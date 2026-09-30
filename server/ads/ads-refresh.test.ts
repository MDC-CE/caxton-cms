import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adsRefreshBackoffMs } from "@shared/ads-refresh-status";
import type { JobRowSummary } from "../jobs/job-rows";

const h = vi.hoisted(() => ({
  cacheDir: "",
  enqueueJob: vi.fn(async () => ({ queued: true })),
  syncMetaAds: vi.fn(async (_opts: { onStep?: (label: string) => void }) => ({ ok: true, mode: "refresh", dates: [], rows: 0 })),
  syncPaidLandingDays: vi.fn(async () => ({ ok: true, fetched: [] })),
  metaSteps: 3,
}));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-refresh-test-"));

vi.mock("../db-cache", () => ({ CACHE_DIR: h.cacheDir }));
vi.mock("../settings", () => ({
  getAdsSettings: () => ({ meta: { enabled: true, ad_account_ids: ["111"] } }),
}));
vi.mock("./meta-client", () => ({ isMetaTokenConfigured: () => true }));
vi.mock("./meta-ads-days", () => ({
  isMetaStale: () => true,
  isMetaSyncInFlight: () => false,
  loadMetaState: () => ({ accounts: {} }),
  META_STALE_MS: 24 * 60 * 60 * 1000,
  planMetaSyncSteps: () => h.metaSteps,
  syncMetaAds: h.syncMetaAds,
}));
vi.mock("./paid-detection", () => ({
  isGa4Configured: () => false,
  loadPaidLandingState: () => ({}),
  planPaidLandingSteps: () => 0,
  syncPaidLandingDays: h.syncPaidLandingDays,
}));
vi.mock("../jobs/job-rows", () => ({
  latestJobRows: () => [],
  isSidequestWorkerAlive: () => true,
  currentWorkerJob: () => undefined,
}));
vi.mock("../jobs/queue", () => ({ enqueueJob: h.enqueueJob }));

const { getAdsRefreshStatus, requestAdsRefresh, runAdsRefresh, triggerAdsRefreshIfStale } = await import("./ads-refresh");

const SITE = "site_test";
const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const MIN = 60 * 1000;
const iso = (t: number) => new Date(t).toISOString();
const statePath = () => path.join(h.cacheDir, SITE, "ads-refresh-state.json");

function seed(state: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state), "utf-8");
}
function readState(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(statePath(), "utf-8"));
}
function job(over: Partial<JobRowSummary>): JobRowSummary {
  return {
    id: 1,
    state: "waiting",
    args: [{ site: SITE }],
    error: null,
    inserted_at: NOW - MIN,
    attempted_at: null,
    completed_at: null,
    failed_at: null,
    canceled_at: null,
    ...over,
  };
}

const alive = { now: NOW, workerAlive: () => true, workerCurrentJob: () => undefined, latestJob: () => null };

beforeEach(() => {
  fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });
  h.enqueueJob.mockClear();
  h.syncMetaAds.mockClear();
  h.syncPaidLandingDays.mockClear();
  h.metaSteps = 3;
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
});

describe("adsRefreshBackoffMs", () => {
  it("grows 1h, 2h, 4h and caps at 6h", () => {
    const hour = 60 * MIN;
    expect([0, 1, 2, 3, 4, 9].map(adsRefreshBackoffMs)).toEqual([0, hour, 2 * hour, 4 * hour, 6 * hour, 6 * hour]);
  });
});

