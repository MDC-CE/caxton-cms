import { spawn, execFileSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { readEnvFile } from "../../cli/src/lib/env-file.js";

export type StressHandles = {
  app: ChildProcess;
  mcp: ChildProcess;
  appPort: number;
  mcpPort: number;
};

type Listener = { pid: number; cmd: string };

function listTcpListeners(port: number | string): Listener[] {
  try {
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp", "-Fc"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const listeners: Listener[] = [];
    let pid = 0;
    let cmd = "";
    for (const line of out.split("\n")) {
      if (line.startsWith("p")) {
        if (pid) listeners.push({ pid, cmd });
        pid = Number(line.slice(1)) || 0;
        cmd = "";
      } else if (line.startsWith("c")) {
        cmd = line.slice(1);
      }
    }
    if (pid) listeners.push({ pid, cmd });
    return listeners;
  } catch {
    return [];
  }
}

/** Fail fast if dedicated stress ports are busy — never kill other processes. */
export function assertPortsFree(appPort: number, mcpPort: number): void {
  for (const port of [appPort, mcpPort]) {
    const listeners = listTcpListeners(port);
    if (!listeners.length) continue;
    const detail = listeners
      .map((l) => `pid ${l.pid}${l.cmd ? ` (${l.cmd})` : ""}`)
      .join(", ");
    throw new Error(
      `Port ${port} is already in use by ${detail}. Free it or pass --port / --mcp-port.`,
    );
  }
}

function resolveTsx(projectRoot: string): { runner: string; prefix: string[] } {
  const tsxBin = path.join(projectRoot, "node_modules", ".bin", "tsx");
  if (fs.existsSync(tsxBin)) return { runner: tsxBin, prefix: [] };
  return { runner: "npx", prefix: ["tsx"] };
}

function buildChildEnv(opts: {
  projectRoot: string;
  appPort: number;
  mcpPort: number;
  connectionToken: string;
  mcpSecret: string;
}): NodeJS.ProcessEnv {
  const projectEnv = readEnvFile(opts.projectRoot);
  const siteUrl = `http://127.0.0.1:${opts.appPort}`;
  return {
    ...process.env,
    ...projectEnv,
    NODE_ENV: "development",
    PORT: String(opts.appPort),
    MCP_PORT: String(opts.mcpPort),
    SITE_URL: siteUrl,
    PUBLIC_URL: siteUrl,
    MCP_PUBLIC_URL: siteUrl,
    WEBLIFY_PROJECT_ROOT: opts.projectRoot,
    WEBLIFY_PACKAGE_ROOT: opts.projectRoot,
    WEBLIFY_CONNECTION_TOKEN: opts.connectionToken,
    WEBLIFY_ALLOW_CONNECTION_TOKEN_STAFF: "1",
    MCP_SERVER_SECRET: opts.mcpSecret,
    // Do not share optimize-deps cache with the developer's `npm run dev`
    // (parallel writers leave deps_temp_* and 504 Outdated Optimize Dep).
    VITE_CACHE_DIR: path.join(opts.projectRoot, "node_modules", ".vite-stress"),
    // Force off even if .env enables sync — do not edit .env
    GITHUB_SYNC_ENABLED: "false",
    GITHUB_AUTO_COMMIT_ENABLED: "false",
    LOG_LEVEL: projectEnv.LOG_LEVEL?.trim() || "warn",
  };
}

export async function spawnStressServers(opts: {
  projectRoot: string;
  appPort: number;
  mcpPort: number;
  connectionToken: string;
}): Promise<StressHandles> {
  assertPortsFree(opts.appPort, opts.mcpPort);

  const projectEnv = readEnvFile(opts.projectRoot);
  const mcpSecret =
    process.env.MCP_SERVER_SECRET?.trim() ||
    projectEnv.MCP_SERVER_SECRET?.trim() ||
    process.env.MCP_API_KEY?.trim() ||
    projectEnv.MCP_API_KEY?.trim();
  if (!mcpSecret) {
    throw new Error(
      "MCP_SERVER_SECRET is missing from the environment / .env. Set it before running test:stress.",
    );
  }

  const env = buildChildEnv({
    projectRoot: opts.projectRoot,
    appPort: opts.appPort,
    mcpPort: opts.mcpPort,
    connectionToken: opts.connectionToken,
    mcpSecret,
  });

  const { runner, prefix } = resolveTsx(opts.projectRoot);
  const appEntry = path.join(opts.projectRoot, "server", "index.ts");
  const mcpEntry = path.join(opts.projectRoot, "mcp-server", "index.ts");

  const app = spawn(runner, [...prefix, appEntry], {
    cwd: opts.projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const mcp = spawn(runner, [...prefix, mcpEntry], {
    cwd: opts.projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const forwardFatal = (label: string) => (chunk: Buffer) => {
    const text = chunk.toString();
    if (/FATAL|Error:|EADDRINUSE|failed/i.test(text) && !/DeprecationWarning/i.test(text)) {
      process.stderr.write(`[stress ${label}] ${text}`);
    }
  };
  app.stderr?.on("data", forwardFatal("app"));
  mcp.stderr?.on("data", forwardFatal("mcp"));
  app.on("error", (err) => {
    process.stderr.write(`[stress app] ${err.message}\n`);
  });
  mcp.on("error", (err) => {
    process.stderr.write(`[stress mcp] ${err.message}\n`);
  });

  return { app, mcp, appPort: opts.appPort, mcpPort: opts.mcpPort };
}

export async function waitForAppHealth(port: number, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
      if (res?.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`App did not become healthy on :${port} within ${timeoutMs}ms`);
}

export async function waitForMcpHealth(
  port: number,
  child: ChildProcess,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null || child.killed) {
      throw new Error(
        `MCP exited before becoming healthy (code ${child.exitCode}). Is port ${port} free?`,
      );
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
      if (res?.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`MCP did not become healthy on :${port} within ${timeoutMs}ms`);
}

export function stopStressServers(handles: StressHandles | null | undefined): void {
  if (!handles) return;
  for (const child of [handles.mcp, handles.app]) {
    try {
      if (child && !child.killed) child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}
