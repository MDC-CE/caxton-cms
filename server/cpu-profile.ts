/**
 * CPU stack samples.
 *
 * This process never records. A systemd service on the server writes the
 * binary under /var/lib/cpu-capture/raw. Web summarizes that file and inserts
 * the list into cpu_stacks. The service deletes the binary. Web deletes only
 * its own JSON. The web event loop never reads the binary.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPackageRoot, getProjectRoot } from "@shared/paths";
import { child } from "./logger";

const log = child({ component: "cpu-profile" });

export const CPU_PROFILE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** The performance page treats a heartbeat older than this as a stopped recorder. */
export const CPU_CAPTURE_STALE_MS = 2 * 60 * 1000;
/** Thirty functions on eight threads, with long native names, still fit under this. */
export const CPU_CAPTURE_JSON_MAX_BYTES = 1024 * 1024;
const SERVICE_DATA_MAX_BYTES = 40 * 1024 * 1024;
const META_MAX_BYTES = 8 * 1024;
const NAME_MAX = 300;
const ERROR_MAX = 400;
const SCRIPT_TIMEOUT_MS = 60_000;
const MAX_SCRIPT_STDOUT = 20 * 1024 * 1024;
const MAX_THREADS = 8;
const MAX_FRAMES = 30;
const MAX_CALLERS = 3;

export type CpuFrameKind = "js" | "native" | "kernel";

export type CpuProfileFrame = {
  percent: number;
  function: string;
  file: string;
  kind: CpuFrameKind;
  /** Up to three calls above this function, nearest first. The Node entry is kept once. */
  callers?: Array<{ function: string; file: string }>;
};

export type CpuProfileThread = {
  name: string;
  percent: number;
  frames: CpuProfileFrame[];
};

export type CpuProfileCapture = {
  timestamp: number;
  processName: string;
  ok: true;
  threads: CpuProfileThread[];
} | {
  timestamp: number;
  processName: string;
  ok: false;
  error: string;
};

/** Binaries the recorder left. Missing when the service is not installed, and that is a no-op. */
export function rawCaptureDir(): string {
  return process.env.CPU_CAPTURE_RAW_DIR || "/var/lib/cpu-capture/raw";
}

export function cpuCaptureHeartbeatPath(): string {
  return process.env.CPU_CAPTURE_HEARTBEAT || "/run/cpu-capture/heartbeat";
}

export function cpuCaptureStatusPath(): string {
  return process.env.CPU_CAPTURE_STATUS || "/run/cpu-capture/status.json";
}

export type CpuCaptureHealth = {
  /** Service: production, where the recorder runs. Local: no recorder on this machine. */
  mode: "service" | "local";
  /** Null outside production. False when the heartbeat is missing or older than 2 minutes. */
  active: boolean | null;
  lastError: string | null;
  notice: string | null;
};

/** Read when the performance page is opened. This does not start or block a recording. */
export function readCpuCaptureHealth(now = Date.now()): CpuCaptureHealth {
  if (process.env.NODE_ENV !== "production") {
    return { mode: "local", active: null, lastError: null, notice: null };
  }
  let active = false;
  try {
    const info = fs.statSync(cpuCaptureHeartbeatPath());
    active = now - info.mtimeMs <= CPU_CAPTURE_STALE_MS;
  } catch {
    active = false;
  }
  const status = readCaptureStatus();
  return { mode: "service", active, lastError: status.lastError, notice: status.notice };
}

export function cpuProfileDir(): string {
  return process.env.CPU_PROFILE_DIR || path.join(getProjectRoot(), "data", "cpu-profiles");
}

function captureError(
  result: { spawnError: string | null; timedOut: boolean; stderr: string; code: number | null },
  what: string,
): string {
  if (result.spawnError) return `${what} failed to start: ${result.spawnError}`;
  if (result.timedOut) return `${what} timed out`;
  const detail = result.stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
  return detail ? `${what} exited ${result.code}: ${detail}` : `${what} exited ${result.code}`;
}

