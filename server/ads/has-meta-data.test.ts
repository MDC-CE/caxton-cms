import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  accounts: ["111"] as string[],
  token: false,
  ga4: false,
  pulledAt: undefined as string | undefined,
  metaDates: [] as string[],
  ga4Dates: [] as string[],
}));

vi.mock("../db-cache", () => ({ CACHE_DIR: "/tmp/has-meta-data-test" }));
vi.mock("../settings", () => ({ getAdsSettings: () => ({ meta: { enabled: h.enabled, ad_account_ids: h.accounts } }) }));
vi.mock("./meta-client", () => ({ isMetaTokenConfigured: () => h.token }));
vi.mock("./meta-ads-days", () => ({
  isMetaStale: () => false,
  isMetaSyncInFlight: () => false,
  listMetaDayDates: () => h.metaDates,
  loadMetaState: () => ({ accounts: {}, consecutive_failures: 0, pulled_from_production_at: h.pulledAt }),
  META_STALE_MS: 86_400_000,
  planMetaSyncSteps: () => 0,
  syncMetaAds: async () => ({ ok: true }),
}));
vi.mock("./paid-detection", () => ({
  isGa4Configured: () => h.ga4,
  listPaidLandingDates: () => h.ga4Dates,
  loadPaidLandingState: () => ({}),
  planPaidLandingSteps: () => 0,
  syncPaidLandingDays: async () => ({ ok: true, fetched: [] }),
}));
vi.mock("../jobs/job-rows", () => ({ latestJobRows: () => [], isSidequestWorkerAlive: () => true, currentWorkerJob: () => undefined }));

const { hasGa4Data, hasMetaData, isMetaConnected, isProductionSnapshot } = await import("./ads-refresh");

beforeEach(() => {
  Object.assign(h, { enabled: true, accounts: ["111"], token: false, ga4: false, pulledAt: undefined, metaDates: [], ga4Dates: [] });
});

describe("hasMetaData", () => {
  it("is true with a token, like isMetaConnected", () => {
    h.token = true;
    expect(hasMetaData("s")).toBe(true);
    expect(isMetaConnected()).toBe(true);
  });

  it("is true without a token only for a production download that has day files", () => {
    expect(hasMetaData("s")).toBe(false);
    h.pulledAt = "2026-09-30T10:00:00.000Z";
    expect(isProductionSnapshot("s")).toBe(true);
    expect(hasMetaData("s")).toBe(false);
    h.metaDates = ["2026-09-29"];
    expect(hasMetaData("s")).toBe(true);
    expect(isMetaConnected()).toBe(false);
  });

  it("stays false when Meta is off or has no accounts, even with a download", () => {
    h.pulledAt = "2026-09-30T10:00:00.000Z";
    h.metaDates = ["2026-09-29"];
    h.enabled = false;
    expect(hasMetaData("s")).toBe(false);
    h.enabled = true;
    h.accounts = [];
    expect(hasMetaData("s")).toBe(false);
  });
});

describe("hasGa4Data", () => {
  it("is true when BigQuery is configured or a download brought GA4 days", () => {
    expect(hasGa4Data("s")).toBe(false);
    h.ga4 = true;
    expect(hasGa4Data("s")).toBe(true);
    h.ga4 = false;
    h.pulledAt = "2026-09-30T10:00:00.000Z";
    h.ga4Dates = ["2026-09-27"];
    expect(hasGa4Data("s")).toBe(true);
  });
});
