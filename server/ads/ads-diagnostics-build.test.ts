import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ADS_SETTINGS } from "@shared/ads-settings";
import type { AdsPageRow, AdsReport, AdsUnrecognizedCampaigns, Resolved } from "./ads-report";
import type { MetaAdCreativeInfo, MetaAdDayRow } from "./meta-client";

const h = vi.hoisted(() => ({
  cacheDir: "",
  reportBuilds: 0,
  ga4Configured: false,
  totals: {} as Record<string, number>,
  connected: true,
  syncFailures: 0,
  known: [] as Array<{ key: string; note?: string }>,
  unrecognized: undefined as AdsUnrecognizedCampaigns | undefined,
  offSite: null as AdsPageRow | null,
  rows: null as MetaAdDayRow[] | null,
  creatives: null as Record<string, MetaAdCreativeInfo> | null,
  leadConversions: [] as string[],
  expectedPairs: [] as Array<{ pixel_id: string; events: [string, string] }>,
  pixels: {} as Record<string, unknown>,
  customConversions: {} as Record<string, unknown>,
  reportLeadConversions: undefined as Record<string, unknown> | undefined,
  ga4Days: [] as Array<{
    date: string;
    complete: boolean;
    candidates: Array<{ utm_content: string | null; sessions: number }>;
  }>,
}));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-diagnostics-build-test-"));

const SITE = "site_test";
const NOW = new Date("2026-09-29T12:00:00.000Z");
const READ_111 = "2026-09-29T06:00:00.000Z";

function row(ad_id: string, spend: number, campaign_id: string, account_id = "111"): MetaAdDayRow {
  return {
    date: "2026-09-20",
    account_id,
    currency: "USD",
    campaign_id,
    campaign_name: `Campaign ${campaign_id}`,
    adset_id: `s-${campaign_id}`,
    adset_name: "Set",
    ad_id,
    ad_name: `Ad ${ad_id}`,
    spend,
    impressions: 100,
    reach: 90,
    frequency: 1.1,
    link_clicks: 10,
    landing_page_views: 8,
    pixel_leads: 0,
    instant_form_leads: 0,
  };
}

const ROWS: MetaAdDayRow[] = [
  row("a1", 100, "c1"),
  row("a2", 40, "c1"),
  row("a3", 30, "c2", "222"),
  row("a4", 20, "c3"),
];

const CREATIVES: Record<string, MetaAdCreativeInfo> = {
  a1: {
    ad_id: "a1",
    campaign_id: "c1",
    adset_id: "s-c1",
    effective_status: "PAUSED",
    links: ["https://4geeks.com/landing/x"],
    url_tags: "utm_source=facebook&utm_medium=paid_social",
    instant_form: false,
  },
  a4: { ad_id: "a4", campaign_id: "c3", adset_id: "s-c3", effective_status: "ACTIVE", links: [], instant_form: false },
};

const OFF_SITE: AdsPageRow = {
  key: "dest:learn.4geeks.com|/choose-program",
  kind: "off_site",
  kind_label: "Off-site",
  url: "https://learn.4geeks.com/choose-program",
  spend: {},
  paid_visits: 12,
  ga4_ads: [
    {
      platform: "google",
      source: "google",
      medium: "cpc",
      campaign: "Brand",
      campaign_id: null,
      adset_id: null,
      ad_id: null,
      visits: 12,
      leads: 1,
      first_seen: "2026-09-02",
      last_seen: "2026-09-28",
    },
  ],
  ga4_untagged_visits: 12,
} as unknown as AdsPageRow;

