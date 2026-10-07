import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ cacheDir: "", contentDir: "" }));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-history-cache-"));
h.contentDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-history-content-"));
vi.mock("../db-cache", () => ({ CACHE_DIR: h.cacheDir }));

const { backupAdsHistory, exportAdsHistory, restoreAdsHistoryIfMissing, writeAdsHistoryFiles } = await import("./ads-history-backup");
const { appendChanges, listChangeLogFiles } = await import("./ads-change-log");
const { emptyAdsSetup, loadAdsSetup, mergeMetaAccountAds, mergeMetaCampaigns, noteCampaignName, saveAdsSetup } = await import("./ads-setup");

const SITE = "site_test";
const AT1 = "2026-09-01T10:00:00.000Z";
const AT2 = "2026-09-05T10:00:00.000Z";
const NOW = new Date("2026-09-20T00:00:00.000Z");
const historyDir = () => path.join(h.contentDir, "ads-history");

function seedCatalog() {
  const cat = emptyAdsSetup("meta");
  const ad = { ad_id: "a1", campaign_id: "c1", adset_id: "s1", links: ["https://x.com/old"], instant_form: false, creative_id: "cr1", status: "ACTIVE" };
  mergeMetaAccountAds(cat, "111", [ad], AT1);
  mergeMetaAccountAds(cat, "111", [{ ...ad, links: ["https://x.com/new"] }], AT2);
  mergeMetaCampaigns(
    cat,
    "111",
    [{ id: "c1", account_id: "111", name: "Brand", status: "ACTIVE", effective_status: "ACTIVE", objective: null, daily_budget: "5000", lifetime_budget: null, bid_strategy: null, spend_cap: null }],
    AT1,
  );
  cat.campaigns.c1!.name = "Brand";
  noteCampaignName(cat.campaigns.c1!, "Old brand", "2026-06-01");
  noteCampaignName(cat.campaigns.c1!, "Brand", "2026-09-01");
  saveAdsSetup(SITE, cat);
  return cat;
}

beforeEach(() => {
  fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });
  fs.rmSync(historyDir(), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
  fs.rmSync(h.contentDir, { recursive: true, force: true });
});

describe("exportAdsHistory", () => {
  it("keeps versions, names and fingerprints without metrics or 'still current' timestamps", () => {
    const file = exportAdsHistory(seedCatalog());
    const a1 = file.ads.a1!;
    expect(a1.versions?.map((v) => v.landing_urls[0])).toEqual(["https://x.com/old", "https://x.com/new"]);
    expect(a1.versions?.[0]?.last_seen_at).toBe(AT1);
    expect(a1.versions?.[1]?.last_seen_at).toBeNull();
    expect(a1.history).toEqual({ fields: expect.any(Object), fingerprint: expect.any(String) });
    expect(file.campaigns.c1?.names).toEqual([
      { name: "Old brand", first_seen: "2026-06-01", last_seen: "2026-06-01" },
      { name: "Brand", first_seen: "2026-09-01", last_seen: null },
    ]);
    const text = JSON.stringify(file);
    expect(text).not.toMatch(/"(spend|clicks|impressions|seen_at)"/);
  });
});