function copyIfExists(from: string, to: string): void {
  try {
    if (!fs.existsSync(from)) return;
    fs.copyFileSync(from, to);
  } catch (err) {
    log.warn({ err, from }, "could not copy the perf name map");
  }
}

function writeCaptureFile(file: string, capture: CpuProfileCapture): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(capture)}\n`);
  fs.renameSync(tmp, file);
}

/** Runs in the low-priority child. Reads the perf binary and writes the list. */
export async function summarizeRecordedProfile(opts: {
  dataFile: string;
  mapCopy: string;
  liveMap: string;
  outFile: string;
  processName: string;
  timestamp: number;
}): Promise<void> {
  if (!fs.existsSync(opts.liveMap)) copyIfExists(opts.mapCopy, opts.liveMap);
  const scripted = await runCommand("perf", [
    "script", "--force", "-i", opts.dataFile, "-F", "comm,tid,sym,dso,ip",
  ], SCRIPT_TIMEOUT_MS - 5_000, MAX_SCRIPT_STDOUT);
  if (scripted.spawnError || scripted.timedOut || scripted.code !== 0) {
    writeCaptureFile(opts.outFile, {
      timestamp: opts.timestamp,
      processName: opts.processName,
      ok: false,
      error: captureError(scripted, "perf script"),
    });
    return;
  }
  const threads = parsePerfScript(scripted.stdout);
  if (threads.length === 0) {
    writeCaptureFile(opts.outFile, {
      timestamp: opts.timestamp,
      processName: opts.processName,
      ok: false,
      error: scripted.stdout.trim()
        ? "perf script did not list any functions"
        : "perf recorded no samples",
    });
    return;
  }
  writeCaptureFile(opts.outFile, {
    timestamp: opts.timestamp,
    processName: opts.processName,
    ok: true,
    threads,
  });
}

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
};

function runCommand(cmd: string, args: string[], timeoutMs: number, maxStdout: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let truncated = false;
    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const childProc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    const killTree = () => {
      if (childProc.pid == null) return;
      try {
        process.kill(-childProc.pid, "SIGKILL");
      } catch {
        childProc.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      killTree();
      finish({ code: null, stdout, stderr, timedOut: true, spawnError: null });
    }, timeoutMs);
    childProc.on("error", (err) => {
      finish({ code: null, stdout, stderr, timedOut: false, spawnError: err.message });
    });
    childProc.stdout.on("data", (buf: Buffer) => {
      if (maxStdout > 0 && stdout.length >= maxStdout) {
        truncated = true;
        killTree();
        return;
      }
      stdout += buf.toString("utf8");
      if (maxStdout > 0 && stdout.length > maxStdout) stdout = stdout.slice(0, maxStdout);
    });
    childProc.stderr.on("data", (buf: Buffer) => {
      if (stderr.length < 8_000) stderr += buf.toString("utf8");
    });
    childProc.on("close", (code) => {
      finish({ code: truncated ? 0 : code, stdout, stderr, timedOut: false, spawnError: null });
    });
  });
}

type RawFrame = { function: string; file: string; kind: CpuFrameKind };
type RawSample = { thread: string; frames: RawFrame[] };

/** perf script text. A line that does not start with a space opens a sample; the first word is the thread. */
export function parsePerfScript(text: string): CpuProfileThread[] {
  const samples: RawSample[] = [];
  let current: RawSample | null = null;
  const flush = () => {
    if (current && current.frames.length > 0) samples.push(current);
    current = null;
  };
  for (const raw of text.split("\n")) {
    if (raw.trim().length === 0) {
      flush();
      continue;
    }
    if (!/^\s/.test(raw)) {
      flush();
      current = { thread: threadName(raw.trim()), frames: [] };
      continue;
    }
    if (!current) continue;
    const frame = parseFrameLine(raw.trim());
    if (frame) current.frames.push(frame);
  }
  flush();
  return groupSamples(samples);
}

function threadName(header: string): string {
  const parts = header.split(/\s+/);
  const comm = parts[0] || "unknown";
  const tid = parts[1] && /^\d+$/.test(parts[1]) ? parts[1] : "";
  return tid ? `${comm} ${tid}` : comm;
}

function parseFrameLine(line: string): RawFrame | null {
  const paren = line.match(/^(.*)\s+\(([^)]*)\)\s*$/);
  let symbol = "";
  let file = "";
  if (paren) {
    symbol = paren[1].replace(/^[0-9a-f]{4,}\s+/i, "").trim();
    file = paren[2].trim();
  } else {
    const parts = line.split(/\s+/);
    if (parts.length === 0) return null;
    if (/^[0-9a-f]{4,}$/i.test(parts[0]) && parts.length >= 2) parts.shift();
    if (parts.length === 1) {
      symbol = parts[0];
    } else {
      file = parts[parts.length - 1];
      symbol = parts.slice(0, -1).join(" ");
    }
  }
  if (!symbol) symbol = file || "[unknown]";
  return {
    function: symbol.slice(0, NAME_MAX),
    file: file.slice(0, NAME_MAX),
    kind: frameKind(file, symbol),
  };
}

function frameKind(file: string, symbol: string): CpuFrameKind {
  const lower = file.toLowerCase();
  if (lower.includes("kernel") || lower.includes("[kernel")) return "kernel";
  if (/\.(?:tsx?|jsx?|mjs|cjs)(?:$|[:)])/.test(lower) || lower.endsWith(".map") || symbol.startsWith("JS:")) return "js";
  return "native";
}

function isNodeEntry(frame: RawFrame): boolean {
  return frame.function.startsWith("Builtins_");
}

/** Nearest calls above the running function. A Node entry is kept once so it does not crowd out project functions. */
function callChain(frames: RawFrame[]): Array<{ function: string; file: string }> {
  const chain: Array<{ function: string; file: string }> = [];
  let keptNodeEntry = false;
  for (const frame of frames.slice(1)) {
    if (isNodeEntry(frame)) {
      if (keptNodeEntry) continue;
      keptNodeEntry = true;
    }
    chain.push({ function: frame.function, file: frame.file });
    if (chain.length >= MAX_CALLERS) break;
  }
  return chain;
}

function groupSamples(samples: RawSample[]): CpuProfileThread[] {
  const total = samples.length;
  if (total === 0) return [];
  const threadCount = new Map<string, number>();
  const leafCount = new Map<string, { thread: string; frame: RawFrame; count: number; chains: Map<string, { callers: Array<{ function: string; file: string }>; count: number }> }>();
  for (const sample of samples) {
    threadCount.set(sample.thread, (threadCount.get(sample.thread) ?? 0) + 1);
    const leaf = sample.frames[0];
    if (!leaf) continue;
    const key = `${sample.thread}\0${leaf.function}\0${leaf.file}`;
    let row = leafCount.get(key);
    if (!row) {
      row = { thread: sample.thread, frame: leaf, count: 0, chains: new Map() };
      leafCount.set(key, row);
    }
    row.count += 1;
    const callers = callChain(sample.frames);
    if (callers.length === 0) continue;
    const chainKey = callers.map((step) => `${step.function}\0${step.file}`).join("\n");
    const prev = row.chains.get(chainKey);
    if (prev) prev.count += 1;
    else row.chains.set(chainKey, { callers, count: 1 });
  }
  const threads = [...threadCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_THREADS);
  return threads.map(([name, count]) => {
    const frames = [...leafCount.values()]
      .filter((row) => row.thread === name)
      .sort((a, b) => b.count - a.count || a.frame.function.localeCompare(b.frame.function))
      .slice(0, MAX_FRAMES)
      .map((row) => {
        const chain = [...row.chains.values()].sort((a, b) => b.count - a.count)[0];
        const frame: CpuProfileFrame = {
          percent: share(row.count, total),
          function: row.frame.function,
          file: row.frame.file,
          kind: row.frame.kind,
        };
        if (chain) frame.callers = chain.callers;
        return frame;
      });
    return { name, percent: share(count, total), frames };
  });
}

function share(count: number, total: number): number {
  return Math.round((count / total) * 1000) / 10;
}

const PROFILE_PROCESSES = new Set(["web", "sidequest", "mcp", "diagnostics-worker"]);

function isCapture(value: unknown, timestamp: number): value is CpuProfileCapture {
  if (value == null || typeof value !== "object") return false;
  const row = value as CpuProfileCapture;
  if (row.timestamp !== timestamp) return false;
  if (!PROFILE_PROCESSES.has(row.processName)) return false;
  if (row.ok === true) return Array.isArray(row.threads);
  if (row.ok === false) return typeof row.error === "string";
  return false;
}

/** Finished JSON files waiting for web to insert them. Broken files are named so the ingest can drop them. */
export function pendingCpuProfileFiles(dir = cpuProfileDir()): {
  ready: Array<{ file: string; capture: CpuProfileCapture }>;
  broken: string[];
} {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { ready: [], broken: [] };
  }
  const ready: Array<{ file: string; capture: CpuProfileCapture }> = [];
  const broken: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(dir, name);
    const timestamp = Number(name.split("-")[0]);
    if (!Number.isFinite(timestamp)) {
      broken.push(file);
      continue;
    }
    let info: fs.Stats;
    try {
      info = fs.lstatSync(file);
    } catch {
      broken.push(file);
      continue;
    }
    if (!info.isFile() || info.size > CPU_CAPTURE_JSON_MAX_BYTES) {
      broken.push(file);
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      if (!isCapture(parsed, timestamp)) {
        broken.push(file);
        continue;
      }
      ready.push({ file, capture: parsed });
    } catch {
      broken.push(file);
    }
  }
  return { ready, broken };
}

export function pruneCpuProfiles(now = Date.now(), dir = cpuProfileDir()): void {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = now - CPU_PROFILE_RETENTION_MS;
  for (const name of names) {
    const timestamp = Number(name.split("-")[0]);
    if (!Number.isFinite(timestamp) || timestamp >= cutoff) continue;
    fs.rmSync(path.join(dir, name), { force: true });
  }
  const seenDir = path.join(dir, "seen");
  let seen: string[] = [];
  try {
    seen = fs.readdirSync(seenDir);
  } catch {
    return;
  }
  for (const name of seen) {
    const timestamp = Number(name);
    if (!Number.isFinite(timestamp) || timestamp >= cutoff) continue;
    fs.rmSync(path.join(seenDir, name), { force: true });
  }
}

type ServiceMeta = {
  timestamp: number;
  pid: number;
  ok: boolean;
  error: string | null;
};

/**
 * Turn finished recorder directories into JSON files this process owns.
 * Does not delete the recorder's files. Returns the ids that now have a JSON
 * waiting to be inserted. Already-inserted ids are skipped.
 */
export async function importServiceCaptures(rawDir = rawCaptureDir()): Promise<string[]> {
  let names: string[] = [];
  try {
    names = fs.readdirSync(rawDir);
  } catch {
    return [];
  }
  const pending: string[] = [];
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    if (seenMarkerExists(name)) continue;
    const folder = path.join(rawDir, name);
    let info: fs.Stats;
    try {
      info = fs.lstatSync(folder);
    } catch {
      continue;
    }
    if (!info.isDirectory()) continue;
    const meta = readServiceMeta(folder, name);
    if (!meta) {
      writeSeenMarker(name);
      continue;
    }
    const outFile = path.join(cpuProfileDir(), `${name}-web.json`);
    if (!fs.existsSync(outFile)) await writeServiceCapture(folder, meta, outFile);
    if (fs.existsSync(outFile)) pending.push(name);
  }
  return pending;
}

/**
 * Mark ids whose JSON was inserted and removed. An id whose JSON is still
 * here failed to insert, so the next tick tries again.
 */
export function noteServiceCapturesImported(ids: string[], dir = cpuProfileDir()): void {
  for (const id of ids) {
    if (!/^\d+$/.test(id)) continue;
    if (fs.existsSync(path.join(dir, `${id}-web.json`))) continue;
    writeSeenMarker(id, dir);
  }
}

function seenMarkerExists(id: string, dir = cpuProfileDir()): boolean {
  try {
    return fs.lstatSync(path.join(dir, "seen", id)).isFile();
  } catch {
    return false;
  }
}

function writeSeenMarker(id: string, dir = cpuProfileDir()): void {
  const seenDir = path.join(dir, "seen");
  fs.mkdirSync(seenDir, { recursive: true });
  const file = path.join(seenDir, id);
  try {
    fs.writeFileSync(file, "");
  } catch (err) {
    log.warn({ err, id }, "could not remember an imported cpu capture");
  }
}

function readServiceMeta(folder: string, id: string): ServiceMeta | null {
  const file = path.join(folder, "meta.json");
  let info: fs.Stats;
  try {
    info = fs.lstatSync(file);
  } catch {
    return null;
  }
  if (!info.isFile() || info.size > META_MAX_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  const timestamp = Number(id);
  if (row.timestamp !== timestamp || row.processName !== "web") return null;
  if (typeof row.ok !== "boolean") return null;
  const pid = typeof row.pid === "number" && Number.isInteger(row.pid) && row.pid > 0 ? row.pid : 0;
  const error = typeof row.error === "string" ? row.error.slice(0, ERROR_MAX) : null;
  return { timestamp, pid, ok: row.ok, error };
}

async function writeServiceCapture(folder: string, meta: ServiceMeta, outFile: string): Promise<void> {
  if (!meta.ok) {
    writeCaptureFile(outFile, {
      timestamp: meta.timestamp,
      processName: "web",
      ok: false,
      error: meta.error || "recording failed",
    });
    return;
  }
  const dataFile = path.join(folder, "perf.data");
  let info: fs.Stats | null = null;
  try {
    info = fs.lstatSync(dataFile);
  } catch {
    info = null;
  }
  if (!info || !info.isFile() || info.size <= 0 || info.size > SERVICE_DATA_MAX_BYTES) {
    writeCaptureFile(outFile, {
      timestamp: meta.timestamp,
      processName: "web",
      ok: false,
      error: "recording left no usable data",
    });
    return;
  }
  const liveMap = meta.pid > 0
    ? path.join(os.tmpdir(), `perf-${meta.pid}.map`)
    : path.join(os.tmpdir(), "perf-missing.map");
  const summary = path.join(getPackageRoot(), "scripts/cpu-profile-summary.ts");
  const summarized = await runCommand("nice", [
    "-n", "19", process.execPath, "--import", "tsx", summary,
    dataFile, "", liveMap, outFile, "web", String(meta.timestamp),
  ], SCRIPT_TIMEOUT_MS, 64_000);
  if (!fs.existsSync(outFile)) {
    writeCaptureFile(outFile, {
      timestamp: meta.timestamp,
      processName: "web",
      ok: false,
      error: captureError(summarized, "cpu profile summary"),
    });
  }
}

function readCaptureStatus(): { lastError: string | null; notice: string | null } {
  const file = cpuCaptureStatusPath();
  let info: fs.Stats;
  try {
    info = fs.lstatSync(file);
  } catch {
    return { lastError: null, notice: null };
  }
  if (!info.isFile() || info.size > META_MAX_BYTES) return { lastError: null, notice: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (parsed == null || typeof parsed !== "object") return { lastError: null, notice: null };
    const row = parsed as Record<string, unknown>;
    const notice = typeof row.notice === "string" && row.notice.trim()
      ? row.notice.trim().slice(0, ERROR_MAX)
      : null;
    const lastError = row.ok === false && typeof row.error === "string" && row.error.trim()
      ? row.error.trim().slice(0, ERROR_MAX)
      : null;
    return { lastError, notice };
  } catch {
    return { lastError: null, notice: null };
  }
}

/** Drop /tmp/perf-<pid>.map files whose process is already gone. Leave this process's map. */
export function deleteOrphanPerfMaps(dir = os.tmpdir()): void {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const match = name.match(/^perf-(\d+)\.map$/);
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid === process.pid) continue;
    if (pidAlive(pid)) continue;
    try {
      fs.rmSync(path.join(dir, name), { force: true });
    } catch (err) {
      log.warn({ err, name }, "could not delete an old perf map");
    }
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code !== "ESRCH";
  }
}
