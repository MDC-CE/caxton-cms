import { describe, expect, it, vi } from "vitest";
import type { LedgerRow } from "./lead-ledger";
import type { MetaAdDayRow } from "./meta-client";
import type { PaidLandingCandidateRow, PaidLandingDayFile } from "./paid-detection";
import type { GoogleAdDayRow, GoogleNetworkDayRow } from "./google-ads-bq";
import type { GoogleAdsSetups, GoogleAdsSyncState } from "./google-ads-days";
import { DEFAULT_ADS_SETTINGS, DEFAULT_GOOGLE_ADS_SETTINGS } from "@shared/ads-settings";
import type { ContentIndex } from "../content-index";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const DAY = "2026-09-15";
const HOST = "example.com";
const CID = "1234567890";

const metaRows: MetaAdDayRow[] = [
  {
    date: DAY,
    account_id: "111111",
    currency: "USD",
    campaign_id: "c1",
    campaign_name: "Bootcamp prospecting",
    adset_id: "s1",
    adset_name: "US",
    ad_id: "ad1",
    ad_name: "Ad 1",
    spend: 100,
    impressions: 5000,
    reach: 4000,
    frequency: 1.25,
    link_clicks: 80,
    landing_page_views: 60,
    pixel_leads: 5,
    instant_form_leads: 0,
  },
];

function gRow(over: Partial<GoogleAdDayRow>): GoogleAdDayRow {
  return {
    date: DAY,
    customer_id: CID,
    currency: "USD",
    campaign_id: "g1",
    campaign_name: "Search brand",
    ad_group_id: "ag1",
    ad_group_name: "Brand",
    landing_url: `https://${HOST}/en/coding-bootcamp`,
    destination: null,
    channel_type: "SEARCH",
    spend: 60,
    clicks: 30,
    impressions: 900,
    lead_conversions: 2,
    ...over,
  };
}

const googleRows: GoogleAdDayRow[] = [
  gRow({}),
  gRow({ campaign_id: "g2", campaign_name: "YouTube awareness", ad_group_id: "ag2", landing_url: null, destination: "video_views", channel_type: "VIDEO", spend: 20, clicks: 0, impressions: 8000, lead_conversions: 0 }),
  gRow({ campaign_id: "g3", campaign_name: "Lead form ext", ad_group_id: "ag3", landing_url: null, destination: "google_lead_form", spend: 10, clicks: 0, impressions: 400, lead_conversions: 1 }),
];

const networkRows: GoogleNetworkDayRow[] = [
  { date: DAY, customer_id: CID, currency: "USD", campaign_id: "g1", network: "search", spend: 60, clicks: 30, impressions: 900 },
  { date: DAY, customer_id: CID, currency: "USD", campaign_id: "g2", network: "youtube", spend: 20, clicks: 0, impressions: 8000 },
  { date: DAY, customer_id: CID, currency: "USD", campaign_id: "g3", network: "search", spend: 10, clicks: 0, impressions: 400 },
];

function candidate(over: Partial<PaidLandingCandidateRow>): PaidLandingCandidateRow {
  return {
    host: HOST,
    path: "/en/coding-bootcamp",
    source: "facebook",
    medium: "paid_social",
    campaign: "Bootcamp prospecting",
    click_id_type: "fbclid",
    utm_id: "c1",
    utm_term: "s1",
    utm_content: "ad1",
    experiment_id: null,
    variant: null,
    sessions: 50,
    engaged_sessions: 30,
    engagement_ms: 50 * 20_000,
    lead_events: 4,
    sessions_with_lead: 4,
    ...over,
  };
}

const googleVisit = (over: Partial<PaidLandingCandidateRow>) =>
  candidate({
    source: "google",
    medium: "cpc",
    campaign: "Search brand",
    click_id_type: "gclid",
    utm_id: null,
    utm_term: null,
    utm_content: null,
    gads_customer_id: CID,
    gads_campaign_id: "g1",
    gads_ad_group_id: "ag1",
    gads_network: "search",
    gads_match: "ga4_link",
    sessions: 20,
    engaged_sessions: 12,
    sessions_with_lead: 1,
    ...over,
  });

const paidDay: PaidLandingDayFile = {
  date: DAY,
  fetched_at: NOW.toISOString(),
  complete: true,
  candidates: [candidate({}), googleVisit({}), googleVisit({ gads_customer_id: "9999999999", gads_campaign_id: "g9", gads_ad_group_id: "ag9", sessions: 5 })],
  organic: [],
  cookieless: [],
};

const t0 = Date.parse(`${DAY}T10:00:00.000Z`);
function lead(over: Record<string, unknown>): LedgerRow {
  return {
    submission_id: `s-${Math.random()}`,
    created_at: t0 + 60_000,
    form: "apply",
    browser_hash: "b1",
    host: HOST,
    locale: "en",
    utm_source: "facebook",
    utm_medium: "paid_social",
    utm_campaign: "Bootcamp prospecting",
    utm_content: "ad1",
    utm_term: "s1",
    platform: "meta",
    campaign_id: "c1",
    adset_id: "s1",
    ad_id: "ad1",
    click_id_type: "fbclid",
    landing_path: "/en/coding-bootcamp",
    conversion_path: "/en/apply",
    first_paid_host: HOST,
    first_paid_path: "/en/coding-bootcamp",
    first_paid_at: t0,
    last_paid_host: HOST,
    last_paid_path: "/en/coding-bootcamp",
    last_paid_at: t0,
    experiment_id: null,
    variant: null,
    is_test: 0,
    test_reason: null,
    is_repeat: 0,
    repeat_of: null,
    ...over,
  } as LedgerRow;
}