describe("writeAdsHistoryFiles", () => {
  it("writes plain .json files and only rewrites what changed", () => {
    seedCatalog();
    appendChanges(SITE, [{ at: AT2, platform: "meta", level: "ad", id: "a1", campaign_id: "c1", field: "creative_id", from: "cr1", to: "cr2", source: "sync" }]);
    const first = writeAdsHistoryFiles(SITE, h.contentDir, NOW);
    expect(first.changed.map((f) => path.basename(f)).sort()).toEqual(["meta-2026-09.json", "meta.json"]);
    expect(fs.existsSync(path.join(historyDir(), "meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(historyDir(), "changes", "meta-2026-09.json"))).toBe(true);

    // A later sync that only bumps "last seen" times changes nothing on disk.
    const cat = loadAdsSetup(SITE, "meta");
    cat.ads.a1!.versions!.at(-1)!.last_seen_at = "2026-09-19T10:00:00.000Z";
    cat.ads.a1!.history!.seen_at = "2026-09-19T10:00:00.000Z";
    saveAdsSetup(SITE, cat);
    expect(writeAdsHistoryFiles(SITE, h.contentDir, NOW).changed).toEqual([]);
  });

  it("deletes backup months past retention", () => {
    seedCatalog();
    fs.mkdirSync(path.join(historyDir(), "changes"), { recursive: true });
    fs.writeFileSync(path.join(historyDir(), "changes", "meta-2023-01.json"), "[]");
    const res = writeAdsHistoryFiles(SITE, h.contentDir, NOW);
    expect(res.deleted.map((f) => path.basename(f))).toEqual(["meta-2023-01.json"]);
    expect(fs.existsSync(path.join(historyDir(), "changes", "meta-2023-01.json"))).toBe(false);
  });
});

describe("backupAdsHistory", () => {
  it("never pushes outside production or on a production download", async () => {
    seedCatalog();
    const push = vi.fn(async () => ({ ok: true }));
    expect(await backupAdsHistory(SITE, h.contentDir, { isProduction: () => false, isSnapshot: () => false, push })).toEqual({ pushed: false, skipped: "not_production" });
    expect(await backupAdsHistory(SITE, h.contentDir, { isProduction: () => true, isSnapshot: () => true, push })).toEqual({ pushed: false, skipped: "snapshot" });
    expect(push).not.toHaveBeenCalled();
    expect(fs.existsSync(historyDir())).toBe(false);
  });

  it("pushes changed files in one commit, then skips when nothing changed", async () => {
    seedCatalog();
    const push = vi.fn(async () => ({ ok: true }));
    const deps = { isProduction: () => true, isSnapshot: () => false, push, now: NOW };
    const res = await backupAdsHistory(SITE, h.contentDir, deps);
    expect(res.pushed).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![1]).toMatch(/^Ads history: 2 URL versions, 0 changes$/);
    expect(await backupAdsHistory(SITE, h.contentDir, deps)).toEqual({ pushed: false, skipped: "no_changes" });
  });

  it("reports a push failure instead of throwing", async () => {
    seedCatalog();
    const res = await backupAdsHistory(SITE, h.contentDir, { isProduction: () => true, isSnapshot: () => false, push: async () => ({ ok: false, error: "403" }) });
    expect(res).toMatchObject({ pushed: false, error: "403" });
  });
});

describe("restoreAdsHistoryIfMissing", () => {
  it("restores versions, names and the change log into an empty cache", () => {
    seedCatalog();
    appendChanges(SITE, [{ at: AT2, platform: "meta", level: "campaign", id: "c1", campaign_id: "c1", field: "status", from: "ACTIVE", to: "PAUSED", source: "sync" }]);
    writeAdsHistoryFiles(SITE, h.contentDir, NOW);
    fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });

    expect(restoreAdsHistoryIfMissing(SITE, h.contentDir, "meta", NOW)).toBe(true);
    const cat = loadAdsSetup(SITE, "meta");
    expect(cat.ads.a1?.versions?.map((v) => v.landing_urls[0])).toEqual(["https://x.com/old", "https://x.com/new"]);
    expect(cat.ads.a1?.landing_urls).toEqual(["https://x.com/new"]);
    expect(cat.campaigns.c1?.names?.[1]).toEqual({ name: "Brand", first_seen: "2026-09-01", last_seen: "2026-09-20" });
    expect(listChangeLogFiles(SITE).map((f) => f.month)).toEqual(["2026-09"]);
  });

  it("leaves a catalog that already has history alone", () => {
    seedCatalog();
    writeAdsHistoryFiles(SITE, h.contentDir, NOW);
    expect(restoreAdsHistoryIfMissing(SITE, h.contentDir, "meta", NOW)).toBe(false);
  });
});
