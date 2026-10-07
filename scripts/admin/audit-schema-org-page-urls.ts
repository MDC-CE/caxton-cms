/**
 * audit-schema-org-page-urls.ts
 *
 * Finds page-type schema_org sections (WebPage, AboutPage, ContactPage,
 * CollectionPage, ProfilePage, ItemPage) whose typed `url` / `@id` names a
 * different page on this site, in live and draft/variant YAML. `--apply`
 * deletes only those keys (SSR fills the page address when blank).
 * Also lists open proposals on the flagged drafts (report only).
 *
 * Usage:
 *   npx tsx scripts/admin/audit-schema-org-page-urls.ts [contentRoot] [--apply]
 *
 * Dry run is the default; nothing is written without --apply.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { isDeepStrictEqual } from "util";
import yaml from "js-yaml";
import { glob } from "glob";
import { escapeTemplateVars, unescapeObjectVars } from "../../shared/templateVars";
import {
  findSchemaOrgPageUrlMismatches,
  type SchemaOrgPageUrlMismatch,
} from "../../shared/schema-org-page-url";
import { getAllDirectories, getType } from "../../server/content-types";
import { getSupportedLocales } from "../../server/settings";
import { getSiteHosts } from "../../server/site-urls";
import { resolveExpectedPagePaths } from "../../server/schema-org-page-url-gate";
import { markFileAsModified } from "../../server/sync-state";

const CONTENT_ROOT_DEFAULT = "site_4geeks-com";
const AUTHOR = "audit-schema-org-page-urls";

export interface AuditSchemaOrgPageUrlsOptions {
  contentRoot?: string;
  dryRun?: boolean;
}

export interface AuditSchemaOrgPageUrlsResultItem {
  id: string;
  src: string;
  status: "would-remove" | "removed" | "error";
  reason?: string;
  section_id: string | null;
  key_path: string;
  typed: string;
  expected: string[];
}

export interface OpenProposalHit {
  proposal_id: string;
  title: string;
  file: string;
  locale: string;
  variant: string;
}

export interface AuditSchemaOrgPageUrlsResult {
  message: string;
  results: AuditSchemaOrgPageUrlsResultItem[];
  openProposals: OpenProposalHit[];
  changedFiles: string[];
  removedCount: number;
  errorCount: number;
}

type YamlDoc = Record<string, unknown>;

function loadYaml(filePath: string): YamlDoc | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { escaped, map } = escapeTemplateVars(raw);
  const parsed = yaml.load(escaped);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return unescapeObjectVars(parsed, map) as YamlDoc;
}

function parseYamlText(raw: string): unknown {
  const { escaped, map } = escapeTemplateVars(raw);
  return unescapeObjectVars(yaml.load(escaped), map);
}

function asRecord(v: unknown): YamlDoc | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as YamlDoc) : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Delete `key_path` (e.g. `properties.locales.es.url`) from a section object. */
function deleteKeyPath(section: YamlDoc, keyPath: string): void {
  const parts = keyPath.split(".");
  const field = parts.pop()!;
  let cur: YamlDoc | null = section;
  for (const p of parts) cur = asRecord(cur?.[p]);
  if (cur) delete cur[field];
}

/**
 * Remove the single line holding `field: value` so comments and formatting survive.
 * Returns null when the line is not uniquely identifiable.
 */
function removeLine(raw: string, m: SchemaOrgPageUrlMismatch): string | null {
  const key = m.field === "@id" ? `["']@id["']` : "url";
  const re = new RegExp(`^\\s*${key}:\\s*(["']?)${escapeRegex(m.value)}\\1\\s*$`);
  const lines = raw.split("\n");
  const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) return null;
  lines.splice(hits[0], 1);
  return lines.join("\n");
}

type FileTarget = {
  abs: string;
  rel: string;
  contentType: string;
  slug: string;
  locale: string;
  variant: string | null;
};

function classifyFile(
  abs: string,
  contentAbs: string,
  directories: Set<string>,
  locales: string[],
  contentRoot: string,
): FileTarget | null {
  const relToRoot = path.relative(contentAbs, abs).split(path.sep);
  if (relToRoot.length !== 3) return null;
  const [dir, slug, filename] = relToRoot;
  if (!directories.has(dir)) return null;
  const base = filename.replace(/\.(yml|yaml)$/i, "");
  if (base.startsWith("_") || base === "versioning") return null;
  const dot = base.lastIndexOf(".");
  const locale = dot === -1 ? base : base.slice(dot + 1);
  if (!locales.includes(locale)) return null;
  return {
    abs,
    rel: path.relative(process.cwd(), abs),
    contentType: getType(dir, contentRoot),
    slug,
    locale,
    variant: dot === -1 ? null : base.slice(0, dot),
  };
}

