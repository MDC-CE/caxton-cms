import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchProductionAdminResult } from "../dev-production-fetch";

const h = vi.hoisted(() => ({ cacheDir: "" }));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-pull-test-"));

vi.mock("../db-cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("../db-cache")>()), CACHE_DIR: h.cacheDir }));
vi.mock("../dev-production-fetch", () => ({
  fetchProductionAdmin: vi.fn(),
  resolveProductionOrigin: () => "https://prod.test",
}));

const { applyAdsSnapshot, buildAdsExport, pullProductionAds, parseAdsExport } = await import("./pull-production");

const SITE = "site_pull_test";
const ORIGIN = "https://prod.test";
const NOW = new Date("2026-09-30T12:00:00.000Z");
const live = (...p: string[]) => path.join(h.cacheDir, SITE, ...p);

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), "utf-8");
}
function readJson<T = Record<string, unknown>>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function metaDay(date: string, spend: number) {
  return { date, fetched_at: NOW.toISOString(), rows: [{ date, account_id: "111", currency: "USD", ad_id: "a1", spend }] };
}

function snapshot(over: Record<string, unknown> = {}) {
  return parseAdsExport({
    meta_days: [metaDay("2026-09-28", 10), metaDay("2026-09-29", 20)],
    platform_days: [{ date: "2026-09-29", fetched_at: NOW.toISOString(), rows: [] }],
    meta_state: { consecutive_failures: 0, accounts: { "111": { name: "Prod", currency: "USD", account_status: 1 } }, last_success_at: "2026-09-29T08:00:00.000Z" },
    creatives: { fetched_at: "2026-09-29T08:00:00.000Z", ads: { a1: { ad_id: "a1" } } },
    paid_landing_days: [{ date: "2026-09-27", fetched_at: NOW.toISOString(), complete: true, candidates: [], organic: [], cookieless: [] }],
    paid_landing_state: { consecutive_failures: 0, last_export_date: "2026-09-27" },
    window: { since: "2026-07-03", until: "2026-09-30", days: 90 },
    ...over,
  })!;
}

function seedLocal() {
  writeJson(live("meta-ads-days", "2026-08-01.json"), metaDay("2026-08-01", 999));
  writeJson(live("meta-ads-days", "2026-09-28.json"), metaDay("2026-09-28", 1));
  writeJson(live("meta-ads-state.json"), { consecutive_failures: 0, accounts: {}, last_success_at: "2026-09-01T00:00:00.000Z" });
  writeJson(live("paid-landing-days", "2026-08-01.json"), { date: "2026-08-01", candidates: [] });
  writeJson(live("ads-report-windows", "meta-28-last_paid.json"), { generation: 1 });
}

function okResponse(body: unknown): FetchProductionAdminResult {
  return { ok: true, response: new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }) };
}