function fakeReport(): AdsReport {
  return {
    window: { start: "2026-09-01", end: "2026-09-28", days: 28 },
    meta: { connected: true, last_synced_at: READ_111, last_error: null, consecutive_failures: 0, accounts: [] },
    ga4: { configured: h.ga4Configured, last_synced_at: null, last_export_date: null, last_error: null },
    refreshing: false,
    refresh: { state: "idle" },
    collecting_since: null,
    totals: {
      spend: { USD: 190 },
      tracked_spend: { USD: 100 },
      clicks: 40,
      landing_page_views: 32,
      paid_visits: 0,
      unclear_visits: 0,
      meta_leads: 0,
      instant_form_leads: 0,
      ga4_leads: 0,
      unique_leads: 0,
      submissions: 0,
      repeat_submissions: 0,
      test_submissions: 0,
      matched_visits: 0,
      unmatched_meta_visits: 0,
      ratio_clicks: 0,
      untagged_clicks: 0,
      ...h.totals,
    },
    lead_gap_compare: { days: 0, ga4_leads: 0, submissions: 0 },
    pages: [],
    destinations: [h.offSite ?? OFF_SITE],
    campaigns: [],
    warnings: [],
    unrecognized_campaigns: h.unrecognized,
    lead_conversions: h.reportLeadConversions,
  } as unknown as AdsReport;
}

vi.mock("../db-cache", () => ({ CACHE_DIR: h.cacheDir }));
vi.mock("../settings", () => ({
  getAdsSettings: () => ({
    ...DEFAULT_ADS_SETTINGS,
    meta: {
      ...DEFAULT_ADS_SETTINGS.meta,
      enabled: true,
      ad_account_ids: ["111", "222"],
      known_external_campaigns: h.known,
      lead_conversions: h.leadConversions,
      expected_event_pairs: h.expectedPairs,
    },
  }),
}));
vi.mock("./ads-report", () => ({
  getAdsReport: async () => fakeReport(),
  buildAdsReport: () => {
    h.reportBuilds += 1;
    return fakeReport();
  },
  makeDestinationResolver:
    () =>
    (host: string, p: string): Resolved => ({
      kind: host === "4geeks.com" ? "entry" : "off_site",
      key: host === "4geeks.com" ? "entry:landing/x/en" : `dest:${host}|${p}`,
      host,
      path: p,
      content_type: null,
      slug: null,
      locale: null,
      redirect_chain: [],
    }),
}));
vi.mock("./meta-ads-days", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  loadMetaRows: () => h.rows ?? ROWS,
  loadMetaCreatives: () => ({ fetched_at: READ_111, ads: h.creatives ?? CREATIVES }),
  loadMetaPixelEvents: () => ({ fetched_at: READ_111, since: "2026-09-22", pixels: h.pixels }),
  loadMetaCustomConversions: () => ({ fetched_at: READ_111, accounts: h.customConversions }),
  metaConversionNames: () => new Map([["1086440567304045", "request_more_info"]]),
  loadMetaState: () => ({
    consecutive_failures: h.syncFailures,
    last_error: h.syncFailures > 0 ? "Meta timeout" : null,
    last_success_at: READ_111,
    accounts: {
      "111": { name: "A", currency: "USD", account_status: 1, setup_read_at: READ_111 },
      "222": { name: "B", currency: "USD", account_status: 1, setup_error: "Meta timeout" },
    },
  }),
}));
vi.mock("./paid-detection", () => ({
  lastCompleteGa4Date: () => "2026-09-27",
  loadPaidLandingDays: () => h.ga4Days,
}));
vi.mock("./lead-ledger", () => ({ ledgerLastRecordedAt: () => null }));
vi.mock("./ads-refresh", () => ({ isMetaConnected: () => h.connected, hasMetaData: () => h.connected }));
vi.mock("../legal/legal-diagnostics", () => ({
  loadConsentWindow: () => ({ current: [], trailing: [] }),
  consentDropPct: () => null,
  consentTotals: () => ({ accept_pct: null }),
}));

const { buildAdsDiagnostics } = await import("./ads-diagnostics");
const { metaKpis } = await import("./diagnostics/kpis");

const kpisOf = () => metaKpis(fakeReport(), { open_errors: 0, open_warnings: 0 }, null, h.leadConversions, null);