describe("getAdsRefreshStatus", () => {
  it("is idle with no state", () => {
    expect(getAdsRefreshStatus(SITE, alive)).toMatchObject({ state: "idle", error: null, retry_after: null });
  });

  it("is queued while a fresh request waits for a live worker", () => {
    seed({ requested_at: iso(NOW - MIN) });
    expect(getAdsRefreshStatus(SITE, alive).state).toBe("queued");
  });

  it("is failed when the job row failed, and records the failure once", () => {
    seed({ requested_at: iso(NOW - MIN) });
    const deps = { ...alive, latestJob: () => job({ state: "failed", error: "Invalid job class: MetaAdsSyncJob" }) };
    const first = getAdsRefreshStatus(SITE, deps);
    expect(first).toMatchObject({ state: "failed", error: "Invalid job class: MetaAdsSyncJob", retry_after: iso(NOW + 60 * MIN) });
    getAdsRefreshStatus(SITE, deps);
    expect(readState().failure_count).toBe(1);
  });

  it("is failed after 5 minutes queued without starting", () => {
    seed({ requested_at: iso(NOW - 6 * MIN) });
    expect(getAdsRefreshStatus(SITE, alive)).toMatchObject({ state: "failed", error: "The background worker never picked this up." });
  });

  it("stays queued just under the 5 minute cutoff", () => {
    seed({ requested_at: iso(NOW - 4 * MIN) });
    expect(getAdsRefreshStatus(SITE, alive).state).toBe("queued");
  });

  it("is worker_down when a request waits and the worker is not running", () => {
    seed({ requested_at: iso(NOW - MIN) });
    expect(getAdsRefreshStatus(SITE, { ...alive, workerAlive: () => false }).state).toBe("worker_down");
  });

  it("is running once started, and failed when a start never finished", () => {
    seed({ requested_at: iso(NOW - 3 * MIN), started_at: iso(NOW - 2 * MIN) });
    expect(getAdsRefreshStatus(SITE, alive).state).toBe("running");

    seed({ requested_at: iso(NOW - 30 * MIN), started_at: iso(NOW - 20 * MIN) });
    expect(getAdsRefreshStatus(SITE, { ...alive, workerCurrentJob: () => "meta_ads_sync" }).state).toBe("running");
    expect(getAdsRefreshStatus(SITE, alive)).toMatchObject({ state: "failed", error: "The last sync stopped before finishing." });
  });

  it("is idle after a finished run", () => {
    seed({ requested_at: iso(NOW - 10 * MIN), started_at: iso(NOW - 9 * MIN), finished_at: iso(NOW - 8 * MIN) });
    expect(getAdsRefreshStatus(SITE, alive).state).toBe("idle");
  });

  it("shows progress only for the run that is in the state file", () => {
    const started = iso(NOW - 2 * MIN);
    seed({ started_at: started, progress: { done: 2, total: 5, label: "Meta: account 1 of 1, Sep 20–29", run: started } });
    expect(getAdsRefreshStatus(SITE, alive).progress).toEqual({ done: 2, total: 5, label: "Meta: account 1 of 1, Sep 20–29" });

    seed({ started_at: started, progress: { done: 2, total: 5, label: "old", run: iso(NOW - 60 * MIN) } });
    const stale = getAdsRefreshStatus(SITE, alive);
    expect(stale.state).toBe("running");
    expect(stale.progress).toBeNull();
  });

  it("never shows progress outside running", () => {
    const started = iso(NOW - 9 * MIN);
    seed({ started_at: started, finished_at: iso(NOW - 8 * MIN), progress: { done: 1, total: 5, label: "x", run: started } });
    expect(getAdsRefreshStatus(SITE, alive)).toMatchObject({ state: "idle", progress: null });
  });
});

