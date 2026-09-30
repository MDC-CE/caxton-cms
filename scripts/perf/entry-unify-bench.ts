/**
 * In-process timings for the "database entries are just entries" gates.
 *
 * Usage: npx tsx scripts/perf/entry-unify-bench.ts <label> [--compare <baselineLabel>]
 * Writes artifacts/perf/<label>.json (median of 3 runs, each run's p95 over REPS calls).
 * Regression = more than 10% AND more than 20 ms worse than the baseline.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ quiet: true });

import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

const REPS = 25;
const RUNS = 3;

const label = process.argv[2] || "run";
const compareIdx = process.argv.indexOf("--compare");
const compareLabel = compareIdx >= 0 ? process.argv[compareIdx + 1] : undefined;
const contentFolder = process.env.BENCH_CONTENT_FOLDER || "site_4geeks-com";

const STATIC_TYPE = "blog";
const DB_TYPE = "interactive-exercise";

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function time(fn: () => unknown): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

async function main() {
  const root = path.join(process.cwd(), contentFolder);
  const { DatabaseManager } = await import("../../server/database");
  const { ContentIndex } = await import("../../server/content-index");
  const { queryEntries } = await import("../../server/query-entries");
  const sitemap = await import("../../server/sitemap");
  const mcpContent = await import("../../mcp-server/lib/content");
  const bench = await import("./entry-unify-targets");

  const db = new DatabaseManager(root);
  const ci = new ContentIndex(contentFolder, db);
  ci.scanFast();

  const staticSlug = fs
    .readdirSync(path.join(root, STATIC_TYPE))
    .find((d) => fs.existsSync(path.join(root, STATIC_TYPE, d, "en.yml")));
  const dbItems = db.getMappedItems("interactive-exercises") || [];
  const dbItem = dbItems.find((i) => String(i.language ?? i.lang ?? "") === "us" || String(i.language ?? "") === "en") ?? dbItems[0];
  const dbSlug = dbItem ? String(dbItem.slug) : undefined;
  if (!staticSlug || !dbSlug) throw new Error("bench needs one static blog entry and one cached interactive exercise");

  const metrics: Record<string, () => Promise<unknown> | unknown> = {
    ssr_static_attached_page: () => bench.loadPageForDelivery(ci, db, STATIC_TYPE, staticSlug, "en"),
    ssr_db_page: () => bench.loadPageForDelivery(ci, db, DB_TYPE, dbSlug, "en"),
    listing_db_type_page: () =>
      queryEntries({ from: { contentType: DB_TYPE }, locale: "en", limit: 20 }, { db, contentIndex: ci, contentRoot: root }),
    sitemap_build: () => {
      sitemap.clearSitemapCache();
      return sitemap.getSitemapUrls({ contentIndex: ci, contentRootName: contentFolder, database: db });
    },
    mcp_get_entry_content_static: () => mcpContent.loadPage(STATIC_TYPE, staticSlug, "en", root),
    mcp_get_entry_content_db: () => mcpContent.loadPage(DB_TYPE, dbSlug, "en", root),
  };

  const out: Record<string, { p95_ms: number; runs: number[]; returned: boolean }> = {};
  for (const [name, fn] of Object.entries(metrics)) {
    await fn();
    const runP95s: number[] = [];
    let returned = false;
    for (let run = 0; run < RUNS; run++) {
      const samples: number[] = [];
      for (let i = 0; i < REPS; i++) {
        let value: unknown;
        samples.push(await time(async () => { value = await fn(); }));
        returned = returned || (value != null && value !== false);
      }
      runP95s.push(Number(p95(samples).toFixed(2)));
    }
    out[name] = { p95_ms: median(runP95s), runs: runP95s, returned };
  }

  const report = { label, contentFolder, staticSlug, dbSlug, measured_at: new Date().toISOString(), metrics: out };
  const dir = path.join(process.cwd(), "artifacts", "perf");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify(report, null, 2));
  console.log("report", JSON.stringify(report, null, 2));

  if (compareLabel) {
    const base = JSON.parse(fs.readFileSync(path.join(dir, `${compareLabel}.json`), "utf-8"));
    const regressions: string[] = [];
    for (const [name, m] of Object.entries(out)) {
      const b = base.metrics?.[name];
      if (!b || !b.returned) continue;
      const delta = m.p95_ms - b.p95_ms;
      if (delta > 20 && delta > b.p95_ms * 0.1) regressions.push(`${name}: ${b.p95_ms} -> ${m.p95_ms} ms`);
    }
    const staticP95 = out.mcp_get_entry_content_static?.p95_ms ?? 0;
    const dbP95 = out.mcp_get_entry_content_db?.p95_ms ?? 0;
    if (out.mcp_get_entry_content_db?.returned && !base.metrics?.mcp_get_entry_content_db?.returned && dbP95 > staticP95 * 1.5) {
      regressions.push(`mcp_get_entry_content_db ${dbP95} ms is over 1.5x static ${staticP95} ms`);
    }
    console.log("regressions", regressions);
    if (regressions.length) process.exitCode = 1;
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
