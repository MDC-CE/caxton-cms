/**
 * Process statistics. Records when a Node process stalls and which traffic
 * finished in that window. This is not Search Console, GA4, or the diagnostics
 * "performance" category.
 *
 * Each process (web, sidequest, mcp, diagnostics-worker) calls startTick once.
 * Every 30s it appends one JSON object to
 * data/process-stats/<processName>-<pid>.jsonl. One line is one closed window,
 * not one request. Qdrant does not report.
 *
 * Only web opens data/process-stats.db (separate from data/app.db). On the same
 * tick, after appending its own line, it reads every jsonl, inserts, then
 * drops what it consumed. An empty file is removed when that pid is not
 * running, and web also removes its own file. A live sibling keeps an empty
 * file, so an append in the same moment is not unlinked. Importing this
 * module does not open the database.
 *
 * noteApi and notePage only update in-memory maps. API and page sheets are
 * filled by web traffic, because the other processes never call them. Those
 * processes still write a process row with empty lists.
 *
 * If the event loop is blocked, the tick does not run and windows do not pile
 * up in memory. When the thread unblocks there is one object, with intervalMs
 * and eventLoopMaxMs covering the whole stall. A call is counted in the window
 * where it finishes, not where it started. Requests still open at the cut for
 * 500ms or more are stored on that process row as openCalls. maxMs there is
 * time already open, not the final duration.
 *
 * The 720-object cap (6 hours) is a waiting room for when web is not reading.
 * Database retention is separate: 7 days, pruned on startup and every hour.
 *
 * Sections follow the data: collection, the window file, the database write,
 * the staff read, then test hooks.
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, PerformanceObserver, type PerformanceEntry } from "node:perf_hooks";
import Database from "better-sqlite3";
import { getProjectRoot } from "@shared/paths";
import { getAllConfigs } from "./content-types";
import { child } from "./logger";

const log = child({ module: "process-stats" });

/** Histogram bounds, in code (not settings.yml). The last durationCounts slot is "≥ 5000 ms". Calls under 50 ms share the first slot. */
export const DURATION_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000];
/** Max JSON objects per jsonl file. 720 × 30s = 6 hours. */
export const MAX_FILE_OBJECTS = 720;
/** Tick interval. A row's intervalMs is the real time since the previous close, not always this value. */
export const TICK_MS = 30_000;
/** Ranges up to this long stay on the 30s tick. */
const TWO_HOUR_RANGE_MS = 2 * 60 * 60 * 1000;
/** Ranges up to this long use one point per 90 seconds. A day is 5 minutes. A week is 30 minutes. */
const SIX_HOUR_RANGE_MS = 6 * 60 * 60 * 1000;
/** Ranges up to this long return one point per 5 minutes. Longer ranges use 30 minutes. */
const DAY_RANGE_MS = 24 * 60 * 60 * 1000;
const STEP_90_SEC_MS = 90 * 1000;
const STEP_5_MIN_MS = 5 * 60 * 1000;
const STEP_30_MIN_MS = 30 * 60 * 1000;
/** How long rows stay in SQLite. Separate from the 6-hour file cap. */
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** An open request is listed on the closing window only after this long. */
const OPEN_CALL_MIN_MS = 500;

/** One column of a sheet table. json marks values stored as text and parsed back on read. */
type SqlColumn = {
  name: string;
  sql: string;
  json?: "array" | "object";
};

/** The write contract for one sheet: table name, columns, and primary key. */
type SheetTable = {
  name: string;
  primaryKey: string[];
  columns: SqlColumn[];
};

const PROCESS_SHEET: SheetTable = {
  name: "process_samples",
  primaryKey: ["timestamp", "processName", "processId"],
  columns: [
    { name: "timestamp", sql: "INTEGER NOT NULL" },
    { name: "processName", sql: "TEXT NOT NULL" },
    { name: "processId", sql: "INTEGER NOT NULL" },
    { name: "processStartId", sql: "TEXT NOT NULL" },
    { name: "intervalMs", sql: "INTEGER NOT NULL" },
    { name: "eventLoopP50Ms", sql: "REAL NOT NULL" },
    { name: "eventLoopP99Ms", sql: "REAL NOT NULL" },
    { name: "eventLoopMaxMs", sql: "REAL NOT NULL" },
    { name: "heapUsedMb", sql: "INTEGER NOT NULL" },
    { name: "rssMb", sql: "INTEGER NOT NULL" },
    { name: "cpuProcessPercent", sql: "REAL NOT NULL" },
    { name: "cpuMachinePercent", sql: "REAL" },
    { name: "garbageCollectionPauseMs", sql: "REAL NOT NULL" },
    { name: "garbageCollectionMaxPauseMs", sql: "REAL NOT NULL" },
    { name: "inFlightMaxRequests", sql: "INTEGER NOT NULL" },
    { name: "openFds", sql: "INTEGER" },
    { name: "openFdsLimit", sql: "INTEGER" },
    { name: "openCalls", sql: "TEXT", json: "array" },
  ],
};

const API_SHEET: SheetTable = {
  name: "api_samples",
  primaryKey: ["timestamp", "pid", "method", "route"],
  columns: [
    { name: "timestamp", sql: "INTEGER NOT NULL" },
    { name: "pid", sql: "INTEGER NOT NULL" },
    { name: "bootId", sql: "TEXT NOT NULL" },
    { name: "method", sql: "TEXT NOT NULL" },
    { name: "route", sql: "TEXT NOT NULL" },
    { name: "count", sql: "INTEGER NOT NULL" },
    { name: "sumMs", sql: "INTEGER NOT NULL" },
    { name: "maxMs", sql: "INTEGER NOT NULL" },
    { name: "durationBoundsId", sql: "TEXT NOT NULL" },
    { name: "durationCounts", sql: "TEXT NOT NULL", json: "array" },
    { name: "statusCounts", sql: "TEXT NOT NULL", json: "object" },
  ],
};

const PAGE_SHEET: SheetTable = {
  name: "document_samples",
  primaryKey: ["timestamp", "pid", "route"],
  columns: [
    { name: "timestamp", sql: "INTEGER NOT NULL" },
    { name: "pid", sql: "INTEGER NOT NULL" },
    { name: "bootId", sql: "TEXT NOT NULL" },
    { name: "route", sql: "TEXT NOT NULL" },
    { name: "count", sql: "INTEGER NOT NULL" },
    { name: "sumMs", sql: "INTEGER NOT NULL" },
    { name: "maxMs", sql: "INTEGER NOT NULL" },
    { name: "durationBoundsId", sql: "TEXT NOT NULL" },
    { name: "durationCounts", sql: "TEXT NOT NULL", json: "array" },
    { name: "statusCounts", sql: "TEXT NOT NULL", json: "object" },
    { name: "ssrCounts", sql: "TEXT NOT NULL", json: "object" },
    { name: "slowestPath", sql: "TEXT" },
  ],
};

/** Who reports. Two workers with the same name are separated by pid, not by this string. */
export type ProcessName = "web" | "sidequest" | "mcp" | "diagnostics-worker";

/** Names the staff GET accepts in `?process=`. */
export const PROCESS_NAMES: readonly ProcessName[] = ["web", "sidequest", "mcp", "diagnostics-worker"];

type DurationRow = {
  count: number;
  sumMs: number;
  maxMs: number;
  durationCounts: number[];
  statusCounts: Record<string, number>;
  durationBoundsId: string;
};

type PageRow = DurationRow & {
  ssrCounts: Record<string, number>;
  slowestPath: string | null;
  route: string;
};

type ApiRow = DurationRow & {
  method: string;
  route: string;
};

/**
 * One process row per window. cpuProcessPercent is one core of THIS process
 * (100 = the JS thread is full). cpuMachinePercent is the whole machine and is
 * set only on web; other processes store null.
 * heapUsedMb is the V8 heap; rssMb is this process's RAM. Neither is droplet RAM.
 * openFds is null outside Linux.
 */
