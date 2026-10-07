import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ads-rollups-windows-"));
const SETTINGS = { meta: { enabled: true, ad_account_ids: ["111"] } };

vi.mock("../db-cache", () => ({ CACHE_DIR: TMP }));
vi.mock("./paid-detection", () => ({ loadPaidLandingDays: () => [] }));
vi.mock("./providers/meta", () => ({ metaProvider: {} }));
vi.mock("./providers/google", () => ({ googleProvider: {} }));
vi.mock("../settings", () => ({ getAdsSettings: () => SETTINGS }));
vi.mock("./ads-refresh", () => ({
  getAdsRefreshStatus: () => ({ state: "idle", requested_at: null, started_at: null, finished_at: null, error: null, retry_after: null, progress: null }),
  triggerAdsRefreshIfStale: async () => false,
}));
const buildAdsReport = vi.fn(() => ({ window: { start: "2026-09-01", end: "2026-09-28", days: 28 }, warnings: [], built: "fresh" }));
vi.mock("./ads-report", () => ({
  buildAdsReport,
  isRefreshWarning: () => false,
  refreshWarnings: () => [],
}));

const { ADS_ATTRIBUTION_VERSION, ADS_REPORT_WINDOWS_DIR, assembleAdsReportFromRollups, reportSettingsHash } = await import("./ads-rollups");

const SITE = "site_test";
const windowFile = path.join(TMP, SITE, ADS_REPORT_WINDOWS_DIR, "all-28d-last_paid.json");

function saveWindow(hash: string) {
  fs.mkdirSync(path.dirname(windowFile), { recursive: true });
  fs.writeFileSync(windowFile, JSON.stringify({ generation: 0, settings_hash: hash, built_at: "2026-09-29T00:00:00.000Z", report: { window: { start: "2026-09-01", end: "2026-09-28", days: 28 }, warnings: [], built: "saved" } }));
}

describe("saved report windows and ADS_ATTRIBUTION_VERSION", () => {
  beforeEach(() => {
    buildAdsReport.mockClear();
    fs.rmSync(path.join(TMP, SITE), { recursive: true, force: true });
  });
  afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("changes the hash when the attribution version changes", () => {
    expect(reportSettingsHash(SETTINGS, ADS_ATTRIBUTION_VERSION)).not.toBe(reportSettingsHash(SETTINGS, ADS_ATTRIBUTION_VERSION - 1));
    expect(reportSettingsHash(SETTINGS)).toBe(reportSettingsHash(SETTINGS, ADS_ATTRIBUTION_VERSION));
  });

  it("serves a window saved under the current version", async () => {
    saveWindow(reportSettingsHash(SETTINGS));
    const r = (await assembleAdsReportFromRollups({ site: SITE, days: 28, noRefresh: true })) as unknown as { built: string };
    expect(r.built).toBe("saved");
    expect(buildAdsReport).not.toHaveBeenCalled();
  });

  it("rebuilds once a window saved under an older version, then serves the new copy", async () => {
    saveWindow(reportSettingsHash(SETTINGS, ADS_ATTRIBUTION_VERSION - 1));
    const first = (await assembleAdsReportFromRollups({ site: SITE, days: 28, noRefresh: true })) as unknown as { built: string };
    expect(first.built).toBe("fresh");
    expect(buildAdsReport).toHaveBeenCalledTimes(1);
    const second = (await assembleAdsReportFromRollups({ site: SITE, days: 28, noRefresh: true })) as unknown as { built: string };
    expect(second.built).toBe("fresh");
    expect(buildAdsReport).toHaveBeenCalledTimes(1);
  });
});