beforeEach(() => {
  fs.rmSync(live(), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
});

describe("applyAdsSnapshot", () => {
  it("replaces local days, stamps the download and clears saved Diagnostics results", () => {
    seedLocal();
    const out = applyAdsSnapshot(SITE, snapshot(), ORIGIN, { now: NOW });

    expect(out).toEqual({ meta_days: 2, platform_days: 1, ga4_days: 1, last_date: "2026-09-29" });
    expect(fs.readdirSync(live("meta-ads-days")).sort()).toEqual(["2026-09-28.json", "2026-09-29.json"]);
    expect(readJson<{ rows: Array<{ spend: number }> }>(live("meta-ads-days", "2026-09-28.json")).rows[0]!.spend).toBe(10);
    expect(fs.readdirSync(live("paid-landing-days"))).toEqual(["2026-09-27.json"]);
    expect(fs.existsSync(live("meta-ads-platform-days", "2026-09-29.json"))).toBe(true);
    expect(readJson(live("meta-ads-state.json"))).toMatchObject({
      last_success_at: "2026-09-29T08:00:00.000Z",
      history_since: "2026-09-28",
      pulled_from_production_at: NOW.toISOString(),
      production_origin: ORIGIN,
      snapshot_last_date: "2026-09-29",
    });
    expect(fs.existsSync(live("ads-report-windows"))).toBe(false);
    expect(fs.readdirSync(live()).filter((n) => n.includes(".pull-"))).toEqual([]);
  });

  it("leaves live data untouched when the swap fails halfway", () => {
    seedLocal();
    let calls = 0;
    const flaky = (from: string, to: string) => {
      calls++;
      if (calls === 4) throw new Error("disk full");
      fs.renameSync(from, to);
    };
    expect(() => applyAdsSnapshot(SITE, snapshot(), ORIGIN, { now: NOW, rename: flaky })).toThrow("disk full");

    expect(fs.readdirSync(live("meta-ads-days")).sort()).toEqual(["2026-08-01.json", "2026-09-28.json"]);
    expect(readJson<{ rows: Array<{ spend: number }> }>(live("meta-ads-days", "2026-09-28.json")).rows[0]!.spend).toBe(1);
    expect(fs.readdirSync(live("paid-landing-days"))).toEqual(["2026-08-01.json"]);
    expect(readJson(live("meta-ads-state.json"))).not.toHaveProperty("pulled_from_production_at");
    expect(fs.existsSync(live("meta-ads-platform-days"))).toBe(false);
    expect(fs.readdirSync(live()).filter((n) => n.includes(".pull-"))).toEqual([]);
  });

  it("round-trips through buildAdsExport", () => {
    applyAdsSnapshot(SITE, snapshot(), ORIGIN, { now: NOW });
    const exported = buildAdsExport(SITE, 90, NOW);
    expect(exported.window).toEqual({ since: "2026-07-03", until: "2026-09-30", days: 90 });
    expect(exported.meta_days.map((d) => d.date)).toEqual(["2026-09-28", "2026-09-29"]);
    expect(exported.paid_landing_days.map((d) => d.date)).toEqual(["2026-09-27"]);
    expect(buildAdsExport(SITE, 2, NOW).meta_days.map((d) => d.date)).toEqual(["2026-09-29"]);
  });
});

describe("pullProductionAds", () => {
  const idle = { isBusy: () => false, now: NOW };

  it("refuses while a local sync is running and never calls production", async () => {
    const fetchAdmin = vi.fn();
    const r = await pullProductionAds(SITE, {}, { isBusy: () => true, fetchAdmin });
    expect(r).toMatchObject({ success: false, pulled: false });
    expect(r.reason).toContain("Ads Sync or Ads Run is in progress");
    expect(fetchAdmin).not.toHaveBeenCalled();
  });

  it("passes the production-token prompt through", async () => {
    const payload = {
      code: "production_staff_token_required" as const,
      productionOrigin: ORIGIN,
      envVar: "PRODUCTION_STAFF_TOKEN" as const,
      error: "token needed",
    };
    const r = await pullProductionAds(SITE, {}, { ...idle, fetchAdmin: async () => ({ ok: false, kind: "token_required", payload }) });
    expect(r).toMatchObject({ success: false, code: "production_staff_token_required", productionOrigin: ORIGIN, reason: "token needed" });
  });

  it("explains a 404 as 'not deployed yet' and a network error plainly", async () => {
    const notFound = await pullProductionAds(SITE, {}, {
      ...idle,
      fetchAdmin: async () => ({ ok: false, kind: "http", status: 404, body: "", productionOrigin: ORIGIN, response: new Response(null, { status: 404 }) }),
    });
    expect(notFound).toMatchObject({ success: false, not_supported: true });
    expect(notFound.reason).toContain("Deploy");

    const down = await pullProductionAds(SITE, {}, {
      ...idle,
      fetchAdmin: async () => ({ ok: false, kind: "network", error: "Could not reach production (ECONNREFUSED)", productionOrigin: ORIGIN }),
    });
    expect(down.reason).toContain("ECONNREFUSED");
  });

  it("keeps local data when production has nothing for the window", async () => {
    seedLocal();
    const r = await pullProductionAds(SITE, {}, { ...idle, fetchAdmin: async () => okResponse({ ...snapshot(), meta_days: [], paid_landing_days: [] }) });
    expect(r.success).toBe(false);
    expect(fs.readdirSync(live("meta-ads-days")).sort()).toEqual(["2026-08-01.json", "2026-09-28.json"]);
  });

  it("downloads, asks for the clamped window and applies it", async () => {
    let asked = "";
    const r = await pullProductionAds(SITE, { days: 9999 }, {
      ...idle,
      fetchAdmin: async (url) => {
        asked = url.toString();
        return okResponse(snapshot());
      },
    });
    expect(asked).toBe("https://prod.test/api/ads/export?days=395");
    expect(r).toMatchObject({ success: true, pulled: true, productionOrigin: ORIGIN, imported: { meta_days: 2, last_date: "2026-09-29" } });
    expect(readJson(live("meta-ads-state.json"))).toMatchObject({ production_origin: ORIGIN });
  });
});