/** Requests of one route still open at the cut, and already open for at least 500ms. */
export type OpenCallRow = {
  method: string;
  route: string;
  count: number;
  /** Longest time already open at the cut. Not the duration when it later finishes. */
  maxMs: number;
};

export type ProcessSample = {
  timestamp: number;
  processName: ProcessName;
  processId: number;
  processStartId: string;
  intervalMs: number;
  eventLoopP50Ms: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  heapUsedMb: number;
  rssMb: number;
  cpuProcessPercent: number;
  /** Whole machine. Null on every process except web. */
  cpuMachinePercent: number | null;
  garbageCollectionPauseMs: number;
  garbageCollectionMaxPauseMs: number;
  inFlightMaxRequests: number;
  openFds: number | null;
  openFdsLimit: number | null;
  /** Null when nothing had been open for 500ms. Old rows are null too. */
  openCalls: OpenCallRow[] | null;
};

/**
 * One jsonl line. timestamp, pid, and bootId stay on the object even when
 * process is null, so APIs or pages can still be inserted if gauges fail.
 * timestamp is the window-close epoch ms, not the INSERT time.
 */
type WindowObject = {
  timestamp: number;
  pid: number;
  bootId: string;
  processName: ProcessName;
  process: ProcessSample | null;
  api: ApiRow[];
  pages: PageRow[];
};

type StartOpts = {
  processName: ProcessName;
  processStartId: string;
  /** Web process inserts files into SQLite. */
  ingest?: boolean;
  /** When false, only flushTick() publishes. Tests use this. */
  timer?: boolean;
  intervalMs?: number;
  dir?: string;
  dbPath?: string;
  /** Pass null to exercise the bounds fallback. */
  boundsMs?: number[] | null;
};

let started = false;
let ingestEnabled = false;
let processName: ProcessName = "web";
let processStartId = "";
let statsDir = "";
let dbPath = "";
let boundsMs: number[] | null = DURATION_BUCKETS_MS;
let timer: ReturnType<typeof setInterval> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let lastFlushAt = 0;
let db: import("better-sqlite3").Database | null = null;
let histogramResets = 0;
let ingestStatements: string[] = [];

// --- Collection ---
// Open window, in memory. note while a request finishes, take when the tick
// closes it. Callers outside this file use beginRequest, noteApi, and notePage.
// durationBuckets reads the in-memory cutoffs (50, 100, 250, … ms). It opens
// SQLite only when that array is missing.

/**
 * Short id of a bounds legend. If the array changes, the id changes and old
 * rows keep the previous one. The GET does not convert counts from one legend to another.
 */
export function durationBoundsId(bounds: readonly number[] = DURATION_BUCKETS_MS): string {
  return createHash("sha256").update(JSON.stringify(bounds)).digest("hex").slice(0, 8);
}

function addDuration(row: DurationRow, ms: number, status: number, buckets: readonly number[]): void {
  row.count += 1;
  row.sumMs += ms;
  if (ms > row.maxMs) row.maxMs = ms;
  // Slot 0 is below the first cutoff. The last slot is at or above the last cutoff.
  let idx = buckets.length;
  for (let i = 0; i < buckets.length; i++) {
    if (ms < buckets[i]) {
      idx = i;
      break;
    }
  }
  row.durationCounts[idx] = (row.durationCounts[idx] ?? 0) + 1;
  const statusKey = !Number.isInteger(status) || status < 100 || status > 599 ? "other" : String(status);
  row.statusCounts[statusKey] = (row.statusCounts[statusKey] ?? 0) + 1;
}

/**
 * Route stored in api_samples. With an Express template, uses baseUrl +
 * route.path (for example GET /api/content/:contentType/:slug): a concrete
 * slug does not open another row. Without a template (a 404, or a response
 * that finished before a route), returns "unmatched".
 */
export function resolveApiRoute(req: {
  path: string;
  baseUrl?: string;
  route?: { path?: string | RegExp };
}): string {
  const routePath = req.route?.path;
  if (typeof routePath === "string" && routePath.length > 0) {
    const base = req.baseUrl || "";
    if (routePath.startsWith("/")) return `${base}${routePath}`;
    return `${base}/${routePath}`;
  }
  return "unmatched";
}

/**
 * Which url_pattern this pathname belongs to. Same number of segments, literals
 * must match, `:param` matches one segment. If several patterns fit, the one
 * with more literal segments wins (`/en/blog/:slug` over `/en/:section/:slug`).
 * ContentIndex.parseContentUrl does this too, but it returns the content type
 * of the first hit and it loads the whole site index. Here we only need the
 * pattern string, from the cached content-types.yml list.
 * Returns "unmatched" when nothing fits.
 */
export function matchUrlPattern(pathname: string, patterns: readonly string[]): string {
  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  let best: { pattern: string; literals: number } | null = null;
  for (const pattern of patterns) {
    const stored = pattern.startsWith("/") ? pattern : `/${pattern}`;
    const pParts = stored.split("/").filter(Boolean);
    if (pParts.length !== parts.length) continue;
    let literals = 0;
    let ok = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(":")) continue;
      if (pParts[i] !== parts[i]) {
        ok = false;
        break;
      }
      literals += 1;
    }
    if (!ok) continue;
    if (!best || literals > best.literals) best = { pattern: stored, literals };
  }
  return best ? best.pattern : "unmatched";
}

/** Collects url_pattern values from content-types.yml and passes them to matchUrlPattern. */
export function pageRouteForPath(pathname: string, contentRoot?: string): string {
  const patterns: string[] = [];
  try {
    const configs = getAllConfigs(contentRoot);
    for (const entry of Object.values(configs)) {
      const up = entry?.url_pattern;
      if (!up) continue;
      for (const p of Object.values(up)) {
        if (typeof p === "string" && p.length > 0) patterns.push(p);
      }
    }
  } catch (err) {
    log.warn({ err }, "content type patterns unavailable");
  }
  return matchUrlPattern(pathname, patterns);
}

/** Open fd count and the soft "Max open files" limit from /proc. Null when /proc is unavailable. */
function readOpenFds(): { openFds: number | null; openFdsLimit: number | null } {
  try {
    const names = fs.readdirSync("/proc/self/fd");
    let openFdsLimit: number | null = null;
    try {
      const limits = fs.readFileSync("/proc/self/limits", "utf8");
      const line = limits.split("\n").find((l) => l.toLowerCase().startsWith("max open files"));
      const nums = line?.match(/\d+/g);
      const n = nums ? Number(nums[0]) : NaN;
      openFdsLimit = Number.isFinite(n) ? n : null;
    } catch {
      openFdsLimit = null;
    }
    return { openFds: names.length, openFdsLimit };
  } catch {
    return { openFds: null, openFdsLimit: null };
  }
}

/**
 * Millisecond cutoffs for the duration histogram (50, 100, 250, …). In production
 * this is the in-memory array and does not touch SQLite — not once per tick,
 * and not once per request beyond reading a variable. The query below runs
 * only when that array was not provided (tests, or a build that dropped the constant).
 */
