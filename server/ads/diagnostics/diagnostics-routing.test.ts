import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredValidationIssue, ValidationIssueCompletion } from "../../../scripts/validation/shared/types";

const h = vi.hoisted(() => ({
  cacheDir: "",
  issues: new Map<string, unknown>(),
  completions: new Map<string, unknown>(),
  adsUnder: [] as string[],
  jobN: 0,
}));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-diag-routing-"));

vi.mock("../../db-cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../db-cache")>()), CACHE_DIR: h.cacheDir }));
vi.mock("../../jobs/queue", () => ({ enqueueJob: vi.fn(async () => ({ queued: true })) }));
vi.mock("./fork-service", () => ({
  startAdsForkJob: vi.fn(() => ({ ok: true, job: { job_id: "fork_1" } })),
  pendingForVerify: vi.fn(() => []),
}));
vi.mock("./jobs", () => ({
  newAdsJobId: vi.fn(() => `recheck_${++h.jobN}`),
  writeAdsJobRecord: vi.fn(),
  updateAdsJobRecord: vi.fn(),
  readAdsJobRecord: vi.fn(() => ({ status: "queued" })),
  writeAdsJobResult: vi.fn(),
}));
vi.mock("../ads-setup", () => ({ adIdsUnder: vi.fn(() => h.adsUnder), loadAdsSetup: vi.fn(() => ({ ads: {}, accounts: {} })) }));
vi.mock("./context", () => ({
  verifyContextFor: (site: string, now = new Date()) => ({ site, now, lastSyncAt: {}, timeZoneFor: () => null }),
}));
vi.mock("./save", () => ({
  adsValidationCache: () => ({
    getIssueById: (id: string) => h.issues.get(id) ?? null,
    getCompletion: (id: string) => h.completions.get(id),
    setAdsPending: vi.fn((id: string, c: unknown) => h.completions.set(id, c)),
    clearAdsPending: vi.fn((id: string) => h.completions.delete(id)),
    flush: vi.fn(async () => undefined),
  }),
}));

const { enqueueJob } = await import("../../jobs/queue");
const { startAdsForkJob } = await import("./fork-service");
const { requestAdsRecheck, resetRecheckBatchesForTests, ADS_RECHECK_COALESCE_MS } = await import("./recheck");
const { markAdsIssueFixed, undoAdsIssueFixed } = await import("./actions");
const { runAdsRecheckJob, ADS_RECHECK_DEFER_MS } = await import("../../jobs/definitions/ads-recheck");
const { snapKpiDays, toIssueRow } = await import("./read");
const { sumRollupsSince } = await import("../ads-rollups");

const SITE = "site_routing_test";

function issue(code: string, extra: { level?: "account" | "campaign" | "ad"; affected?: string[]; validator?: string } = {}): StoredValidationIssue {
  const level = extra.level ?? "campaign";
  const affected = extra.affected ?? ["a1"];
  const id = `ads:meta:${code}:${level}:r1`;
  const i = {
    id,
    validator: extra.validator ?? "ads-meta",
    code,
    severity: "warning",
    message: "m",
    lastSeenAt: "2026-09-30T00:00:00.000Z",
    category: "ads",
    ads: {
      platform: "meta",
      level,
      resource_id: "r1",
      account_id: "act1",
      affected_ads: affected,
      evidence: { id: `${code}:legacy`, code, severity: "warning", title: "T", why: "W", how_to_fix: "F", spend_affected: {}, scope: {}, site_fixable: false },
      measured_at: "2026-09-30T00:00:00.000Z",
      window: { start: "2026-09-02", end: "2026-09-29", days: 28 },
      first_seen: "2026-09-30T00:00:00.000Z",
    },
  } as unknown as StoredValidationIssue;
  h.issues.set(id, i);
  return i;
}

