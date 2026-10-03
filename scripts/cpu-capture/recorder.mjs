/**
 * Production CPU recorder. systemd runs this as perf-capture, from a root-owned
 * copy at /opt/cpu-capture/recorder.mjs. Deploy does not start it, and PM2 must
 * not start it: every PM2 app runs as website-runtime.
 *
 * It decides for itself. The web app does not pass a pid or a command.
 * It writes a recording under /var/lib/cpu-capture/raw and leaves it. The web
 * app reads that directory and summarizes. This process does not parse symbols.
 *
 * kernel.perf_event_paranoid stays at 4. The unit grants CAP_PERFMON and
 * CAP_SYS_PTRACE to this process only. Do not setcap the perf binary.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RAW_DIR = "/var/lib/cpu-capture/raw";
const HEARTBEAT = "/run/cpu-capture/heartbeat";
const STATUS = "/run/cpu-capture/status.json";
const THRESHOLD = 120;
const POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const RECORD_SECONDS = 20;
const RECORD_TIMEOUT_MS = 45_000;
const RAW_KEEP_MS = 15 * 60 * 1000;
const MAX_RAW = 30;
const MAX_PER_DAY = 48;
const CLK_TCK = 100;

let armed = true;
let lastSample = null;
let status = { at: null, ok: null, error: null, notice: null };

function log(message) {
  console.error(`[cpu-capture] ${message}`);
}

function websiteRuntimeUid() {
  const text = fs.readFileSync("/etc/passwd", "utf8");
  for (const line of text.split("\n")) {
    const [name, , uid] = line.split(":");
    if (name === "website-runtime") return Number(uid);
  }
  return null;
}

function webPids(uid) {
  const found = [];
  let names = [];
  try {
    names = fs.readdirSync("/proc");
  } catch {
    return found;
  }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    let procStatus = "";
    try {
      procStatus = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    } catch {
      continue;
    }
    const uidLine = procStatus.match(/^Uid:\s+(\d+)/m);
    if (!uidLine || Number(uidLine[1]) !== uid) continue;
    let cmdline = "";
    try {
      cmdline = fs.readFileSync(`/proc/${pid}/cmdline`).toString("utf8").replaceAll("\0", " ");
    } catch {
      continue;
    }
    if (cmdline.includes("dist/index.js")) found.push(pid);
  }
  return found;
}

function cpuTicks(pid) {
  let stat = "";
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch {
    return null;
  }
  const end = stat.lastIndexOf(")");
  if (end < 0) return null;
  const rest = stat.slice(end + 2).trim().split(/\s+/);
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
  return utime + stime;
}

/** Percent of one core since the previous sample. Null until a second sample exists. */
function cpuPercent(pid) {
  const ticks = cpuTicks(pid);
  const now = Date.now();
  if (ticks == null) {
    lastSample = null;
    return null;
  }
  if (!lastSample || lastSample.pid !== pid) {
    lastSample = { pid, ticks, at: now };
    return null;
  }
  const elapsed = now - lastSample.at;
  const delta = ticks - lastSample.ticks;
  lastSample = { pid, ticks, at: now };
  if (elapsed <= 0 || delta <= 0) return 0;
  return Math.round(((delta / CLK_TCK) / (elapsed / 1000)) * 1000) / 10;
}

function writeWorldReadable(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.chmodSync(tmp, 0o644);
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o644);
}

