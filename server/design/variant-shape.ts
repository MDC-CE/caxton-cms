/**
 * Measures `content_shape` per component variant from live pages (item
 * counts, headline lengths, image/icon presence) and tightens ranges with
 * hard limits from schema.ts (Zod `.min` / `.max` on arrays) and schema.yml
 * `text_limits`. Also returns usage evidence (where each variant appears)
 * for AI-drafted `best_for` / `avoid_when` and drift suggestions.
 */
import fs from "fs";
import type { ContentShapeRange, VariantContentShape } from "@shared/component-layout-traits";
import type { TextLimitsByVariant } from "@shared/component-text-limits";
import { listLivePageFiles, safeLoadYaml, sectionsOf } from "./live-pages";

const TEXT_KEYS = ["eyebrow", "heading", "title", "subtitle", "description", "tagline"] as const;
const IGNORED_ARRAY_KEYS = new Set(["related_features", "tags", "classes"]);
const CONFIG_ARRAY_KEY = /^(show|hide)_?on|locations?$|_ids?$|^filters?$/i;
const MEDIA_IMAGE = /(image|logo|photo|picture|thumbnail|avatar|video)/i;
const MEDIA_ICON = /icon/i;

export interface VariantEvidence {
  type: string;
  variant: string;
  uses: number;
  /** Distinct pages (entry or template) using the variant. */
  sample_pages: number;
  /** Uses per top-level content directory (landings, pages, programs…). */
  by_dir: Record<string, number>;
  /** Up to 5 example page files. */
  example_files: string[];
  shape: VariantContentShape;
}

type Acc = {
  uses: number;
  pages: Set<string>;
  byDir: Map<string, number>;
  examples: string[];
  items: Map<string, number[]>;
  text: Map<string, number[]>;
  image: number;
  icon: number;
};

export function visibleLength(value: string): number {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function hasMediaKey(rec: Record<string, unknown>, re: RegExp): boolean {
  for (const [k, v] of Object.entries(rec)) {
    if (!re.test(k)) continue;
    if (typeof v === "string" && v.trim()) return true;
    if (v && typeof v === "object" && Object.keys(v as object).length > 0) return true;
  }
  return false;
}

function sectionHasMedia(section: Record<string, unknown>, re: RegExp): boolean {
  if (hasMediaKey(section, re)) return true;
  for (const v of Object.values(section)) {
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      if (item && typeof item === "object" && hasMediaKey(item as Record<string, unknown>, re)) return true;
    }
  }
  return false;
}

function range(values: number[]): ContentShapeRange {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    typical: sorted[Math.floor((sorted.length - 1) / 2)],
  };
}

function presence(count: number, uses: number): "required" | "optional" | "unused" {
  if (count === 0) return "unused";
  return count / uses >= 0.95 ? "required" : "optional";
}

export function measureVariantShapes(contentRoot: string): Map<string, Map<string, VariantEvidence>> {
  const accs = new Map<string, Map<string, Acc>>();
  for (const page of listLivePageFiles(contentRoot)) {
    let raw: string;
    try {
      raw = fs.readFileSync(page.abs, "utf8");
    } catch {
      continue;
    }
    if (!/(^|\n)\s*sections\s*:/.test(raw)) continue;
    const pageKey = page.kind === "template" ? `${page.dir}::template` : `${page.dir}/${page.slug ?? page.file}`;
    for (const section of sectionsOf(safeLoadYaml(raw))) {
      const type = String(section.type);
      const variant = typeof section.variant === "string" && section.variant.trim() ? section.variant.trim() : "default";
      let byVariant = accs.get(type);
      if (!byVariant) accs.set(type, (byVariant = new Map()));
      let acc = byVariant.get(variant);
      if (!acc) {
        acc = { uses: 0, pages: new Set(), byDir: new Map(), examples: [], items: new Map(), text: new Map(), image: 0, icon: 0 };
        byVariant.set(variant, acc);
      }
      acc.uses += 1;
      acc.pages.add(pageKey);
      acc.byDir.set(page.dir, (acc.byDir.get(page.dir) ?? 0) + 1);
      if (acc.examples.length < 5 && !acc.examples.includes(page.file)) acc.examples.push(page.file);
      for (const [key, value] of Object.entries(section)) {
        if (Array.isArray(value) && !IGNORED_ARRAY_KEYS.has(key) && !CONFIG_ARRAY_KEY.test(key)) {
          const list = acc.items.get(key) ?? [];
          list.push(value.length);
          acc.items.set(key, list);
        }
      }
      for (const key of TEXT_KEYS) {
        const value = section[key];
        if (typeof value !== "string" || !value.trim()) continue;
        const list = acc.text.get(key) ?? [];
        list.push(visibleLength(value));
        acc.text.set(key, list);
      }
      if (sectionHasMedia(section, MEDIA_IMAGE)) acc.image += 1;
      if (sectionHasMedia(section, MEDIA_ICON)) acc.icon += 1;
    }
  }

  const out = new Map<string, Map<string, VariantEvidence>>();
  const measuredAt = new Date().toISOString().slice(0, 10);
  for (const [type, byVariant] of accs) {
    const variants = new Map<string, VariantEvidence>();
    for (const [variant, acc] of byVariant) {
      const items: Record<string, ContentShapeRange> = {};
      for (const [k, v] of acc.items) items[k] = range(v);
      const text: Record<string, ContentShapeRange> = {};
      for (const [k, v] of acc.text) text[k] = range(v);
      const shape: VariantContentShape = {
        ...(Object.keys(items).length ? { items } : {}),
        ...(Object.keys(text).length ? { text } : {}),
        image: presence(acc.image, acc.uses),
        icon: presence(acc.icon, acc.uses),
        sample_pages: acc.pages.size,
        measured_at: measuredAt,
      };
      variants.set(variant, {
        type,
        variant,
        uses: acc.uses,
        sample_pages: acc.pages.size,
        by_dir: Object.fromEntries([...acc.byDir.entries()].sort((a, b) => b[1] - a[1])),
        example_files: acc.examples,
        shape,
      });
    }
    out.set(type, variants);
  }
  return out;
}

