import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsDiagnostics } from "./ads-diagnostics";

const h = vi.hoisted(() => ({
  cacheDir: "",
  metaSyncedAt: "2026-09-29T08:00:00.000Z" as string | undefined,
  ga4Export: "2026-09-27" as string | undefined,
}));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-snapshots-test-"));

vi.mock("../db-cache", () => ({ CACHE_DIR: h.cacheDir }));
vi.mock("./meta-ads-days", () => ({ loadMetaState: () => ({ accounts: {}, consecutive_failures: 0, last_success_at: h.metaSyncedAt }) }));
vi.mock("./paid-detection", () => ({ loadPaidLandingState: () => ({ consecutive_failures: 0, last_export_date: h.ga4Export }) }));

const {
  ADS_SNAPSHOT_MAX,
  ADS_SNAPSHOT_TTL_MS,
  AdsIdFilterError,
  clampAdsLimit,
  clampAdsOffset,
  currentSnapshotMarkers,
  filterIssuesByIds,
  loadAdsSnapshot,
  newerDataAvailable,
  parseAdIdFilters,
  parseAdIdList,
  parseIssueIds,
  saveAdsSnapshot,
  trimIssueAds,
} = await import("./ads-diagnostics-snapshots");

const SITE = "site_test";
const NOW = new Date("2026-09-29T12:00:00.000Z");

function issue(id: string, ads = 5): AdsIssue {
  return {
    id,
    code: "missing_tracking_params",
    severity: "warning",
    title: id,
    why: "",
    how_to_fix: "",
    spend_affected: { USD: 10 },
    scope: {},
    site_fixable: false,
    details: {
      ads: Array.from({ length: ads }, (_, i) => ({ ad_id: `ad${i}` }) as never),
      ads_total: ads,
      ads_offset: 0,
    },
  };
}

function diag(issues: AdsIssue[], generatedAt = NOW.toISOString()): AdsDiagnostics {
  return { generated_at: generatedAt, window_days: 28, issue_window_days: 28, issues } as unknown as AdsDiagnostics;
}

beforeEach(() => {
  fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });
  h.metaSyncedAt = "2026-09-29T08:00:00.000Z";
  h.ga4Export = "2026-09-27";
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
});

describe("saveAdsSnapshot / loadAdsSnapshot", () => {
  it("reuses one id for identical issues and markers (generated_at ignored)", () => {
    const a = saveAdsSnapshot(SITE, diag([issue("x")]), NOW);
    const b = saveAdsSnapshot(SITE, diag([issue("x")], "2026-09-29T12:05:00.000Z"), NOW);
    expect(a.id).toMatch(/^ads_[a-f0-9]{16}$/);
    expect(b.id).toBe(a.id);
    expect(saveAdsSnapshot(SITE, diag([issue("y")]), NOW).id).not.toBe(a.id);
    h.metaSyncedAt = "2026-09-29T11:00:00.000Z";
    expect(saveAdsSnapshot(SITE, diag([issue("x")]), NOW).id).not.toBe(a.id);
  });

  it("reads back until the TTL, then reports expired (also for unknown or malformed ids)", () => {
    const snap = saveAdsSnapshot(SITE, diag([issue("x")]), NOW);
    const hit = loadAdsSnapshot(SITE, snap.id, new Date(NOW.getTime() + ADS_SNAPSHOT_TTL_MS - 1000));
    expect(hit.status).toBe("ok");
    expect(loadAdsSnapshot(SITE, snap.id, new Date(NOW.getTime() + ADS_SNAPSHOT_TTL_MS + 1000))).toEqual({ status: "expired" });
    expect(loadAdsSnapshot(SITE, "ads_0000000000000000", NOW)).toEqual({ status: "expired" });
    expect(loadAdsSnapshot(SITE, "../../etc/passwd", NOW)).toEqual({ status: "expired" });
  });

  it(`keeps only the newest ${ADS_SNAPSHOT_MAX}`, () => {
    for (let i = 0; i < ADS_SNAPSHOT_MAX + 5; i++) {
      saveAdsSnapshot(SITE, diag([issue(`i${i}`)]), new Date(NOW.getTime() + i * 1000));
    }
    const files = fs.readdirSync(path.join(h.cacheDir, SITE, "ads-diagnostics-snapshots"));
    expect(files).toHaveLength(ADS_SNAPSHOT_MAX);
  });

  it("flags newer data when Meta or GA4 synced after the snapshot", () => {
    const snap = saveAdsSnapshot(SITE, diag([issue("x")]), NOW);
    expect(newerDataAvailable(snap, currentSnapshotMarkers(SITE))).toBe(false);
    h.ga4Export = "2026-09-28";
    expect(newerDataAvailable(snap, currentSnapshotMarkers(SITE))).toBe(true);
    h.ga4Export = "2026-09-27";
    h.metaSyncedAt = "2026-09-29T11:30:00.000Z";
    expect(newerDataAvailable(snap, currentSnapshotMarkers(SITE))).toBe(true);
  });
});