beforeEach(() => {
  fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });
  h.reportBuilds = 0;
  h.ga4Configured = false;
  h.totals = {};
  h.connected = true;
  h.syncFailures = 0;
  h.known = [];
  h.unrecognized = undefined;
  h.offSite = OFF_SITE;
  h.rows = null;
  h.creatives = null;
  h.leadConversions = [];
  h.expectedPairs = [];
  h.pixels = {};
  h.customConversions = {};
  h.reportLeadConversions = undefined;
  h.ga4Days = [];
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
});

describe("buildAdsDiagnostics issue details", () => {
  it("lists a campaign's missing and unchecked ads with account, status and setup read time", async () => {
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const missing = d.issues.find((i) => i.id === "missing_tracking_params:c1")!;
    expect(missing.scope).toMatchObject({ campaign_id: "c1", account_id: "111" });
    expect(missing.details!.ads.map((a) => [a.ad_id, a.effective_status, a.unchecked_reason ?? null])).toEqual([
      ["a1", "PAUSED", null],
      ["a2", null, "ad_removed_in_meta"],
    ]);
    expect(missing.details!.ads[0]!.missing).toEqual(["utm_id", "utm_content"]);
    expect(missing.details!.unchecked).toEqual([{ reason: "ad_removed_in_meta", ads: 1, spend: { USD: 40 } }]);
    expect(missing.details!.setup_last_read_at).toBe(READ_111);
  });

  it("raises tracking_params_unchecked (info) per campaign with the reason", async () => {
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const failed = d.issues.find((i) => i.id === "tracking_params_unchecked:c2")!;
    expect(failed).toMatchObject({ severity: "info", scope: { account_id: "222" }, spend_affected: { USD: 30 } });
    expect(failed.details!.unchecked).toEqual([{ reason: "setup_fetch_failed", ads: 1, spend: { USD: 30 } }]);
    expect(failed.details!.setup_last_read_at).toBeNull();
    const noLink = d.issues.find((i) => i.id === "tracking_params_unchecked:c3")!;
    expect(noLink.details!.ads[0]).toMatchObject({ ad_id: "a4", unchecked_reason: "no_link_found", effective_status: "ACTIVE" });
    expect(d.issues.find((i) => i.id === "tracking_params_unchecked:c1")).toBeUndefined();
  });

  it("shows GA4-seen campaigns on destinations with no synced ad", async () => {
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const off = d.issues.find((i) => i.id === "off_site_destination:dest:learn.4geeks.com|/choose-program")!;
    expect(off.details!.ads_total).toBe(0);
    expect(off.details!.ga4_seen).toEqual(OFF_SITE.ga4_ads);
    expect(off.details!.ga4_untagged_visits).toBe(12);
  });

  it("sorts severity first, then spend", async () => {
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const ranks = d.issues.map((i) => ({ error: 0, warning: 1, info: 2 })[i.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const infos = d.issues.filter((i) => i.severity === "info" && Object.keys(i.spend_affected).length > 0);
    expect(infos.map((i) => i.id).slice(0, 2)).toEqual(["tracking_params_unchecked:c2", "tracking_params_unchecked:c3"]);
  });
});

const EXTERNAL_ID = "120249995075650344";

function unrecognizedCampaign(key: string, visits: number, campaign_name = key): AdsUnrecognizedCampaigns["campaigns"][number] {
  const campaign_id = /^\d+$/.test(key) ? key : null;
  return {
    key,
    campaign_id,
    campaign_name,
    visits,
    leads: 1,
    untagged_visits: 0,
    pages: [{ key: "entry:landing/ai-fluency-es/es", url: "https://4geeks.com/landing/ai-fluency-es", title: "AI Fluency", visits }],
    ga4_seen: [
      {
        platform: "meta",
        source: "facebook",
        medium: "paid_social",
        campaign: campaign_name,
        campaign_id,
        adset_id: null,
        ad_id: "9",
        visits,
        leads: 1,
        first_seen: "2026-09-02",
        last_seen: "2026-09-27",
      },
    ],
    first_seen: "2026-09-02",
    last_seen: "2026-09-27",
  };
}

describe("buildAdsDiagnostics unrecognized campaigns", () => {
  const data = (): AdsUnrecognizedCampaigns => ({
    paid_meta_visits: 1000,
    campaigns: [unrecognizedCampaign(EXTERNAL_ID, 785, "AI Fluency ES"), unrecognizedCampaign("Spring promo", 5), unrecognizedCampaign("Tiny", 2)],
  });

  it("raises an error, a warning, and nothing below the minimum", async () => {
    h.unrecognized = data();
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const big = d.issues.find((i) => i.id === `unrecognized_campaign:${EXTERNAL_ID}`)!;
    expect(big).toMatchObject({
      code: "unrecognized_campaign",
      severity: "error",
      title: "Campaign we can't see: AI Fluency ES",
      site_fixable: false,
      spend_affected: {},
      scope: { campaign_id: EXTERNAL_ID, campaign_name: "AI Fluency ES" },
    });
    expect(big.why).toContain("isn't in any connected ad account");
    expect(big.details!.pages![0]).toMatchObject({ url: "https://4geeks.com/landing/ai-fluency-es", visits: 785 });
    expect(big.details!.ga4_totals).toEqual({ visits: 785, leads: 1 });
    expect(d.issues.find((i) => i.id === "unrecognized_campaign:Spring promo")!.severity).toBe("warning");
    expect(d.issues.find((i) => i.id === "unrecognized_campaign:Tiny")).toBeUndefined();
  });

  it("downgrades known external campaigns to info", async () => {
    h.unrecognized = data();
    h.known = [{ key: EXTERNAL_ID, note: "Agency" }, { key: "spring PROMO" }];
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const big = d.issues.find((i) => i.id === `unrecognized_campaign:${EXTERNAL_ID}`)!;
    expect(big).toMatchObject({ severity: "info", title: "Known external campaign: AI Fluency ES" });
    expect(big.how_to_fix).toContain("Nothing to fix");
    expect(d.issues.find((i) => i.id === "unrecognized_campaign:Spring promo")!.severity).toBe("info");
  });

  it("skips the check when Meta isn't connected or sync keeps failing", async () => {
    h.unrecognized = data();
    h.connected = false;
    let d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.some((i) => i.code === "unrecognized_campaign")).toBe(false);

    h.connected = true;
    h.syncFailures = 3;
    d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.some((i) => i.code === "meta_sync_failing")).toBe(true);
    expect(d.issues.some((i) => i.code === "unrecognized_campaign")).toBe(false);
  });

  it("explains GA4-only off-site rows and points at the flagged campaign", async () => {
    const plain = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const plainOff = plain.issues.find((i) => i.code === "off_site_destination")!;
    expect(plainOff.why).toContain("None of your ads link here. GA4 counted 12 visits here as paid");
    expect(plainOff.why).not.toContain("flagged separately");
    expect(plainOff.how_to_fix).toBe("Nothing to fix here.");

    h.unrecognized = data();
    h.offSite = {
      ...OFF_SITE,
      key: "dest:learn.4geeks.com|/cohort/x",
      url: "https://learn.4geeks.com/cohort/x",
      paid_visits: 4,
      ga4_ads: [{ ...unrecognizedCampaign(EXTERNAL_ID, 4, "AI Fluency ES").ga4_seen[0]! }],
      ga4_untagged_visits: 0,
    } as unknown as AdsPageRow;
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const off = d.issues.find((i) => i.code === "off_site_destination")!;
    expect(off.why).toContain("Most come from campaign AI Fluency ES (flagged separately).");
  });
});