function durationBuckets(): number[] | null {
  if (boundsMs && boundsMs.length > 0) return boundsMs;
  try {
    if (!dbPath) return null;
    const opened = openDatabase();
    const id = fallbackBoundsIdForPid(process.pid);
    if (!id) return null;
    const row = opened.prepare(`SELECT boundsMs FROM duration_bounds WHERE id = ?`).get(id) as
      | { boundsMs: string }
      | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.boundsMs) as unknown;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

/**
 * Process sheet. enable() once at start. noteStart/noteFinish on each request.
 * take() is the tick: read the histogram, CPU, GC and in-flight peak, then reset
 * them the way monitorEventLoopDelay.reset() does.
 */
const processLive = {
  histogram: null as ReturnType<typeof monitorEventLoopDelay> | null,
  gcObserver: null as PerformanceObserver | null,
  gcSum: 0,
  gcMax: 0,
  inFlight: 0,
  inFlightMax: 0,
  lastCpu: process.cpuUsage(),

  noteStart(): void {
    this.inFlight += 1;
    if (this.inFlight > this.inFlightMax) this.inFlightMax = this.inFlight;
  },

  noteFinish(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  },

  enable(): void {
    try {
      this.histogram = monitorEventLoopDelay({ resolution: 20 });
      this.histogram.enable();
    } catch (err) {
      log.warn({ err }, "event loop monitor unavailable");
      this.histogram = null;
    }
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEntry[]) {
          this.gcSum += entry.duration;
          if (entry.duration > this.gcMax) this.gcMax = entry.duration;
        }
      });
      this.gcObserver.observe({ entryTypes: ["gc"] });
    } catch {
      this.gcObserver = null;
    }
  },

  /** Drop observers and zero the counters. Does not write a window. */
  reset(): void {
    this.histogram?.disable();
    this.gcObserver?.disconnect();
    this.histogram = null;
    this.gcObserver = null;
    this.gcSum = 0;
    this.gcMax = 0;
    this.inFlight = 0;
    this.inFlightMax = 0;
    this.lastCpu = process.cpuUsage();
  },

  /**
   * Gauges for the window that just closed, then reset. cpuProcessPercent is
   * one core of this process (100 = its JS thread was full). A sibling process
   * does not raise it. The in-flight peak floor for the next window is however
   * many requests are still open. Machine CPU is not here; web reads that on `machine`.
   */
  take(intervalMs: number): Omit<ProcessSample, "timestamp" | "processName" | "processId" | "processStartId" | "intervalMs" | "cpuMachinePercent" | "openCalls"> {
    let eventLoopP50Ms = 0;
    let eventLoopP99Ms = 0;
    let eventLoopMaxMs = 0;
    if (this.histogram) {
      eventLoopP50Ms = Math.round((this.histogram.percentile(50) / 1e6) * 10) / 10;
      eventLoopP99Ms = Math.round((this.histogram.percentile(99) / 1e6) * 10) / 10;
      eventLoopMaxMs = Math.round((this.histogram.max / 1e6) * 10) / 10;
      this.histogram.reset();
      histogramResets += 1;
    }
    const mem = process.memoryUsage();
    const fds = readOpenFds();
    const gcPause = Math.round(this.gcSum * 10) / 10;
    const gcPauseMax = Math.round(this.gcMax * 10) / 10;
    this.gcSum = 0;
    this.gcMax = 0;
    const peak = this.inFlightMax;
    this.inFlightMax = this.inFlight;
    const cpuProcessPercent = this.readProcessCpuPercent(intervalMs);
    return {
      eventLoopP50Ms,
      eventLoopP99Ms,
      eventLoopMaxMs,
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      cpuProcessPercent,
      garbageCollectionPauseMs: gcPause,
      garbageCollectionMaxPauseMs: gcPauseMax,
      inFlightMaxRequests: peak,
      openFds: fds.openFds,
      openFdsLimit: fds.openFdsLimit,
    };
  },

  /** This process since the previous reading, as a percent of one core. */
  readProcessCpuPercent(intervalMs: number): number {
    const diff = process.cpuUsage(this.lastCpu);
    this.lastCpu = process.cpuUsage();
    if (intervalMs <= 0) return 0;
    const pct = (diff.user + diff.system) / 1000 / intervalMs * 100;
    return Math.round(pct * 10) / 10;
  },
};

/**
 * Machine CPU. Only web calls take(). os.cpus() is a counter since boot, so
 * the percent is the change since the previous take. The first call returns 0.
 * Other processes leave cpuMachinePercent null.
 */
const machine = {
  last: null as { idle: number; total: number } | null,

  reset(): void {
    this.last = null;
  },

  take(): number {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      const t = cpu.times;
      idle += t.idle;
      total += t.user + t.nice + t.sys + t.idle + t.irq;
    }
    if (!this.last) {
      this.last = { idle, total };
      return 0;
    }
    const dTotal = total - this.last.total;
    const dIdle = idle - this.last.idle;
    this.last = { idle, total };
    if (dTotal <= 0) return 0;
    return Math.round((1 - dIdle / dTotal) * 1000) / 10;
  },
};

/** API sheet. One row per method + route template. take() empties the map. */
const api = {
  rows: new Map<string, ApiRow>(),

  /**
   * One finished API call. Does not write the file. If the duration cutoffs
   * are missing and this pid has no previous route row, the call is dropped.
   */
  note(method: string, route: string, ms: number, status: number): void {
    const buckets = durationBuckets();
    if (!buckets) return;
    const key = `${method} ${route}`;
    let row = this.rows.get(key);
    if (!row) {
      row = {
        method,
        route,
        count: 0,
        sumMs: 0,
        maxMs: 0,
        durationCounts: new Array(buckets.length + 1).fill(0),
        statusCounts: {},
        durationBoundsId: durationBoundsId(buckets),
      };
      this.rows.set(key, row);
    }
    addDuration(row, ms, status, buckets);
  },

  take(): ApiRow[] {
    const rows = [...this.rows.values()];
    this.rows.clear();
    return rows;
  },

  reset(): void {
    this.rows.clear();
  },
};

/**
 * Page sheet. Production HTML only (not the Vite dev handler, not a cache hit).
 * slowestPath is set when this call is the slowest and at or above the last
 * duration cutoff (the last durationCounts slot). The duration itself is maxMs.
 * ssrCounts uses the outcome string as it arrived. A missing key means 0.
 */
const pages = {
  rows: new Map<string, PageRow>(),

  note(pattern: string, pathName: string, ms: number, status: number, outcome: string): void {
    const buckets = durationBuckets();
    if (!buckets) return;
    const cleanPath = pathName.split("?")[0].split("#")[0] || "/";
    let row = this.rows.get(pattern);
    if (!row) {
      row = {
        route: pattern,
        count: 0,
        sumMs: 0,
        maxMs: 0,
        durationCounts: new Array(buckets.length + 1).fill(0),
        statusCounts: {},
        durationBoundsId: durationBoundsId(buckets),
        ssrCounts: {},
        slowestPath: null,
      };
      this.rows.set(pattern, row);
    }
    const isSlowest = ms >= buckets[buckets.length - 1] && ms >= row.maxMs;
    addDuration(row, ms, status, buckets);
    row.ssrCounts[outcome] = (row.ssrCounts[outcome] ?? 0) + 1;
    if (isSlowest) row.slowestPath = cleanPath;
  },

  take(): PageRow[] {
    const rows = [...this.rows.values()];
    this.rows.clear();
    return rows;
  },

  reset(): void {
    this.rows.clear();
  },
};

type OpenRequest = {
  method?: string;
  path?: string;
  baseUrl?: string;
  route?: { path?: string | RegExp };
};

/**
 * Still-open requests, keyed by the request object. Removed on finish and on
 * connection close. A Map so endRequest is a lookup, not a scan of every open call.
 */
const trackedRequests = new Map<OpenRequest, number>();

/** Express template when one exists. Otherwise the path that arrived, not "unmatched". */
function routeForOpenCall(req: OpenRequest): string {
  const templated = resolveApiRoute({ ...req, path: req.path ?? "" });
  if (templated !== "unmatched") return templated;
  return req.path && req.path.length > 0 ? req.path : "unmatched";
}

/** Group requests open for at least 500ms. Two of the same route share one row. */
function snapshotOpenCalls(now: number): OpenCallRow[] | null {
  const groups = new Map<string, OpenCallRow>();
  for (const [req, startedAt] of trackedRequests) {
    const elapsed = now - startedAt;
    if (elapsed < OPEN_CALL_MIN_MS) continue;
    const method = (req.method || "GET").toUpperCase();
    const route = routeForOpenCall(req);
    const key = `${method} ${route}`;
    const maxMs = Math.round(elapsed);
    const prev = groups.get(key);
    if (!prev) {
      groups.set(key, { method, route, count: 1, maxMs });
      continue;
    }
    prev.count += 1;
    if (maxMs > prev.maxMs) prev.maxMs = maxMs;
  }
  if (groups.size === 0) return null;
  return [...groups.values()].sort((a, b) => b.maxMs - a.maxMs || b.count - a.count);
}