const setups: GoogleAdsSetups = {
  fetched_at: NOW.toISOString(),
  customers: { [CID]: { name: "Main", currency: "USD", auto_tagging: true } },
  campaigns: {},
  ad_groups: {},
  ads: {},
  conversion_actions: [],
};

const fixture: {
  googleState: GoogleAdsSyncState;
  ledgerRows: LedgerRow[];
  metaEnabled: boolean;
} = {
  googleState: { consecutive_failures: 0, last_success_at: NOW.toISOString(), customers: { [CID]: { name: "Main", currency: "USD", data_through: "2026-09-17" } } },
  ledgerRows: [
    // Legacy row (no stored landing platform): falls back to the latest tags.
    lead({ submission_id: "meta-legacy" }),
    // New row: last paid landing came from Google even though the latest tags were Meta.
    lead({
      submission_id: "google-new",
      browser_hash: "b2",
      first_paid_platform: "google",
      first_paid_campaign_id: "g1",
      first_paid_adset_id: "ag1",
      last_paid_platform: "google",
      last_paid_campaign_id: "g1",
      last_paid_adset_id: "ag1",
    }),
  ],
  metaEnabled: true,
};

vi.mock("../site-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../site-config")>()),
  getSiteConfigs: () => [{ domain: HOST, contentFolder: "site_test", aliases: [] }],
}));
vi.mock("../content-index", () => ({ contentIndex: {} }));
vi.mock("../settings", () => ({
  getAdsSettings: () => ({
    ...DEFAULT_ADS_SETTINGS,
    meta: { ...DEFAULT_ADS_SETTINGS.meta, enabled: fixture.metaEnabled, ad_account_ids: fixture.metaEnabled ? ["111111"] : [] },
    google: { ...DEFAULT_GOOGLE_ADS_SETTINGS, enabled: true, customer_ids: [CID], bigquery: { project: "my-project", dataset: "google_ads" } },
  }),
  getHomePage: () => ({ type: "page", slug: "home" }),
  getSupportedLocales: () => ["en", "es"],
  getDefaultLocale: () => "en",
}));
vi.mock("../site-manager", () => ({ getSiteContextMap: () => new Map() }));
vi.mock("../redirects", () => ({ createPublicUrlResolver: () => ({ test: () => ({ match: false }) }) }));

const PAGES: Record<string, { contentType: string; slug: string; locale: string }> = {
  "/en/coding-bootcamp": { contentType: "landing", slug: "coding-bootcamp", locale: "en" },
  "/en/apply": { contentType: "landing", slug: "apply", locale: "en" },
};
const fakeContentIndex = {
  resolveUrl: (url: string) => {
    const p = PAGES[url];
    return p ? { contentType: p.contentType, slug: p.slug, entry: {} } : null;
  },
  loadCommonData: (contentType: string, slug: string) => {
    const hit = Object.values(PAGES).find((p) => p.contentType === contentType && p.slug === slug);
    return hit ? { locale: hit.locale } : null;
  },
  getLocaleUrls: (slug: string, contentType: string) => {
    const hit = Object.entries(PAGES).find(([, p]) => p.contentType === contentType && p.slug === slug);
    return hit ? { [hit[1].locale]: hit[0] } : {};
  },
} as unknown as ContentIndex;

const ALL_DATES: string[] = [];
for (let d = new Date("2025-06-01T00:00:00.000Z"); d <= NOW; d.setUTCDate(d.getUTCDate() + 1)) ALL_DATES.push(d.toISOString().slice(0, 10));

vi.mock("./meta-ads-days", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  loadMetaRows: () => (fixture.metaEnabled ? metaRows : []),
  listMetaDayDates: () => ALL_DATES,
  loadMetaState: () => ({ accounts: {}, consecutive_failures: 0, last_success_at: NOW.toISOString() }),
  loadMetaCreatives: () => ({ ads: { ad1: { links: [`https://${HOST}/en/coding-bootcamp`], instant_form: false } } }),
  loadMetaPlatformRows: () => [],
}));
vi.mock("./google-ads-days", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  hasGoogleData: () => true,
  listGoogleDayDates: () => ALL_DATES.filter((d) => d <= "2026-09-17"),
  loadGoogleRows: (_site: string, since: string, until: string) => googleRows.filter((r) => r.date >= since && r.date <= until),
  loadGoogleNetworkRows: () => networkRows,
  loadGoogleSetups: () => setups,
  loadGoogleState: () => fixture.googleState,
}));
vi.mock("./paid-detection", () => ({
  isGa4Configured: () => true,
  loadPaidLandingState: () => ({ last_success_at: NOW.toISOString(), last_export_date: DAY }),
  loadPaidLandingDays: () => [paidDay],
  lastCompleteGa4Date: () => "2026-09-18",
}));
vi.mock("./lead-ledger", () => ({
  listLedgerRows: () => fixture.ledgerRows,
  ledgerCollectingSince: () => Date.parse("2026-08-01T00:00:00.000Z"),
}));
vi.mock("./consent-store", () => ({ listConsentDaily: () => [], summarizeConsentRates: () => [] }));
vi.mock("./ads-refresh", () => ({
  isMetaConnected: () => fixture.metaEnabled,
  hasMetaData: () => fixture.metaEnabled,
  hasGa4Data: () => true,
  isProductionSnapshot: () => false,
  getAdsRefreshStatus: () => ({ state: "idle", requested_at: null, started_at: null, finished_at: null, error: null, retry_after: null, progress: null }),
  triggerAdsRefreshIfStale: async () => false,
}));