describe("buildAdsDiagnostics clicks → visits", () => {
  it("uses matched visits over tagged clicks and passes the exclusions through", async () => {
    h.ga4Configured = true;
    h.totals = { paid_visits: 900, matched_visits: 150, ratio_clicks: 200, untagged_clicks: 35, unmatched_meta_visits: 750 };
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(kpisOf()).toMatchObject({ clicks_to_visits_pct: 75, clicks_to_visits_mismatch: false, untagged_clicks: 35, unmatched_meta_visits: 750 });
    expect(d.issues.find((i) => i.code === "clicks_visits_low")).toBeUndefined();
  });

  it("flags a mismatch above 110% and raises no clicks_visits_low", async () => {
    h.ga4Configured = true;
    h.totals = { matched_visits: 900, ratio_clicks: 200 };
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(kpisOf()).toMatchObject({ clicks_to_visits_pct: 450, clicks_to_visits_mismatch: true });
    expect(d.issues.find((i) => i.code === "clicks_visits_low")).toBeUndefined();
  });

  it("still warns when few tagged clicks become matched visits", async () => {
    h.ga4Configured = true;
    h.totals = { paid_visits: 400, matched_visits: 40, ratio_clicks: 200 };
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const cv = d.issues.find((i) => i.code === "clicks_visits_low")!;
    expect(cv.title).toBe("Few ad clicks become visits");
    expect(cv.why).toContain("Only 20% of Meta clicks from tagged ads");
    expect(kpisOf().clicks_to_visits_mismatch).toBe(false);
  });

  it("shows no ratio without GA4", async () => {
    h.totals = { matched_visits: 40, ratio_clicks: 200 };
    expect(kpisOf()).toMatchObject({ clicks_to_visits_pct: null, clicks_to_visits_mismatch: false });
  });
});