/**
 * Raises the in-flight count. Pass the request to remember it until endRequest
 * with the same object. startedAt is the clock for tests; production omits it.
 */
export function beginRequest(req?: OpenRequest, startedAt = Date.now()): void {
  processLive.noteStart();
  if (!req) return;
  trackedRequests.set(req, startedAt);
}

/**
 * Lowers the in-flight count. With a request, a second call does nothing, so
 * finish and close can both invoke it. The peak stays until the next take().
 */
export function endRequest(req?: OpenRequest): void {
  if (req && !trackedRequests.delete(req)) return;
  processLive.noteFinish();
}

/** /api finish handler, dev and production. */
export function noteApi(method: string, route: string, ms: number, status: number): void {
  api.note(method, route, ms, status);
}

/** Production catch-all only. pattern is the url_pattern, or "unmatched". */
export function notePage(
  pattern: string,
  pathName: string,
  ms: number,
  status: number,
  outcome: string,
): void {
  pages.note(pattern, pathName, ms, status, outcome);
}

// --- Window file ---
// Close the three sheets into one JSON object and append it. The timer lives
// here. Web ingests on the same tick; that insert is the next section.

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Append one window object. Under the cap this is an append, not a rewrite.
 * Past MAX_FILE_OBJECTS, drop the oldest and rewrite via a temp file + rename.
 * Do not overwrite the file the way the Sidequest heartbeat does.
 */
export function appendWindowObject(file: string, obj: WindowObject, maxObjects = MAX_FILE_OBJECTS): void {
  ensureDir(path.dirname(file));
  const line = JSON.stringify(obj);
  let existing = "";
  try {
    existing = fs.readFileSync(file, "utf8");
  } catch {
    existing = "";
  }
  const lines = existing.split("\n").filter((l) => l.length > 0);
  lines.push(line);
  const capped = lines.length > maxObjects ? lines.slice(lines.length - maxObjects) : lines;
  if (capped.length !== lines.length || existing.length === 0) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${capped.join("\n")}\n`);
    fs.renameSync(tmp, file);
    return;
  }
  fs.appendFileSync(file, `${line}\n`);
}

/**
 * Close one window and append it. take() on each sheet reads and resets that
 * sheet. A counter failure still writes the process row; a gauge failure still
 * writes api and pages. now is the window close. intervalMs is elapsed since
 * the previous close.
 */
function publishWindow(now = Date.now()): void {
  const intervalMs = Math.max(0, now - lastFlushAt);
  lastFlushAt = now;
  let apiTaken: ApiRow[] = [];
  let pagesTaken: PageRow[] = [];
  try {
    apiTaken = api.take();
    pagesTaken = pages.take();
  } catch (err) {
    log.warn({ err }, "route counters failed; writing process window anyway");
  }
  let processSample: ProcessSample | null = null;
  try {
    processSample = {
      timestamp: now,
      processName,
      processId: process.pid,
      processStartId,
      intervalMs,
      ...processLive.take(intervalMs),
      cpuMachinePercent: processName === "web" ? machine.take() : null,
      openCalls: snapshotOpenCalls(now),
    };
  } catch (err) {
    log.warn({ err }, "process gauges failed");
  }
  // One file per process and pid, so two diagnostics workers never share a file.
  const file = path.join(statsDir, `${processName}-${process.pid}.jsonl`);
  appendWindowObject(file, {
    timestamp: now,
    pid: process.pid,
    bootId: processStartId,
    processName: processName,
    process: processSample,
    api: apiTaken,
    pages: pagesTaken,
  });
}

/**
 * Close the current window now. Web also ingests. Call this on SIGTERM and
 * when the diagnostics worker exits, so at most the still-open window is lost.
 */
export function flushTick(now = Date.now()): void {
  if (!started) return;
  publishWindow(now);
  if (ingestEnabled) ingestStatsFiles(statsDir);
}

/**
 * Start the 30s timer in this process. Pass ingest: true only from web.
 * processStartId is the boot UUID (web uses BOOT_ID). A second call is ignored.
 * The timer is unref'd so it does not keep the process alive by itself.
 */
export function startTick(opts: StartOpts): void {
  if (started) return;
  started = true;
  processName = opts.processName;
  processStartId = opts.processStartId || randomUUID();
  ingestEnabled = opts.ingest === true;
  statsDir = opts.dir ?? path.join(getProjectRoot(), "data", "process-stats");
  dbPath = opts.dbPath ?? path.join(getProjectRoot(), "data", "process-stats.db");
  boundsMs = opts.boundsMs === undefined ? DURATION_BUCKETS_MS : opts.boundsMs;
  lastFlushAt = Date.now();
  ensureDir(statsDir);
  processLive.enable();
  if (ingestEnabled) {
    prune(openDatabase());
  }
  if (opts.timer === false) return;
  const interval = opts.intervalMs ?? TICK_MS;
  timer = setInterval(() => {
    try {
      flushTick();
    } catch (err) {
      log.warn({ err }, "process stats tick failed");
    }
  }, interval);
  timer.unref();
  if (ingestEnabled) {
    pruneTimer = setInterval(() => {
      try {
        prune(openDatabase());
      } catch (err) {
        log.warn({ err }, "process stats prune failed");
      }
    }, 60 * 60 * 1000);
    pruneTimer.unref();
  }
}

/** Stop the timer, disconnect observers, and close SQLite. Does not flush. */
export function stopTick(): void {
  if (timer) clearInterval(timer);
  if (pruneTimer) clearInterval(pruneTimer);
  processLive.reset();
  machine.reset();
  api.reset();
  pages.reset();
  trackedRequests.clear();
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  timer = null;
  pruneTimer = null;
  db = null;
  started = false;
  ingestEnabled = false;
  histogramResets = 0;
  ingestStatements = [];
}

// --- Database write ---
// Web only. Read every jsonl, insert, then delete the lines just consumed.
// An empty file goes away when its writer is gone. Importing this file does
// not open SQLite.

type Sqlite = import("better-sqlite3").Database;

function columnNames(table: SheetTable): string[] {
  return table.columns.map((col) => col.name);
}

function createTableSql(table: SheetTable): string {
  const body = table.columns.map((col) => `${col.name} ${col.sql}`).join(",\n");
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n${body},\nPRIMARY KEY (${table.primaryKey.join(", ")})\n)`;
}

/**
 * Open data/process-stats.db on first use. This is not data/app.db and it does
 * not belong in db.ts: that module opens app.db at import time, and sidequest
 * / mcp / the diagnostics worker must be able to import this file without
 * opening SQLite. WAL. API and page rows have no processName; they join the
 * process row by pid + timestamp.
 */
function openDatabase(): Sqlite {
  if (db) return db;
  ensureDir(path.dirname(dbPath));
  const opened = new Database(dbPath);
  opened.pragma("journal_mode = WAL");
  opened.exec(`
    ${createTableSql(PROCESS_SHEET)};
    ${createTableSql(API_SHEET)};
    ${createTableSql(PAGE_SHEET)};
    CREATE TABLE IF NOT EXISTS duration_bounds (
      id TEXT PRIMARY KEY,
      boundsMs TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS process_samples_ts ON process_samples (timestamp);
    CREATE INDEX IF NOT EXISTS api_samples_ts ON api_samples (timestamp);
    CREATE INDEX IF NOT EXISTS document_samples_ts ON document_samples (timestamp);
  `);
  ensureColumns(opened, PROCESS_SHEET);
  ensureColumns(opened, API_SHEET);
  ensureColumns(opened, PAGE_SHEET);
  db = opened;
  const bounds = boundsMs && boundsMs.length > 0 ? boundsMs : null;
  if (bounds) {
    opened.prepare(
      `INSERT OR IGNORE INTO duration_bounds (id, boundsMs) VALUES (?, ?)`,
    ).run(durationBoundsId(bounds), JSON.stringify(bounds));
  }
  return opened;
}