const { buildAdsReport, AdsPlatformRequiredError } = await import("./ads-report");
const build = (over: Record<string, unknown> = {}) =>
  buildAdsReport({ site: "site_test", days: 28, now: NOW, noRefresh: true, contentIndex: fakeContentIndex, ...over });

describe("buildAdsReport with Google Ads", () => {
  it("adds Google spend next to Meta and keeps platform leads apart", () => {
    const r = build();
    expect(r.totals.spend).toEqual({ USD: 190 });
    expect(r.totals.meta_leads).toBe(5);
    expect(r.totals.google_leads).toBe(3);
    const page = r.pages.find((p) => p.slug === "coding-bootcamp")!;
    expect(page.spend).toEqual({ USD: 160 });
    expect(page.meta_leads).toBe(5);
    expect(page.google_leads).toBe(2);
  });

  it("puts Google spend without a website link in named destinations", () => {
    const r = build();
    expect(r.destinations.find((d) => d.kind === "video_views")?.spend).toEqual({ USD: 20 });
    const form = r.destinations.find((d) => d.kind === "google_lead_form")!;
    expect(form.spend).toEqual({ USD: 10 });
    expect(form.google_leads).toBe(1);
    expect(r.totals.tracked_spend).toEqual({ USD: 160 });
  });

  it("platform google shows only Google spend and visits", () => {
    const r = build({ platform: "google" });
    expect(r.totals.spend).toEqual({ USD: 90 });
    expect(r.totals.meta_leads).toBe(0);
    const page = r.pages.find((p) => p.slug === "coding-bootcamp")!;
    expect(page.spend).toEqual({ USD: 60 });
    expect(page.paid_visits).toBeGreaterThanOrEqual(20);
  });

  it("credits a lead to the platform of its stored paid landing", () => {
    const g = build({ platform: "google" });
    const m = build({ platform: "meta" });
    expect(g.totals.unique_leads).toBe(1);
    expect(m.totals.unique_leads).toBe(1);
    expect(g.warnings.map((w) => w.code)).toContain("lead_platform_legacy");
  });

  it("requires a platform for id filters when both platforms are connected", () => {
    expect(() => build({ campaign_ids: ["g1"] })).toThrow(AdsPlatformRequiredError);
    const r = build({ platform: "google", campaign_ids: ["g1"] });
    expect(r.totals.spend).toEqual({ USD: 60 });
  });

  it("id filters don't need a platform when only Google is connected", () => {
    fixture.metaEnabled = false;
    try {
      const r = build({ campaign_ids: ["g1"] });
      expect(r.totals.spend).toEqual({ USD: 60 });
      expect(r.warnings.map((w) => w.code)).not.toContain("meta_not_connected");
    } finally {
      fixture.metaEnabled = true;
    }
  });

  it("reports the Google block, unticked accounts and networks", () => {
    const r = build();
    expect(r.google.connected).toBe(true);
    expect(r.google.data_through).toBe("2026-09-17");
    expect(r.google.accounts.map((a) => a.id)).toEqual([CID]);
    expect(r.google.unconnected_accounts).toEqual([{ customer_id: "9999999999", paid_visits: 5 }]);
    const nets = Object.fromEntries((r.google_networks?.rows ?? []).map((n) => [n.network, n]));
    expect(nets.search?.spend).toEqual({ USD: 70 });
    expect(nets.youtube?.spend).toEqual({ USD: 20 });
    expect(nets.search?.paid_visits).toBe(25);
  });

  it("warns about transfer lag, and about a stale transfer only when overdue", () => {
    const codes = build().warnings.map((w) => w.code);
    expect(codes).toContain("google_data_through");
    expect(codes).not.toContain("google_transfer_stale");

    const prev = fixture.googleState;
    fixture.googleState = { ...prev, customers: { [CID]: { ...prev.customers[CID], data_through: "2026-09-10", sync_error: "Access Denied" } } };
    try {
      const stale = build().warnings.map((w) => w.code);
      expect(stale).toContain("google_transfer_stale");
      expect(stale).toContain("google_account_not_synced");
    } finally {
      fixture.googleState = prev;
    }
  });
});
