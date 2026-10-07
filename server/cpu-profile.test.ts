import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteOrphanPerfMaps,
  importServiceCaptures,
  noteServiceCapturesImported,
  parsePerfScript,
  pendingCpuProfileFiles,
  pruneCpuProfiles,
  readCpuCaptureHealth,
  CPU_CAPTURE_JSON_MAX_BYTES,
  CPU_CAPTURE_STALE_MS,
  CPU_PROFILE_RETENTION_MS,
} from "./cpu-profile";

const script = `
libuv-worker 200
	zlib.deflate (/usr/lib/libz.so.1)
	compress (server/http/compress.ts:40)

libuv-worker 200
	zlib.deflate (/usr/lib/libz.so.1)
	compress (server/http/compress.ts:40)

node 100
	rebuildIndex (server/relation-index.ts:120)
	tick (server/process-stats.ts:10)

node 100
	rebuildIndex (server/relation-index.ts:120)
	tick (server/process-stats.ts:10)
`;

describe("perf script list", () => {
  it("groups by thread and then by function, as a share of the sample", () => {
    const threads = parsePerfScript(script);
    expect(threads.map((row) => [row.name, row.percent])).toEqual([
      ["libuv-worker 200", 50],
      ["node 100", 50],
    ]);
    const worker = threads[0].frames[0];
    expect(worker).toMatchObject({
      percent: 50,
      function: "zlib.deflate",
      file: "/usr/lib/libz.so.1",
      kind: "native",
      callers: [{ function: "compress", file: "server/http/compress.ts:40" }],
    });
    const main = threads[1].frames[0];
    expect(main.function).toBe("rebuildIndex");
    expect(main.kind).toBe("js");
    expect(main.callers?.[0]?.function).toBe("tick");
  });

  it("marks kernel frames", () => {
    const threads = parsePerfScript("kthread 3\n\tnative_write_msr ([kernel.kallsyms])\n");
    expect(threads[0].frames[0].kind).toBe("kernel");
  });

  it("reads the address form perf script prints, and treats the name map as JavaScript", () => {
    const threads = parsePerfScript(`WorkerThread   93426
	    73c5dc00969b JS:* [worker eval]:1:1 (/tmp/perf-92133.map)
	    73c5fbdcb21c Builtins_JSEntryTrampoline (/usr/bin/node)

WorkerThread   93425
	    73c5dc00969b JS:* [worker eval]:1:1 (/tmp/perf-92133.map)
	    73c5fbdcb21c Builtins_JSEntryTrampoline (/usr/bin/node)
`);
    expect(threads.map((row) => row.name)).toEqual(["WorkerThread 93425", "WorkerThread 93426"]);
    expect(threads[0].frames[0]).toMatchObject({
      function: "JS:* [worker eval]:1:1",
      file: "/tmp/perf-92133.map",
      kind: "js",
      callers: [{ function: "Builtins_JSEntryTrampoline", file: "/usr/bin/node" }],
    });
  });

  it("keeps the Node entry once and the next project functions, up to three", () => {
    const threads = parsePerfScript(`WorkerThread 1
	stallInOurFunction (server/dev-cpu-burn-worker.ts:8)
	Builtins_InterpreterEntryTrampoline (/usr/bin/node)
	burnFromRoute (server/dev-cpu-burn.ts:14)
	Builtins_InterpreterEntryTrampoline (/usr/bin/node)
	handleRequest (server/routes/index.ts:3)
	startServer (server/index.ts:1)
`);
    expect(threads[0].frames[0].callers).toEqual([
      { function: "Builtins_InterpreterEntryTrampoline", file: "/usr/bin/node" },
      { function: "burnFromRoute", file: "server/dev-cpu-burn.ts:14" },
      { function: "handleRequest", file: "server/routes/index.ts:3" },
    ]);
  });

  it("keeps the 30 functions that ran the most", () => {
    const chunks: string[] = [];
    for (let i = 0; i < 30; i++) {
      const name = `fn${String(i).padStart(2, "0")}`;
      chunks.push(`node 1\n\t${name} (server/a.ts:1)\n`);
      chunks.push(`node 1\n\t${name} (server/a.ts:1)\n`);
    }
    chunks.push("node 1\n\tonce (server/a.ts:1)\n");
    const threads = parsePerfScript(chunks.join("\n"));
    expect(threads[0].frames).toHaveLength(30);
    expect(threads[0].frames.some((frame) => frame.function === "once")).toBe(false);
  });
});

