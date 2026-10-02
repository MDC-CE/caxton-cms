import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ cacheDir: "", configured: true }));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "paid-detection-test-"));

vi.mock("../db-cache", () => ({ CACHE_DIR: h.cacheDir }));
vi.mock("../ecommerce/bigquery-client", () => ({
  getBigQueryConfigStatus: () => ({ configured: h.configured }),
  getBigQueryClient: vi.fn(),
  getBigQuerySettings: vi.fn(),
  fqEventsWildcard: vi.fn(),
}));
vi.mock("../analytics/reports", () => ({
  bqNormalizedPagePathSql: () => "",
  bqSessionLastClickChannelSql: () => "",
}));
vi.mock("../settings", () => ({ getLeadConversionEventNames: () => [], getAdsSettings: () => ({ meta: { enabled: true, ad_account_ids: [] } }) }));

const { planPaidLandingSteps, lastCompleteGa4Date, PAID_LANDING_BACKFILL_DAYS, PAID_LANDING_SCHEMA_VERSION } = await import("./paid-detection");
const { addDays, utcDate } = await import("./meta-ads-days");

const SITE = "site_test";
const NOW = new Date("2026-09-29T12:00:00.000Z");

function seedCompleteDay(date: string, schemaVersion = PAID_LANDING_SCHEMA_VERSION) {
  const dir = path.join(h.cacheDir, SITE, "paid-landing-days");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${date}.json`),
    JSON.stringify({ date, fetched_at: "", complete: true, candidates: [], organic: [], cookieless: [], schema_version: schemaVersion }),
    "utf-8",
  );
}

function seedWindow(schemaVersion?: number) {
  const until = addDays(utcDate(NOW), -1);
  const cutoff = lastCompleteGa4Date(NOW);
  for (let i = 0; i < PAID_LANDING_BACKFILL_DAYS; i++) {
    const d = addDays(until, -i);
    if (d <= cutoff) seedCompleteDay(d, schemaVersion);
  }
}

beforeEach(() => {
  fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });
  h.configured = true;
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
});

describe("planPaidLandingSteps", () => {
  it("caps a first load at 30 days per run", () => {
    expect(planPaidLandingSteps(SITE, undefined, NOW)).toBe(30);
  });

  it("only counts days still missing or not yet final", () => {
    seedWindow();
    expect(planPaidLandingSteps(SITE, undefined, NOW)).toBe(1);
  });

  it("re-reads every older-schema day in one run, past the 30-day cap", () => {
    seedWindow(2);
    seedCompleteDay(addDays(utcDate(NOW), -200), 2);
    const cached = PAID_LANDING_BACKFILL_DAYS - 1;
    expect(planPaidLandingSteps(SITE, undefined, NOW)).toBe(1 + cached + 1);
  });

  it("is 0 when GA4 isn't configured", () => {
    h.configured = false;
    expect(planPaidLandingSteps(SITE, undefined, NOW)).toBe(0);
  });
});