/** Index of the `)` closing the `(` at `open`, or -1. */
function matchParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `field: z.array(...).min(N).max(M)` limits found in a schema.ts source. */
export function zodArrayLimits(source: string): Record<string, { min?: number; max?: number }> {
  const out: Record<string, { min?: number; max?: number }> = {};
  const re = /(\w+)\s*:\s*z\s*\.\s*array\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const close = matchParen(source, m.index + m[0].length - 1);
    if (close < 0) continue;
    const chain = /^((?:\s*\.\s*\w+\s*\([^()]*\))*)/.exec(source.slice(close + 1))?.[1] ?? "";
    const min = /\.\s*(?:min|nonempty)\s*\(\s*(\d*)/.exec(chain);
    const max = /\.\s*max\s*\(\s*(\d+)/.exec(chain);
    const length = /\.\s*length\s*\(\s*(\d+)/.exec(chain);
    const limit: { min?: number; max?: number } = {};
    if (min) limit.min = min[1] ? Number(min[1]) : 1;
    if (max) limit.max = Number(max[1]);
    if (length) limit.min = limit.max = Number(length[1]);
    if (Object.keys(limit).length) out[m[1]!] = limit;
  }
  return out;
}

function clampRange(r: ContentShapeRange, limit: { min?: number; max?: number }): ContentShapeRange {
  const next: ContentShapeRange = { ...r, limit };
  if (limit.min !== undefined && next.min !== undefined) next.min = Math.max(next.min, limit.min);
  if (limit.max !== undefined && next.max !== undefined) next.max = Math.min(next.max, limit.max);
  return next;
}

/** Apply hard limits (Zod arrays + text_limits for this variant) to a measured shape. */
export function applyShapeLimits(
  shape: VariantContentShape,
  variant: string,
  zodLimits: Record<string, { min?: number; max?: number }>,
  textLimits: TextLimitsByVariant | undefined,
): VariantContentShape {
  const items = { ...(shape.items ?? {}) };
  for (const [field, limit] of Object.entries(zodLimits)) {
    items[field] = items[field] ? clampRange(items[field]!, limit) : { limit };
  }
  const text = { ...(shape.text ?? {}) };
  const rules = [...(textLimits?.["*"] ?? []), ...(textLimits?.[variant] ?? [])];
  for (const rule of rules) {
    if ("fields" in rule && rule.fields.length === 1) {
      const f = rule.fields[0]!;
      text[f] = text[f] ? clampRange(text[f]!, { max: rule.max_length }) : { limit: { max: rule.max_length } };
    } else if ("list" in rule && rule.max_items !== undefined) {
      const f = rule.list;
      const prev = items[f]?.limit ?? {};
      const limit = { ...prev, max: Math.min(prev.max ?? Infinity, rule.max_items) };
      items[f] = items[f] ? clampRange(items[f]!, limit) : { limit };
    }
  }
  return {
    ...shape,
    ...(Object.keys(items).length ? { items } : {}),
    ...(Object.keys(text).length ? { text } : {}),
  };
}