beforeEach(() => {
  h.issues.clear();
  h.completions.clear();
  h.adsUnder = [];
  vi.mocked(enqueueJob).mockClear();
  vi.mocked(startAdsForkJob).mockClear();
  resetRecheckBatchesForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestAdsRecheck routing", () => {
  it("rejects unknown issues and checks that need new data", () => {
    expect(requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: "ads:meta:x:ad:1" } })).toMatchObject({ ok: false, status: 404, code: "ads_issue_not_found" });
    const fresh = issue("spend_zero_visits");
    expect(requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: fresh.id } })).toMatchObject({ ok: false, status: 409, code: "ads_recheck_not_instant" });
  });

  it("rejects pending issues that aren't ready yet", () => {
    const i = issue("meta_access_failed");
    h.completions.set(i.id, { completedBy: "x", completedAt: "2026-09-30T00:00:00.000Z", verify: { kind: "after_sync", after_sync_platform: "meta" } });
    expect(requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: i.id } })).toMatchObject({ ok: false, status: 409, code: "ads_recheck_not_ready" });
  });

  it("queues small Re-checks and coalesces requests into one job", async () => {
    vi.useFakeTimers();
    const a = issue("missing_tracking_params");
    const b = issue("non_paid_medium");
    const first = requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: a.id } });
    const second = requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: b.id } });
    const dup = requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: a.id } });
    expect(first).toMatchObject({ ok: true, lane: "queue" });
    expect(second).toMatchObject({ ok: true, lane: "queue", coalesced: true });
    expect(dup).toMatchObject({ ok: true, coalesced: true });
    if (!first.ok || !second.ok) throw new Error("expected ok");
    expect(second.job_id).toBe(first.job_id);
    await vi.advanceTimersByTimeAsync(ADS_RECHECK_COALESCE_MS + 10);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(enqueueJob).mock.calls[0]![1] as { scopes: unknown[]; refreshMeta?: { ad_ids: string[] } };
    expect(payload.scopes).toHaveLength(2);
    expect(payload.refreshMeta?.ad_ids).toEqual(["a1"]);
  });

  it("sends account-level and big scopes to the fork", () => {
    const acc = issue("missing_tracking_params", { level: "account" });
    expect(requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: acc.id } })).toMatchObject({ ok: true, lane: "fork" });
    h.adsUnder = Array.from({ length: 60 }, (_, i) => `a${i}`);
    expect(requestAdsRecheck({ site: SITE, scope: { type: "resource", platform: "meta", level: "campaign", id: "c1" } })).toMatchObject({ ok: true, lane: "fork" });
    h.adsUnder = ["a1", "a2"];
    expect(requestAdsRecheck({ site: SITE, scope: { type: "resource", platform: "meta", level: "campaign", id: "c2" } })).toMatchObject({ ok: true, lane: "queue" });
    expect(startAdsForkJob).toHaveBeenCalledTimes(2);
  });

  it("returns busy when the fork is taken", () => {
    vi.mocked(startAdsForkJob).mockReturnValueOnce({ ok: false, code: "ads_run_busy", message: "A Run is in progress." } as never);
    const acc = issue("missing_tracking_params", { level: "account" });
    expect(requestAdsRecheck({ site: SITE, scope: { type: "issue", issue_id: acc.id } })).toMatchObject({ ok: false, status: 409, code: "ads_run_busy" });
  });
});

describe("ads_recheck job", () => {
  it("defers behind a running full Run instead of writing in parallel", async () => {
    const enqueue = vi.fn(async () => ({ queued: true }));
    const run = vi.fn();
    const payload = { site: SITE, job_id: "recheck_9", scopes: [], platforms: ["meta" as const], pending: [] };
    const out = await runAdsRecheckJob(payload, { isRunActive: () => true, enqueue: enqueue as never, run: run as never });
    expect(out).toBe("deferred");
    expect(run).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith("ads_recheck", expect.objectContaining({ deferrals: 1 }), { delayMs: ADS_RECHECK_DEFER_MS });
  });
});

