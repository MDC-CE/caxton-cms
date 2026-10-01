import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS, DEFAULT_GOOGLE_ADS_SETTINGS } from "@shared/ads-settings";
import type { AdsReport } from "./ads-report";
import type { GoogleAdsSetups, GoogleAdsSyncState } from "./google-ads-days";

vi.mock("./paid-detection", () => ({ lastCompleteGa4Date: () => "2026-09-18", loadPaidLandingState: () => ({ consecutive_failures: 0 }) }));
vi.mock("./ads-report", () => ({ buildAdsReport: vi.fn(), getAdsReport: vi.fn() }));
vi.mock("./ads-diagnostics", () => ({ GOOGLE_ISSUE_STATE_FILE: "x", loadIssueState: vi.fn(), rollIssueState: vi.fn(), saveIssueState: vi.fn() }));
vi.mock("../settings", () => ({ getAdsSettings: vi.fn() }));

const { googleIssues } = await import("./google-ads-diagnostics");

const NOW = new Date("2026-09-20T12:00:00.000Z");
const CID = "1234567890";

function report(over: Partial<AdsReport> & { google?: Partial<AdsReport["google"]> } = {}): AdsReport {
  const { google, ...rest } = over;
  return {
    window: { start: "2026-08-24", end: "2026-09-19", days: 28 },
    ga4: { configured: true, last_synced_at: null, last_export_date: "2026-09-18", last_error: null },
    totals: { spend: { USD: 1000 }, google_leads: 4, unique_leads: 3 },
    pages: [],
    destinations: [],
    campaigns: [],
    google: {
      connected: true,
      last_synced_at: NOW.toISOString(),
      last_error: null,
      consecutive_failures: 0,
      data_through: "2026-09-17",
      expected_through: "2026-09-17",
      accounts: [],
      unconnected_accounts: [],
      available_accounts: [],
      visit_match: { ga4_link: 40, gclid: 0, tags: 0, none: 2 },
      ...google,
    },
    ...rest,
  } as unknown as AdsReport;
}

const state = (over: Partial<GoogleAdsSyncState> = {}): GoogleAdsSyncState => ({
  consecutive_failures: 0,
  customers: { [CID]: { name: "Main", auto_tagging: true, first_date: "2025-01-01", history_loaded_at: NOW.toISOString() } },
  available_customers: [CID],
  ...over,
});
const setups: GoogleAdsSetups = { fetched_at: "", customers: {}, campaigns: {}, ad_groups: {}, ads: {}, conversion_actions: [] };
const settings = { ...DEFAULT_GOOGLE_ADS_SETTINGS, enabled: true, customer_ids: [CID], bigquery: { project: "p-project", dataset: "ads" } };
const base = { setups, settings, paidState: { consecutive_failures: 0 }, t: DEFAULT_ADS_ALERT_THRESHOLDS, now: NOW };
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("googleIssues", () => {
  it("is quiet when the transfer is current and GA4 is linked", () => {
    expect(googleIssues({ ...base, report: report(), state: state() })).toEqual([]);
  });

  it("flags a late transfer, error once more than 3 days behind", () => {
    const late = googleIssues({ ...base, report: report({ google: { data_through: "2026-09-15" } }), state: state() });
    expect(late.find((i) => i.code === "google_transfer_stale")?.severity).toBe("warning");
    const very = googleIssues({ ...base, report: report({ google: { data_through: "2026-09-10" } }), state: state() });
    expect(very.find((i) => i.code === "google_transfer_stale")?.severity).toBe("error");
  });

  it("flags ticked accounts the transfer doesn't have and unticked accounts sending visits", () => {
    const issues = googleIssues({
      ...base,
      report: report({ google: { unconnected_accounts: [{ customer_id: "9999999999", paid_visits: 500 }] } }),
      state: state({ available_customers: ["9999999999"] }),
    });
    expect(issues.find((i) => i.code === "google_transfer_missing_account")?.severity).toBe("error");
    const unticked = issues.find((i) => i.code === "google_account_not_connected")!;
    expect(unticked.severity).toBe("info");
    expect(unticked.how_to_fix).toContain("Tick it");
  });

  it("flags GA4 not linked and a failed gclid join", () => {
    const issues = googleIssues({
      ...base,
      report: report({ google: { visit_match: { ga4_link: 0, gclid: 0, tags: 0, none: 50 } } }),
      state: state(),
      paidState: { consecutive_failures: 0, gclid_join_error: "Cannot read and write in different locations" },
    });
    expect(codes(issues)).toEqual(expect.arrayContaining(["google_ga4_not_linked", "google_gclid_join_unavailable"]));
    expect(issues.find((i) => i.code === "google_ga4_not_linked")?.severity).toBe("warning");
    expect(issues.find((i) => i.code === "google_gclid_join_unavailable")?.severity).toBe("warning");
  });

  it("explains spend that never reaches the site and warns on missing Google leads", () => {
    const issues = googleIssues({
      ...base,
      t: { ...DEFAULT_ADS_ALERT_THRESHOLDS, severity_spend_floor: { USD: 100 } },
      report: report({
        totals: { spend: { USD: 1000 }, google_leads: 0, unique_leads: 5 } as AdsReport["totals"],
        destinations: [
          { key: "dest:video_views", kind: "video_views", spend: { USD: 200 } },
          { key: "dest:unknown", kind: "unknown_destination", spend: { USD: 300 } },
        ] as unknown as AdsReport["destinations"],
      }),
      state: state(),
    });
    expect(issues.find((i) => i.id === "google_destination_policy:video_views")?.severity).toBe("info");
    expect(issues.find((i) => i.id === "google_destination_policy:unknown")?.severity).toBe("warning");
    expect(codes(issues)).toContain("google_conversions_not_reporting");
    expect(issues.every((i) => i.platform === "google")).toBe(true);
  });

  it("flags auto-tagging off only for spending campaigns without the id suffix", () => {
    const issues = googleIssues({
      ...base,
      report: report({ campaigns: [{ platform: "google", campaign_id: "c1", campaign_name: "Brand", spend: { USD: 50 } }] as AdsReport["campaigns"] }),
      state: state({ customers: { [CID]: { name: "Main", auto_tagging: false } } }),
      setups: { ...setups, campaigns: { c1: { customer_id: CID, name: "Brand", channel_type: "SEARCH", status: "ENABLED", final_url_suffix: null } } },
    });
    expect(codes(issues)).toContain("google_auto_tagging_off");
  });
});
