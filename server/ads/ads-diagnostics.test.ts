import { describe, expect, it } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS } from "@shared/ads-settings";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import {
  adUrlRedirectIssues,
  indexAds,
  leadIssues,
  purgeStaleDestinationIssues,
  rollIssueState,
  setupLastReadAt,
  toIssueAd,
  trackingParamsCoverage,
  type IssueState,
} from "./ads-diagnostics";
import type { DestinationResolver, Resolved } from "./ads-report";
import type { MetaAdsCreatives } from "./meta-ads-days";
import type { MetaAdCreativeInfo, MetaAdDayRow } from "./meta-client";

const TAGS = "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}";

function row(ad_id: string, spend: number, campaign_id = "c1", currency = "USD"): MetaAdDayRow {
  return {
    date: "2026-09-20",
    account_id: "111",
    currency,
    campaign_id,
    campaign_name: `Campaign ${campaign_id}`,
    adset_id: "s1",
    adset_name: "Set",
    ad_id,
    ad_name: `Ad ${ad_id}`,
    spend,
  } as MetaAdDayRow;
}

function creative(ad_id: string, over: Partial<MetaAdCreativeInfo> = {}): MetaAdCreativeInfo {
  return { ad_id, campaign_id: "c1", adset_id: "s1", links: ["https://4geeks.com/landing"], url_tags: TAGS, instant_form: false, ...over };
}

function creatives(...list: MetaAdCreativeInfo[]): MetaAdsCreatives {
  return { fetched_at: "2026-09-29T10:00:00.000Z", ads: Object.fromEntries(list.map((c) => [c.ad_id, c])) };
}

describe("trackingParamsCoverage", () => {
  it("reports all ads tagged", () => {
    const cov = trackingParamsCoverage({ creatives: creatives(creative("a1"), creative("a2")), rows: [row("a1", 10), row("a2", 5)], windowDays: 28 });
    expect(cov).toMatchObject({ window_days: 28, checked_at: "2026-09-29T10:00:00.000Z", checked_ads: 2, missing_ads: 0, campaigns: [], non_paid_campaigns: [] });
  });

  it("groups ads missing utm_id / utm_content by campaign with spend", () => {
    const cov = trackingParamsCoverage({
      creatives: creatives(creative("a1", { url_tags: "utm_source=facebook&utm_medium=paid_social" }), creative("a2", { url_tags: undefined }), creative("a3")),
      rows: [row("a1", 10), row("a1", 2), row("a2", 5, "c2"), row("a3", 1)],
      windowDays: 28,
    });
    expect(cov.checked_ads).toBe(3);
    expect(cov.missing_ads).toBe(2);
    expect(cov.campaigns).toHaveLength(2);
    expect(cov.campaigns[0]).toMatchObject({ id: "c1", ads: 1, spend: { USD: 12 } });
    expect(cov.campaigns[0]!.missing).toEqual(["utm_id", "utm_content"]);
    expect(cov.campaigns[1]).toMatchObject({ id: "c2", ads: 1, spend: { USD: 5 } });
    expect(cov.campaigns[1]!.missing).toEqual(["utm_source", "utm_medium", "utm_id", "utm_content"]);
  });

  it("accepts params written into the website link instead of url_tags", () => {
    const cov = trackingParamsCoverage({
      creatives: creatives(creative("a1", { url_tags: undefined, links: [`https://4geeks.com/landing?${TAGS}`] })),
      rows: [row("a1", 10)],
      windowDays: 28,
    });
    expect(cov.missing_ads).toBe(0);
    expect(cov.checked_ads).toBe(1);
  });

  it("skips Instant Form ads, ads without a link, zero-spend ads and ads not in the creatives file", () => {
    const cov = trackingParamsCoverage({
      creatives: creatives(
        creative("form", { url_tags: undefined, instant_form: true }),
        creative("nolink", { url_tags: undefined, links: [] }),
        creative("free", { url_tags: undefined }),
      ),
      rows: [row("form", 10), row("nolink", 10), row("free", 0), row("unknown", 10)],
      windowDays: 28,
    });
    expect(cov).toMatchObject({ checked_ads: 0, missing_ads: 0, campaigns: [] });
  });

  it("flags a non-paid utm_medium but not an unresolved macro", () => {
    const cov = trackingParamsCoverage({
      creatives: creatives(
        creative("a1", { url_tags: TAGS.replace("paid_social", "social") }),
        creative("a2", { campaign_id: "c2", url_tags: TAGS.replace("paid_social", "{{placement}}") }),
      ),
      rows: [row("a1", 10), row("a2", 10, "c2")],
      windowDays: 28,
    });
    expect(cov.non_paid_campaigns).toEqual([{ id: "c1", name: "Campaign c1", medium: "social", spend: { USD: 10 } }]);
    expect(cov.missing_ads).toBe(0);
  });

  it("returns null checked_at when creatives were never fetched", () => {
    const cov = trackingParamsCoverage({ creatives: { fetched_at: "", ads: {} }, rows: [], windowDays: 28 });
    expect(cov.checked_at).toBeNull();
    expect(cov.checked_ads).toBe(0);
  });
});

