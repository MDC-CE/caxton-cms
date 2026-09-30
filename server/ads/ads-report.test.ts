import { describe, expect, it, vi } from "vitest";
import type { LedgerRow } from "./lead-ledger";
import type { MetaAdDayRow } from "./meta-client";
import type { PaidLandingCandidateRow, PaidLandingDayFile } from "./paid-detection";
import { DEFAULT_ADS_SETTINGS } from "@shared/ads-settings";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const DAY = "2026-09-15";
const HOST = "example.com";

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
  {
    date: DAY,
    account_id: "111111",
    currency: "USD",
    campaign_id: "c2",
    campaign_name: "Lead form",
    adset_id: "s2",
    adset_name: "US",
    ad_id: "ad2",
    ad_name: "Ad 2",
    spend: 40,
    impressions: 2000,
    reach: 1800,
    frequency: 1.1,
    link_clicks: 0,
    landing_page_views: 0,
    pixel_leads: 0,
    instant_form_leads: 3,
  },
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

const paidDay: PaidLandingDayFile = {
  date: DAY,
  fetched_at: NOW.toISOString(),
  complete: true,
  candidates: [
    candidate({}),
    candidate({ source: "facebook", medium: "referral", utm_id: null, utm_term: null, utm_content: null, sessions: 7, engaged_sessions: 2, sessions_with_lead: 0 }),
  ],
  organic: [{ host: HOST, path: "/en/coding-bootcamp", sessions: 200, engaged_sessions: 120, sessions_with_lead: 6 } as never],
  cookieless: [],
};

const t0 = Date.parse(`${DAY}T10:00:00.000Z`);
function lead(over: Partial<LedgerRow>): LedgerRow {
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

const ledgerRows: LedgerRow[] = [
  lead({ submission_id: "a" }),
  lead({ submission_id: "b", browser_hash: "b2" }),
  lead({ submission_id: "c", is_repeat: 1, repeat_of: "a" }),
  lead({ submission_id: "t", is_test: 1, test_reason: "staff_session" }),
];

vi.mock("../site-config", () => ({
  getSiteConfigs: () => [{ domain: HOST, contentFolder: "site_test", aliases: [] }],
}));
vi.mock("../settings", () => ({
  getAdsSettings: () => ({ ...DEFAULT_ADS_SETTINGS, meta: { ...DEFAULT_ADS_SETTINGS.meta, enabled: true, ad_account_ids: ["111111"] } }),
}));
vi.mock("../seo-index", () => ({
  loadSeoIndex: () => ({
    version: 1,
    generated_at: "",
    entries: {
      "landing/coding-bootcamp/en": { content_type: "landing", slug: "coding-bootcamp", locale: "en", path: "/en/coding-bootcamp" },
      "landing/apply/en": { content_type: "landing", slug: "apply", locale: "en", path: "/en/apply" },
    },
    by_path: { "/en/coding-bootcamp": "landing/coding-bootcamp/en", "/en/apply": "landing/apply/en" },
    clusters: {},
    orphans: [],
    warnings: [],
  }),
}));
vi.mock("../redirects", () => ({ lookupRedirect: () => null }));
vi.mock("./meta-ads-days", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    loadMetaRows: () => metaRows,
    loadMetaState: () => ({ accounts: {}, consecutive_failures: 0, last_success_at: NOW.toISOString() }),
    loadMetaCreatives: () => ({
      ads: {
        ad1: { links: [`https://${HOST}/en/coding-bootcamp?utm_source=facebook`], instant_form: false },
        ad2: { links: [], instant_form: true },
      },
    }),
  };
});
vi.mock("./paid-detection", () => ({
  isGa4Configured: () => true,
  loadPaidLandingState: () => ({ last_success_at: NOW.toISOString(), last_export_date: DAY }),
  loadPaidLandingDays: () => [paidDay],
}));
vi.mock("./lead-ledger", () => ({
  listLedgerRows: () => ledgerRows,
  ledgerCollectingSince: () => Date.parse("2026-08-01T00:00:00.000Z"),
}));
vi.mock("./consent-store", () => ({
  listConsentDaily: () => [],
  summarizeConsentRates: () => [],
}));
vi.mock("./ads-refresh", () => ({
  isMetaConnected: () => true,
  isAdsRefreshing: () => false,
  triggerAdsRefreshIfStale: async () => false,
}));

const { buildAdsReport } = await import("./ads-report");

describe("buildAdsReport join", () => {
  const report = buildAdsReport({ site: "site_test", days: 28, now: NOW, noRefresh: true });
  const page = report.pages.find((p) => p.slug === "coding-bootcamp")!;

  it("joins Meta spend, GA4 paid visits, and credited ledger leads on the landing page", () => {
    expect(page).toBeTruthy();
    expect(page.spend).toEqual({ USD: 100 });
    expect(page.paid_visits).toBe(50);
    expect(page.unclear_visits).toBe(7);
    expect(page.unique_leads).toBe(2);
    expect(page.submissions).toBe(3);
    expect(page.repeat_submissions).toBe(1);
    expect(page.cost_per_lead).toEqual({ USD: 50 });
    expect(page.meta_leads).toBe(5);
    expect(page.organic?.sessions).toBe(200);
  });

  it("never credits the form page and excludes test leads", () => {
    expect(report.pages.find((p) => p.slug === "apply")).toBeUndefined();
    expect(report.totals.test_submissions).toBe(1);
    expect(report.totals.unique_leads).toBe(2);
    expect(page.started_here).toBe(2);
  });

  it("puts instant-form spend in destinations so totals reconcile with Meta", () => {
    const form = report.destinations.find((d) => d.kind === "instant_form")!;
    expect(form.spend).toEqual({ USD: 40 });
    expect(form.instant_form_leads).toBe(3);
    expect(report.totals.spend).toEqual({ USD: 140 });
    expect(report.totals.tracked_spend).toEqual({ USD: 100 });
  });

  it("keeps Meta leads and site leads separate and flags low sample", () => {
    expect(report.totals.meta_leads).toBe(5);
    expect(report.totals.unique_leads).toBe(2);
    expect(page.low_sample).toBe(false);
    expect(report.warnings.map((w) => w.code)).not.toContain("mixed_currency");
  });
});