/** How to split one table's rows so a single statement stays under SQLite's variable limit. */
export function planInsertChunks(rowCount: number, columnCount: number, maxVariables = 30_000): number[] {
  if (rowCount <= 0 || columnCount <= 0) return [];
  const size = Math.max(1, Math.floor(maxVariables / columnCount));
  const chunks: number[] = [];
  let left = rowCount;
  while (left > 0) {
    const n = Math.min(size, left);
    chunks.push(n);
    left -= n;
  }
  return chunks;
}

/**
 * Insert every row of one table. One multi-row INSERT OR IGNORE. Splits into
 * more statements only when one would exceed SQLite's variable limit.
 * Duplicate keys (a retry after a commit that did not get to delete the file)
 * are ignored.
 */
function insertRows(
  opened: Sqlite,
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): void {
  if (rows.length === 0) return;
  const chunks = planInsertChunks(rows.length, columns.length);
  let offset = 0;
  for (const n of chunks) {
    const slice = rows.slice(offset, offset + n);
    offset += n;
    const groups = slice.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    const sql = `INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES ${groups}`;
    const params = slice.flatMap((row) => columns.map((col) => row[col]));
    opened.prepare(sql).run(...params);
    ingestStatements.push(table);
  }
}

/** Delete rows older than RETENTION_MS. Does not touch the jsonl files. */
function prune(opened: Sqlite, now = Date.now()): void {
  const cutoff = now - RETENTION_MS;
  const tx = opened.transaction(() => {
    opened.prepare(`DELETE FROM process_samples WHERE timestamp < ?`).run(cutoff);
    opened.prepare(`DELETE FROM api_samples WHERE timestamp < ?`).run(cutoff);
    opened.prepare(`DELETE FROM document_samples WHERE timestamp < ?`).run(cutoff);
  });
  tx();
}

/**
 * Bounds id of this pid's route row with the greatest timestamp, across API
 * and page sheets. Used when the code array is missing. Not "the first row"
 * of duration_bounds.
 */
export function fallbackBoundsIdForPid(pid: number): string | null {
  const opened = openDatabase();
  const row = opened.prepare(
    `SELECT durationBoundsId FROM (
       SELECT durationBoundsId, timestamp FROM api_samples WHERE pid = ?
       UNION ALL
       SELECT durationBoundsId, timestamp FROM document_samples WHERE pid = ?
     ) ORDER BY timestamp DESC LIMIT 1`,
  ).get(pid, pid) as { durationBoundsId: string } | undefined;
  return row?.durationBoundsId ?? null;
}

type ParsedLine = { raw: string; parsed: WindowObject };

/**
 * Read one jsonl file. A line that does not parse is removed now: re-read and
 * drop only that text, so a window appended in between is kept. Returns the
 * lines that parsed. raw is the file text; parsed is the window.
 */
function readAndDropBrokenLines(file: string): ParsedLine[] {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const parsed: ParsedLine[] = [];
  const broken: string[] = [];
  for (const raw of text.split("\n")) {
    if (!raw) continue;
    try {
      const row = JSON.parse(raw) as WindowObject;
      if (!row || typeof row !== "object") {
        broken.push(raw);
        continue;
      }
      parsed.push({ raw, parsed: row });
    } catch {
      broken.push(raw);
    }
  }
  if (broken.length > 0) {
    let fresh = "";
    try {
      fresh = fs.readFileSync(file, "utf8");
    } catch {
      fresh = "";
    }
    const drop = new Set(broken);
    const kept = fresh.split("\n").filter((l) => l.length > 0 && !drop.has(l));
    fs.writeFileSync(file, kept.length ? `${kept.join("\n")}\n` : "");
  }
  return parsed;
}

/** Copy one sheet into a DB row. Columns marked json are stored as text. */
function ensureColumns(opened: Sqlite, table: SheetTable): void {
  const have = new Set(
    (opened.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string }>).map((col) => col.name),
  );
  for (const col of table.columns) {
    if (have.has(col.name)) continue;
    opened.exec(`ALTER TABLE ${table.name} ADD COLUMN ${col.name} ${col.sql}`);
  }
}

function dbRow(table: SheetTable, source: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of table.columns) {
    const value = source[col.name];
    if (col.json) {
      if (value == null) {
        row[col.name] = col.sql.includes("NOT NULL") ? JSON.stringify(col.json === "array" ? [] : {}) : null;
      } else {
        row[col.name] = JSON.stringify(value);
      }
      continue;
    }
    row[col.name] = value ?? null;
  }
  return row;
}

/**
 * Flatten windows into one list per table, using each sheet's column list.
 * Route rows use the process timestamp when the process sample exists,
 * otherwise the object's own timestamp, so a failed gauge does not drop the routes.
 */
function rowsFromWindows(windows: WindowObject[]): {
  processRows: Array<Record<string, unknown>>;
  apiRowsOut: Array<Record<string, unknown>>;
  pageRowsOut: Array<Record<string, unknown>>;
} {
  const processRows: Array<Record<string, unknown>> = [];
  const apiRowsOut: Array<Record<string, unknown>> = [];
  const pageRowsOut: Array<Record<string, unknown>> = [];
  for (const win of windows) {
    const proc = win.process;
    if (proc && proc.timestamp != null && proc.processName && proc.processId != null) {
      processRows.push(dbRow(PROCESS_SHEET, proc));
    }
    const stamp = proc?.timestamp ?? win.timestamp;
    const pid = proc?.processId ?? win.pid;
    const bootId = proc?.processStartId ?? win.bootId ?? "";
    if (stamp == null || pid == null) continue;
    for (const api of win.api ?? []) {
      apiRowsOut.push(dbRow(API_SHEET, { timestamp: stamp, pid, bootId, ...api }));
    }
    for (const page of win.pages ?? []) {
      pageRowsOut.push(dbRow(PAGE_SHEET, { timestamp: stamp, pid, bootId, ...page }));
    }
  }
  return { processRows, apiRowsOut, pageRowsOut };
}

const STATS_FILE_NAME = /^(web|sidequest|mcp|diagnostics-worker)-(\d+)\.jsonl$/;

/**
 * Empty files are removed only when nobody will append to them. This process
 * will not append again until the tick returns, so its own file is safe.
 * Another process's file is safe only when that pid is gone (ESRCH). EPERM
 * means the pid is alive. A name this writer does not use is left in place.
 */
function emptyStatsFileCanBeRemoved(file: string): boolean {
  const match = path.basename(file).match(STATS_FILE_NAME);
  if (!match) return false;
  const name = match[1] as ProcessName;
  const pid = Number(match[2]);
  if (pid === process.pid && name === processName) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/**
 * Insert every pending jsonl. One transaction, one INSERT per table (split
 * only if a statement would exceed the variable cap). Broken lines are already
 * gone. On failure the good lines stay for the next tick. After commit,
 * re-read each file and drop only the consumed lines, so an append that
 * landed during the insert is kept. If nothing remains and the writer is
 * gone, the file is removed. No-op unless this process started with ingest.
 */
export function ingestStatsFiles(dir = statsDir): void {
  if (!ingestEnabled) return;
  ingestStatements = [];
  const opened = openDatabase();
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return;
  }
  const pending = names.map((name) => {
    const file = path.join(dir, name);
    return { file, rows: readAndDropBrokenLines(file) };
  });
  const windows = pending.flatMap((file) => file.rows.map((row) => row.parsed));
  const { processRows, apiRowsOut, pageRowsOut } = rowsFromWindows(windows);
  try {
    const tx = opened.transaction(() => {
      insertRows(opened, PROCESS_SHEET.name, columnNames(PROCESS_SHEET), processRows);
      insertRows(opened, API_SHEET.name, columnNames(API_SHEET), apiRowsOut);
      insertRows(opened, PAGE_SHEET.name, columnNames(PAGE_SHEET), pageRowsOut);
    });
    tx();
  } catch (err) {
    log.warn({ err }, "process stats ingest failed; files kept");
    return;
  }
  for (const file of pending) {
    let fresh = "";
    try {
      fresh = fs.readFileSync(file.file, "utf8");
    } catch {
      continue;
    }
    const consumed = new Set(file.rows.map((row) => row.raw));
    const kept = fresh.split("\n").filter((l) => l.length > 0 && !consumed.has(l));
    if (kept.length > 0) {
      fs.writeFileSync(file.file, `${kept.join("\n")}\n`);
      continue;
    }
    if (emptyStatsFileCanBeRemoved(file.file)) {
      try {
        fs.unlinkSync(file.file);
      } catch {
        /* already gone */
      }
      continue;
    }
    fs.writeFileSync(file.file, "");
  }
}