describe("indexAds", () => {
  const accounts = {
    "111": { name: "A", currency: "USD", account_status: 1, setup_read_at: "2026-09-29T10:00:00.000Z" },
    "222": { name: "B", currency: "USD", account_status: 1, setup_read_at: "2026-09-20T10:00:00.000Z", setup_error: "boom" },
  };

  it("sums rows per ad and keeps names, status and last spend date", () => {
    const rows = [
      { ...row("a1", 10), date: "2026-09-18", link_clicks: 3, impressions: 100, landing_page_views: 2 },
      { ...row("a1", 0), date: "2026-09-25", ad_name: "Renamed", link_clicks: 1, impressions: 50, landing_page_views: 1 },
      { ...row("a1", 5), date: "2026-09-21" },
    ] as MetaAdDayRow[];
    const a = indexAds({ creatives: creatives(creative("a1", { effective_status: "PAUSED" })).ads, rows, accounts }).get("a1")!;
    expect(a).toMatchObject({
      ad_name: "Renamed",
      effective_status: "PAUSED",
      spend: { USD: 15 },
      link_clicks: 4,
      impressions: 150,
      landing_page_views: 3,
      last_spend_date: "2026-09-21",
      landing_url: "https://4geeks.com/landing",
      state: "checked",
    });
    expect(a.missing).toBeUndefined();
  });

  it("gives each unchecked ad a reason", () => {
    const rows = [row("gone", 10), { ...row("failed", 10), account_id: "222" }, row("nolink", 10), row("never", 10)] as MetaAdDayRow[];
    rows[3] = { ...rows[3]!, account_id: "333" };
    const idx = indexAds({ creatives: creatives(creative("nolink", { links: [] })).ads, rows, accounts });
    expect(idx.get("gone")).toMatchObject({ state: "unchecked", unchecked_reason: "ad_removed_in_meta", effective_status: null });
    expect(idx.get("failed")).toMatchObject({ state: "unchecked", unchecked_reason: "setup_fetch_failed" });
    expect(idx.get("never")).toMatchObject({ state: "unchecked", unchecked_reason: "setup_fetch_failed" });
    expect(idx.get("nolink")).toMatchObject({ state: "unchecked", unchecked_reason: "no_link_found" });
  });

  it("names an account Meta refused to read on the last sync", () => {
    const rows = [{ ...row("locked", 10), account_id: "444" }] as MetaAdDayRow[];
    const withLocked = { ...accounts, "444": { name: "Locked", currency: "USD", account_status: 1, sync_error: "no access" } };
    const idx = indexAds({ creatives: creatives().ads, rows, accounts: withLocked });
    expect(idx.get("locked")).toMatchObject({ state: "unchecked", unchecked_reason: "account_unreadable" });
  });

  it("treats Instant Form ads (flagged, or leads with no link) as not checkable", () => {
    const rows = [row("form", 10), { ...row("leads", 10), instant_form_leads: 2 }] as MetaAdDayRow[];
    const idx = indexAds({ creatives: creatives(creative("form", { instant_form: true })).ads, rows, accounts });
    expect(idx.get("form")!.state).toBe("instant_form");
    expect(idx.get("leads")!.state).toBe("instant_form");
  });

  it("marks missing params and non-paid medium, and toIssueAd drops internals", () => {
    const idx = indexAds({
      creatives: creatives(creative("a1", { url_tags: "utm_source=facebook&utm_medium=social" })).ads,
      rows: [row("a1", 10)],
      accounts,
    });
    const a = idx.get("a1")!;
    expect(a.missing).toEqual(["utm_id", "utm_content"]);
    expect(a.medium).toBe("social");
    const pub = toIssueAd(a);
    expect(pub).not.toHaveProperty("total");
    expect(pub).not.toHaveProperty("state");
    expect(pub.ad_id).toBe("a1");
  });

  it("flags dubious utm_content (other ad id) as needing a GA4 check", () => {
    const tags = TAGS.replace("{{ad.id}}", "other-ad");
    const a = indexAds({
      creatives: creatives(creative("a1", { url_tags: tags })).ads,
      rows: [row("a1", 10)],
      accounts,
    }).get("a1")!;
    expect(a.dubious_utm_content).toBe(true);
    expect(a.missing).toBeUndefined();
  });
});