describe("cpu profile files", () => {
  let dir: string;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps finished stack files and drops ones older than 7 days", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpu-profiles-"));
    const now = 1_700_000_000_000;
    const fresh = now - 60_000;
    const stale = now - CPU_PROFILE_RETENTION_MS - 1;
    fs.writeFileSync(path.join(dir, `${fresh}-web.json`), JSON.stringify({
      timestamp: fresh, processName: "web", ok: false, error: "perf record failed to start: spawn perf ENOENT",
    }));
    fs.writeFileSync(path.join(dir, `${fresh}-mcp.json`), JSON.stringify({
      timestamp: fresh, processName: "mcp", ok: true, threads: [],
    }));
    fs.writeFileSync(path.join(dir, `${stale}-web.json`), JSON.stringify({
      timestamp: stale, processName: "web", ok: true, threads: [],
    }));
    fs.writeFileSync(path.join(dir, "not-a-stack.json"), "{");
    const pending = pendingCpuProfileFiles(dir);
    expect(pending.ready.map((row) => row.capture.processName).sort()).toEqual(["mcp", "web", "web"]);
    expect(pending.broken).toHaveLength(1);
    pruneCpuProfiles(now, dir);
    expect(fs.readdirSync(dir).sort()).toEqual([`${fresh}-mcp.json`, `${fresh}-web.json`, "not-a-stack.json"]);
  });

  it("treats an oversized stack file as broken", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpu-profiles-"));
    const name = `${Date.now()}-web.json`;
    fs.writeFileSync(path.join(dir, name), "x".repeat(CPU_CAPTURE_JSON_MAX_BYTES + 1));
    expect(pendingCpuProfileFiles(dir).broken).toEqual([path.join(dir, name)]);
  });

  it("turns a failed service recording into a stack file and leaves the raw directory", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpu-profiles-"));
    const raw = fs.mkdtempSync(path.join(os.tmpdir(), "cpu-raw-"));
    const prev = process.env.CPU_PROFILE_DIR;
    process.env.CPU_PROFILE_DIR = dir;
    const id = "1700000100000";
    fs.mkdirSync(path.join(raw, id));
    fs.writeFileSync(path.join(raw, id, "meta.json"), JSON.stringify({
      timestamp: 1700000100000,
      processName: "web",
      pid: 12,
      ok: false,
      error: "perf record exited 1",
    }));
    fs.symlinkSync("/etc", path.join(raw, "1700000100001"));
    expect(await importServiceCaptures(raw)).toEqual([id]);
    expect(fs.existsSync(path.join(raw, id, "meta.json"))).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(dir, `${id}-web.json`), "utf8"));
    expect(written).toMatchObject({ ok: false, error: "perf record exited 1", processName: "web" });
    noteServiceCapturesImported([id]);
    expect(fs.existsSync(path.join(dir, "seen", id))).toBe(false);
    fs.rmSync(path.join(dir, `${id}-web.json`));
    noteServiceCapturesImported([id]);
    expect(fs.existsSync(path.join(dir, "seen", id))).toBe(true);
    expect(await importServiceCaptures(raw)).toEqual([]);
    if (prev == null) delete process.env.CPU_PROFILE_DIR;
    else process.env.CPU_PROFILE_DIR = prev;
    fs.rmSync(raw, { recursive: true, force: true });
  });

  it("reads a fresh heartbeat as active and an old one as inactive", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpu-health-"));
    const heartbeat = path.join(dir, "heartbeat");
    const status = path.join(dir, "status.json");
    const prevEnv = process.env.NODE_ENV;
    const prevBeat = process.env.CPU_CAPTURE_HEARTBEAT;
    const prevStatus = process.env.CPU_CAPTURE_STATUS;
    process.env.NODE_ENV = "production";
    process.env.CPU_CAPTURE_HEARTBEAT = heartbeat;
    process.env.CPU_CAPTURE_STATUS = status;
    const now = Date.now();
    fs.writeFileSync(heartbeat, `${now}\n`);
    fs.writeFileSync(status, JSON.stringify({ ok: false, error: "perf record exited 1", notice: "Two processes." }));
    expect(readCpuCaptureHealth(now)).toEqual({
      mode: "service",
      active: true,
      lastError: "perf record exited 1",
      notice: "Two processes.",
    });
    const old = new Date(now - CPU_CAPTURE_STALE_MS - 1_000);
    fs.utimesSync(heartbeat, old, old);
    expect(readCpuCaptureHealth(now).active).toBe(false);
    fs.rmSync(heartbeat);
    expect(readCpuCaptureHealth(now).active).toBe(false);
    if (prevEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
    if (prevBeat == null) delete process.env.CPU_CAPTURE_HEARTBEAT;
    else process.env.CPU_CAPTURE_HEARTBEAT = prevBeat;
    if (prevStatus == null) delete process.env.CPU_CAPTURE_STATUS;
    else process.env.CPU_CAPTURE_STATUS = prevStatus;
  });

  it("deletes name maps whose pid is gone and keeps this process", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "perf-maps-"));
    fs.writeFileSync(path.join(dir, `perf-${process.pid}.map`), "live");
    fs.writeFileSync(path.join(dir, "perf-99999999.map"), "dead");
    deleteOrphanPerfMaps(dir);
    expect(fs.existsSync(path.join(dir, `perf-${process.pid}.map`))).toBe(true);
    expect(fs.existsSync(path.join(dir, "perf-99999999.map"))).toBe(false);
  });
});