// --- Staff read ---
// One windows list per process name. Route rows stay on the detail read.

const P50_MIN_COUNT = 5;
const P95_MIN_COUNT = 20;
const P99_MIN_COUNT = 100;

type DbProcess = ProcessSample;

type TrafficLatency = {
  count: number;
  avgMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number;
};

/** One chart point. api and pages are null when that bucket had no calls. */
export type StatsWindow = {
  timestamp: number;
  intervalMs: number;
  cpuProcessPercent: number | null;
  heapUsedMb: number | null;
  rssMb: number | null;
  garbageCollectionPauseMs: number | null;
  garbageCollectionMaxPauseMs: number | null;
  inFlightMaxRequests: number | null;
  openFds: number | null;
  openFdsLimit: number | null;
  eventLoop: { p50Ms: number; p99Ms: number; maxMs: number } | null;
  api: TrafficLatency | null;
  pages: TrafficLatency | null;
  /** Open calls of this point. On a 5 or 30 minute point, only the 30s slice with the worst event loop. */
  openCalls: OpenCallRow[] | null;
};

export type ChartStats = {
  startingAt: number;
  endingAt: number;
  stepMs: number;
  boundsMs: number[];
  restarts?: Array<{ timestamp: number }>;
  windows: StatsWindow[];
};

export type DetailRoute = {
  kind: "api" | "pages";
  method: string;
  route: string;
  count: number;
  avgMs: number;
  maxMs: number;
  statusCounts: Record<string, number>;
  durationCounts: number[];
  ssrCounts?: Record<string, number>;
  path?: string | null;
};

export type DetailStats = {
  startingAt: number;
  endingAt: number;
  boundsMs: number[];
  counts: number[];
  count: number;
  statusCounts: Record<string, number>;
  ssrCounts?: Record<string, number>;
  mixedBounds: boolean;
  peak: { method: string; route: string; maxMs: number; path?: string | null; kind: "api" | "pages" } | null;
  routes: DetailRoute[];
};

/** Chart step for a range. Up to 2 hours stays on the 30s tick. Up to 6 hours is 90 seconds. A day is 5 minutes. A week is 30 minutes. */
export function stepForRange(rangeMs: number): number {
  if (rangeMs <= TWO_HOUR_RANGE_MS) return TICK_MS;
  if (rangeMs <= SIX_HOUR_RANGE_MS) return STEP_90_SEC_MS;
  if (rangeMs <= DAY_RANGE_MS) return STEP_5_MIN_MS;
  return STEP_30_MIN_MS;
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/** Linear interpolation inside one histogram bucket. Rank is q * total count. */
export function histogramQuantile(q: number, counts: readonly number[], bounds: readonly number[]): number | null {
  const total = counts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  if (total <= 0 || !(q > 0) || q > 1 || bounds.length === 0) return null;
  const rank = q * total;
  let cum = 0;
  for (let i = 0; i < counts.length; i++) {
    const prev = cum;
    cum += counts[i] ?? 0;
    if (cum < rank && i < counts.length - 1) continue;
    const lower = i === 0 ? 0 : (bounds[i - 1] ?? bounds[bounds.length - 1] ?? 0);
    if (i >= bounds.length) return bounds[bounds.length - 1] ?? lower;
    const upper = bounds[i] ?? lower;
    const inBucket = counts[i] ?? 0;
    if (inBucket <= 0) return lower;
    const fraction = Math.min(1, Math.max(0, (rank - prev) / inBucket));
    return lower + (upper - lower) * fraction;
  }
  return bounds[bounds.length - 1] ?? null;
}

function percentileOrNull(count: number, min: number, q: number, counts: number[], bounds: number[]): number | null {
  if (count < min) return null;
  const histTotal = counts.reduce((sum, n) => sum + n, 0);
  if (histTotal <= 0) return null;
  const value = histogramQuantile(q, counts, bounds);
  return value == null ? null : Math.round(value);
}

function latencyFromHist(
  count: number,
  sumMs: number,
  maxMs: number,
  counts: number[],
  bounds: number[],
  mixed: boolean,
): TrafficLatency {
  return {
    count,
    avgMs: count > 0 ? Math.round(sumMs / count) : 0,
    p50Ms: mixed ? null : percentileOrNull(count, P50_MIN_COUNT, 0.5, counts, bounds),
    p95Ms: mixed ? null : percentileOrNull(count, P95_MIN_COUNT, 0.95, counts, bounds),
    p99Ms: mixed ? null : percentileOrNull(count, P99_MIN_COUNT, 0.99, counts, bounds),
    maxMs,
  };
}

type HistRow = {
  timestamp: number;
  count: number;
  sumMs: number;
  maxMs: number;
  durationBoundsId: string;
  durationCounts: number[];
  method?: string;
  route: string;
  statusCounts: Record<string, number>;
  ssrCounts?: Record<string, number>;
  slowestPath?: string | null;
  kind: "api" | "pages";
};

function parseOpenCalls(raw: unknown): OpenCallRow[] | null {
  let parsed = raw;
  if (typeof raw === "string") {
    if (!raw) return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const out: OpenCallRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const method = typeof row.method === "string" ? row.method : "";
    const route = typeof row.route === "string" ? row.route : "";
    const count = Number(row.count);
    const maxMs = Number(row.maxMs);
    if (!method || !route || !Number.isFinite(count) || count <= 0 || !Number.isFinite(maxMs)) continue;
    out.push({ method, route, count, maxMs });
  }
  return out.length > 0 ? out : null;
}

function parseCounts(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((n) => Number(n) || 0) : [];
  } catch {
    return [];
  }
}