describe("setupLastReadAt", () => {
  it("returns the oldest read, or null when any account was never read", () => {
    const accounts = {
      "111": { setup_read_at: "2026-09-29T10:00:00.000Z" },
      "222": { setup_read_at: "2026-09-20T10:00:00.000Z" },
    } as never;
    expect(setupLastReadAt(accounts, ["111", "222"])).toBe("2026-09-20T10:00:00.000Z");
    expect(setupLastReadAt(accounts, ["111", "333"])).toBeNull();
    expect(setupLastReadAt(accounts, [])).toBeNull();
  });
});

describe("trackingParamsCoverage unchecked", () => {
  it("counts unchecked ads by reason and prefers setupReadAt over the file timestamp", () => {
    const cov = trackingParamsCoverage({
      creatives: creatives(creative("a1"), creative("nolink", { links: [] })),
      rows: [row("a1", 10), row("nolink", 4), row("gone", 6)],
      windowDays: 28,
      accounts: { "111": { name: "A", currency: "USD", account_status: 1, setup_read_at: "2026-09-28T00:00:00.000Z" } },
      setupReadAt: null,
    });
    expect(cov.checked_ads).toBe(1);
    expect(cov.checked_at).toBeNull();
    expect(cov.unchecked).toEqual(
      expect.arrayContaining([
        { reason: "no_link_found", ads: 1, spend: { USD: 4 } },
        { reason: "ad_removed_in_meta", ads: 1, spend: { USD: 6 } },
      ]),
    );
  });
});

describe("adUrlRedirectIssues", () => {
  const page = (path: string, chain: string[]): Resolved => ({
    kind: "entry",
    key: "entry:landing/new/en",
    host: "4geeks.com",
    path,
    content_type: "landing",
    slug: "new",
    locale: "en",
    redirected_from: chain[0],
    redirect_chain: chain,
  });
  const resolve: DestinationResolver = (_host, path) => {
    if (path === "/landing/old") return page("/landing/new", ["/landing/old"]);
    if (path === "/landing/older") return page("/landing/new", ["/landing/older", "/landing/old"]);
    if (path === "/landing/gone") return { ...page("/landing/gone", []), kind: "missing_page", key: "dest:4geeks.com|/landing/gone" };
    return page(path, []);
  };
  const spend = (ad: string, usd: number, campaign = "c1") => [ad, { spend: { USD: usd }, campaign_id: campaign, campaign_name: `Campaign ${campaign}` }] as const;

  it("raises one warning per redirected ad URL with summed spend and the top-spend ad in scope", () => {
    const issues = adUrlRedirectIssues({
      spendByAd: new Map([spend("a1", 10), spend("a2", 30, "c2"), spend("a3", 5)]),
      creatives: creatives(
        creative("a1", { links: ["https://4geeks.com/landing/old?utm_source=facebook"] }),
        creative("a2", { links: ["https://4geeks.com/landing/old"] }),
        creative("a3", { links: ["https://4geeks.com/landing/new"] }),
      ).ads,
      resolve,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "ad_url_redirects:https://4geeks.com/landing/old",
      code: "ad_url_redirects",
      severity: "warning",
      spend_affected: { USD: 40 },
      site_fixable: false,
      scope: { url: "https://4geeks.com/landing/old", ad_id: "a2", campaign_id: "c2", page_key: "entry:landing/new/en" },
    });
    expect(issues[0]!.how_to_fix).toBe("Update the ad URL in Meta to https://4geeks.com/landing/new.");
  });

  it("mentions chains, skips URLs already flagged for dropping params, missing pages and zero spend", () => {
    const issues = adUrlRedirectIssues({
      spendByAd: new Map([spend("a1", 10), spend("a2", 10), spend("a3", 10), spend("a4", 0)]),
      creatives: creatives(
        creative("a1", { links: ["https://4geeks.com/landing/older"] }),
        creative("a2", { links: ["https://4geeks.com/landing/old"] }),
        creative("a3", { links: ["https://4geeks.com/landing/gone"] }),
        creative("a4", { links: ["https://4geeks.com/landing/older"] }),
      ).ads,
      resolve,
      skipUrls: new Set(["https://4geeks.com/landing/old"]),
    });
    expect(issues.map((i) => i.id)).toEqual(["ad_url_redirects:https://4geeks.com/landing/older"]);
    expect(issues[0]!.why).toContain("through 2 redirects");
    expect(issues[0]!.spend_affected).toEqual({ USD: 10 });
  });
});

