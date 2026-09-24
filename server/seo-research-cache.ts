/**
 * Cached SEO research payloads (keyword ideas, competitors, keyword gaps).
 * Vendor-neutral paths under .cache/{site}/seo-research-*.json
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "./db-cache";
import { getDefaultContentFolder } from "./site-config";

export const SEO_RESEARCH_IDEAS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SEO_RESEARCH_COMPETITORS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const SEO_RESEARCH_GAPS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SeoResearchCacheEntry = {
  key: string;
  fetched_at: string;
  location: string;
  language: string;
  payload: Record<string, unknown>;
};

type CacheFile = {
  updated_at: string;
  entries: Record<string, SeoResearchCacheEntry>;
};

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function researchCacheKey(parts: string[]): string {
  return parts.map(normalizePart).join("|");
}

function cachePath(kind: "ideas" | "competitors" | "gaps", contentFolder?: string): string {
  const folder = contentFolder || getDefaultContentFolder();
  return path.join(CACHE_DIR, folder, `seo-research-${kind}.json`);
}

function loadFile(kind: "ideas" | "competitors" | "gaps", contentFolder?: string): CacheFile {
  const p = cachePath(kind, contentFolder);
  if (!fs.existsSync(p)) return { updated_at: "", entries: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as CacheFile;
    if (!parsed?.entries || typeof parsed.entries !== "object") {
      return { updated_at: "", entries: {} };
    }
    return { updated_at: parsed.updated_at || "", entries: parsed.entries };
  } catch {
    return { updated_at: "", entries: {} };
  }
}

function saveFile(
  kind: "ideas" | "competitors" | "gaps",
  file: CacheFile,
  contentFolder?: string,
): void {
  const p = cachePath(kind, contentFolder);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(file), "utf-8");
}

function entryFresh(entry: SeoResearchCacheEntry | undefined, ttlMs: number, now = Date.now()): boolean {
  if (!entry?.fetched_at) return false;
  const t = Date.parse(entry.fetched_at);
  if (Number.isNaN(t)) return false;
  return now - t < ttlMs;
}

export function ideasCacheKey(opts: {
  seed: string;
  mode: string;
  location: string;
  language: string;
  limit?: number;
  min_volume?: number;
  intent?: string;
}): string {
  return researchCacheKey([
    "ideas",
    opts.seed,
    opts.mode || "ideas",
    opts.location,
    opts.language,
    String(opts.limit ?? 25),
    String(opts.min_volume ?? ""),
    opts.intent ?? "",
  ]);
}

export function competitorsCacheKey(opts: {
  domain?: string;
  seed_keywords?: string[];
  location: string;
  language: string;
  limit?: number;
}): string {
  const seeds = (opts.seed_keywords || []).map(normalizePart).filter(Boolean).sort();
  return researchCacheKey([
    "competitors",
    opts.domain || "",
    seeds.join(","),
    opts.location,
    opts.language,
    String(opts.limit ?? 10),
  ]);
}

export function gapsCacheKey(opts: {
  domain: string;
  competitors: string[];
  location: string;
  language: string;
  limit?: number;
}): string {
  const comps = opts.competitors.map(normalizePart).filter(Boolean).sort();
  return researchCacheKey([
    "gaps",
    opts.domain,
    comps.join(","),
    opts.location,
    opts.language,
    String(opts.limit ?? 50),
  ]);
}

export function getIdeasEntry(key: string, contentFolder?: string): SeoResearchCacheEntry | undefined {
  return loadFile("ideas", contentFolder).entries[key];
}

export function ideasEntryFresh(entry: SeoResearchCacheEntry | undefined, now = Date.now()): boolean {
  return entryFresh(entry, SEO_RESEARCH_IDEAS_TTL_MS, now);
}

export function upsertIdeasEntry(
  opts: {
    key: string;
    location: string;
    language: string;
    payload: Record<string, unknown>;
  },
  contentFolder?: string,
): SeoResearchCacheEntry {
  const file = loadFile("ideas", contentFolder);
  const entry: SeoResearchCacheEntry = {
    key: opts.key,
    fetched_at: new Date().toISOString(),
    location: opts.location,
    language: opts.language,
    payload: opts.payload,
  };
  file.entries[opts.key] = entry;
  file.updated_at = entry.fetched_at;
  saveFile("ideas", file, contentFolder);
  return entry;
}

export function getCompetitorsEntry(
  key: string,
  contentFolder?: string,
): SeoResearchCacheEntry | undefined {
  return loadFile("competitors", contentFolder).entries[key];
}

export function competitorsEntryFresh(
  entry: SeoResearchCacheEntry | undefined,
  now = Date.now(),
): boolean {
  return entryFresh(entry, SEO_RESEARCH_COMPETITORS_TTL_MS, now);
}

export function upsertCompetitorsEntry(
  opts: {
    key: string;
    location: string;
    language: string;
    payload: Record<string, unknown>;
  },
  contentFolder?: string,
): SeoResearchCacheEntry {
  const file = loadFile("competitors", contentFolder);
  const entry: SeoResearchCacheEntry = {
    key: opts.key,
    fetched_at: new Date().toISOString(),
    location: opts.location,
    language: opts.language,
    payload: opts.payload,
  };
  file.entries[opts.key] = entry;
  file.updated_at = entry.fetched_at;
  saveFile("competitors", file, contentFolder);
  return entry;
}

export function getGapsEntry(key: string, contentFolder?: string): SeoResearchCacheEntry | undefined {
  return loadFile("gaps", contentFolder).entries[key];
}

export function gapsEntryFresh(entry: SeoResearchCacheEntry | undefined, now = Date.now()): boolean {
  return entryFresh(entry, SEO_RESEARCH_GAPS_TTL_MS, now);
}

export function upsertGapsEntry(
  opts: {
    key: string;
    location: string;
    language: string;
    payload: Record<string, unknown>;
  },
  contentFolder?: string,
): SeoResearchCacheEntry {
  const file = loadFile("gaps", contentFolder);
  const entry: SeoResearchCacheEntry = {
    key: opts.key,
    fetched_at: new Date().toISOString(),
    location: opts.location,
    language: opts.language,
    payload: opts.payload,
  };
  file.entries[opts.key] = entry;
  file.updated_at = entry.fetched_at;
  saveFile("gaps", file, contentFolder);
  return entry;
}
