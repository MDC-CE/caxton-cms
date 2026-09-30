/**
 * Phase 2 gate: list database pages where a top-level page value from the template
 * (or the entry's own files) differs from the item's mapped field. After delivery
 * switches to the shared entry merge, the item's value wins for those keys.
 *
 * Usage: npx tsx scripts/entry-unify-clash-report.ts [contentFolder]
 * Writes artifacts/entry-unify/clash-report.{json,md}.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ quiet: true });

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isDeepStrictEqual } from "util";

export type Clash = {
  contentType: string;
  slug: string;
  locale: string;
  key: string;
  /** Value the page shows today (template / entry files). */
  current: unknown;
  /** Item value that wins after the switch. */
  after: unknown;
};

export type ClashReport = {
  contentFolder: string;
  generated_at: string;
  pages_checked: number;
  clashes: Clash[];
  /** Template values that are `{{ ... }}` bindings: they resolve from the item anyway, so not listed as clashes. */
  bindings_skipped: number;
};

const IGNORED_KEYS = new Set(["slug", "locale", "_slug", "_locale", "_image", "_updated_at", "updated_at", "image"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBinding(value: unknown): boolean {
  return typeof value === "string" && value.includes("{{");
}

export async function buildClashReport(contentFolder: string): Promise<ClashReport> {
  const root = path.join(process.cwd(), contentFolder);
  const { DatabaseManager } = await import("../server/database");
  const { ContentIndex } = await import("../server/content-index");
  const { listEntryKeys, entryItemLayer } = await import("../server/entry-layer");

  const db = new DatabaseManager(root);
  const ci = new ContentIndex(contentFolder, db);
  const list = listEntryKeys(ci);

  const clashes: Clash[] = [];
  let pagesChecked = 0;
  let bindingsSkipped = 0;
  for (const key of list.keys) {
    if (!list.itemsByType.has(key.contentType)) continue;
    for (const locale of key.locales) {
      const layer = entryItemLayer(ci, key.contentType, key.slug, locale, list.itemsByType);
      if (!layer) continue;
      const merged = ci.loadMergedContent(key.contentType, key.slug, locale);
      if (!merged.data) continue;
      pagesChecked++;
      const compare = (field: string, current: unknown, after: unknown) => {
        if (current === undefined || current === null || current === "") return;
        if (isBinding(current)) {
          bindingsSkipped++;
          return;
        }
        if (isDeepStrictEqual(current, after)) return;
        clashes.push({ contentType: key.contentType, slug: key.slug, locale, key: field, current, after });
      };
      for (const [field, after] of Object.entries(layer.fields)) {
        if (IGNORED_KEYS.has(field) || field === "sections") continue;
        const current = merged.data[field];
        if (field === "meta" && isPlainObject(after) && isPlainObject(current)) {
          for (const [sub, subAfter] of Object.entries(after)) compare(`meta.${sub}`, current[sub], subAfter);
          continue;
        }
        compare(field, current, after);
      }
    }
  }
  return {
    contentFolder,
    generated_at: new Date().toISOString(),
    pages_checked: pagesChecked,
    clashes,
    bindings_skipped: bindingsSkipped,
  };
}

function short(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  const one = (s ?? "").replace(/\s+/g, " ");
  return one.length > 80 ? `${one.slice(0, 77)}...` : one;
}

export function clashReportMarkdown(report: ClashReport): string {
  const lines = [
    `# Template vs item clashes (${report.contentFolder})`,
    "",
    `Generated ${report.generated_at}. Pages checked: ${report.pages_checked}. Clashes: ${report.clashes.length}. Template bindings skipped: ${report.bindings_skipped}.`,
    "",
    "After the delivery switch the item value (right column) wins over the value the page shows today.",
    "",
  ];
  if (report.clashes.length === 0) {
    lines.push("No clashes.");
    return lines.join("\n") + "\n";
  }
  const byKey = new Map<string, number>();
  for (const c of report.clashes) byKey.set(`${c.contentType}.${c.key}`, (byKey.get(`${c.contentType}.${c.key}`) ?? 0) + 1);
  lines.push("## By type and key", "", "| Type.key | Pages |", "|---|---|");
  for (const [k, n] of [...byKey.entries()].sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${n} |`);
  lines.push("", "## Pages", "", "| Page | Key | Today | After switch |", "|---|---|---|---|");
  for (const c of report.clashes) {
    lines.push(`| ${c.contentType}/${c.slug} (${c.locale}) | ${c.key} | ${short(c.current)} | ${short(c.after)} |`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const contentFolder = process.argv[2] || process.env.BENCH_CONTENT_FOLDER || "site_4geeks-com";
  const report = await buildClashReport(contentFolder);
  const dir = path.join(process.cwd(), "artifacts", "entry-unify");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "clash-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, "clash-report.md"), clashReportMarkdown(report));
  console.log("pages_checked", report.pages_checked);
  console.log("clashes", report.clashes.length);
  console.log("bindings_skipped", report.bindings_skipped);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