export async function auditSchemaOrgPageUrls(
  options: AuditSchemaOrgPageUrlsOptions = {},
): Promise<AuditSchemaOrgPageUrlsResult> {
  const dryRun = options.dryRun ?? true;
  const folder = options.contentRoot || CONTENT_ROOT_DEFAULT;
  const contentAbs = path.isAbsolute(folder) ? folder : path.join(process.cwd(), folder);
  const contentRoot = path.relative(process.cwd(), contentAbs) || folder;

  const empty: AuditSchemaOrgPageUrlsResult = {
    message: "",
    results: [],
    openProposals: [],
    changedFiles: [],
    removedCount: 0,
    errorCount: 0,
  };
  if (!fs.existsSync(contentAbs)) {
    return { ...empty, message: `Content root not found: ${contentRoot}`, errorCount: 1 };
  }

  const directories = new Set(getAllDirectories(contentRoot));
  const locales = getSupportedLocales(contentRoot);
  const siteHosts = getSiteHosts();

  const files = await glob("*/*/*.{yml,yaml}", { cwd: contentAbs, absolute: true, nodir: true });
  const results: AuditSchemaOrgPageUrlsResultItem[] = [];
  const changedFiles: string[] = [];
  const flaggedVariants: FileTarget[] = [];
  let removedCount = 0;
  let errorCount = 0;

  for (const abs of files.sort()) {
    const target = classifyFile(abs, contentAbs, directories, locales, contentRoot);
    if (!target) continue;

    let doc: YamlDoc | null;
    try {
      doc = loadYaml(abs);
    } catch (err: any) {
      errorCount++;
      results.push({
        id: target.rel,
        src: target.rel,
        status: "error",
        reason: `unparseable YAML: ${err?.message || "unknown"}`,
        section_id: null,
        key_path: "",
        typed: "",
        expected: [],
      });
      continue;
    }
    if (!doc || !Array.isArray(doc.sections)) continue;

    const commonPath = path.join(path.dirname(abs), "_common.yml");
    const common = fs.existsSync(commonPath) ? loadYaml(commonPath) ?? {} : {};
    const pageData: YamlDoc = { ...common, ...doc };
    const meta = asRecord(doc.meta) ?? asRecord(common.meta);

    const expectedPaths = resolveExpectedPagePaths({
      contentType: target.contentType,
      slug: target.slug,
      locale: target.locale,
      pageData,
      canonicalUrl: meta?.canonical_url,
      contentRoot,
    });
    const mismatches = findSchemaOrgPageUrlMismatches({
      sections: doc.sections,
      expectedPaths,
      siteHosts,
      locale: target.locale,
    });
    if (mismatches.length === 0) continue;
    if (target.variant) flaggedVariants.push(target);

    let raw = fs.readFileSync(abs, "utf-8");
    const expectedDoc = JSON.parse(JSON.stringify(doc)) as YamlDoc;
    const fileItems: AuditSchemaOrgPageUrlsResultItem[] = [];
    let lineEditFailed: string | null = null;

    for (const m of mismatches) {
      fileItems.push({
        id: `${target.rel}#${m.section_id ?? m.section_index}`,
        src: target.rel,
        status: dryRun ? "would-remove" : "removed",
        section_id: m.section_id,
        key_path: m.key_path,
        typed: m.value,
        expected: m.expected,
      });
      deleteKeyPath((expectedDoc.sections as YamlDoc[])[m.section_index], m.key_path);
      const next = removeLine(raw, m);
      if (next === null) lineEditFailed ??= `could not uniquely locate ${m.key_path} "${m.value}"`;
      else raw = next;
    }

    if (!lineEditFailed && !isDeepStrictEqual(parseYamlText(raw), expectedDoc)) {
      lineEditFailed = "line removal changed more than the mismatched keys";
    }
    if (lineEditFailed) {
      for (const item of fileItems) {
        item.status = "error";
        item.reason = lineEditFailed;
      }
      errorCount += fileItems.length;
    } else {
      removedCount += fileItems.length;
      if (!dryRun) {
        fs.writeFileSync(abs, raw, "utf-8");
        markFileAsModified(target.rel, AUTHOR, undefined, contentRoot);
        changedFiles.push(target.rel);
      }
    }
    results.push(...fileItems);
  }

  const openProposals: OpenProposalHit[] = [];
  const site = path.basename(contentAbs);
  try {
    const { siteDbExists } = await import("../../server/db");
    if (siteDbExists(site) && flaggedVariants.length > 0) {
      const { listOpenProposalsForVariant } = await import("../../server/content-proposals/service");
      for (const t of flaggedVariants) {
        for (const p of listOpenProposalsForVariant(site, t.contentType, t.slug, t.locale, t.variant!)) {
          openProposals.push({
            proposal_id: p.id,
            title: p.title,
            file: t.rel,
            locale: t.locale,
            variant: t.variant!,
          });
        }
      }
    }
  } catch (err: any) {
    errorCount++;
    results.push({
      id: "open-proposals",
      src: "",
      status: "error",
      reason: `could not read proposals: ${err?.message || "unknown"}`,
      section_id: null,
      key_path: "",
      typed: "",
      expected: [],
    });
  }

  const verb = dryRun ? "Dry run: would remove" : "Removed";
  return {
    message: `${verb} ${removedCount} mismatched url/@id value(s); ${errorCount} error(s); ${openProposals.length} open proposal(s) on flagged drafts.`,
    results,
    openProposals,
    changedFiles,
    removedCount,
    errorCount,
  };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const dryRun = !flags.has("--apply");
  const contentRoot = positional[0] || CONTENT_ROOT_DEFAULT;

  auditSchemaOrgPageUrls({ contentRoot, dryRun })
    .then((result) => {
      for (const r of result.results) {
        const prefix = r.status === "error" ? "[ERR]" : "[OK] ";
        const detail = r.reason ? ` — ${r.reason}` : "";
        console.log(
          `  ${prefix} ${r.src} · ${r.section_id ?? "?"} · ${r.key_path} "${r.typed}" · expected ${r.expected[0] ?? "?"} · ${r.status}${detail}`,
        );
      }
      if (result.openProposals.length > 0) {
        console.log("\nOpen proposals on flagged drafts (not modified):");
        for (const p of result.openProposals) {
          console.log(`  ${p.proposal_id} · ${p.title} · ${p.file}`);
        }
      }
      if (result.changedFiles.length > 0) {
        console.log("\nChanged files:");
        for (const f of result.changedFiles) console.log(`  ${f}`);
      }
      console.log("");
      console.log(result.message);
      if (result.errorCount > 0 && result.removedCount === 0) process.exit(1);
    })
    .catch((err) => {
      console.error("Failed:", err);
      process.exit(1);
    });
}