describe("leadIssues", () => {
  const T = DEFAULT_ADS_ALERT_THRESHOLDS;
  const empty = { days: 0, ga4_leads: 0, submissions: 0 };
  const input = (over: { ga4_leads?: number; submissions?: number; cmp?: typeof empty; configured?: boolean; lastRecordedAt?: number | null }) => ({
    report: {
      ga4: { configured: over.configured ?? true, last_synced_at: null, last_export_date: null, last_error: null },
      totals: { ga4_leads: over.ga4_leads ?? 1083, submissions: over.submissions ?? 0 } as never,
      lead_gap_compare: over.cmp ?? empty,
    },
    baseline: { lead_gap_compare: empty },
    lastRecordedAt: over.lastRecordedAt ?? null,
    t: T,
  });

  it("GA4 leads with empty lead records → info notice, no gap warning, gap suppressed", () => {
    const r = leadIssues(input({}));
    expect(r.issues.map((i) => [i.code, i.severity, i.site_fixable])).toEqual([["ledger_not_recording", "info", true]]);
    expect(r.issues[0]!.title).toBe("Our site hasn't recorded any leads yet");
    expect(r.issues[0]!.how_to_fix).toContain("local or staging copy");
    expect(r.suppressed).toEqual(["ga4_ledger_gap"]);
  });

  it("earlier leads but none in the window → warning with the last date", () => {
    const r = leadIssues(input({ lastRecordedAt: Date.parse("2026-08-14T09:00:00.000Z") }));
    expect(r.issues[0]).toMatchObject({ code: "ledger_not_recording", severity: "warning", title: "Our site stopped recording paid leads" });
    expect(r.issues[0]!.why).toContain("2026-08-14");
  });

  it("gap is suppressed with fewer than 7 shared days and raised over shared days otherwise", () => {
    const few = leadIssues(input({ submissions: 5, cmp: { days: 4, ga4_leads: 100, submissions: 5 } }));
    expect(few).toEqual({ issues: [], suppressed: ["ga4_ledger_gap"] });
    const gap = leadIssues(input({ submissions: 40, cmp: { days: 10, ga4_leads: 100, submissions: 40 } }));
    expect(gap.issues.map((i) => i.code)).toEqual(["ga4_ledger_gap"]);
    expect(gap.issues[0]!.why).toContain("Over the last 10 days both sources cover");
    const close = leadIssues(input({ submissions: 90, cmp: { days: 10, ga4_leads: 100, submissions: 90 } }));
    expect(close).toEqual({ issues: [], suppressed: [] });
  });
});

describe("rollIssueState", () => {
  const issue = (id: string): AdsIssue =>
    ({ id, code: "ledger_not_recording", severity: "info", title: id, why: "", how_to_fix: "", spend_affected: {}, scope: {}, site_fixable: true }) as AdsIssue;

  it("drops a suppressed gap from open without listing it as Resolved", () => {
    const state: IssueState = {
      open: {
        ga4_ledger_gap: { first_seen: "2026-09-01T00:00:00.000Z", title: "GA4 and our lead records disagree", severity: "warning" },
        clicks_visits_low: { first_seen: "2026-09-01T00:00:00.000Z", title: "Few ad clicks become visits", severity: "warning" },
      },
      resolved: [],
      resolver_version: 2,
    };
    rollIssueState(state, [issue("ledger_not_recording")], "2026-09-29T12:00:00.000Z", new Set(["ga4_ledger_gap"]));
    expect(Object.keys(state.open)).toEqual(["ledger_not_recording"]);
    expect(state.resolved.map((r) => r.id)).toEqual(["clicks_visits_low"]);
  });
});

describe("purgeStaleDestinationIssues", () => {
  const open = (severity: "warning" | "info" = "warning") => ({ first_seen: "2026-09-01T00:00:00.000Z", title: "t", severity });

  it("drops stale missing-page rows once without touching other issues", () => {
    const state: IssueState = {
      open: {
        "unmanaged_destination:dest:4geeks.com|/landing/ai-engineering-salaries": open(),
        "unmanaged_destination:dest:4geeks.com|/landing/deleted": open(),
        "landing_http_error:https://4geeks.com/x": open(),
      },
      resolved: [],
    };
    purgeStaleDestinationIssues(state, new Set(["unmanaged_destination:dest:4geeks.com|/landing/deleted"]));
    expect(Object.keys(state.open)).toEqual(["unmanaged_destination:dest:4geeks.com|/landing/deleted", "landing_http_error:https://4geeks.com/x"]);
    expect(state.resolved).toEqual([]);
    expect(state.resolver_version).toBe(2);
  });

  it("does nothing once the state is on the current version", () => {
    const state: IssueState = { open: { "unmanaged_destination:dest:4geeks.com|/landing/deleted": open() }, resolved: [], resolver_version: 2 };
    purgeStaleDestinationIssues(state, new Set());
    expect(Object.keys(state.open)).toEqual(["unmanaged_destination:dest:4geeks.com|/landing/deleted"]);
  });
});