function writeHeartbeat() {
  try {
    writeWorldReadable(HEARTBEAT, `${Date.now()}\n`);
  } catch (err) {
    log(`heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function publishStatus() {
  try {
    writeWorldReadable(STATUS, `${JSON.stringify(status)}\n`);
  } catch (err) {
    log(`status failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function startOfUtcDay(now) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function recordings() {
  let names = [];
  try {
    names = fs.readdirSync(RAW_DIR);
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const folder = path.join(RAW_DIR, name);
    let info;
    try {
      info = fs.lstatSync(folder);
    } catch {
      continue;
    }
    if (!info.isDirectory()) continue;
    rows.push({ name, folder, mtimeMs: info.mtimeMs });
  }
  return rows.sort((a, b) => Number(a.name) - Number(b.name));
}

function pruneRaw(now = Date.now()) {
  const rows = recordings();
  for (const row of rows) {
    if (now - row.mtimeMs > RAW_KEEP_MS) fs.rmSync(row.folder, { recursive: true, force: true });
  }
  let names = [];
  try {
    names = fs.readdirSync(RAW_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".part")) continue;
    const folder = path.join(RAW_DIR, name);
    let info;
    try {
      info = fs.lstatSync(folder);
    } catch {
      continue;
    }
    if (info.isDirectory() && now - info.mtimeMs > 2 * 60 * 1000) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
  const left = recordings();
  const extra = left.length - MAX_RAW;
  for (let i = 0; i < extra; i++) fs.rmSync(left[i].folder, { recursive: true, force: true });
}

function countToday(now = Date.now()) {
  const start = startOfUtcDay(now);
  let count = 0;
  for (const row of recordings()) {
    if (Number(row.name) >= start) count += 1;
  }
  return count;
}

function runPerf(pid, dataFile) {
  return new Promise((resolve) => {
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn("/usr/bin/perf", [
      "record", "-q", "-B", "-N",
      "-e", "cpu-clock:u",
      "-p", String(pid),
      "-F", "99",
      "-g",
      "--max-size=32M",
      "-o", dataFile,
      "--", "sleep", String(RECORD_SECONDS),
    ], { stdio: ["ignore", "ignore", "pipe"], detached: true });
    const killTree = () => {
      if (child.pid == null) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      killTree();
      finish({ ok: false, error: "perf record timed out" });
    }, RECORD_TIMEOUT_MS);
    child.on("error", (err) => finish({ ok: false, error: `perf record failed to start: ${err.message}`.slice(0, 400) }));
    child.stderr.on("data", (buf) => {
      if (stderr.length < 8_000) stderr += buf.toString("utf8");
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true, error: null });
        return;
      }
      const detail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 300);
      finish({ ok: false, error: detail ? `perf record exited ${code}: ${detail}` : `perf record exited ${code}` });
    });
  });
}

async function record(pid) {
  const id = String(Date.now());
  const part = path.join(RAW_DIR, `${id}.part`);
  fs.mkdirSync(part, { recursive: true });
  const dataFile = path.join(part, "perf.data");
  const result = await runPerf(pid, dataFile);
  const meta = {
    timestamp: Number(id),
    processName: "web",
    pid,
    ok: result.ok,
    error: result.error,
  };
  fs.writeFileSync(path.join(part, "meta.json"), `${JSON.stringify(meta)}\n`);
  if (!result.ok) fs.rmSync(dataFile, { force: true });
  fs.renameSync(part, path.join(RAW_DIR, id));
  status = { at: Date.now(), ok: result.ok, error: result.error, notice: null };
  publishStatus();
  log(result.ok ? `recorded ${id}` : `record failed ${id}: ${result.error}`);
}

async function tick(uid) {
  pruneRaw();
  const pids = webPids(uid);
  if (pids.length > 1) {
    status.notice = "More than one web process is running, so nothing was recorded.";
    publishStatus();
    return;
  }
  if (pids.length === 0) {
    if (status.notice) {
      status.notice = null;
      publishStatus();
    }
    return;
  }
  const percent = cpuPercent(pids[0]);
  if (percent == null) return;
  if (percent <= THRESHOLD) {
    armed = true;
    if (status.notice) {
      status.notice = null;
      publishStatus();
    }
    return;
  }
  if (!armed) return;
  if (countToday() >= MAX_PER_DAY) {
    status.notice = "The daily recording limit was reached, so this spike was not recorded.";
    publishStatus();
    return;
  }
  armed = false;
  status.notice = null;
  await record(pids[0]);
  lastSample = null;
}

const uid = websiteRuntimeUid();
if (uid == null) {
  log("website-runtime is not in /etc/passwd");
  process.exit(1);
}

writeHeartbeat();
setInterval(writeHeartbeat, HEARTBEAT_MS).unref();

while (true) {
  try {
    await tick(uid);
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
