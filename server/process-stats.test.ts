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
  histogramResetsForTests,
  ingestStatementsForTests,
  ingestStatsFiles,
  matchUrlPattern,
  noteApi,
  notePage,
  pageRouteForPath,
  planInsertChunks,
  readProcessStats,
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

function ownFile(): string {
  return path.join(dir, `web-${process.pid}.jsonl`);
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
    const win = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1 }).processes[0].windows[0];
    expect(win.api[0].durationBoundsId).toBe(newerId);
    expect(win.api[0].durationCounts).toEqual([0, 1, 0]);
  });

  it("does not classify new durations when there is no code array and no previous row", () => {
    boot({ boundsMs: null });
    noteApi("GET", "/api/x", 15, 200);
    const closedAt = Date.now();
    flushTick(closedAt);
    const win = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1 }).processes[0].windows[0];
    expect(win.api).toEqual([]);
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
    const win = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1 }).processes[0].windows[0];
    expect(win.api[0].statusCounts).toEqual({ other: 3, "201": 1 });
  });

  it("counts an SSR outcome under the string that arrived", () => {
    notePage("/en/:slug", "/en/home", 10, 200, "ssr_weird");
    const closedAt = Date.now();
    flushTick(closedAt);
    const win = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1 }).processes[0].windows[0];
    expect(win.pages[0].ssrCounts).toEqual({ ssr_weird: 1 });
  });

  it("keeps the exact slowest duration in maxMs and one histogram slot", () => {
    noteApi("POST", "/api/validation/diagnostics-jobs", 31_000, 200);
    for (let i = 0; i < 98; i++) noteApi("GET", "/api/content/:contentType/:slug", 20, 200);
    const closedAt = Date.now();
    flushTick(closedAt);
    const win = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1 }).processes[0].windows[0];
    const slow = win.api.find((row) => row.route.endsWith("diagnostics-jobs"));
    const reads = win.api.find((row) => row.route.includes(":slug"));
    expect(slow).toMatchObject({ count: 1, maxMs: 31_000, sumMs: 31_000 });
    expect(slow?.durationCounts[DURATION_BUCKETS_MS.length]).toBe(1);
    expect(slow?.durationCounts).toHaveLength(DURATION_BUCKETS_MS.length + 1);
    expect(reads).toMatchObject({ count: 98, maxMs: 20, sumMs: 1_960 });
    expect(reads?.durationCounts[1]).toBe(98);
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
    notePage("/es/:slug", "/es/lento", 5_000, 200, "ssr_ok");
    notePage("unmatched", "/solo", 100, 200, "client_fallback");
    const closedAt = Date.now();
    flushTick(closedAt);
    const win = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1 }).processes[0].windows[0];
    const blog = win.pages.find((row) => row.route === "/en/blog/:slug");
    const home = win.pages.find((row) => row.route === "/en/:slug");
    const slow = win.pages.find((row) => row.route === "/es/:slug");
    expect(blog).toMatchObject({ count: 2, maxMs: 80, slowestPath: null, ssrCounts: { ssr_ok: 2 } });
    expect(blog?.durationCounts[3]).toBe(2);
    expect(home).toMatchObject({ count: 1, maxMs: 2_000, slowestPath: null, ssrCounts: { ssr_empty_fallback: 1 } });
    expect(home?.durationCounts[7]).toBe(1);
    expect(slow).toMatchObject({ count: 1, maxMs: 5_000, slowestPath: "/es/lento", ssrCounts: { ssr_ok: 1 } });
    expect(slow?.durationCounts[DURATION_BUCKETS_MS.length]).toBe(1);
    expect(win.pages.find((row) => row.route === "unmatched")?.slowestPath).toBeNull();
  });

  it("counts a call in the window where it finishes, not the window where it started", () => {
    const t0 = Date.now();
    beginRequest();
    flushTick(t0 + 1_000);
    noteApi("GET", "/api/slow", 1_000, 200);
    endRequest();
    flushTick(t0 + 2_000);
    const windows = readProcessStats({ from: t0, to: t0 + 3_000, now: t0 + 3_000 }).processes[0].windows;
    expect(windows).toHaveLength(2);
    expect(windows[0].api).toEqual([]);
    expect(windows[0].process?.inFlightMaxRequests).toBeGreaterThanOrEqual(1);
    expect(windows[1].api.map((row) => row.route)).toEqual(["/api/slow"]);
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
    const windows = readProcessStats({ from: t0, to: t0 + 4_000, now: t0 + 4_000 }).processes[0].windows;
    expect(windows[0].api[0].count).toBe(1);
    expect(windows[1].api).toEqual([]);
    expect(windows[1].process?.inFlightMaxRequests).toBe(1);
    expect(windows[2].process?.inFlightMaxRequests).toBe(0);
    expect(histogramResetsForTests()).toBe(resetsBefore + 3);
  });

  it("records machine CPU only on web", () => {
    const t0 = Date.now();
    flushTick(t0);
    const web = readProcessStats({ from: t0 - 1, to: t0 + 1, now: t0 + 1 }).processes[0].windows[0];
    expect(typeof web.process?.cpuMachinePercent).toBe("number");

    boot({ processName: "sidequest" });
    const t1 = t0 + 10_000;
    flushTick(t1);
    const side = readProcessStats({ from: t1 - 1, to: t1 + 1, now: t1 + 1 }).processes.find((series) => series.processName === "sidequest");
    expect(side?.windows[0].process?.cpuMachinePercent).toBeNull();
  });
});