describe("mark as fixed / undo", () => {
  it("marks a non-instant issue pending and undo clears it", async () => {
    const i = issue("spend_zero_visits");
    const marked = await markAdsIssueFixed({ site: SITE, issueId: i.id, by: "staff@x", now: new Date("2026-09-30T12:00:00.000Z") });
    expect(marked).toMatchObject({ ok: true, verify: { state: "pending" } });
    expect((h.completions.get(i.id) as ValidationIssueCompletion).verify).toMatchObject({ kind: "fresh_days", window_start: "2026-10-01" });
    expect(await markAdsIssueFixed({ site: SITE, issueId: i.id, by: "staff@x" })).toMatchObject({ ok: false, code: "ads_already_pending" });
    expect(await undoAdsIssueFixed({ site: SITE, issueId: i.id })).toMatchObject({ ok: true, verify: { state: "open" } });
    expect(await undoAdsIssueFixed({ site: SITE, issueId: i.id })).toMatchObject({ ok: false, status: 409, code: "ads_not_pending" });
  });

  it("instant checks use Re-check instead; agents must send a report", async () => {
    const instant = issue("missing_tracking_params");
    expect(await markAdsIssueFixed({ site: SITE, issueId: instant.id, by: "x" })).toMatchObject({ ok: false, code: "ads_mark_not_needed" });
    const fresh = issue("spend_zero_visits");
    const agent = { type: "mcp", label: "agent" } as never;
    expect(await markAdsIssueFixed({ site: SITE, issueId: fresh.id, by: "x", actor: agent })).toMatchObject({ ok: false, status: 400, code: "ads_report_required" });
    expect(await markAdsIssueFixed({ site: SITE, issueId: "ads:meta:nope:ad:1", by: "x" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("read helpers", () => {
  it("snaps KPI days to the saved 7 / 28 / 90 windows", () => {
    expect([snapKpiDays(undefined), snapKpiDays("3"), snapKpiDays(7), snapKpiDays(14), snapKpiDays(28), snapKpiDays(60), snapKpiDays(365)]).toEqual([28, 7, 7, 28, 28, 90, 90]);
  });

  it("flags issues of a platform the last Run skipped as not checked", () => {
    const i = issue("missing_tracking_params");
    const run = {
      never_run: false,
      last_run: { job_id: "r", started_at: null, finished_at: null, checked: [], skipped: [{ platform: "meta" as const, reason: "Meta rejected our access" }] },
      active: [],
      last_failed: null,
      busy: null,
    };
    const row = toIssueRow(i, { cacheCompletion: undefined, verify: { site: SITE, now: new Date(), lastSyncAt: {}, timeZoneFor: () => null }, queued: new Set([i.id]), run });
    expect(row).toMatchObject({ id: i.id, check_key: "missing_tracking_params:legacy", affected_ads_total: 1, recheck_queued: true });
    expect(row.not_checked?.reason).toBe("Meta rejected our access");
  });
});

describe("sumRollupsSince", () => {
  const day = (date: string, rows: Array<{ ad_id: string; spend: number; clicks: number }>, platforms = ["meta"]) => {
    const file = path.join(h.cacheDir, SITE, "ads-daily-rollups", `${date}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        date,
        built_at: "x",
        platforms,
        ga4_complete: true,
        rows: rows.map((r) => ({ platform: "meta", account_id: "act1", campaign_id: "c1", adset_id: "s1", currency: "USD", impressions: 0, landing_page_views: 0, leads: 0, sessions: 0, ...r })),
      }),
    );
  };

  it("sums only the target ads and skips missing days", () => {
    day("2026-09-01", [{ ad_id: "a1", spend: 5, clicks: 10 }, { ad_id: "a2", spend: 100, clicks: 100 }]);
    day("2026-09-03", [{ ad_id: "a1", spend: 0, clicks: 0 }]);
    day("2026-09-04", [{ ad_id: "a1", spend: 1, clicks: 2 }], ["google"]);
    const s = sumRollupsSince(SITE, { platform: "meta", ad_ids: ["a1"] }, "2026-09-01", "2026-09-04");
    expect(s.days_counted).toBe(2);
    expect(s.missing_days).toEqual(["2026-09-02", "2026-09-04"]);
    expect(s.clicks).toBe(10);
    expect(s.spend).toEqual({ USD: 5 });
    expect(s.days_with_spend).toBe(1);
  });

  it("leaves out days when every affected ad was switching links", async () => {
    const { loadAdsSetup } = await import("../ads-setup");
    const v = (n: number, path: string, first: string | null, last: string) => ({ v: n, landing_urls: [`https://x.com${path}`], url_tags: null, destination: "website", first_seen_at: first, last_seen_at: last });
    vi.mocked(loadAdsSetup).mockReturnValueOnce({
      accounts: { act1: { timezone: "UTC" } },
      ads: { a1: { account_id: "act1", versions: [v(1, "/a", null, "2026-09-11T08:00:00.000Z"), v(2, "/b", "2026-09-11T12:00:00.000Z", "2026-09-13T08:00:00.000Z")] } },
    } as never);
    day("2026-09-10", [{ ad_id: "a1", spend: 4, clicks: 8 }]);
    day("2026-09-11", [{ ad_id: "a1", spend: 9, clicks: 30 }]);
    day("2026-09-12", [{ ad_id: "a1", spend: 2, clicks: 4 }]);
    const s = sumRollupsSince(SITE, { platform: "meta", ad_ids: ["a1"] }, "2026-09-10", "2026-09-12");
    expect(s.days_counted).toBe(2);
    expect(s.url_change_days).toEqual(["2026-09-11"]);
    expect(s.clicks).toBe(12);
    expect(s.spend).toEqual({ USD: 6 });
  });
});
