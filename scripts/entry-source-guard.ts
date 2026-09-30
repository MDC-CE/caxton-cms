import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Identifiers that branch on "does this entry come from a database?". Entry
 * resolution should go through server/entry-layer.ts instead; every remaining
 * use must be listed in ENTRY_SOURCE_ALLOWLIST with a reason.
 */
export const ENTRY_SOURCE_PATTERN =
  /database\?\.slug|\bisDbBacked\b|\bisDatabaseBacked\b|\bhasDatabaseSingle\b|\bgetDatabaseName\b|\bgetMappedItems\b|\bfetchMappedItems\b|\bloadDatabaseSinglePage\b/g;

export const ENTRY_SOURCE_ROOTS = ["server", "scripts", "mcp-server", "shared", "client/src"];

const SKIP_DIRS = new Set(["node_modules", "dist", "artifacts", "test-helpers"]);

function stripImports(source: string): string {
  return source.replace(/^import\s[\s\S]*?\sfrom\s+["'][^"']+["'];?/gm, "");
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
}

/** Relative path → number of entry-source branches (imports not counted). */
export function countEntrySourceBranches(repoRoot: string): Record<string, number> {
  const files: string[] = [];
  for (const root of ENTRY_SOURCE_ROOTS) walk(path.join(repoRoot, root), files);
  const counts: Record<string, number> = {};
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join("/");
    if (rel === "scripts/entry-source-guard.ts") continue;
    const matches = stripImports(fs.readFileSync(file, "utf-8")).match(ENTRY_SOURCE_PATTERN);
    if (matches?.length) counts[rel] = matches.length;
  }
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const counts = countEntrySourceBranches(process.cwd());
  for (const [file, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`${n}\t${file}`);
  }
}