describe("trimming helpers", () => {
  it("pages each issue's ads and keeps the total", () => {
    const [t] = trimIssueAds([issue("x", 7)], 3, 2);
    expect(t!.details!.ads.map((a) => a.ad_id)).toEqual(["ad2", "ad3", "ad4"]);
    expect(t!.details).toMatchObject({ ads_total: 7, ads_offset: 2 });
    const noDetails = { ...issue("y"), details: undefined };
    expect(trimIssueAds([noDetails], 3, 0)[0]).toBe(noDetails);
  });

  it("clamps limits / offsets and parses issue ids", () => {
    expect(clampAdsLimit(undefined, 3)).toBe(3);
    expect(clampAdsLimit("500", 3)).toBe(200);
    expect(clampAdsLimit("0", 50)).toBe(50);
    expect(clampAdsOffset("-4")).toBe(0);
    expect(clampAdsOffset("12")).toBe(12);
    expect(parseIssueIds("a, b,,a")).toEqual(["a", "b"]);
    expect(parseIssueIds(["dest:x.com|/a,b"])).toEqual(["dest:x.com|/a,b"]);
    expect(parseIssueIds(Array.from({ length: 12 }, (_, i) => `i${i}`))).toHaveLength(10);
    expect(parseIssueIds(undefined)).toEqual([]);
  });
});

describe("id filters", () => {
  const ad = (ad_id: string, adset_id: string, campaign_id: string) => ({ ad_id, adset_id, campaign_id }) as never;
  const withAds = (id: string, ads: unknown[], extra: Record<string, unknown> = {}): AdsIssue => ({
    ...issue(id, 0),
    details: { ads: ads as never, ads_total: ads.length, ads_offset: 0, ...extra },
  });

  it("parses numeric id lists and rejects bad or too many ids", () => {
    expect(parseAdIdFilters({ campaign_ids: ["1", "2", "1"], "ad_ids[]": "5,6" })).toEqual({ campaign_ids: ["1", "2"], ad_ids: ["5", "6"] });
    expect(parseAdIdFilters({})).toEqual({});
    expect(() => parseAdIdList(["12a"], "ad_ids")).toThrow(AdsIdFilterError);
    expect(() => parseAdIdList(Array.from({ length: 21 }, (_, i) => String(i)), "ad_ids")).toThrow(/at most 20/);
  });

  it("keeps matching issues, narrows their ads and totals, and keeps issues with no ad scope", () => {
    const issues = [
      withAds("a", [ad("1", "10", "100"), ad("2", "20", "200"), ad("3", "10", "100")]),
      withAds("b", [ad("4", "40", "400")]),
      { ...issue("sync"), details: undefined },
      withAds("dest", [], { ga4_seen: [{ campaign_id: "100", adset_id: null, ad_id: null }, { campaign_id: "999", adset_id: null, ad_id: null }] }),
    ];
    const out = filterIssuesByIds(issues, { campaign_ids: ["100"] });
    expect(out.map((i) => i.id)).toEqual(["a", "sync", "dest"]);
    expect(out[0]!.details!.ads.map((a) => a.ad_id)).toEqual(["1", "3"]);
    expect(out[0]!.details!.ads_total).toBe(2);
    expect(out[2]!.details!.ga4_seen).toHaveLength(1);
    expect(filterIssuesByIds(issues, { campaign_ids: ["100"], adset_ids: ["20"] }).map((i) => i.id)).toEqual(["sync"]);
    expect(filterIssuesByIds(issues, {})).toBe(issues);
  });
});