function parseRecord(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function addRecord(into: Record<string, number>, extra: Record<string, number>): void {
  for (const [key, value] of Object.entries(extra)) into[key] = (into[key] ?? 0) + value;
}

function addCounts(into: number[], extra: number[]): void {
  for (let i = 0; i < extra.length; i++) into[i] = (into[i] ?? 0) + extra[i];
}

function clampRange(opts: { from?: number; to?: number; now?: number }): { from: number; to: number; stepMs: number } {
  const now = opts.now ?? Date.now();
  let to = opts.to ?? now;
  let from = opts.from ?? to - 24 * 60 * 60 * 1000;
  if (to < from) {
    return { from: to - 24 * 60 * 60 * 1000, to, stepMs: stepForRange(24 * 60 * 60 * 1000) };
  }
  if (to - from > RETENTION_MS) from = to - RETENTION_MS;
  return { from, to, stepMs: stepForRange(to - from) };
}

function queryInt(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

function loadBounds(opened: Sqlite, ids: string[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  if (ids.length === 0) return out;
  const rows = opened.prepare(
    `SELECT id, boundsMs FROM duration_bounds WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).all(...ids) as Array<{ id: string; boundsMs: string }>;
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.boundsMs);
      if (Array.isArray(parsed)) out.set(row.id, parsed.map((n) => Number(n)));
    } catch {
      /* skip */
    }
  }
  return out;
}

function pidFilter(pids: number[]): { sql: string; params: number[] } {
  if (pids.length === 0) return { sql: " AND 1 = 0", params: [] };
  return { sql: ` AND pid IN (${pids.map(() => "?").join(",")})`, params: pids };
}

/** One legend when every window in the range used it. A mix falls back to the current cuts. */
function sharedBounds(groups: Array<Map<number, { bounds: number[] | null; mixed: boolean }>>): number[] {
  const keys = new Set<string>();
  let found: number[] | null = null;
  for (const group of groups) {
    for (const acc of group.values()) {
      if (!acc.bounds || acc.mixed) continue;
      keys.add(acc.bounds.join(","));
      found = acc.bounds;
    }
  }
  if (keys.size === 1 && found) return [...found];
  return [...DURATION_BUCKETS_MS];
}

/**
 * Chart read. One window per bucket, pids of the same name already merged.
 * Gauges are the worst 30s value in the bucket. API and page percentiles come
 * from the summed histogram. Does not backfill empty timestamps.
 */
export function readProcessStats(opts: { from?: number; to?: number; now?: number; processName?: ProcessName } = {}): ChartStats {
  const { from, to, stepMs } = clampRange(opts);
  const opened = openDatabase();
  const nameFilter = opts.processName;
  const processes = (nameFilter
    ? opened.prepare(
      `SELECT * FROM process_samples WHERE timestamp >= ? AND timestamp <= ? AND processName = ? ORDER BY timestamp ASC`,
    ).all(from, to, nameFilter)
    : opened.prepare(
      `SELECT * FROM process_samples WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`,
    ).all(from, to)) as Array<Record<string, unknown>>;
  const samples = processes.map((row) => ({
    ...(row as unknown as ProcessSample),
    openCalls: parseOpenCalls(row.openCalls),
  }));

  const includeTraffic = nameFilter == null || nameFilter === "web";
  const pids = [...new Set(samples.map((row) => row.processId))];
  const filter = includeTraffic ? pidFilter(pids) : { sql: " AND 1 = 0", params: [] };
  const routeParams = [from, to, ...filter.params];
  const apiRows = includeTraffic && pids.length > 0
    ? opened.prepare(
      `SELECT timestamp, count, sumMs, maxMs, durationBoundsId, durationCounts FROM api_samples WHERE timestamp >= ? AND timestamp <= ?${filter.sql}`,
    ).all(...routeParams) as Array<Record<string, unknown>>
    : [];
  const pageRows = includeTraffic && pids.length > 0
    ? opened.prepare(
      `SELECT timestamp, count, sumMs, maxMs, durationBoundsId, durationCounts FROM document_samples WHERE timestamp >= ? AND timestamp <= ?${filter.sql}`,
    ).all(...routeParams) as Array<Record<string, unknown>>
    : [];

  const boundsById = loadBounds(opened, [...new Set(
    [...apiRows, ...pageRows].map((row) => String(row.durationBoundsId ?? "")).filter(Boolean),
  )]);

  const seenStarts = new Set<string>();
  const restarts: Array<{ timestamp: number }> = [];
  for (const row of samples) {
    if (seenStarts.has(row.processStartId)) continue;
    if (seenStarts.size > 0) restarts.push({ timestamp: row.timestamp });
    seenStarts.add(row.processStartId);
  }

  type Gauge = ProcessSample;
  const gauges = new Map<number, Gauge>();
  for (const sample of samples) {
    const start = stepMs === TICK_MS ? sample.timestamp : Math.floor(sample.timestamp / stepMs) * stepMs;
    const prev = gauges.get(start);
    if (!prev) {
      gauges.set(start, { ...sample, timestamp: start });
      continue;
    }
    const incomingIsWorse = sample.eventLoopMaxMs > prev.eventLoopMaxMs;
    gauges.set(start, {
      ...prev,
      intervalMs: Math.max(prev.intervalMs, sample.intervalMs),
      eventLoopP50Ms: Math.max(prev.eventLoopP50Ms, sample.eventLoopP50Ms),
      eventLoopP99Ms: Math.max(prev.eventLoopP99Ms, sample.eventLoopP99Ms),
      eventLoopMaxMs: Math.max(prev.eventLoopMaxMs, sample.eventLoopMaxMs),
      heapUsedMb: Math.max(prev.heapUsedMb, sample.heapUsedMb),
      rssMb: Math.max(prev.rssMb, sample.rssMb),
      cpuProcessPercent: Math.max(prev.cpuProcessPercent, sample.cpuProcessPercent),
      garbageCollectionPauseMs: Math.max(prev.garbageCollectionPauseMs, sample.garbageCollectionPauseMs),
      garbageCollectionMaxPauseMs: Math.max(prev.garbageCollectionMaxPauseMs, sample.garbageCollectionMaxPauseMs),
      inFlightMaxRequests: Math.max(prev.inFlightMaxRequests, sample.inFlightMaxRequests),
      openFds: maxOrNull(prev.openFds, sample.openFds),
      openFdsLimit: prev.openFdsLimit ?? sample.openFdsLimit,
      openCalls: incomingIsWorse ? sample.openCalls : prev.openCalls,
    });
  }

  type Acc = { count: number; sumMs: number; maxMs: number; counts: number[]; bounds: number[] | null; mixed: boolean };
  const fold = (rows: Array<Record<string, unknown>>) => {
    const byBucket = new Map<number, Acc>();
    for (const row of rows) {
      const timestamp = Number(row.timestamp);
      const start = stepMs === TICK_MS ? timestamp : Math.floor(timestamp / stepMs) * stepMs;
      const bounds = boundsById.get(String(row.durationBoundsId ?? "")) ?? DURATION_BUCKETS_MS;
      const counts = parseCounts(String(row.durationCounts ?? "[]"));
      let acc = byBucket.get(start);
      if (!acc) {
        acc = { count: 0, sumMs: 0, maxMs: 0, counts: [], bounds, mixed: false };
        byBucket.set(start, acc);
      }
      if (acc.bounds && bounds.join(",") !== acc.bounds.join(",")) acc.mixed = true;
      acc.count += Number(row.count) || 0;
      acc.sumMs += Number(row.sumMs) || 0;
      acc.maxMs = Math.max(acc.maxMs, Number(row.maxMs) || 0);
      if (!acc.mixed) addCounts(acc.counts, counts);
    }
    return byBucket;
  };
  const apiByBucket = fold(apiRows);
  const pageByBucket = fold(pageRows);

  const stamps = new Set<number>([...gauges.keys(), ...apiByBucket.keys(), ...pageByBucket.keys()]);
  const windows: StatsWindow[] = [...stamps].sort((a, b) => a - b).map((timestamp) => {
    const gauge = gauges.get(timestamp);
    const apiAcc = apiByBucket.get(timestamp);
    const pageAcc = pageByBucket.get(timestamp);
    const toLatency = (acc: Acc | undefined): TrafficLatency | null => {
      if (!acc || acc.count <= 0) return null;
      return latencyFromHist(acc.count, acc.sumMs, acc.maxMs, acc.counts, acc.bounds ?? DURATION_BUCKETS_MS, acc.mixed);
    };
    return {
      timestamp,
      intervalMs: gauge?.intervalMs ?? stepMs,
      cpuProcessPercent: gauge?.cpuProcessPercent ?? null,
      heapUsedMb: gauge?.heapUsedMb ?? null,
      rssMb: gauge?.rssMb ?? null,
      garbageCollectionPauseMs: gauge?.garbageCollectionPauseMs ?? null,
      garbageCollectionMaxPauseMs: gauge?.garbageCollectionMaxPauseMs ?? null,
      inFlightMaxRequests: gauge?.inFlightMaxRequests ?? null,
      openFds: gauge?.openFds ?? null,
      openFdsLimit: gauge?.openFdsLimit ?? null,
      eventLoop: gauge
        ? { p50Ms: gauge.eventLoopP50Ms, p99Ms: gauge.eventLoopP99Ms, maxMs: gauge.eventLoopMaxMs }
        : null,
      api: includeTraffic ? toLatency(apiAcc) : null,
      pages: includeTraffic ? toLatency(pageAcc) : null,
      openCalls: gauge?.openCalls ?? null,
    };
  });

  const stats: ChartStats = {
    startingAt: from,
    endingAt: to,
    stepMs,
    boundsMs: sharedBounds([apiByBucket, pageByBucket]),
    windows,
  };
  if (nameFilter !== "diagnostics-worker") stats.restarts = restarts;
  return stats;
}

/**
 * Routes, duration bars, and the peak for one process and one slice.
 * Both kinds come back. The page filters API vs pages.
 */
export function readProcessStatsDetail(opts: { from?: number; to?: number; now?: number; processName: ProcessName }): DetailStats {
  const { from, to } = clampRange(opts);
  const opened = openDatabase();
  const processes = opened.prepare(
    `SELECT processId FROM process_samples WHERE timestamp >= ? AND timestamp <= ? AND processName = ?`,
  ).all(from, to, opts.processName) as Array<{ processId: number }>;
  const pids = [...new Set(processes.map((row) => row.processId))];
  const filter = pidFilter(pids);
  const empty: DetailStats = {
    startingAt: from,
    endingAt: to,
    boundsMs: [...DURATION_BUCKETS_MS],
    counts: [],
    count: 0,
    statusCounts: {},
    mixedBounds: false,
    peak: null,
    routes: [],
  };
  if (opts.processName !== "web" || pids.length === 0) return empty;

  const params = [from, to, ...filter.params];
  const apiRows = opened.prepare(
    `SELECT method, route, count, sumMs, maxMs, durationBoundsId, durationCounts, statusCounts FROM api_samples WHERE timestamp >= ? AND timestamp <= ?${filter.sql}`,
  ).all(...params) as Array<Record<string, unknown>>;
  const pageRows = opened.prepare(
    `SELECT route, count, sumMs, maxMs, durationBoundsId, durationCounts, statusCounts, ssrCounts, slowestPath FROM document_samples WHERE timestamp >= ? AND timestamp <= ?${filter.sql}`,
  ).all(...params) as Array<Record<string, unknown>>;

  const boundsIds = [...new Set([...apiRows, ...pageRows].map((row) => String(row.durationBoundsId ?? "")).filter(Boolean))];
  const boundsById = loadBounds(opened, boundsIds);
  const boundSets = new Set([...boundsById.values()].map((bounds) => bounds.join(",")));
  const mixedBounds = boundSets.size > 1;

  type RouteAcc = DetailRoute & { sumMs: number };
  const byKey = new Map<string, RouteAcc>();
  const absorb = (kind: "api" | "pages", row: Record<string, unknown>) => {
    const method = kind === "api" ? String(row.method ?? "GET") : "GET";
    const route = String(row.route ?? "");
    const key = `${kind}:${method}:${route}`;
    const count = Number(row.count) || 0;
    const sumMs = Number(row.sumMs) || 0;
    const maxMs = Number(row.maxMs) || 0;
    const statusCounts = parseRecord(String(row.statusCounts ?? "{}"));
    const durationCounts = parseCounts(String(row.durationCounts ?? "[]"));
    const ssrCounts = kind === "pages" ? parseRecord(String(row.ssrCounts ?? "{}")) : undefined;
    const slowestPath = kind === "pages" ? (row.slowestPath == null ? null : String(row.slowestPath)) : undefined;
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        kind,
        method,
        route,
        count: 0,
        sumMs: 0,
        avgMs: 0,
        maxMs: 0,
        statusCounts: {},
        durationCounts: [],
        ssrCounts: kind === "pages" ? {} : undefined,
        path: null,
      };
      byKey.set(key, acc);
    }
    acc.count += count;
    acc.sumMs += sumMs;
    if (maxMs >= acc.maxMs) {
      acc.maxMs = maxMs;
      if (kind === "pages") acc.path = slowestPath ?? acc.path;
    }
    addRecord(acc.statusCounts, statusCounts);
    if (!mixedBounds) addCounts(acc.durationCounts, durationCounts);
    if (acc.ssrCounts && ssrCounts) addRecord(acc.ssrCounts, ssrCounts);
  };
  for (const row of apiRows) absorb("api", row);
  for (const row of pageRows) absorb("pages", row);

  const routes: DetailRoute[] = [...byKey.values()].map((acc) => {
    const route: DetailRoute = {
      kind: acc.kind,
      method: acc.method,
      route: acc.route,
      count: acc.count,
      avgMs: acc.count > 0 ? Math.round(acc.sumMs / acc.count) : 0,
      maxMs: acc.maxMs,
      statusCounts: acc.statusCounts,
      durationCounts: acc.durationCounts,
    };
    if (acc.kind === "pages") {
      route.ssrCounts = acc.ssrCounts ?? {};
      route.path = acc.path ?? null;
    }
    return route;
  }).sort((a, b) => b.maxMs - a.maxMs || b.count - a.count);

  const counts: number[] = [];
  const statusCounts: Record<string, number> = {};
  const ssrCounts: Record<string, number> = {};
  let count = 0;
  let peak: DetailStats["peak"] = null;
  for (const route of routes) {
    count += route.count;
    addRecord(statusCounts, route.statusCounts);
    if (route.ssrCounts) addRecord(ssrCounts, route.ssrCounts);
    if (!mixedBounds) addCounts(counts, route.durationCounts);
    if (!peak || route.maxMs > peak.maxMs) {
      peak = { method: route.method, route: route.route, maxMs: route.maxMs, kind: route.kind };
      if (route.kind === "pages") peak.path = route.path ?? null;
    }
  }

  const detail: DetailStats = {
    startingAt: from,
    endingAt: to,
    boundsMs: boundSets.size === 1 ? [...boundsById.values()][0] : [...DURATION_BUCKETS_MS],
    counts,
    count,
    statusCounts,
    mixedBounds,
    peak,
    routes,
  };
  if (pageRows.length > 0) detail.ssrCounts = ssrCounts;
  return detail;
}

/**
 * Staff GET. Requires one process name. starting_at and ending_at are an
 * inclusive pair of integer epoch milliseconds. A partial or inverted pair
 * is ignored and the read falls back to the last 24 hours.
 */
export function resolveProcessStatsRequest(
  query: { process?: unknown; starting_at?: unknown; ending_at?: unknown },
  now?: number,
): { ok: false; error: string } | { ok: true; stats: ChartStats } {
  const rawName = query.process;
  const processName = typeof rawName === "string" && (PROCESS_NAMES as readonly string[]).includes(rawName)
    ? (rawName as ProcessName)
    : null;
  if (!processName) {
    return { ok: false, error: `process is required: ${PROCESS_NAMES.join(" | ")}` };
  }
  const startingAt = queryInt(query.starting_at);
  const endingAt = queryInt(query.ending_at);
  const pair = startingAt != null && endingAt != null && startingAt <= endingAt;
  return {
    ok: true,
    stats: readProcessStats({
      from: pair ? startingAt : undefined,
      to: pair ? endingAt : undefined,
      now,
      processName,
    }),
  };
}

export function resolveProcessStatsDetailRequest(
  query: { process?: unknown; starting_at?: unknown; ending_at?: unknown },
  now?: number,
): { ok: false; error: string } | { ok: true; stats: DetailStats } {
  const rawName = query.process;
  const processName = typeof rawName === "string" && (PROCESS_NAMES as readonly string[]).includes(rawName)
    ? (rawName as ProcessName)
    : null;
  if (!processName) {
    return { ok: false, error: `process is required: ${PROCESS_NAMES.join(" | ")}` };
  }
  const startingAt = queryInt(query.starting_at);
  const endingAt = queryInt(query.ending_at);
  const pair = startingAt != null && endingAt != null && startingAt <= endingAt;
  return {
    ok: true,
    stats: readProcessStatsDetail({
      from: pair ? startingAt : undefined,
      to: pair ? endingAt : undefined,
      now,
      processName,
    }),
  };
}

// --- Test hooks ---

/** Test hook: table name once per INSERT statement in the last ingest. */
export function ingestStatementsForTests(): readonly string[] {
  return ingestStatements;
}

/** Test hook: how many times the event-loop histogram was reset. */
export function histogramResetsForTests(): number {
  return histogramResets;
}

/** Test hook: stop and start again with timer disabled, pointed at a temp dir and db. */
export function resetProcessStatsForTests(opts: Partial<StartOpts> & { processName?: ProcessName } = {}): void {
  stopTick();
  startTick({
    processName: opts.processName ?? "web",
    processStartId: opts.processStartId ?? "boot-test",
    ingest: opts.ingest ?? false,
    timer: false,
    dir: opts.dir,
    dbPath: opts.dbPath,
    boundsMs: opts.boundsMs,
  });
}
