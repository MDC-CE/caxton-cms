/**
 * Detect language-specific meta that lives only in the entry's shared
 * `_common.yml` (so every language gets the same value) instead of `{locale}.yml`.
 *
 * Only YAML entries with 2+ live languages are checked; DB-backed entries
 * (no `_common.yml`) and single-language entries return null.
 */

import * as fs from "fs";
import * as path from "path";
import type { ContentFile, ValidationContext } from "./types";
import { hasTemplate, resolveContentRoot } from "./resolvedMeta";
import { liveFilesForSeo } from "./seoValidationScope";
import { contentIndex as defaultContentIndex } from "../../../server/content-index";
import { getFullFieldMapping } from "../../../server/content-types";
import { getEntryContentDir } from "../../../server/draft-entry";
import { isTemplateVersioningSlug } from "../../../server/shared-layout-entry";
import { getValueByPath, isTransformer, stripOptionalPrefix } from "../../../server/transform";

export type InheritedMetaKey = "page_title" | "description" | "canonical_url";

export type InheritedMetaSource = {
  /** Field to translate: `meta.<key>` or the mapped entry field path (e.g. `title`, `hero.title`). */
  field: string;
  /** True when the meta value is a `{{ entry.* }}` template whose field lives only in `_common.yml`. */
  fromTemplateVar: boolean;
};

const ENTRY_REF_RE = /\{\{\s*(?:entry|single)\.([a-zA-Z_][a-zA-Z0-9_.]*)/g;

type RunCache = {
  yaml: Map<string, Record<string, unknown> | null>;
  languages: Map<string, Set<string>>;
};

const runCaches = new WeakMap<ValidationContext, RunCache>();

function getRunCache(context: ValidationContext): RunCache {
  let cache = runCaches.get(context);
  if (!cache) {
    const languages = new Map<string, Set<string>>();
    for (const f of liveFilesForSeo(context)) {
      const key = `${f.type}\u0000${f.slug}`;
      const set = languages.get(key) ?? new Set<string>();
      set.add(f.locale);
      languages.set(key, set);
    }
    cache = { yaml: new Map(), languages };
    runCaches.set(context, cache);
  }
  return cache;
}

function loadYaml(
  filePath: string,
  context: ValidationContext,
  cache: RunCache,
): Record<string, unknown> | null {
  if (cache.yaml.has(filePath)) return cache.yaml.get(filePath) ?? null;
  let parsed: Record<string, unknown> | null = null;
  try {
    if (fs.existsSync(filePath)) {
      const index = context.contentIndex ?? defaultContentIndex;
      parsed = index.safeYamlLoad(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {
    parsed = null;
  }
  cache.yaml.set(filePath, parsed);
  return parsed;
}

function loadLocaleYaml(
  dir: string,
  locale: string,
  context: ValidationContext,
  cache: RunCache,
): Record<string, unknown> | null {
  return (
    loadYaml(path.join(dir, `${locale}.yml`), context, cache) ??
    loadYaml(path.join(dir, `${locale}.yaml`), context, cache)
  );
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function findInheritedMetaSource(
  file: ContentFile,
  metaKey: InheritedMetaKey,
  context: ValidationContext,
): InheritedMetaSource | null {
  const rawValue = (file.meta as Record<string, unknown> | undefined)?.[metaKey];
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;
  if (isTemplateVersioningSlug(file.slug)) return null;

  const cache = getRunCache(context);
  const languages = cache.languages.get(`${file.type}\u0000${file.slug}`);
  if (!languages || languages.size < 2) return null;

  const contentRoot = resolveContentRoot(context);
  let dir: string;
  try {
    dir = getEntryContentDir(file.type, file.slug, contentRoot);
  } catch {
    return null;
  }
  const commonRaw = loadYaml(path.join(dir, "_common.yml"), context, cache);
  if (!commonRaw) return null;
  const localeRaw = loadLocaleYaml(dir, file.locale, context, cache) ?? {};

  const entryRefs = hasTemplate(rawValue)
    ? Array.from(rawValue.matchAll(ENTRY_REF_RE), (m) => m[1])
    : [];

  if (entryRefs.length === 0) {
    const metaPath = `meta.${metaKey}`;
    if (!isPresent(getValueByPath(localeRaw, metaPath)) && isPresent(getValueByPath(commonRaw, metaPath))) {
      return { field: metaPath, fromTemplateVar: false };
    }
    return null;
  }

  const mapping = getFullFieldMapping(file.type, contentRoot) ?? {};
  for (const ref of entryRefs) {
    const [head, ...rest] = ref.split(".");
    const mapped = mapping[head];
    if (mapped !== undefined && (!mapped || isTransformer(stripOptionalPrefix(mapped)))) continue;
    const source = mapped ? stripOptionalPrefix(mapped) : head;
    const fieldPath = rest.length > 0 ? `${source}.${rest.join(".")}` : source;
    if (!isPresent(getValueByPath(localeRaw, fieldPath)) && isPresent(getValueByPath(commonRaw, fieldPath))) {
      return { field: fieldPath, fromTemplateVar: true };
    }
  }
  return null;
}