describe("requestAdsRefresh / triggerAdsRefreshIfStale", () => {
  const failedState = () => ({
    requested_at: iso(NOW - 10 * MIN),
    failure_count: 1,
    last_failure_at: iso(NOW - 10 * MIN),
    last_error: "Invalid job class: MetaAdsSyncJob",
    failure_key: `requested:${iso(NOW - 10 * MIN)}`,
  });

  it("automatic refresh waits during the retry backoff", async () => {
    seed(failedState());
    expect(await triggerAdsRefreshIfStale(SITE, undefined, alive)).toBe(false);
    expect(h.enqueueJob).not.toHaveBeenCalled();
  });

  it("automatic refresh retries once the backoff has passed", async () => {
    seed(failedState());
    const later = { ...alive, now: NOW + 2 * 60 * MIN };
    expect(await triggerAdsRefreshIfStale(SITE, undefined, later)).toBe(true);
    expect(h.enqueueJob).toHaveBeenCalledTimes(1);
    expect(h.enqueueJob.mock.calls[0][2]).toMatchObject({ uniqueWhileAlive: true });
  });

  it("manual refresh skips the backoff", async () => {
    seed(failedState());
    const runLocal = vi.fn();
    const status = await requestAdsRefresh(SITE, undefined, "refresh", { manual: true, deps: alive, runLocal });
    expect(status.state).toBe("queued");
    expect(h.enqueueJob).toHaveBeenCalledTimes(1);
    expect(runLocal).not.toHaveBeenCalled();
  });

  it("manual refresh runs in-process when the worker is down", async () => {
    const runLocal = vi.fn();
    await requestAdsRefresh(SITE, undefined, "refresh", { manual: true, deps: { ...alive, workerAlive: () => false }, runLocal });
    expect(runLocal).toHaveBeenCalledTimes(1);
    expect(h.enqueueJob).not.toHaveBeenCalled();
  });

  it("automatic refresh never runs in-process when the worker is down", async () => {
    const runLocal = vi.fn();
    const status = await requestAdsRefresh(SITE, undefined, "refresh", { deps: { ...alive, workerAlive: () => false }, runLocal });
    expect(runLocal).not.toHaveBeenCalled();
    expect(status.state).toBe("worker_down");
    expect(await triggerAdsRefreshIfStale(SITE, undefined, { ...alive, workerAlive: () => false })).toBe(false);
    expect(h.enqueueJob).toHaveBeenCalledTimes(1);
  });
});

describe("runAdsRefresh", () => {
  it("a successful run clears the failure and retry wait", async () => {
    seed({
      failure_count: 2,
      last_failure_at: iso(Date.now()),
      last_error: "boom",
      failure_key: "requested:x",
    });
    await runAdsRefresh({ site: SITE });
    const s = readState();
    expect(s.failure_count).toBe(0);
    expect(s.last_error).toBeUndefined();
    expect(getAdsRefreshStatus(SITE, { ...alive, now: Date.now() })).toMatchObject({ state: "idle", error: null, retry_after: null });
  });

  it("a Meta error finishes the run but starts the retry wait", async () => {
    h.syncMetaAds.mockResolvedValueOnce({ ok: false, mode: "refresh", dates: [], rows: 0, error: "Invalid OAuth token" } as never);
    await runAdsRefresh({ site: SITE });
    const status = getAdsRefreshStatus(SITE, { ...alive, now: Date.now() });
    expect(status.state).toBe("idle");
    expect(status.error).toBe("Meta: Invalid OAuth token");
    expect(status.retry_after).not.toBeNull();
    expect(readState().progress).toBeUndefined();
  });

  it("saves progress as steps start, with a fixed total, then clears it", async () => {
    const seen: Array<unknown> = [];
    const readProgress = () => getAdsRefreshStatus(SITE, { ...alive, now: Date.now() }).progress;
    h.syncMetaAds.mockImplementationOnce(async ({ onStep }) => {
      seen.push(readProgress());
      onStep?.("Meta: looking up account 1 of 1");
      seen.push(readProgress());
      onStep?.("Meta: account 1 of 1, Sep 20–29");
      onStep?.("Meta: saving synced days");
      seen.push(readProgress());
      return { ok: true, mode: "refresh", dates: [], rows: 0 };
    });
    await runAdsRefresh({ site: SITE });
    expect(seen).toEqual([
      { done: 0, total: 3, label: "Starting sync" },
      { done: 0, total: 3, label: "Meta: looking up account 1 of 1" },
      { done: 2, total: 3, label: "Meta: saving synced days" },
    ]);
    expect(readState().progress).toBeUndefined();
    expect(getAdsRefreshStatus(SITE, { ...alive, now: Date.now() }).progress).toBeNull();
  });

  it("writes no progress when there are no planned steps", async () => {
    h.metaSteps = 0;
    let onStepPassed: unknown = "unset";
    h.syncMetaAds.mockImplementationOnce(async ({ onStep }) => {
      onStepPassed = onStep;
      expect(readState().progress).toBeUndefined();
      return { ok: true, mode: "refresh", dates: [], rows: 0 };
    });
    await runAdsRefresh({ site: SITE });
    expect(onStepPassed).toBeUndefined();
  });
});
