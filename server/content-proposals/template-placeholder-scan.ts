/**
 * Template proposals: new `{{ entry.* }}` placeholders in the draft template that some attached
 * entries cannot fill (those pages would render an empty spot). Runs only on apply dry run and
 * apply; only placeholders absent from the live template are scanned.
 */

import fs from "fs";
import path from "path";
import { ENTRY_OR_SINGLE_VAR_PATTERN } from "@shared/entryTemplateVars";
import { buildSingleEntryFromContent } from "../build-single-entry";
import { contentIndex } from "../content-index";
import { finalizeSingleEntryForTemplates, getFolder } from "../content-types";

export const PLACEHOLDER_SAMPLE_MAX = 3;

export type TemplatePlaceholderGap = {
  name: string;
  missing: number;
  total: number;
  sample: string[];
};

/** Field paths used as `{{ entry.x }}` / legacy `{{ single.x }}` without a pipe fallback. */
export function entryPlaceholdersIn(data: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, key?: string) => {
    if (key === "item_template" || key?.startsWith("_")) return;
    if (typeof v === "string") {
      const re = new RegExp(ENTRY_OR_SINGLE_VAR_PATTERN.source, ENTRY_OR_SINGLE_VAR_PATTERN.flags);
      for (const m of Array.from(v.matchAll(re))) {
        if (m[2] === undefined && m[1]) out.add(m[1]);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) walk(item, k);
    }
  };
  walk(data);
  return out;
}

/** Placeholders the draft adds that the live template does not already use. */
export function newEntryPlaceholders(liveSections: unknown, draftSections: unknown): string[] {
  const live = entryPlaceholdersIn(liveSections);
  return Array.from(entryPlaceholdersIn(draftSections)).filter((n) => !live.has(n)).sort();
}

function valueAt(bag: Record<string, unknown>, dotPath: string): unknown {
  let cur: unknown = bag;
  for (const part of dotPath.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Count, per placeholder, the entries whose bag leaves it empty. Omits fully filled placeholders. */
export function summarizeUnfilledPlaceholders(
  placeholders: string[],
  entries: Array<{ slug: string; bag: Record<string, unknown> }>,
): TemplatePlaceholderGap[] {
  const out: TemplatePlaceholderGap[] = [];
  for (const name of placeholders) {
    const missingSlugs = entries.filter((e) => isEmptyValue(valueAt(e.bag, name))).map((e) => e.slug);
    if (!missingSlugs.length) continue;
    out.push({
      name,
      missing: missingSlugs.length,
      total: entries.length,
      sample: missingSlugs.slice(0, PLACEHOLDER_SAMPLE_MAX),
    });
  }
  return out;
}

function loadYaml(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = contentIndex.safeYamlLoad(fs.readFileSync(filePath, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Resolve each attached entry's field bag the way delivery does (`_common.yml` + `{locale}.yml`). */
export function scanTemplatePlaceholdersOnSite(opts: {
  contentType: string;
  locale: string;
  liveSections: unknown;
  draftSections: unknown;
  attachedSlugs: string[];
  contentRoot: string;
}): TemplatePlaceholderGap[] {
  const placeholders = newEntryPlaceholders(opts.liveSections, opts.draftSections);
  if (!placeholders.length || !opts.attachedSlugs.length) return [];
  const root = path.isAbsolute(opts.contentRoot) ? opts.contentRoot : path.join(process.cwd(), opts.contentRoot);
  const typeDir = path.join(root, getFolder(opts.contentType, opts.contentRoot));
  const entries = opts.attachedSlugs.map((slug) => {
    const pageData = {
      ...loadYaml(path.join(typeDir, slug, "_common.yml")),
      ...loadYaml(path.join(typeDir, slug, `${opts.locale}.yml`)),
    };
    const bag =
      finalizeSingleEntryForTemplates(
        buildSingleEntryFromContent(opts.contentType, pageData, {
          slug,
          locale: opts.locale,
          contentRoot: opts.contentRoot,
        }) || {},
        { slug, locale: opts.locale },
      ) || {};
    return { slug, bag };
  });
  return summarizeUnfilledPlaceholders(placeholders, entries);
}
