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
vi.mock("../settings", () => ({ getLeadConversionEventNames: () => [] }));

const { planPaidLandingSteps, lastCompleteGa4Date, PAID_LANDING_BACKFILL_DAYS } = await import("./paid-detection");
const { addDays, utcDate } = await import("./meta-ads-days");

const SITE = "site_test";
const NOW = new Date("2026-09-29T12:00:00.000Z");

function seedCompleteDay(date: string) {
  const dir = path.join(h.cacheDir, SITE, "paid-landing-days");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${date}.json`),
    JSON.stringify({ date, fetched_at: "", complete: true, candidates: [], organic: [], cookieless: [] }),
    "utf-8",
  );
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
    const until = addDays(utcDate(NOW), -1);
    const cutoff = lastCompleteGa4Date(NOW);
    for (let i = 0; i < PAID_LANDING_BACKFILL_DAYS; i++) {
      const d = addDays(until, -i);
      if (d <= cutoff) seedCompleteDay(d);
    }
    expect(planPaidLandingSteps(SITE, undefined, NOW)).toBe(1);
  });

  it("is 0 when GA4 isn't configured", () => {
    h.configured = false;
    expect(planPaidLandingSteps(SITE, undefined, NOW)).toBe(0);
  });
});
