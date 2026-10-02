import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { variantMetadataGaps, type VariantMetadata } from "@shared/component-layout-traits";

export interface RegistrySchemaFile {
  /** Repo-relative path, e.g. `site_4geeks-com/component-registry/faq/v1.0/schema.yml`. */
  file: string;
  componentType: string;
  version: string;
  /** `shared` or the `site_*` folder. */
  origin: string;
}

export interface VariantMetadataGap {
  file: string;
  componentType: string;
  variant: string;
  missing: string[];
}

export function listRegistrySchemaFiles(projectRoot: string, only?: { origin?: string }): RegistrySchemaFile[] {
  const roots: { origin: string; dir: string }[] = [];
  const sharedDir = path.join(projectRoot, "shared", "component-registry");
  if (fs.existsSync(sharedDir)) roots.push({ origin: "shared", dir: sharedDir });
  for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("site_")) continue;
    const dir = path.join(projectRoot, entry.name, "component-registry");
    if (fs.existsSync(dir)) roots.push({ origin: entry.name, dir });
  }
  const out: RegistrySchemaFile[] = [];
  for (const { origin, dir } of roots) {
    if (only?.origin && only.origin !== origin) continue;
    for (const type of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!type.isDirectory() || type.name.startsWith("_")) continue;
      const typeDir = path.join(dir, type.name);
      for (const ver of fs.readdirSync(typeDir, { withFileTypes: true })) {
        if (!ver.isDirectory() || !/^v\d/.test(ver.name)) continue;
        const abs = path.join(typeDir, ver.name, "schema.yml");
        if (!fs.existsSync(abs)) continue;
        out.push({
          file: path.relative(projectRoot, abs),
          componentType: type.name,
          version: ver.name,
          origin,
        });
      }
    }
  }
  return out;
}

function readVariants(absFile: string): Record<string, VariantMetadata | null> | null {
  try {
    const parsed = yaml.load(fs.readFileSync(absFile, "utf8")) as Record<string, unknown> | null;
    const v = parsed?.variants;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, VariantMetadata | null>;
  } catch {
    return null;
  }
}

/** Same dump options as scripts/schema-sync so files do not churn between tools. */
export const SCHEMA_YML_DUMP_OPTIONS: yaml.DumpOptions = {
  indent: 2,
  lineWidth: 120,
  noRefs: true,
  sortKeys: false,
  quotingType: '"',
};

export type VariantMetadataPatch = Partial<Pick<VariantMetadata, "best_for" | "avoid_when" | "content_shape" | "metadata_status">>;

/**
 * Merge a patch into `variants.<variant>` of one schema.yml. Empty strings
 * remove the key. Returns false when the file has no such variant map entry
 * and `createVariant` is not set.
 */
export function updateVariantMetadata(
  absFile: string,
  variant: string,
  patch: VariantMetadataPatch,
  opts?: { createVariant?: boolean },
): boolean {
  const parsed = yaml.load(fs.readFileSync(absFile, "utf8")) as Record<string, unknown> | null;
  if (!parsed) return false;
  let variants = parsed.variants as Record<string, VariantMetadata | null> | undefined;
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    if (!opts?.createVariant) return false;
    variants = {};
    parsed.variants = variants;
  }
  if (!(variant in variants) && !opts?.createVariant) return false;
  const next: Record<string, unknown> = { ...(variants[variant] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === "" || v === null) delete next[k];
    else next[k] = v;
  }
  variants[variant] = next as VariantMetadata;
  fs.writeFileSync(absFile, yaml.dump(parsed, SCHEMA_YML_DUMP_OPTIONS));
  return true;
}

export interface VariantDriftSuggestion {
  componentType: string;
  variant: string;
  kind: "unused_variant" | "usage_contradicts_best_for";
  message: string;
  evidence: Record<string, unknown>;
}

/** Words that tie a content directory to wording staff would write in best_for. */
const DIR_WORDS: Record<string, string[]> = {
  landings: ["landing", "campaign", "ad"],
  "landing-page": ["landing", "campaign", "ad"],
  pages: ["page", "home", "about", "corporate"],
  programs: ["program", "course", "bootcamp", "syllabus"],
  blog: ["blog", "article", "post"],
  locations: ["location", "campus", "city"],
  workshop: ["workshop", "event"],
};

/**
 * Staff suggestions when live usage disagrees with metadata: a variant with
 * approved text but no live use, or ≥80% of uses in one area that best_for
 * never mentions.
 */
export function computeVariantDrift(
  componentType: string,
  variants: Record<string, VariantMetadata | null>,
  evidence: Map<string, { uses: number; by_dir: Record<string, number> }> | undefined,
): VariantDriftSuggestion[] {
  const out: VariantDriftSuggestion[] = [];
  for (const [variant, meta] of Object.entries(variants)) {
    const ev = evidence?.get(variant);
    if (!ev || ev.uses === 0) {
      if (meta?.best_for) {
        out.push({
          componentType,
          variant,
          kind: "unused_variant",
          message: `No live page uses ${componentType}/${variant}; check best_for still describes a real use.`,
          evidence: { uses: 0 },
        });
      }
      continue;
    }
    const bestFor = meta?.best_for?.toLowerCase();
    if (!bestFor || ev.uses < 5 || meta?.metadata_status === "draft") continue;
    const [topDir, topUses] = Object.entries(ev.by_dir).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!topDir || !topUses || topUses / ev.uses < 0.8) continue;
    const words = DIR_WORDS[topDir] ?? [topDir.replace(/s$/, "")];
    if (words.some((w) => bestFor.includes(w))) continue;
    out.push({
      componentType,
      variant,
      kind: "usage_contradicts_best_for",
      message: `${Math.round((topUses / ev.uses) * 100)}% of ${componentType}/${variant} uses are in ${topDir}, but best_for does not mention it.`,
      evidence: { uses: ev.uses, by_dir: ev.by_dir, best_for: meta?.best_for },
    });
  }
  return out;
}

/** Variants with empty metadata or missing best_for / content_shape (advisory; never fails a build). */
export function findVariantMetadataGaps(projectRoot: string, only?: { origin?: string }): VariantMetadataGap[] {
  const gaps: VariantMetadataGap[] = [];
  for (const f of listRegistrySchemaFiles(projectRoot, only)) {
    const variants = readVariants(path.join(projectRoot, f.file));
    if (!variants) continue;
    for (const [variant, meta] of Object.entries(variants)) {
      const missing = variantMetadataGaps(meta);
      if (missing.length > 0) gaps.push({ file: f.file, componentType: f.componentType, variant, missing });
    }
  }
  return gaps;
}
