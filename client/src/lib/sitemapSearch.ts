import { localePrefixFromPath } from "@shared/runtime-issues";

export interface SitemapSearchEntry {
  loc: string;
  label: string;
  locale?: string;
  content_type?: string;
  slug?: string;
}

/** Pathname staff see in the picker. Strips origin, query, and hash. */
export function sitemapPathname(loc: string): string {
  try {
    return new URL(loc).pathname;
  } catch {
    const path = loc.split("?")[0].split("#")[0];
    return path || loc;
  }
}

export function sitemapEntryKey(entry: SitemapSearchEntry, index?: number): string {
  const path = sitemapPathname(entry.loc);
  const key = `${path}::${entry.locale ?? ""}::${entry.content_type ?? ""}::${entry.slug ?? ""}`;
  return index == null ? key : `${key}::${index}`;
}

/** seo-index entry id: contentType/slug/locale */
export function sitemapEntrySeoId(entry: SitemapSearchEntry): string | null {
  const ct = entry.content_type?.trim();
  const slug = entry.slug?.trim();
  const locale = entry.locale?.trim();
  if (!ct || !slug || !locale) return null;
  return `${ct}/${slug}/${locale}`;
}

export type FilterSitemapOptions = {
  excludePaths?: string[];
  /** seo-index ids: contentType/slug/locale */
  excludeIds?: string[];
};

function normalizeExcludePath(path: string): string {
  const p = path.split("?")[0].split("#")[0] || "/";
  return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
}

function applySitemapExclusions<T extends SitemapSearchEntry>(
  entries: T[],
  options?: FilterSitemapOptions,
): T[] {
  if (!options?.excludePaths?.length && !options?.excludeIds?.length) return entries;
  const pathSet = new Set(
    (options.excludePaths ?? []).map((p) => normalizeExcludePath(p)),
  );
  const idSet = new Set(options.excludeIds ?? []);
  return entries.filter((entry) => {
    const path = normalizeExcludePath(sitemapPathname(entry.loc));
    if (pathSet.has(path)) return false;
    const id = sitemapEntrySeoId(entry);
    if (id && idSet.has(id)) return false;
    return true;
  });
}

/** Keep the first row for each pathname (cloned landings often share a slug/URL). */
export function dedupeSitemapEntries<T extends SitemapSearchEntry>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const path = sitemapPathname(entry.loc);
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(entry);
  }
  return out;
}

/** Stable key for a CMS entry (locale-agnostic). Null when type or slug is missing. */
export function sitemapContentEntryKey(entry: SitemapSearchEntry): string | null {
  const ct = entry.content_type?.trim();
  const slug = entry.slug?.trim();
  if (!ct || !slug) return null;
  return `${ct}/${slug}`;
}

/**
 * Keep the first row per content_type + slug (product / entry pickers).
 * Drops rows missing content_type or slug.
 */
export function dedupeByContentEntry<T extends SitemapSearchEntry>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const key = sitemapContentEntryKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function lastPathSegment(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

function haystack(entry: SitemapSearchEntry): {
  path: string;
  last: string;
  label: string;
} {
  const path = sitemapPathname(entry.loc).toLowerCase();
  return {
    path,
    last: lastPathSegment(path),
    label: (entry.label ?? "").toLowerCase(),
  };
}

function matchesVisibleFields(entry: SitemapSearchEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const h = haystack(entry);
  return h.path.includes(q) || h.label.includes(q);
}

/** Higher is a better match. 0 means no match. */
export function sitemapMatchScore(entry: SitemapSearchEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const h = haystack(entry);
  const lastTokens = tokenize(h.last);
  const labelTokens = tokenize(h.label);

  if (h.last === q) return 100;
  if (lastTokens.includes(q)) return 90;
  if (labelTokens.includes(q)) return 85;
  if (h.last.startsWith(q)) return 80;
  if (lastTokens.some((t) => t.startsWith(q))) return 75;
  if (h.last.includes(q)) return 70;
  if (h.path.includes(q)) return 50;
  if (h.label.startsWith(q) || h.label.includes(` ${q}`)) return 40;
  if (h.label.includes(q)) return 30;
  return 0;
}

/**
 * Dedupe by pathname, then (when query is non-empty) keep rows whose
 * visible path or label contains the query, ranked by relevance.
 * Searches the URL slug via the pathname last segment — not the folder
 * `slug` field, which can differ from the public URL on cloned landings.
 * Does not search the origin/host of `loc`.
 */
export function filterSitemapEntries<T extends SitemapSearchEntry>(
  entries: T[],
  query: string,
  options?: FilterSitemapOptions,
): T[] {
  const deduped = applySitemapExclusions(dedupeSitemapEntries(entries), options);
  const q = query.trim();
  if (!q) return deduped;

  return deduped
    .filter((entry) => matchesVisibleFields(entry, q))
    .sort((a, b) => {
      const diff = sitemapMatchScore(b, q) - sitemapMatchScore(a, q);
      if (diff !== 0) return diff;
      return sitemapPathname(a.loc).localeCompare(sitemapPathname(b.loc));
    });
}

/** English public URLs on 4geeks use `/us/`, not `/en/`. */
const PATH_PREFIX_TO_SITEMAP_LOCALE: Record<string, string> = {
  us: "en",
};

/**
 * Sitemap locale to suggest from a redirect origin path.
 * Empty string means "all locales" (no prefix, regex-only, or unknown prefix).
 */
export function suggestedSitemapLocale(
  originPath: string,
  supportedLocales: string[] = ["en", "es"],
): string {
  const prefix = localePrefixFromPath(originPath);
  if (!prefix) return "";
  if (supportedLocales.includes(prefix)) return prefix;
  const mapped = PATH_PREFIX_TO_SITEMAP_LOCALE[prefix];
  if (mapped && supportedLocales.includes(mapped)) return mapped;
  return "";
}

