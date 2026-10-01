import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DURATION_BUCKETS_MS,
  MAX_FILE_OBJECTS,
  RETENTION_MS,
  appendWindowObject,
  beginRequest,
  durationBoundsId,
  endRequest,
  fallbackBoundsIdForPid,
  flushTick,
  histogramQuantile,
  histogramResetsForTests,
  ingestStatementsForTests,
  ingestStatsFiles,
  matchUrlPattern,
  noteApi,
  notePage,
  pageRouteForPath,
  planInsertChunks,
  readProcessStats,
  readProcessStatsDetail,
  readRouteSeries,
  resolveProcessStatsDetailRequest,
  resolveProcessStatsRequest,
  resolveRouteSeriesRequest,
  resetProcessStatsForTests,
  resolveApiRoute,
  stopTick,
  type ProcessName,
} from "./process-stats";

let dir: string;
let dbPath: string;

function boot(opts: { ingest?: boolean; boundsMs?: number[] | null; processName?: ProcessName } = {}): void {
  resetProcessStatsForTests({
    dir,
    dbPath,
    ingest: opts.ingest ?? true,
    processName: opts.processName ?? "web",
    processStartId: "boot-test",
    boundsMs: opts.boundsMs,
  });
}

function readLines(file: string): string[] {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function deadPid(): number {
  for (let pid = 1_000_000; pid < 1_001_000; pid++) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") return pid;
    }
  }
  throw new Error("no unused pid");
}

function ownFile(): string {
  return path.join(dir, `web-${process.pid}.jsonl`);
}

function detail(from: number, to: number, processName: ProcessName = "web") {
  return readProcessStatsDetail({ from, to, now: to, processName });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "process-stats-"));
  dbPath = path.join(dir, "stats.db");
  boot();
});