describe("buildAdsDiagnostics lead conversions", () => {
  const RMI = "1086440567304045";
  const withConv = (r: MetaAdDayRow, date: string, conversions: Record<string, number>): MetaAdDayRow => ({ ...r, date, conversions });
  const overlapRows = [
    withConv(ROWS[0]!, "2026-09-20", { fb_pixel_lead: 3, [RMI]: 3 }),
    withConv(ROWS[0]!, "2026-09-21", { fb_pixel_lead: 2, [RMI]: 2 }),
    withConv(ROWS[1]!, "2026-09-21", { fb_pixel_lead: 1, [RMI]: 1 }),
    ...ROWS.slice(2),
  ];

  it("passes the report's per-conversion counts and pick state into the KPIs", async () => {
    h.leadConversions = [RMI];
    h.reportLeadConversions = {
      meta_picked: [RMI],
      meta_changed_at: "2026-09-25T00:00:00.000Z",
      meta: [{ key: RMI, name: "request_more_info", count: 4 }],
      site: [{ name: "apply", count: 2 }],
      meta_incomplete_days: 3,
      snapshot_lacks_conversions: false,
    };
    expect(kpisOf()).toMatchObject({
      meta_conversions: [{ key: RMI, name: "request_more_info", count: 4 }],
      site_conversions: [{ name: "apply", count: 2 }],
      meta_lead_conversions_picked: [RMI],
      lead_conversions_changed_at: "2026-09-25T00:00:00.000Z",
      meta_conversions_incomplete_days: 3,
      snapshot_lacks_conversions: false,
    });
  });

  it("falls back to settings when an older cached report has no lead_conversions block", async () => {
    h.leadConversions = [RMI];
    expect(kpisOf()).toMatchObject({ meta_conversions: [], site_conversions: [], meta_lead_conversions_picked: [RMI], snapshot_lacks_conversions: false });
  });

  it("raises lead_conversions_overlap while both are picked, and not after unpicking one", async () => {
    h.rows = overlapRows;
    h.leadConversions = ["fb_pixel_lead", RMI];
    let d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const overlap = d.issues.find((i) => i.code === "lead_conversions_overlap")!;
    expect(overlap).toMatchObject({ platform: "meta", severity: "warning", action: { kind: "unpick_lead_conversion" } });

    h.leadConversions = [RMI];
    d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.some((i) => i.code === "lead_conversions_overlap")).toBe(false);
  });

  it("raises pixel_events_lockstep unless the pair is marked as expected", async () => {
    const hourly = { "2026-09-23T10:00:00+0000": 12, "2026-09-24T10:00:00+0000": 10 };
    h.pixels = {
      "414": {
        name: "4Geeks",
        last_fired_time: null,
        accounts: ["111"],
        events: [
          { event: "Lead", total: 22, hourly },
          { event: "request_more_info", total: 22, hourly },
          { event: "PageView", total: 22, hourly },
        ],
      },
    };
    let d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.filter((i) => i.code === "pixel_events_lockstep").map((i) => i.id)).toEqual(["pixel_events_lockstep:414:Lead|request_more_info"]);

    h.expectedPairs = [{ pixel_id: "414", events: ["Lead", "request_more_info"] }];
    d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.some((i) => i.code === "pixel_events_lockstep")).toBe(false);
  });

  it("raises lead_conversion_stopped for a picked conversion Meta no longer lists", async () => {
    h.leadConversions = [RMI];
    h.customConversions = { "111": { conversions: [] }, "222": { conversions: [] } };
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.code === "lead_conversion_stopped")).toMatchObject({
      id: `lead_conversion_stopped:${RMI}`,
      evidence: { reason: "missing" },
    });
  });

  it("names the picked conversions when Meta reports no leads", async () => {
    h.totals = { unique_leads: 4, meta_leads: 0 };
    h.leadConversions = [RMI];
    let d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.code === "pixel_not_reporting_leads")!.why).toContain("picked in Settings → Ads → Meta (request_more_info)");
    h.leadConversions = [];
    d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.code === "pixel_not_reporting_leads")!.why).toContain("the standard Lead event (no conversions are picked");
  });
});

