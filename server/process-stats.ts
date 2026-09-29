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
 * deletes what it consumed. Importing this module does not open the database.
 *
 * noteApi and notePage only update in-memory maps. API and page sheets are
 * filled by web traffic, because the other processes never call them. Those
 * processes still write a process row with empty lists.
 *
 * If the event loop is blocked, the tick does not run and windows do not pile
 * up in memory. When the thread unblocks there is one object, with intervalMs
 * and eventLoopMaxMs covering the whole stall. A call is counted in the window
 * where it finishes, not where it started.
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

/** Histogram bounds, in code (not settings.yml). The last durationCounts slot is "≥ 5000 ms". */
export const DURATION_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
/** Max JSON objects per jsonl file. 720 × 30s = 6 hours. */
export const MAX_FILE_OBJECTS = 720;
/** Tick interval. A row's intervalMs is the real time since the previous close, not always this value. */
export const TICK_MS = 30_000;
/** Ranges up to this long return every 30s window, including route rows. */
const RAW_RANGE_MS = 6 * 60 * 60 * 1000;
/** Ranges up to this long return one point per 5 minutes. Longer ranges use 30 minutes. */
const DAY_RANGE_MS = 24 * 60 * 60 * 1000;
const STEP_5_MIN_MS = 5 * 60 * 1000;
const STEP_30_MIN_MS = 30 * 60 * 1000;
/** How long rows stay in SQLite. Separate from the 6-hour file cap. */
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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
// durationBuckets reads the in-memory cutoffs (10, 25, 50, … ms). It opens
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
 * Millisecond cutoffs for the duration histogram (10, 25, 50, …). In production
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
  take(intervalMs: number): Omit<ProcessSample, "timestamp" | "processName" | "processId" | "processStartId" | "intervalMs" | "cpuMachinePercent"> {
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

/** The index.ts middleware calls this for every request, including HTML. */
export function beginRequest(): void {
  processLive.noteStart();
}

/** Lowers the current in-flight count. The peak stays until the next take(). */
export function endRequest(): void {
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
// Importing this file does not open SQLite.

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
function dbRow(table: SheetTable, source: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of table.columns) {
    const value = source[col.name];
    row[col.name] = col.json ? JSON.stringify(value ?? (col.json === "array" ? [] : {})) : value ?? null;
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

/**
 * Insert every pending jsonl. One transaction, one INSERT per table (split
 * only if a statement would exceed the variable cap). Broken lines are already
 * gone. On failure the good lines stay for the next tick. After commit,
 * re-read each file and drop only the consumed lines, so an append that
 * landed during the insert is kept. No-op unless this process started with ingest.
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
    fs.writeFileSync(file.file, kept.length ? `${kept.join("\n")}\n` : "");
  }
}

// --- Staff read ---
// Joins the three tables by pid + timestamp. Does not write.

type DbProcess = ProcessSample;
type DbApi = {
  timestamp: number;
  pid: number;
  bootId: string;
  method: string;
  route: string;
  count: number;
  sumMs: number;
  maxMs: number;
  durationBoundsId: string;
  durationCounts: string;
  statusCounts: string;
};
type DbPage = DbApi & { ssrCounts: string; slowestPath: string | null; route: string };

/** One chart point: process row plus the API and page rows of the same pid and timestamp. Any sheet may be missing. */
export type StatsWindow = {
  timestamp: number;
  process: ProcessSample | null;
  api: Array<Omit<DbApi, "durationCounts" | "statusCounts"> & { durationCounts: number[]; statusCounts: Record<string, number> }>;
  pages: Array<Omit<DbPage, "durationCounts" | "statusCounts" | "ssrCounts"> & {
    durationCounts: number[];
    statusCounts: Record<string, number>;
    ssrCounts: Record<string, number>;
  }>;
};

/**
 * One process lifetime, grouped by pid. processName comes from a process row of
 * that pid. It stays null when every window in range has routes only.
 */
export type StatsSeries = {
  processName: string | null;
  processId: number;
  windows: StatsWindow[];
};

/** Turn JSON text columns back into arrays and objects, using the sheet's column list. */
function restoreJson<T extends Record<string, unknown>>(table: SheetTable, row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const col of table.columns) {
    if (!col.json) continue;
    const fallback = col.json === "array" ? [] : {};
    try {
      out[col.name] = JSON.parse(String(row[col.name] ?? ""));
    } catch {
      out[col.name] = fallback;
    }
  }
  return out as T;
}

/** Chart step for a range. Short ranges stay raw. A day is 5 minutes. A week is 30 minutes. */
export function stepForRange(rangeMs: number): number {
  if (rangeMs <= RAW_RANGE_MS) return TICK_MS;
  if (rangeMs <= DAY_RANGE_MS) return STEP_5_MIN_MS;
  return STEP_30_MIN_MS;
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/** One point per step. Gauges are the worst value in the bucket. Route rows are dropped. */
function summarizeWindows(windows: StatsWindow[], stepMs: number): StatsWindow[] {
  const buckets = new Map<number, ProcessSample>();
  for (const win of windows) {
    const sample = win.process;
    if (!sample) continue;
    const start = Math.floor(win.timestamp / stepMs) * stepMs;
    const prev = buckets.get(start);
    if (!prev) {
      buckets.set(start, { ...sample, timestamp: start, intervalMs: stepMs });
      continue;
    }
    buckets.set(start, {
      ...prev,
      eventLoopP50Ms: Math.max(prev.eventLoopP50Ms, sample.eventLoopP50Ms),
      eventLoopP99Ms: Math.max(prev.eventLoopP99Ms, sample.eventLoopP99Ms),
      eventLoopMaxMs: Math.max(prev.eventLoopMaxMs, sample.eventLoopMaxMs),
      heapUsedMb: Math.max(prev.heapUsedMb, sample.heapUsedMb),
      rssMb: Math.max(prev.rssMb, sample.rssMb),
      cpuProcessPercent: Math.max(prev.cpuProcessPercent, sample.cpuProcessPercent),
      cpuMachinePercent: maxOrNull(prev.cpuMachinePercent, sample.cpuMachinePercent),
      garbageCollectionPauseMs: Math.max(prev.garbageCollectionPauseMs, sample.garbageCollectionPauseMs),
      garbageCollectionMaxPauseMs: Math.max(prev.garbageCollectionMaxPauseMs, sample.garbageCollectionMaxPauseMs),
      inFlightMaxRequests: Math.max(prev.inFlightMaxRequests, sample.inFlightMaxRequests),
      openFds: maxOrNull(prev.openFds, sample.openFds),
      openFdsLimit: prev.openFdsLimit ?? sample.openFdsLimit,
    });
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, process]) => ({ timestamp, process, api: [], pages: [] }));
}

/**
 * Staff read. Default last 24 hours, clamped to 7 days. Joins sheets by
 * pid + timestamp. One process per pid: route rows of that pid join it, and
 * the name comes from whichever window has a process row. Up to 6 hours returns
 * every window and its routes. Longer ranges return one point per 5 or 30
 * minutes, gauges only, each value the worst in that bucket. durationBounds
 * lists each bounds array used by route rows in range. Does not backfill gaps.
 */
export function readProcessStats(opts: { from?: number; to?: number; now?: number } = {}): {
  from: number;
  to: number;
  stepMs: number;
  durationBounds: Array<{ id: string; boundsMs: number[] }>;
  processes: StatsSeries[];
} {
  const now = opts.now ?? Date.now();
  let to = opts.to ?? now;
  let from = opts.from ?? to - 24 * 60 * 60 * 1000;
  if (to < from) [from, to] = [to, from];
  if (to - from > RETENTION_MS) from = to - RETENTION_MS;
  const stepMs = stepForRange(to - from);
  const raw = stepMs === TICK_MS;

  const opened = openDatabase();
  const processes = opened.prepare(
    `SELECT * FROM process_samples WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`,
  ).all(from, to) as DbProcess[];
  const apis = raw
    ? opened.prepare(
      `SELECT * FROM api_samples WHERE timestamp >= ? AND timestamp <= ?`,
    ).all(from, to) as DbApi[]
    : [];
  const pages = raw
    ? opened.prepare(
      `SELECT * FROM document_samples WHERE timestamp >= ? AND timestamp <= ?`,
    ).all(from, to) as DbPage[]
    : [];

  const legendIds = new Set<string>();
  const byKey = new Map<string, StatsWindow>();
  const keyOf = (pid: number, timestamp: number) => `${pid}:${timestamp}`;

  for (const proc of processes) {
    const key = keyOf(proc.processId, proc.timestamp);
    byKey.set(key, { timestamp: proc.timestamp, process: proc, api: [], pages: [] });
  }
  for (const api of apis) {
    legendIds.add(api.durationBoundsId);
    const key = keyOf(api.pid, api.timestamp);
    const win = byKey.get(key) ?? { timestamp: api.timestamp, process: null, api: [], pages: [] };
    win.api.push(restoreJson(API_SHEET, api));
    byKey.set(key, win);
  }
  for (const page of pages) {
    legendIds.add(page.durationBoundsId);
    const key = keyOf(page.pid, page.timestamp);
    const win = byKey.get(key) ?? { timestamp: page.timestamp, process: null, api: [], pages: [] };
    win.pages.push(restoreJson(PAGE_SHEET, page));
    byKey.set(key, win);
  }

  const byPid = new Map<number, StatsSeries>();
  for (const win of byKey.values()) {
    const processId = win.process?.processId ?? win.api[0]?.pid ?? win.pages[0]?.pid ?? 0;
    let group = byPid.get(processId);
    if (!group) {
      group = { processName: win.process?.processName ?? null, processId, windows: [] };
      byPid.set(processId, group);
    } else if (group.processName == null && win.process?.processName) {
      group.processName = win.process.processName;
    }
    group.windows.push(win);
  }
  for (const group of byPid.values()) {
    group.windows.sort((a, b) => a.timestamp - b.timestamp);
    if (!raw) group.windows = summarizeWindows(group.windows, stepMs);
  }

  const durationBounds: Array<{ id: string; boundsMs: number[] }> = [];
  if (legendIds.size > 0) {
    const ids = [...legendIds];
    const rows = opened.prepare(
      `SELECT id, boundsMs FROM duration_bounds WHERE id IN (${ids.map(() => "?").join(",")})`,
    ).all(...ids) as Array<{ id: string; boundsMs: string }>;
    for (const row of rows) {
      let boundsMs: number[] = [];
      try {
        boundsMs = JSON.parse(row.boundsMs);
      } catch {
        boundsMs = [];
      }
      durationBounds.push({ id: row.id, boundsMs });
    }
  }

  return {
    from,
    to,
    stepMs,
    durationBounds,
    processes: [...byPid.values()].sort((a, b) => {
      const an = a.processName ?? "";
      const bn = b.processName ?? "";
      if (an !== bn) return an < bn ? -1 : 1;
      return a.processId - b.processId;
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