afterEach(() => {
  stopTick();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("duration bounds", () => {
  it("hashes the bounds array and keeps a different id when the array changes", () => {
    const id = durationBoundsId(DURATION_BUCKETS_MS);
    expect(id).toBe(durationBoundsId([...DURATION_BUCKETS_MS]));
    expect(id).toHaveLength(8);
    expect(durationBoundsId([10, 100])).not.toBe(id);
  });

  it("uses the route row with the latest timestamp when the code array is missing", () => {
    boot({ boundsMs: null });
    const older = [1, 2];
    const newer = [10, 20];
    const olderId = durationBoundsId(older);
    const newerId = durationBoundsId(newer);
    const db = new Database(dbPath);
    db.prepare(`INSERT INTO duration_bounds (id, boundsMs) VALUES (?, ?)`).run(olderId, JSON.stringify(older));
    db.prepare(`INSERT INTO duration_bounds (id, boundsMs) VALUES (?, ?)`).run(newerId, JSON.stringify(newer));
    const insert = db.prepare(
      `INSERT INTO api_samples (timestamp, pid, bootId, method, route, count, sumMs, maxMs, durationBoundsId, durationCounts, statusCounts)
       VALUES (?, ?, 'boot', 'GET', '/api/x', 1, 1, 1, ?, '[]', '{}')`,
    );
    insert.run(1_000, process.pid, olderId);
    insert.run(2_000, process.pid, newerId);
    db.close();

    expect(fallbackBoundsIdForPid(process.pid)).toBe(newerId);

    noteApi("GET", "/api/x", 15, 200);
    const closedAt = Date.now();
    flushTick(closedAt);
    const route = detail(closedAt - 1, closedAt + 1).routes[0];
    expect(route.durationCounts).toEqual([0, 1, 0]);
  });

  it("does not classify new durations when there is no code array and no previous row", () => {
    boot({ boundsMs: null });
    noteApi("GET", "/api/x", 15, 200);
    const closedAt = Date.now();
    flushTick(closedAt);
    expect(detail(closedAt - 1, closedAt + 1).routes).toEqual([]);
  });
});

describe("counters", () => {
  it("stores exact status codes and collapses the rest to other", () => {
    noteApi("GET", "/api/x", 5, 99);
    noteApi("GET", "/api/x", 5, 600);
    noteApi("GET", "/api/x", 5, 200.5);
    noteApi("GET", "/api/x", 5, 201);
    const closedAt = Date.now();
    flushTick(closedAt);
    const route = detail(closedAt - 1, closedAt + 1).routes[0];
    expect(route.statusCounts).toEqual({ other: 3, "201": 1 });
  });

  it("counts an SSR outcome under the string that arrived", () => {
    notePage("/en/:slug", "/en/home", 10, 200, "ssr_weird");
    const closedAt = Date.now();
    flushTick(closedAt);
    const route = detail(closedAt - 1, closedAt + 1).routes[0];
    expect(route.ssrCounts).toEqual({ ssr_weird: 1 });
  });

  it("keeps the exact slowest duration in maxMs and one histogram slot", () => {
    noteApi("POST", "/api/validation/diagnostics-jobs", 61_000, 200);
    for (let i = 0; i < 98; i++) noteApi("GET", "/api/content/:contentType/:slug", 20, 200);
    const closedAt = Date.now();
    flushTick(closedAt);
    const routes = detail(closedAt - 1, closedAt + 1).routes;
    const slow = routes.find((row) => row.route.endsWith("diagnostics-jobs"));
    const reads = routes.find((row) => row.route.includes(":slug"));
    expect(slow).toMatchObject({ count: 1, maxMs: 61_000, avgMs: 61_000 });
    expect(slow?.durationCounts[DURATION_BUCKETS_MS.length]).toBe(1);
    expect(slow?.durationCounts).toHaveLength(DURATION_BUCKETS_MS.length + 1);
    expect(reads).toMatchObject({ count: 98, maxMs: 20, avgMs: 20 });
    expect(reads?.durationCounts[DURATION_BUCKETS_MS.findIndex((bound) => bound > 20)]).toBe(98);
  });

  it("uses the Express template and unmatched when there is none", () => {
    expect(resolveApiRoute({
      path: "/api/content/blog/mi-post",
      baseUrl: "/api/content",
      route: { path: "/:contentType/:slug" },
    })).toBe("/api/content/:contentType/:slug");
    expect(resolveApiRoute({
      path: "/api/content/delete",
      baseUrl: "",
      route: { path: "/api/content/delete" },
    })).toBe("/api/content/delete");
    expect(resolveApiRoute({ path: "/api/jobs/42" })).toBe("unmatched");
    expect(resolveApiRoute({ path: "/api/jobs/550e8400-e29b-41d4-a716-446655440000" })).toBe("unmatched");
  });

  it("groups pages by url_pattern, records slowestPath only in the last duration bucket, and uses unmatched", () => {
    expect(matchUrlPattern("/en/blog/mi-post", ["/en/:slug", "/en/blog/:slug"])).toBe("/en/blog/:slug");
    expect(matchUrlPattern("/en/home", ["/en/:slug", "/en/blog/:slug"])).toBe("/en/:slug");
    expect(matchUrlPattern("/nope", ["/en/:slug"])).toBe("unmatched");
    expect(pageRouteForPath("/this/does/not/match/anything")).toBe("unmatched");

    notePage("/en/blog/:slug", "/en/blog/mi-post?x=1", 80, 200, "ssr_ok");
    notePage("/en/blog/:slug", "/en/blog/otro", 70, 200, "ssr_ok");
    notePage("/en/:slug", "/en/home", 2_000, 200, "ssr_empty_fallback");
    notePage("/es/:slug", "/es/lento", 60_000, 200, "ssr_ok");
    notePage("unmatched", "/solo", 100, 200, "client_fallback");
    const closedAt = Date.now();
    flushTick(closedAt);
    const pages = detail(closedAt - 1, closedAt + 1).routes.filter((row) => row.kind === "pages");
    const blog = pages.find((row) => row.route === "/en/blog/:slug");
    const home = pages.find((row) => row.route === "/en/:slug");
    const slow = pages.find((row) => row.route === "/es/:slug");
    expect(blog).toMatchObject({ count: 2, maxMs: 80, path: null, ssrCounts: { ssr_ok: 2 } });
    expect(blog?.durationCounts[DURATION_BUCKETS_MS.findIndex((bound) => bound > 80)]).toBe(2);
    expect(home).toMatchObject({ count: 1, maxMs: 2_000, path: null, ssrCounts: { ssr_empty_fallback: 1 } });
    expect(home?.durationCounts[DURATION_BUCKETS_MS.findIndex((bound) => bound > 2_000)]).toBe(1);
    expect(slow).toMatchObject({ count: 1, maxMs: 60_000, path: "/es/lento", ssrCounts: { ssr_ok: 1 } });
    expect(slow?.durationCounts[DURATION_BUCKETS_MS.length]).toBe(1);
    expect(pages.find((row) => row.route === "unmatched")?.path).toBeNull();
  });

  it("counts a call in the window where it finishes, not the window where it started", () => {
    const t0 = Date.now();
    beginRequest();
    flushTick(t0 + 1_000);
    noteApi("GET", "/api/slow", 1_000, 200);
    endRequest();
    flushTick(t0 + 2_000);
    const windows = readProcessStats({ from: t0, to: t0 + 3_000, now: t0 + 3_000, processName: "web" }).windows;
    expect(windows).toHaveLength(2);
    expect(windows[0].api).toBeNull();
    expect(windows[0].inFlightMaxRequests).toBeGreaterThanOrEqual(1);
    expect(detail(t0, t0 + 3_000).routes.map((row) => row.route)).toEqual(["/api/slow"]);
  });

  it("resets route counters and the event-loop histogram after each window", () => {
    const resetsBefore = histogramResetsForTests();
    const t0 = Date.now();
    noteApi("GET", "/api/once", 10, 200);
    beginRequest();
    flushTick(t0 + 1_000);
    endRequest();
    flushTick(t0 + 2_000);
    flushTick(t0 + 3_000);
    const windows = readProcessStats({ from: t0, to: t0 + 4_000, now: t0 + 4_000, processName: "web" }).windows;
    expect(windows[0].api?.count).toBe(1);
    expect(windows[1].api).toBeNull();
    expect(windows[1].inFlightMaxRequests).toBe(1);
    expect(windows[2].inFlightMaxRequests).toBe(0);
    expect(histogramResetsForTests()).toBe(resetsBefore + 3);
  });

  it("records machine CPU only on web", () => {
    const t0 = Date.now();
    flushTick(t0);
    const webDb = new Database(dbPath, { readonly: true });
    const webRow = webDb.prepare(`SELECT cpuMachinePercent FROM process_samples WHERE timestamp = ?`).get(t0) as { cpuMachinePercent: number | null };
    webDb.close();
    expect(typeof webRow.cpuMachinePercent).toBe("number");

    boot({ processName: "sidequest" });
    const t1 = t0 + 10_000;
    flushTick(t1);
    const sideDb = new Database(dbPath, { readonly: true });
    const sideRow = sideDb.prepare(`SELECT cpuMachinePercent FROM process_samples WHERE processName = 'sidequest' AND timestamp = ?`).get(t1) as { cpuMachinePercent: number | null };
    sideDb.close();
    expect(sideRow.cpuMachinePercent).toBeNull();
  });
});

describe("files and ingest", () => {
  it("writes one object for a two-minute stall, stamped at window close", () => {
    const closedAt = Date.now() + 120_000;
    flushTick(closedAt);
    const stats = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1, processName: "web" });
    expect(stats.windows).toHaveLength(1);
    const win = stats.windows[0];
    expect(win.timestamp).toBe(closedAt);
    expect(win.intervalMs).toBeGreaterThanOrEqual(119_000);
    expect(win.intervalMs).toBeLessThanOrEqual(130_000);
  });

  it("drops the oldest objects past 720", () => {
    const file = path.join(dir, "cap.jsonl");
    for (let i = 0; i < MAX_FILE_OBJECTS + 1; i++) {
      appendWindowObject(file, {
        timestamp: i,
        pid: 1,
        bootId: "b",
        processName: "sidequest",
        process: null,
        api: [],
        pages: [],
      });
    }
    const lines = readLines(file);
    expect(lines).toHaveLength(MAX_FILE_OBJECTS);
    expect(JSON.parse(lines[0]).timestamp).toBe(1);
    expect(JSON.parse(lines[lines.length - 1]).timestamp).toBe(MAX_FILE_OBJECTS);
  });

  it("skips and deletes a broken line, then inserts the rest", () => {
    const file = path.join(dir, "web-9.jsonl");
    const good = {
      timestamp: 50_000,
      pid: 9,
      bootId: "boot-9",
      processName: "web" as const,
      process: sample(50_000, 9),
      api: [apiRow()],
      pages: [],
    };
    fs.writeFileSync(file, `not json\n${JSON.stringify(good)}\n`);
    ingestStatsFiles(dir);
    expect(readLines(file)).toEqual([]);
    const stats = readProcessStats({ from: 40_000, to: 60_000, now: 60_000, processName: "web" });
    expect(detail(40_000, 60_000).routes[0].route).toBe("/api/content/:contentType/:slug");
    expect(stats.windows[0].cpuProcessPercent).toBe(0);
  });

  it("removes an empty file when its pid is gone, and keeps one whose pid is still running", () => {
    const dead = deadPid();
    const deadFile = path.join(dir, `sidequest-${dead}.jsonl`);
    const liveFile = path.join(dir, `sidequest-${process.pid}.jsonl`);
    const window = (pid: number) => JSON.stringify({
      timestamp: 60_000,
      pid,
      bootId: "boot",
      processName: "sidequest",
      process: { ...sample(60_000, pid), processName: "sidequest", cpuMachinePercent: null },
      api: [],
      pages: [],
    });
    fs.writeFileSync(deadFile, `${window(dead)}\n`);
    fs.writeFileSync(liveFile, `${window(process.pid)}\n`);
    ingestStatsFiles(dir);
    expect(fs.existsSync(deadFile)).toBe(false);
    expect(fs.existsSync(liveFile)).toBe(true);
    expect(readLines(liveFile)).toEqual([]);
    flushTick(70_000);
    expect(fs.existsSync(ownFile())).toBe(false);
  });

  it("uses one INSERT per table, and splits only when a statement would exceed the variable cap", () => {
    noteApi("GET", "/api/content/:contentType/:slug", 20, 200);
    notePage("/en/:slug", "/en/home", 2_000, 200, "ssr_empty_fallback");
    flushTick(80_000);
    expect(ingestStatementsForTests()).toEqual(["process_samples", "api_samples", "document_samples"]);
    const split = planInsertChunks(2_000, 17);
    expect(split.length).toBeGreaterThan(1);
    expect(split.reduce((sum, n) => sum + n, 0)).toBe(2_000);
    expect(planInsertChunks(10, 17)).toEqual([10]);
  });

  it("keeps the file when the insert transaction fails", () => {
    noteApi("GET", "/api/kept", 10, 200);
    const opened = new Database(dbPath);
    opened.exec(`
      CREATE TRIGGER fail_process_insert
      BEFORE INSERT ON process_samples
      BEGIN
        SELECT RAISE(ABORT, 'ingest failed');
      END;
    `);
    opened.close();
    flushTick(90_000);
    expect(readLines(ownFile())).toHaveLength(1);
    expect(readProcessStats({ from: 80_000, to: 100_000, now: 100_000, processName: "web" }).windows).toEqual([]);
    const again = new Database(dbPath);
    again.exec(`DROP TRIGGER fail_process_insert`);
    again.close();
    flushTick(91_000);
    expect(detail(80_000, 100_000).routes.map((row) => row.route)).toContain("/api/kept");
    expect(readLines(ownFile())).toEqual([]);
  });

  it("prunes rows older than seven days and ignores a duplicate window", () => {
    const oldTs = Date.now() - RETENTION_MS - 60_000;
    const recentTs = Date.now() - 60_000;
    const file = path.join(dir, "web-3.jsonl");
    fs.writeFileSync(file, `${JSON.stringify({
      timestamp: oldTs,
      pid: 3,
      bootId: "old",
      processName: "web",
      process: sample(oldTs, 3),
      api: [],
      pages: [],
    })}\n${JSON.stringify({
      timestamp: recentTs,
      pid: 3,
      bootId: "recent",
      processName: "web",
      process: sample(recentTs, 3),
      api: [],
      pages: [],
    })}\n`);
    ingestStatsFiles(dir);
    fs.writeFileSync(file, `${JSON.stringify({
      timestamp: recentTs,
      pid: 3,
      bootId: "recent",
      processName: "web",
      process: sample(recentTs, 3),
      api: [],
      pages: [],
    })}\n`);
    ingestStatsFiles(dir);
    const before = new Database(dbPath, { readonly: true });
    const oldBefore = before.prepare(`SELECT COUNT(*) AS c FROM process_samples WHERE timestamp = ?`).get(oldTs) as { c: number };
    const recentBefore = before.prepare(`SELECT COUNT(*) AS c FROM process_samples WHERE timestamp = ?`).get(recentTs) as { c: number };
    before.close();
    expect(oldBefore.c).toBe(1);
    expect(recentBefore.c).toBe(1);

    boot();
    const after = new Database(dbPath, { readonly: true });
    const oldAfter = after.prepare(`SELECT COUNT(*) AS c FROM process_samples WHERE timestamp = ?`).get(oldTs) as { c: number };
    const recentAfter = after.prepare(`SELECT COUNT(*) AS c FROM process_samples WHERE timestamp = ?`).get(recentTs) as { c: number };
    after.close();
    expect(oldAfter.c).toBe(0);
    expect(recentAfter.c).toBe(1);
  });
});