describe("files and ingest", () => {
  it("writes one object for a two-minute stall, stamped at window close", () => {
    const closedAt = Date.now() + 120_000;
    flushTick(closedAt);
    const stats = readProcessStats({ from: closedAt - 1, to: closedAt + 1, now: closedAt + 1 });
    expect(stats.processes).toHaveLength(1);
    expect(stats.processes[0].windows).toHaveLength(1);
    const win = stats.processes[0].windows[0];
    expect(win.timestamp).toBe(closedAt);
    expect(win.process?.timestamp).toBe(closedAt);
    expect(win.process?.intervalMs).toBeGreaterThanOrEqual(119_000);
    expect(win.process?.intervalMs).toBeLessThanOrEqual(130_000);
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
    const stats = readProcessStats({ from: 40_000, to: 60_000, now: 60_000 });
    expect(stats.processes[0].windows[0].api[0].route).toBe("/api/content/:contentType/:slug");
    expect(stats.processes[0].windows[0].process?.processId).toBe(9);
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
    expect(readProcessStats({ from: 80_000, to: 100_000, now: 100_000 }).processes).toEqual([]);
    const again = new Database(dbPath);
    again.exec(`DROP TRIGGER fail_process_insert`);
    again.close();
    flushTick(91_000);
    const stats = readProcessStats({ from: 80_000, to: 100_000, now: 100_000 });
    const routes = stats.processes.flatMap((series) => series.windows.flatMap((win) => win.api.map((row) => row.route)));
    expect(routes).toContain("/api/kept");
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
    const stats = readProcessStats({ from: ts - 1, to: ts + 10, now: ts + 10 });
    const web = stats.processes.filter((row) => row.processId === 4);
    expect(web).toHaveLength(1);
    expect(web[0].processName).toBe("web");
    expect(web[0].windows).toHaveLength(2);
    expect(web[0].windows[0].process?.processId).toBe(4);
    expect(web[0].windows[0].api).toEqual([]);
    expect(web[0].windows[1].process).toBeNull();
    expect(web[0].windows[1].api[0].maxMs).toBe(20);
  });

  it("leaves the name empty when that pid has no process row", () => {
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
    const stats = readProcessStats({ from: ts - 1, to: ts + 1, now: ts + 1 });
    expect(stats.processes).toHaveLength(1);
    expect(stats.processes[0].processName).toBeNull();
    expect(stats.processes[0].processId).toBe(8);
    expect(stats.processes[0].windows[0].process).toBeNull();
    expect(stats.processes[0].windows[0].api[0].maxMs).toBe(20);
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
    const stats = readProcessStats({ from: ts - 1, to: ts + 1, now: ts + 1 });
    const workers = stats.processes.filter((series) => series.processName === "diagnostics-worker");
    expect(workers.map((series) => series.processId).sort()).toEqual([11, 12]);
    const mixed = workers.find((series) => series.processId === 12);
    expect(mixed?.windows[0].pages[0].durationBoundsId).toBe(otherId);
    expect(mixed?.windows[0].pages[0].durationCounts).toEqual([0, 1]);
    expect(stats.durationBounds.map((legend) => legend.id)).toContain(otherId);
    expect(stats.durationBounds.find((legend) => legend.id === otherId)?.boundsMs).toEqual(otherBounds);
  });

  it("defaults to the last 24 hours and never returns more than 7 days", () => {
    const now = 1_700_000_000_000;
    const day = readProcessStats({ now });
    expect(day.to).toBe(now);
    expect(day.from).toBe(now - 24 * 60 * 60 * 1000);
    expect(day.stepMs).toBe(5 * 60 * 1000);
    const wide = readProcessStats({ from: 0, to: now, now });
    expect(wide.from).toBe(now - RETENTION_MS);
    expect(wide.to).toBe(now);
    expect(wide.stepMs).toBe(30 * 60 * 1000);
  });

  it("keeps every window and its routes when the range is at most 6 hours", () => {
    const ts = 400_000;
    noteApi("GET", "/api/kept", 10, 200);
    flushTick(ts);
    const stats = readProcessStats({ from: ts, to: ts + 6 * 60 * 60 * 1000, now: ts + 6 * 60 * 60 * 1000 });
    expect(stats.stepMs).toBe(30_000);
    expect(stats.processes[0].windows[0].api[0].route).toBe("/api/kept");
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
    const stats = readProcessStats({ from: bucket, to: bucket + 7 * 60 * 60 * 1000, now: bucket + 7 * 60 * 60 * 1000 });
    const web = stats.processes.find((row) => row.processId === 4);
    expect(stats.stepMs).toBe(step);
    expect(stats.durationBounds).toEqual([]);
    expect(web?.windows.map((win) => win.timestamp)).toEqual([bucket, bucket + step]);
    expect(web?.windows[0].process?.eventLoopMaxMs).toBe(80);
    expect(web?.windows[0].process?.cpuProcessPercent).toBe(40);
    expect(web?.windows[0].process?.intervalMs).toBe(step);
    expect(web?.windows[0].api).toEqual([]);
    expect(web?.windows[1].process?.eventLoopMaxMs).toBe(12);
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
    const stats = readProcessStats({ from: bucket, to: bucket + 25 * 60 * 60 * 1000, now: bucket + 25 * 60 * 60 * 1000 });
    const web = stats.processes.find((row) => row.processId === 5);
    expect(stats.stepMs).toBe(step);
    expect(web?.windows.map((win) => [win.timestamp, win.process?.eventLoopMaxMs])).toEqual([
      [bucket, 50],
      [bucket + step, 9],
    ]);
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