function completeGa4Days(adSessions: Record<string, number>, dates = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]) {
  return dates.map((date, i) => ({
    date,
    complete: true,
    // Put the full session count on the first complete day so totals match the map exactly.
    candidates:
      i === 0
        ? Object.entries(adSessions).map(([utm_content, sessions]) => ({ utm_content, sessions }))
        : Object.keys(adSessions).map((utm_content) => ({ utm_content, sessions: 0 })),
  }));
}

describe("buildAdsDiagnostics GA4-verified tracking", () => {
  const missingTags = "utm_source=facebook&utm_medium=paid_social";

  it("hides meta_auto ads that GA4 sees tagged with the ad id", async () => {
    h.ga4Configured = true;
    h.creatives = {
      a1: {
        ad_id: "a1",
        campaign_id: "c1",
        adset_id: "s-c1",
        effective_status: "ACTIVE",
        links: ["https://4geeks.com/landing/x"],
        url_tags: missingTags,
        instant_form: false,
      },
    };
    h.rows = [{ ...row("a1", 50, "c1"), date: "2026-09-22", link_clicks: 100 }];
    // 25 sessions / 100 clicks = 25% ≥ 10%, sessions ≥ 3
    h.ga4Days = completeGa4Days({ a1: 25 });
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.code === "missing_tracking_params")).toBeUndefined();
    expect(d.issues.find((i) => i.code === "tracking_params_unverified")).toBeUndefined();
  });

  it("warns when many clicks produce almost no GA4 sessions with the ad id", async () => {
    h.ga4Configured = true;
    h.creatives = {
      a1: {
        ad_id: "a1",
        campaign_id: "c1",
        adset_id: "s-c1",
        effective_status: "ACTIVE",
        links: ["https://4geeks.com/landing/x"],
        url_tags: missingTags,
        instant_form: false,
      },
    };
    h.rows = [{ ...row("a1", 80, "c1"), date: "2026-09-22", link_clicks: 300 }];
    h.ga4Days = completeGa4Days({ a1: 3 });
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const missing = d.issues.find((i) => i.id === "missing_tracking_params:c1")!;
    expect(missing.severity).toBe("warning");
    expect(missing.details!.ads[0]).toMatchObject({
      ad_id: "a1",
      tagging_source: "none",
      checked_clicks: 300,
      ga4_tagged_sessions: 3,
    });
  });

  it("emits tracking_params_unverified (info) when clicks are too low to confirm", async () => {
    h.ga4Configured = true;
    h.creatives = {
      a1: {
        ad_id: "a1",
        campaign_id: "c1",
        adset_id: "s-c1",
        effective_status: "ACTIVE",
        links: ["https://4geeks.com/landing/x"],
        url_tags: missingTags,
        instant_form: false,
      },
    };
    h.rows = [{ ...row("a1", 40, "c1"), date: "2026-09-22", link_clicks: 5 }];
    h.ga4Days = completeGa4Days({ a1: 0 });
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.code === "missing_tracking_params")).toBeUndefined();
    const unverified = d.issues.find((i) => i.id === "tracking_params_unverified:c1")!;
    expect(unverified).toMatchObject({ severity: "info", platform: "meta" });
  });

  it("treats fewer than 4 complete GA4 days as unverifiable", async () => {
    h.ga4Configured = true;
    h.creatives = {
      a1: {
        ad_id: "a1",
        campaign_id: "c1",
        adset_id: "s-c1",
        effective_status: "ACTIVE",
        links: ["https://4geeks.com/landing/x"],
        url_tags: missingTags,
        instant_form: false,
      },
    };
    h.rows = [{ ...row("a1", 40, "c1"), date: "2026-09-22", link_clicks: 100 }];
    h.ga4Days = completeGa4Days({ a1: 0 }, ["2026-09-25", "2026-09-26", "2026-09-27"]);
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.code === "missing_tracking_params")).toBeUndefined();
    expect(d.issues.find((i) => i.id === "tracking_params_unverified:c1")).toBeTruthy();
  });

  it("drops unchecked ads that GA4 marks meta_auto", async () => {
    h.ga4Configured = true;
    h.creatives = {};
    h.rows = [{ ...row("a3", 30, "c2", "222"), date: "2026-09-22", link_clicks: 100 }];
    h.ga4Days = completeGa4Days({ a3: 40 });
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.id === "tracking_params_unchecked:c2")).toBeUndefined();
  });

  it("keeps unchecked ads when GA4 does not confirm meta_auto", async () => {
    h.ga4Configured = true;
    h.creatives = {};
    h.rows = [{ ...row("a3", 30, "c2", "222"), date: "2026-09-22", link_clicks: 100 }];
    h.ga4Days = completeGa4Days({ a3: 0 });
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.id === "tracking_params_unchecked:c2")).toMatchObject({ severity: "info" });
  });

  it("hides dubious utm_content when GA4 marks meta_auto, warns when it does not", async () => {
    h.ga4Configured = true;
    const dubious = {
      ad_id: "a1",
      campaign_id: "c1",
      adset_id: "s-c1",
      effective_status: "ACTIVE" as const,
      links: ["https://4geeks.com/landing/x"],
      url_tags: "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_term={{adset.id}}&utm_content=other-ad",
      instant_form: false,
    };
    h.creatives = { a1: dubious };
    h.rows = [{ ...row("a1", 50, "c1"), date: "2026-09-22", link_clicks: 100 }];
    h.ga4Days = completeGa4Days({ a1: 30 });
    let d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.code === "missing_tracking_params")).toBeUndefined();

    h.ga4Days = completeGa4Days({ a1: 0 });
    d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    const missing = d.issues.find((i) => i.id === "missing_tracking_params:c1")!;
    expect(missing.why).toMatch(/wrong or incomplete/i);
    expect(missing.details!.ads[0]!.dubious_utm_content).toBe(true);
  });

  it("warns on dubious utm_content when GA4 is not configured", async () => {
    h.ga4Configured = false;
    h.creatives = {
      a1: {
        ad_id: "a1",
        campaign_id: "c1",
        adset_id: "s-c1",
        effective_status: "ACTIVE",
        links: ["https://4geeks.com/landing/x"],
        url_tags: "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_term={{adset.id}}&utm_content=other-ad",
        instant_form: false,
      },
    };
    h.rows = [row("a1", 50, "c1")];
    const d = await buildAdsDiagnostics({ site: SITE, now: NOW });
    expect(d.issues.find((i) => i.id === "missing_tracking_params:c1")!.details!.ads[0]!.dubious_utm_content).toBe(true);
  });
});