describe("open calls at close", () => {
  it("lists a call that is still open at the cut, then counts it where it finishes", () => {
    const call = { method: "GET", path: "/api/admin/system-alerts", route: { path: "/api/admin/system-alerts" } };
    const t0 = 1_700_000_000_000;
    beginRequest(call, t0 - 3_600);
    flushTick(t0);
    noteApi("GET", "/api/admin/system-alerts", 4_095, 304);
    endRequest(call);
    flushTick(t0 + 30_000);
    const windows = readProcessStats({ from: t0 - 1, to: t0 + 30_000, now: t0 + 30_000, processName: "web" }).windows;
    expect(windows[0].openCalls).toEqual([
      { method: "GET", route: "/api/admin/system-alerts", count: 1, maxMs: 3_600 },
    ]);
    expect(windows[0].api).toBeNull();
    expect(windows[1].openCalls).toBeNull();
    expect(windows[1].api?.maxMs).toBe(4_095);
  });

  it("keeps the same call on each cut it is still open", () => {
    const call = { method: "GET", path: "/api/slow" };
    const t0 = 1_700_000_100_000;
    beginRequest(call, t0 - 800);
    flushTick(t0);
    flushTick(t0 + 30_000);
    flushTick(t0 + 60_000);
    const windows = readProcessStats({ from: t0 - 1, to: t0 + 60_000, now: t0 + 60_000, processName: "web" }).windows;
    expect(windows.map((row) => row.openCalls?.[0]?.maxMs)).toEqual([800, 30_800, 60_800]);
    expect(windows.every((row) => row.openCalls?.[0]?.route === "/api/slow")).toBe(true);
  });

  it("omits a call open for less than 500ms and drops one that already closed", () => {
    const short = { method: "GET", path: "/api/short" };
    const aborted = { method: "GET", path: "/api/aborted" };
    const t0 = 1_700_000_200_000;
    beginRequest(short, t0 - 499);
    beginRequest(aborted, t0 - 5_000);
    endRequest(aborted);
    endRequest(aborted);
    flushTick(t0);
    const win = readProcessStats({ from: t0 - 1, to: t0, now: t0, processName: "web" }).windows[0];
    expect(win.openCalls).toBeNull();
    expect(win.inFlightMaxRequests).toBe(2);
  });

  it("groups two of the same route and keeps the longer one as maxMs", () => {
    const t0 = 1_700_000_300_000;
    beginRequest({ method: "get", path: "/api/admin/system-alerts" }, t0 - 900);
    beginRequest({ method: "GET", path: "/api/admin/system-alerts" }, t0 - 2_200);
    flushTick(t0);
    const win = readProcessStats({ from: t0 - 1, to: t0, now: t0, processName: "web" }).windows[0];
    expect(win.openCalls).toEqual([
      { method: "GET", route: "/api/admin/system-alerts", count: 2, maxMs: 2_200 },
    ]);
  });

  it("uses the express template, and the raw path when there is none", () => {
    const t0 = 1_700_000_400_000;
    beginRequest({
      method: "GET",
      path: "/api/content/blog/mi-post",
      baseUrl: "/api/content",
      route: { path: "/:contentType/:slug" },
    }, t0 - 700);
    beginRequest({ method: "GET", path: "/api/jobs/42" }, t0 - 700);
    flushTick(t0);
    const routes = readProcessStats({ from: t0 - 1, to: t0, now: t0, processName: "web" }).windows[0]
      .openCalls?.map((row) => row.route).sort();
    expect(routes).toEqual(["/api/content/:contentType/:slug", "/api/jobs/42"]);
  });

  it("stores the request path when the Express route is a wildcard", () => {
    const t0 = 1_700_000_450_000;
    beginRequest({
      method: "POST",
      path: "/mcp/role/copy_editor",
      baseUrl: "/mcp",
      route: { path: "/*" },
    }, t0 - 800);
    flushTick(t0);
    const routes = readProcessStats({ from: t0 - 1, to: t0, now: t0, processName: "web" }).windows[0]
      .openCalls?.map((row) => row.route);
    expect(routes).toEqual(["/mcp/role/copy_editor"]);
  });

  it("on a 5 minute point keeps the open calls of the last 30s slice", () => {
    const base = 1_700_000_500_000;
    const loud = {
      ...sample(base + 10_000, 11),
      eventLoopMaxMs: 3_700,
      openCalls: [{ method: "GET", route: "/api/admin/system-alerts", count: 1, maxMs: 3_600 }],
    };
    const quiet = {
      ...sample(base + 40_000, 11),
      eventLoopMaxMs: 12,
      openCalls: [{ method: "GET", route: "/api/quiet", count: 1, maxMs: 800 }],
    };
    const line = (processRow: typeof quiet) => JSON.stringify({
      timestamp: processRow.timestamp,
      pid: 11,
      bootId: "boot",
      processName: "web",
      process: processRow,
      api: [],
      pages: [],
    });
    fs.writeFileSync(path.join(dir, "web-11.jsonl"), `${line(loud)}\n${line(quiet)}\n`);
    ingestStatsFiles(dir);
    const span = 7 * 60 * 60 * 1000;
    const stats = readProcessStats({ from: base, to: base + span, now: base + span, processName: "web" });
    expect(stats.stepMs).toBe(5 * 60 * 1000);
    const point = stats.windows.find((row) => row.eventLoop?.maxMs === 3_700);
    expect(point?.openCalls).toEqual([
      { method: "GET", route: "/api/quiet", count: 1, maxMs: 800 },
    ]);
  });

  it("reads a database created before the openCalls column", () => {
    stopTick();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
    const opened = new Database(dbPath);
    opened.exec(`
      CREATE TABLE process_samples (
        timestamp INTEGER NOT NULL,
        processName TEXT NOT NULL,
        processId INTEGER NOT NULL,
        processStartId TEXT NOT NULL,
        intervalMs INTEGER NOT NULL,
        eventLoopP50Ms REAL NOT NULL,
        eventLoopP99Ms REAL NOT NULL,
        eventLoopMaxMs REAL NOT NULL,
        heapUsedMb INTEGER NOT NULL,
        rssMb INTEGER NOT NULL,
        cpuProcessPercent REAL NOT NULL,
        cpuMachinePercent REAL,
        garbageCollectionPauseMs REAL NOT NULL,
        garbageCollectionMaxPauseMs REAL NOT NULL,
        inFlightMaxRequests INTEGER NOT NULL,
        openFds INTEGER,
        openFdsLimit INTEGER,
        PRIMARY KEY (timestamp, processName, processId)
      );
    `);
    const row = sample(Date.now() - 60_000, 12);
    opened.prepare(
      `INSERT INTO process_samples (
        timestamp, processName, processId, processStartId, intervalMs,
        eventLoopP50Ms, eventLoopP99Ms, eventLoopMaxMs, heapUsedMb, rssMb,
        cpuProcessPercent, cpuMachinePercent, garbageCollectionPauseMs,
        garbageCollectionMaxPauseMs, inFlightMaxRequests, openFds, openFdsLimit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.timestamp, row.processName, row.processId, row.processStartId, row.intervalMs,
      row.eventLoopP50Ms, row.eventLoopP99Ms, row.eventLoopMaxMs, row.heapUsedMb, row.rssMb,
      row.cpuProcessPercent, row.cpuMachinePercent, row.garbageCollectionPauseMs,
      row.garbageCollectionMaxPauseMs, row.inFlightMaxRequests, row.openFds, row.openFdsLimit,
    );
    opened.close();
    boot();
    const win = readProcessStats({
      from: row.timestamp - 1,
      to: row.timestamp,
      now: row.timestamp,
      processName: "web",
    }).windows[0];
    expect(win.openCalls).toBeNull();
    expect(win.cpuProcessPercent).toBe(0);
  });
});

describe("histogram quantile", () => {
  it("interpolates inside the bucket that holds the rank", () => {
    const bounds = [10, 25, 50];
    const p50 = histogramQuantile(0.5, [0, 98, 0, 0], bounds);
    expect(p50).toBeGreaterThan(10);
    expect(p50).toBeLessThan(25);
    expect(histogramQuantile(0.5, [0, 0, 0, 0], bounds)).toBeNull();
  });
});

describe("readProcessStats", () => {
  it("joins route rows of a pid onto that process when another window has the process row", () => {
    const ts = 200_000;
    fs.writeFileSync(path.join(dir, "web-4.jsonl"), `${JSON.stringify({
      timestamp: ts,
      pid: 4,
      bootId: "p",
      processName: "web",
      process: sample(ts, 4),
      api: [],
      pages: [],
    })}\n${JSON.stringify({
      timestamp: ts + 1,
      pid: 4,
      bootId: "p",
      processName: "web",
      process: null,
      api: [apiRow()],
      pages: [],
    })}\n`);
    ingestStatsFiles(dir);
    const stats = readProcessStats({ from: ts - 1, to: ts + 10, now: ts + 10, processName: "web" });
    expect(stats.windows).toHaveLength(2);
    expect(stats.windows[0].cpuProcessPercent).toBe(0);
    expect(stats.windows[0].api).toBeNull();
    expect(stats.windows[1].cpuProcessPercent).toBeNull();
    expect(stats.windows[1].api?.maxMs).toBe(20);
  });

  it("ignores route rows that have no process sample to name them", () => {
    const ts = 250_000;
    fs.writeFileSync(path.join(dir, "web-8.jsonl"), `${JSON.stringify({
      timestamp: ts,
      pid: 8,
      bootId: "p",
      processName: "web",
      process: null,
      api: [apiRow()],
      pages: [],
    })}\n`);
    ingestStatsFiles(dir);
    const stats = readProcessStats({ from: ts - 1, to: ts + 1, now: ts + 1, processName: "web" });
    expect(stats.windows).toEqual([]);
    expect(detail(ts - 1, ts + 1).routes).toEqual([]);
  });

  it("keeps two workers with the same name as two series and does not convert bounds", () => {
    const ts = 300_000;
    const otherBounds = [10, 100];
    const otherId = durationBoundsId(otherBounds);
    const db = new Database(dbPath);
    db.prepare(`INSERT OR IGNORE INTO duration_bounds (id, boundsMs) VALUES (?, ?)`).run(otherId, JSON.stringify(otherBounds));
    db.close();
    const page = {
      route: "/en/:slug",
      count: 1,
      sumMs: 2_000,
      maxMs: 2_000,
      durationCounts: [0, 1],
      statusCounts: { "200": 1 },
      durationBoundsId: otherId,
      ssrCounts: { ssr_empty_fallback: 1 },
      slowestPath: "/en/home",
    };
    fs.writeFileSync(path.join(dir, "diagnostics-worker-11.jsonl"), `${JSON.stringify({
      timestamp: ts,
      pid: 11,
      bootId: "a",
      processName: "diagnostics-worker",
      process: { ...sample(ts, 11), processName: "diagnostics-worker" },
      api: [],
      pages: [],
    })}\n`);
    fs.writeFileSync(path.join(dir, "diagnostics-worker-12.jsonl"), `${JSON.stringify({
      timestamp: ts,
      pid: 12,
      bootId: "b",
      processName: "diagnostics-worker",
      process: { ...sample(ts, 12), processName: "diagnostics-worker" },
      api: [],
      pages: [page],
    })}\n`);
    ingestStatsFiles(dir);
    const stats = readProcessStats({ from: ts - 1, to: ts + 1, now: ts + 1, processName: "diagnostics-worker" });
    expect(stats.windows).toHaveLength(1);
    expect(stats.restarts).toBeUndefined();
    expect(stats.windows[0].api).toBeNull();
    expect(stats.windows[0].pages).toBeNull();
    const stored = new Database(dbPath, { readonly: true });
    const row = stored.prepare(`SELECT durationBoundsId, durationCounts FROM document_samples WHERE pid = 12`).get() as {
      durationBoundsId: string;
      durationCounts: string;
    };
    stored.close();
    expect(row.durationBoundsId).toBe(otherId);
    expect(JSON.parse(row.durationCounts)).toEqual([0, 1]);
  });

  it("defaults to the last 24 hours and never returns more than 7 days", () => {
    const now = 1_700_000_000_000;
    const day = readProcessStats({ now, processName: "web" });
    expect(day.endingAt).toBe(now);
    expect(day.startingAt).toBe(now - 24 * 60 * 60 * 1000);
    expect(day.stepMs).toBe(5 * 60 * 1000);
    const wide = readProcessStats({ from: 0, to: now, now, processName: "web" });
    expect(wide.startingAt).toBe(now - RETENTION_MS);
    expect(wide.endingAt).toBe(now);
    expect(wide.stepMs).toBe(30 * 60 * 1000);
  });

  it("keeps every 30s window up to 2 hours and uses 90 seconds through 6 hours", () => {
    const ts = 400_000;
    noteApi("GET", "/api/kept", 10, 200);
    flushTick(ts);
    const twoHours = readProcessStats({ from: ts, to: ts + 2 * 60 * 60 * 1000, now: ts + 2 * 60 * 60 * 1000, processName: "web" });
    expect(twoHours.stepMs).toBe(30_000);
    expect(twoHours.windows[0].api).toMatchObject({ count: 1, maxMs: 10, p50Ms: null, p95Ms: null, p99Ms: null });
    const stats = readProcessStats({ from: ts, to: ts + 6 * 60 * 60 * 1000, now: ts + 6 * 60 * 60 * 1000, processName: "web" });
    expect(stats.stepMs).toBe(90_000);
    expect(stats.windows[0].api).toMatchObject({ count: 1, maxMs: 10 });
    expect(stats.windows[0].pages).toBeNull();
    expect(detail(ts, ts + 6 * 60 * 60 * 1000).routes[0].route).toBe("/api/kept");
  });

  it("collapses a day to 5-minute points and keeps the worst gauge", () => {
    const start = 1_000_000_000_000;
    const step = 5 * 60 * 1000;
    const bucket = Math.floor(start / step) * step;
    const write = (timestamp: number, eventLoopMaxMs: number, cpuProcessPercent: number) => {
      fs.appendFileSync(path.join(dir, "web-4.jsonl"), `${JSON.stringify({
        timestamp,
        pid: 4,
        bootId: "p",
        processName: "web",
        process: { ...sample(timestamp, 4), eventLoopMaxMs, cpuProcessPercent },
        api: [apiRow()],
        pages: [],
      })}\n`);
    };
    write(bucket + 1_000, 10, 1);
    write(bucket + 60_000, 80, 40);
    write(bucket + step + 1_000, 12, 3);
    ingestStatsFiles(dir);
    const stats = readProcessStats({ from: bucket, to: bucket + 7 * 60 * 60 * 1000, now: bucket + 7 * 60 * 60 * 1000, processName: "web" });
    expect(stats.stepMs).toBe(step);
    expect(stats.windows.map((win) => win.timestamp)).toEqual([bucket, bucket + step]);
    expect(stats.windows[0].eventLoop?.maxMs).toBe(80);
    expect(stats.windows[0].cpuProcessPercent).toBe(40);
    expect(stats.windows[0].intervalMs).toBe(30_000);
    expect(stats.windows[0].api).toMatchObject({ count: 196, avgMs: 20, maxMs: 20 });
    expect(stats.windows[0].api?.p50Ms).not.toBeNull();
    expect(stats.windows[0].api?.p99Ms).not.toBeNull();
    expect(stats.windows[0].pages).toBeNull();
    expect(stats.windows[1].eventLoop?.maxMs).toBe(12);
    expect(stats.windows[1].api).toMatchObject({ count: 98, avgMs: 20, maxMs: 20, p99Ms: null });
    expect(stats.windows[1].api?.p50Ms).not.toBeNull();
  });

  it("collapses a week to 30-minute points", () => {
    const start = 2_000_000_000_000;
    const step = 30 * 60 * 1000;
    const bucket = Math.floor(start / step) * step;
    for (const [offset, eventLoopMaxMs] of [[1_000, 5], [10 * 60 * 1000, 50], [step + 1_000, 9]] as const) {
      const timestamp = bucket + offset;
      fs.appendFileSync(path.join(dir, "web-5.jsonl"), `${JSON.stringify({
        timestamp,
        pid: 5,
        bootId: "p",
        processName: "web",
        process: { ...sample(timestamp, 5), eventLoopMaxMs },
        api: [],
        pages: [],
      })}\n`);
    }
    ingestStatsFiles(dir);
    const stats = readProcessStats({ from: bucket, to: bucket + 25 * 60 * 60 * 1000, now: bucket + 25 * 60 * 60 * 1000, processName: "web" });
    expect(stats.stepMs).toBe(step);
    expect(stats.windows.map((win) => [win.timestamp, win.eventLoop?.maxMs])).toEqual([
      [bucket, 50],
      [bucket + step, 9],
    ]);
    expect(stats.windows[0].api).toBeNull();
    expect(stats.windows[0].pages).toBeNull();
  });

  it("rolls every route in a bucket into one weighted average and one peak", () => {
    const start = 3_000_000_000_000;
    const step = 5 * 60 * 1000;
    const bucket = Math.floor(start / step) * step;
    const boundsId = durationBoundsId();
    const api = (route: string, count: number, sumMs: number, maxMs: number) => ({
      method: "GET",
      route,
      count,
      sumMs,
      maxMs,
      durationCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      statusCounts: { "200": count },
      durationBoundsId: boundsId,
    });
    const page = (route: string, count: number, sumMs: number, maxMs: number) => ({
      route,
      count,
      sumMs,
      maxMs,
      durationCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      statusCounts: { "200": count },
      durationBoundsId: boundsId,
      ssrCounts: { ssr: count },
      slowestPath: route,
    });
    const write = (
      file: string,
      timestamp: number,
      pid: number,
      processName: "web" | "sidequest",
      routes: { api: ReturnType<typeof api>[]; pages: ReturnType<typeof page>[] },
    ) => {
      fs.appendFileSync(path.join(dir, file), `${JSON.stringify({
        timestamp,
        pid,
        bootId: "p",
        processName,
        process: { ...sample(timestamp, pid), processName },
        api: routes.api,
        pages: routes.pages,
      })}\n`);
    };
    write("web-4.jsonl", bucket + 1_000, 4, "web", {
      api: [api("/api/a", 1, 100, 100), api("/api/b", 3, 900, 300)],
      pages: [page("/en/a", 1, 100, 100), page("/en/b", 3, 900, 300)],
    });
    write("web-4.jsonl", bucket + 60_000, 4, "web", {
      api: [api("/api/a", 1, 0, 500)],
      pages: [page("/en/a", 1, 0, 500)],
    });
    write("sidequest-9.jsonl", bucket + 1_000, 9, "sidequest", { api: [], pages: [] });
    ingestStatsFiles(dir);
    const stats = readProcessStats({ from: bucket, to: bucket + 7 * 60 * 60 * 1000, now: bucket + 7 * 60 * 60 * 1000, processName: "web" });
    expect(stats.windows[0].api).toMatchObject({ count: 5, avgMs: 200, maxMs: 500, p50Ms: null });
    expect(stats.windows[0].pages).toMatchObject({ count: 5, avgMs: 200, maxMs: 500, p50Ms: null });
    const side = readProcessStats({ from: bucket, to: bucket + 7 * 60 * 60 * 1000, now: bucket + 7 * 60 * 60 * 1000, processName: "sidequest" });
    expect(side.windows[0].api).toBeNull();
    expect(side.windows[0].pages).toBeNull();
    const rows = detail(bucket, bucket + 7 * 60 * 60 * 1000);
    expect(rows.routes.map((row) => row.kind).sort()).toEqual(["api", "api", "pages", "pages"]);
    expect(rows.peak?.maxMs).toBe(500);
  });

  it("marks a new processStartId before bucketing and omits the mark on diagnostics-worker", () => {
    const ts = 600_000;
    const write = (pid: number, processStartId: string) => {
      fs.appendFileSync(path.join(dir, `web-${pid}.jsonl`), `${JSON.stringify({
        timestamp: ts + pid,
        pid,
        bootId: processStartId,
        processName: "web",
        process: { ...sample(ts + pid, pid), processStartId },
        api: [],
        pages: [],
      })}\n`);
    };
    write(1, "boot-a");
    write(2, "boot-b");
    ingestStatsFiles(dir);
    const stats = readProcessStats({ from: ts, to: ts + 10, now: ts + 10, processName: "web" });
    expect(stats.restarts).toEqual([{ timestamp: ts + 2 }]);
  });
});

describe("GET /api/admin/process-stats", () => {
  it("rejects a missing or unknown process name", () => {
    expect(resolveProcessStatsRequest({})).toEqual({
      ok: false,
      error: "process is required: web | sidequest | mcp | diagnostics-worker",
    });
    expect(resolveProcessStatsRequest({ process: "nope" }).ok).toBe(false);
    expect(resolveProcessStatsRequest({ process: ["web"] }).ok).toBe(false);
  });

  it("returns every pid of that name and leaves the other processes out", () => {
    const ts = 500_000;
    const write = (file: string, pid: number, processName: "web" | "sidequest") => {
      fs.writeFileSync(path.join(dir, file), `${JSON.stringify({
        timestamp: ts,
        pid,
        bootId: "p",
        processName,
        process: { ...sample(ts, pid), processName },
        api: processName === "web" ? [apiRow()] : [],
        pages: [],
      })}\n`);
    };
    write("web-4.jsonl", 4, "web");
    write("web-5.jsonl", 5, "web");
    write("sidequest-9.jsonl", 9, "sidequest");
    ingestStatsFiles(dir);
    const result = resolveProcessStatsRequest({ process: "web", starting_at: ts - 1, ending_at: ts + 1 }, ts + 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.windows).toHaveLength(1);
    expect(result.stats.windows[0].api?.count).toBe(196);
    expect(result.stats.startingAt).toBe(ts - 1);
    expect(result.stats.endingAt).toBe(ts + 1);
    const side = resolveProcessStatsRequest({ process: "sidequest", starting_at: ts - 1, ending_at: ts + 1 }, ts + 1);
    expect(side.ok && side.stats.windows[0].api).toBeNull();
    expect(resolveProcessStatsRequest({ process: "web", starting_at: "", ending_at: "1" }).ok).toBe(true);
    const swapped = resolveProcessStatsRequest({ process: "web", starting_at: 20, ending_at: 10 }, ts + 1);
    expect(swapped.ok && swapped.stats.startingAt).not.toBe(20);
    const both = resolveProcessStatsDetailRequest({ process: "web", starting_at: ts - 1, ending_at: ts + 1 }, ts + 1);
    expect(both.ok && both.stats.routes.every((row) => row.kind === "api")).toBe(true);
  });

  it("leaves routes out of Calls and Latency from the body, and returns their lines", () => {
    const closedAt = 1_800_000_000_000;
    noteApi("GET", "/api/admin/system-alerts", 2_000, 200);
    noteApi("GET", "/api/fast", 40, 200);
    notePage("/es/:slug", "/es/blog", 8_000, 200, "ssr_ok");
    notePage("/en/:slug", "/en/home", 80, 200, "ssr_ok");
    flushTick(closedAt);
    const from = closedAt - 1;
    const to = closedAt + 1;
    const full = readProcessStats({ from, to, now: to, processName: "web" });
    expect(full.windows[0].api).toMatchObject({ count: 2, maxMs: 2_000 });
    expect(full.windows[0].pages).toMatchObject({ count: 2, maxMs: 8_000 });
    const api = readProcessStats({
      from, to, now: to, processName: "web",
      omit: [{ kind: "api", method: "GET", route: "/api/admin/system-alerts" }],
    });
    expect(api.windows[0].api).toMatchObject({ count: 1, maxMs: 40 });
    expect(api.windows[0].pages).toMatchObject({ count: 2, maxMs: 8_000 });
    expect(api.windows[0].eventLoop).not.toBeNull();
    const both = readProcessStats({
      from, to, now: to, processName: "web",
      omit: [
        { kind: "api", method: "GET", route: "/api/fast" },
        { kind: "pages", method: null, route: "/es/:slug" },
      ],
    });
    expect(both.windows[0].api).toMatchObject({ count: 1, maxMs: 2_000 });
    expect(both.windows[0].pages).toMatchObject({ count: 1, maxMs: 80 });
    const fromBody = resolveProcessStatsRequest({
      process: "web",
      starting_at: from,
      ending_at: to,
    }, to, {
      exclude: [{ kind: "api", method: "GET", route: "/api/admin/system-alerts" }],
      routes: [{ kind: "api", method: "GET", route: "/api/fast" }],
    });
    expect(fromBody.ok && fromBody.stats.windows[0].api?.count).toBe(1);
    expect(fromBody.ok && fromBody.stats.routes?.[0]).toMatchObject({ route: "/api/fast", method: "GET" });
    expect(fromBody.ok && fromBody.stats.routes?.[0].windows[0].count).toBe(1);
    const queryIgnored = resolveProcessStatsRequest({
      process: "web",
      starting_at: from,
      ending_at: to,
      kind: "api",
      method: "GET",
      route: "/api/fast",
    }, to, { process: "web", route: "/api/admin/system-alerts", kind: "api", method: "GET" });
    expect(queryIgnored.ok && queryIgnored.stats.routes?.[0].route).toBe("/api/admin/system-alerts");
    expect(queryIgnored.ok && queryIgnored.stats.windows[0].api?.count).toBe(2);
    expect(resolveProcessStatsRequest({ process: "web" }, to, {
      exclude: [{ kind: "api", route: "/api/fast" }],
    })).toEqual({ ok: false, error: "exclude[0] method is required" });
    expect(resolveProcessStatsRequest({ process: "web" }, to, {
      exclude: "GET /api/fast",
    })).toEqual({ ok: false, error: "exclude must be an array" });
    expect(resolveProcessStatsRequest({ process: "web" }, to, {
      routes: Array.from({ length: 7 }, () => ({ kind: "pages", route: "/x" })),
    }).ok).toBe(false);
  });
});

describe("GET /api/admin/process-stats/route", () => {
  it("keeps one API method apart from the others, and ignores method on pages", () => {
    const closedAt = 1_700_000_000_000;
    noteApi("GET", "/api/x", 100, 200);
    noteApi("GET", "/api/x", 400, 200);
    noteApi("POST", "/api/x", 900, 200);
    noteApi("GET", "/api/other", 50, 200);
    notePage("/en/:slug", "/en/home", 30, 200, "ssr_ok");
    notePage("/en/:slug", "/en/home", 80, 200, "ssr_ok");
    flushTick(closedAt);
    const from = closedAt - 1;
    const to = closedAt + 1;
    const getOnly = readRouteSeries({
      from, to, now: to, processName: "web", kind: "api", route: "/api/x", method: "GET",
    });
    expect(getOnly.stepMs).toBe(30_000);
    expect(getOnly.method).toBe("GET");
    expect(getOnly.windows).toEqual([{ timestamp: closedAt, count: 2, avgMs: 250, maxMs: 400 }]);
    const both = readRouteSeries({
      from, to, now: to, processName: "web", kind: "api", route: "/api/x",
    });
    expect(both.method).toBeNull();
    expect(both.windows).toEqual([{ timestamp: closedAt, count: 3, avgMs: 467, maxMs: 900 }]);
    const pages = readRouteSeries({
      from, to, now: to, processName: "web", kind: "pages", route: "/en/:slug", method: "GET",
    });
    expect(pages.method).toBeNull();
    expect(pages.windows).toEqual([{ timestamp: closedAt, count: 2, avgMs: 55, maxMs: 80 }]);
  });

  it("requires kind and route, and returns no windows for a process other than web", () => {
    expect(resolveRouteSeriesRequest({ process: "web", route: "/api/x" })).toEqual({
      ok: false,
      error: "kind is required: api | pages",
    });
    expect(resolveRouteSeriesRequest({ process: "web", kind: "api", route: "  " })).toEqual({
      ok: false,
      error: "route is required",
    });
    expect(resolveRouteSeriesRequest({})).toEqual({
      ok: false,
      error: "process is required: web | sidequest | mcp | diagnostics-worker",
    });
    const side = resolveRouteSeriesRequest({
      process: "sidequest",
      kind: "api",
      route: "/api/x",
      starting_at: 1,
      ending_at: 2,
    });
    expect(side.ok).toBe(true);
    if (!side.ok) return;
    expect(side.stats.windows).toEqual([]);
    expect(side.stats.kind).toBe("api");
    expect(side.stats.route).toBe("/api/x");
  });
});

function sample(timestamp: number, processId: number) {
  return {
    timestamp,
    processName: "web" as const,
    processId,
    processStartId: "boot",
    intervalMs: 30_000,
    eventLoopP50Ms: 0,
    eventLoopP99Ms: 0,
    eventLoopMaxMs: 0,
    heapUsedMb: 1,
    rssMb: 1,
    cpuProcessPercent: 0,
    cpuMachinePercent: 0,
    garbageCollectionPauseMs: 0,
    garbageCollectionMaxPauseMs: 0,
    inFlightMaxRequests: 0,
    openFds: null,
    openFdsLimit: null,
  };
}

function apiRow() {
  return {
    method: "GET",
    route: "/api/content/:contentType/:slug",
    count: 98,
    sumMs: 1_960,
    maxMs: 20,
    durationCounts: [0, 98, 0, 0, 0, 0, 0, 0, 0, 0],
    statusCounts: { "200": 98 },
    durationBoundsId: durationBoundsId(),
  };
}
