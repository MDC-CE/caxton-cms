#!/usr/bin/env tsx
/**
 * Backfills component variant metadata in schema.yml:
 *   - content_shape: measured from live pages of --site (item counts, headline
 *     lengths, image/icon presence), clamped by Zod array limits in schema.ts
 *     and schema.yml text_limits. Written when missing (or always with
 *     --refresh-shape).
 *   - best_for / avoid_when: with --draft-ai, drafted by the LLM from evidence
 *     (component description, live usage by area, variant TSX) and stored as
 *     metadata_status: draft until staff approve them in the Component
 *     showcase. Never overwrites approved or hand-written text.
 * Also reports drift suggestions (usage that contradicts best_for).
 *
 * Usage:
 *   npx tsx scripts/backfill-variant-metadata.ts --site site_4geeks-com [--write] [--refresh-shape]
 *     [--draft-ai] [--component faq] [--report artifacts/variant-metadata.site_4geeks-com.json]
 *
 * Without --write it is a dry run. Prints changed schema.yml paths: shared/
 * paths go to the app repo, site_* paths must be pushed to the content repo.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ quiet: true });
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { resolveComponentPath } from "../shared/registry-resolve";
import type { VariantMetadata } from "../shared/component-layout-traits";
import type { TextLimitsByVariant } from "../shared/component-text-limits";
import { getInheritComponentsFrom } from "../server/site-config";
import { applyShapeLimits, measureVariantShapes, zodArrayLimits, type VariantEvidence } from "../server/design/variant-shape";
import { computeVariantDrift, updateVariantMetadata, type VariantDriftSuggestion } from "../server/design/variant-metadata";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

const site = arg("--site");
if (!site) {
  console.error("--site <site_folder> is required (e.g. site_4geeks-com)");
  process.exit(1);
}
const write = flag("--write");
const refreshShape = flag("--refresh-shape");
const draftAi = flag("--draft-ai");
const onlyComponent = arg("--component");
const reportPath = arg("--report") ?? path.join("artifacts", `variant-metadata.${site}.json`);
const root = process.cwd();

function latestSchemaYml(componentType: string): { abs: string; versionDir: string } | null {
  let resolved;
  try {
    resolved = resolveComponentPath(componentType, site!, root, getInheritComponentsFrom(site!));
  } catch {
    return null;
  }
  if (!resolved) return null;
  const versions = fs
    .readdirSync(resolved.componentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d/.test(d.name))
    .map((d) => d.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    const abs = path.join(resolved.componentDir, v, "schema.yml");
    if (fs.existsSync(abs)) return { abs, versionDir: path.join(resolved.componentDir, v) };
  }
  return null;
}

function variantTsxExcerpt(componentType: string, variant: string): string | null {
  const dir = path.join(root, "client", "src", "components", componentType, "variants");
  if (!fs.existsSync(dir)) return null;
  const want = variant.toLowerCase().replace(/[^a-z0-9]/g, "");
  const file = fs
    .readdirSync(dir)
    .find((f) => f.endsWith(".tsx") && f.toLowerCase().replace(/[^a-z0-9.]/g, "").endsWith(`${want}.tsx`));
  if (!file) return null;
  return fs.readFileSync(path.join(dir, file), "utf8").slice(0, 3500);
}

async function draftBestFor(
  componentType: string,
  variant: string,
  schema: Record<string, unknown>,
  meta: VariantMetadata,
  ev: VariantEvidence | undefined,
): Promise<{ best_for?: string; avoid_when?: string } | null> {
  const { getLLMService } = await import("../server/ai/LLMService");
  const evidence = {
    component: componentType,
    variant,
    component_description: schema.description,
    when_to_use: schema.when_to_use,
    variant_description: meta.description,
    live_usage: ev ? { uses: ev.uses, pages: ev.sample_pages, by_area: ev.by_dir, content_shape: ev.shape } : "no live uses",
    tsx_excerpt: variantTsxExcerpt(componentType, variant),
  };
  const prompt =
    "You write variant guidance for a website component registry. Agents read it to choose a variant.\n" +
    "From the evidence, return JSON only: {\"best_for\": string, \"avoid_when\": string}.\n" +
    "Each value is ONE plain sentence under 160 characters, concrete about page goal and content (e.g. item counts, media).\n" +
    "Do not invent capabilities that are not visible in the evidence.\n\n" +
    JSON.stringify(evidence, null, 2);
  try {
    const text = await getLLMService().complete(prompt, { temperature: 0.2, maxTokens: 300 });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error(`no JSON object in reply: ${text.slice(0, 80)}`);
    const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const out: { best_for?: string; avoid_when?: string } = {};
    if (typeof json.best_for === "string" && json.best_for.trim()) out.best_for = json.best_for.trim();
    if (typeof json.avoid_when === "string" && json.avoid_when.trim()) out.avoid_when = json.avoid_when.trim();
    return out;
  } catch (err) {
    console.warn(`  LLM draft failed for ${componentType}/${variant}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`Measuring live pages in ${site}…`);
  const measured = measureVariantShapes(site!);
  console.log("measured component types", measured.size);

  const changedFiles = new Set<string>();
  const drift: VariantDriftSuggestion[] = [];
  const report: Record<string, unknown>[] = [];

  const types = [...measured.keys()].filter((t) => !onlyComponent || t === onlyComponent).sort();
  for (const componentType of types) {
    const located = latestSchemaYml(componentType);
    if (!located) continue;
    const schema = (yaml.load(fs.readFileSync(located.abs, "utf8")) as Record<string, unknown>) ?? {};
    const variants = (schema.variants && typeof schema.variants === "object" && !Array.isArray(schema.variants)
      ? schema.variants
      : { default: {} }) as Record<string, VariantMetadata | null>;
    const evidence = measured.get(componentType)!;
    const schemaTs = path.join(located.versionDir, "schema.ts");
    const zodLimits = fs.existsSync(schemaTs) ? zodArrayLimits(fs.readFileSync(schemaTs, "utf8")) : {};
    const textLimits = schema.text_limits as TextLimitsByVariant | undefined;
    const rel = path.relative(root, located.abs);

    drift.push(...computeVariantDrift(componentType, variants, evidence));

    for (const [variant, metaRaw] of Object.entries(variants)) {
      const meta = metaRaw ?? {};
      const ev = evidence.get(variant);
      const patch: Record<string, unknown> = {};
      if (ev && (refreshShape || !meta.content_shape)) {
        patch.content_shape = applyShapeLimits(ev.shape, variant, zodLimits, textLimits);
      }
      const canDraft = meta.metadata_status !== "approved" && (!meta.best_for || !meta.avoid_when);
      if (draftAi && canDraft) {
        const drafted = await draftBestFor(componentType, variant, schema, meta, ev);
        if (drafted?.best_for && !meta.best_for) patch.best_for = drafted.best_for;
        if (drafted?.avoid_when && !meta.avoid_when) patch.avoid_when = drafted.avoid_when;
        if (patch.best_for || patch.avoid_when) patch.metadata_status = "draft";
      }
      if (Object.keys(patch).length === 0) continue;
      report.push({ file: rel, componentType, variant, patch, uses: ev?.uses ?? 0 });
      if (write) {
        const okWrite = updateVariantMetadata(located.abs, variant, patch, { createVariant: !schema.variants });
        if (okWrite) changedFiles.add(rel);
      } else {
        changedFiles.add(rel);
      }
    }
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ site, write, generated_at: new Date().toISOString(), updates: report, drift }, null, 2));

  console.log(`\n${write ? "Updated" : "Would update"} ${report.length} variants in ${changedFiles.size} schema.yml files.`);
  console.log("drift suggestions", drift.length);
  console.log("report", reportPath);
  if (changedFiles.size) {
    console.log("\nFiles:");
    for (const f of [...changedFiles].sort()) console.log(f);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
