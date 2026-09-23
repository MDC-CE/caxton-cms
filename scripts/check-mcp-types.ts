#!/usr/bin/env tsx
/**
 * Scoped typecheck for mcp-server/** only.
 *
 * Compiling mcp-server pulls in server/** modules that still carry the
 * repo-wide tsc baseline. Those leaked diagnostics are counted and ignored
 * (not printed) until a repo-wide ratchet exists — exit non-zero only when a
 * diagnostic path starts with "mcp-server/", or when tsc dies with no file
 * diagnostics at all (config/tooling failure).
 *
 * Deep dive (full dump): npx tsc -p tsconfig.mcp.json --noEmit --pretty false
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Compact file diagnostic: path(line,col): error|warning TSxxxx: … */
const FILE_DIAG =
  /^(?:\.\/)?(?:[\w@.-]+\/)+[\w./@+-]+\(\d+,\d+\):\s+(?:error|warning)\s+TS\d+/;

const result = spawnSync(
  "npx",
  [
    "tsc",
    "-p",
    "tsconfig.mcp.json",
    "--noEmit",
    "--incremental",
    "false",
    "--pretty",
    "false",
  ],
  {
    cwd: root,
    encoding: "utf-8",
    shell: process.platform === "win32",
  },
);

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
const combined = `${stdout}${stderr}`;
const lines = combined.split("\n");

const mcpErrorLines = lines.filter(
  (line) => /^mcp-server\//.test(line) && line.includes("error TS"),
);

const otherDiagnosticCount = lines.filter(
  (line) =>
    FILE_DIAG.test(line) &&
    !( /^mcp-server\//.test(line) && line.includes("error TS")),
).length;

if (mcpErrorLines.length > 0) {
  for (const line of mcpErrorLines) {
    console.error(line);
  }
  console.error(
    `\n[check:mcp] ${mcpErrorLines.length} error(s) under mcp-server/ — failing.`,
  );
  process.exit(1);
}

if (result.error) {
  console.error("[check:mcp] Failed to run tsc:", result.error.message);
  process.exit(1);
}

if (result.status !== 0 && otherDiagnosticCount === 0) {
  console.error("[check:mcp] tsc failed with no file diagnostics");
  if (combined.trim()) {
    process.stderr.write(combined.endsWith("\n") ? combined : `${combined}\n`);
  }
  process.exit(1);
}

const ignored =
  otherDiagnosticCount > 0
    ? ` (ignored ${otherDiagnosticCount} other diagnostic${otherDiagnosticCount === 1 ? "" : "s"})`
    : "";
console.log(`[check:mcp] OK — no mcp-server/ errors${ignored}.`);
process.exit(0);
