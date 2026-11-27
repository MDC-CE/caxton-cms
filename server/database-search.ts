/**
 * Shared database semantic/keyword search with L1 memory + L2 GCS cache.
 * Used by /api/databases/:name/search, FAQ dynamic_entries.search, and future callers.
 */
import { createHash } from "crypto";
import { siteDbSearchCacheKey, siteDbSearchCachePrefix } from "@shared/gcsKeys";
import {
  CATALOG_DB_NAME,
  CATALOG_DESCRIPTIONS_DB_NAME,
  DESCRIPTION_SEARCH_LIMIT,
  fetchCatalogSearch,
  playgroundCatalogBaseUrl,
  toSearchDocuments,
  type CatalogKind,
  type CatalogLang,
} from "@shared/playground-catalog";
import { FAQ_DB_NAME, isFaqIndexable } from "@shared/playground-faqs";
import { databaseManager, type DatabaseManager } from "./database";
import { getJobState, setJobState } from "./db-job-state";
import { gcs } from "./gcs";
import { child } from "./logger";
import { getDefaultContentFolder } from "./site-config";

const log = child({ module: "database-search" });

/** Always search/cache at this ceiling; callers slice. */
export const SEARCH_CACHE_CEILING = 100;

/** Ignore cached entries older than this (reindex also invalidates). */
export const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SearchFallbackReason =
  | "vector_store_unavailable"
  | "semantic_index_empty";

export interface DatabaseSearchResult {
  items: Record<string, unknown>[];
  count: number;
  semantic: boolean;
  scores?: Record<string, number>;
  fallback_reason?: SearchFallbackReason;
  fallback_message?: string;
  /** Whether this response was served from L1 or L2 cache. */
  cache?: "memory" | "gcs" | "miss";
}

interface CacheRef {
  slug: string;
  /** Row key from the site-scoped collection (vectorItemKey). */
  key?: string;
  /** Row position; legacy (bare-name) collections only. */
  _idx?: number;
  score: number;
  destiny_code?: string;
}

type ItemKeyFn = (item: Record<string, unknown>, fields: string[]) => string;
type ItemKeyMap = Map<string, Record<string, unknown>>;

interface CachePayload {
  writtenAt: string;
  semantic: true;
  refs: CacheRef[];
}

interface MemoryEntry {
  writtenAt: number;
  payload: CachePayload;
}

const memoryCache = new Map<string, MemoryEntry>();

export function normalizeSearchQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function catalogLang(locale?: string): CatalogLang | undefined {
  if (locale === "en" || locale === "es" || locale === "ht") return locale;
  return undefined;
}

/** Playground word-score search. Used only when the local embedding index cannot answer. Null means keep going. */
async function searchPlaygroundCatalog(
  q: string,
  options: { limit: number; offset?: number; locale?: string; kind?: CatalogKind },
): Promise<DatabaseSearchResult | null> {
  const token = process.env.CAXTON_CATALOG_TOKEN?.trim() || "";
  if (!token) return null;
  const lang = catalogLang(options.locale);
  try {
    const page = await fetchCatalogSearch(playgroundCatalogBaseUrl(), token, {
      q,
      offset: options.offset ?? 0,
      limit: options.limit,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(lang ? { lang } : {}),
    });
    const items = toSearchDocuments(page.results);
    const scores: Record<string, number> = {};
    page.results.forEach((row, index) => {
      const slug = String(items[index]?.slug ?? "");
      if (slug && typeof row.score === "number") scores[slug] = row.score;
    });
    return {
      items,
      count: items.length,
      semantic: true,
      scores,
      cache: "miss",
    };
  } catch (err) {
    log.warn({ err }, "[database-search] playground catalog search failed; using the local index");
    return null;
  }
}

/** Kind filter (catalog rows carry `kind`) then the offset/limit page. */
function pageOf<T>(
  rows: T[],
  itemOf: (row: T) => Record<string, unknown>,
  kind: CatalogKind | undefined,
  offset: number,
  limit: number,
): { page: T[]; total: number } {
  const kept = kind ? rows.filter((row) => itemOf(row).kind === kind) : rows;
  return { page: kept.slice(offset, offset + limit), total: kept.length };
}

export type DescriptionSearchTarget = "descriptions" | "course" | "content_piece";

export function parseDescriptionSearchTarget(raw: string | undefined): DescriptionSearchTarget | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (value === "descriptions" || value === "course" || value === "content_piece") return value;
  throw new Error("target must be descriptions, course, or content_piece");
}

function descriptionTargetSlot(target?: string): "descriptions" | "course" | "content_piece" {
  return target === "course" || target === "content_piece" ? target : "descriptions";
}

/** Cache identity. Description searches include the request target so course hits cannot answer a piece search. */
export function databaseSearchCacheKey(
  dbName: string,
  normalizedQ: string,
  locale?: string,
  target?: string,
): string {
  if (dbName === CATALOG_DESCRIPTIONS_DB_NAME) {
    return `${dbName}|${locale ?? ""}|${normalizedQ}|${descriptionTargetSlot(target)}|${DESCRIPTION_SEARCH_LIMIT}`;
  }
  return `${dbName}|${locale ?? ""}|${normalizedQ}|${SEARCH_CACHE_CEILING}`;
}

function cacheIdentity(dbName: string, target?: string): string {
  if (dbName === CATALOG_DESCRIPTIONS_DB_NAME) {
    return `${descriptionTargetSlot(target)}|${DESCRIPTION_SEARCH_LIMIT}`;
  }
  return String(SEARCH_CACHE_CEILING);
}

function queryHash(normalizedQ: string, locale: string | undefined, identity: string): string {
  return createHash("sha256")
    .update(`${locale ?? ""}|${normalizedQ}|${identity}`)
    .digest("hex")
    .slice(0, 40);
}

function isExpired(writtenAtMs: number): boolean {
  return Date.now() - writtenAtMs > SEARCH_CACHE_TTL_MS;
}

const keyMapMemo = new Map<string, { sig: string; map: ItemKeyMap }>();

/** Row key → item, rebuilt only when the database copy or the embedded fields change. */
export function getItemKeyMap(
  memoKey: string,
  fetchedAt: string,
  items: Record<string, unknown>[],
  fields: string[],
  keyFn: ItemKeyFn,
): ItemKeyMap {
  const sig = `${fetchedAt}|${items.length}|${fields.join(",")}`;
  const hit = keyMapMemo.get(memoKey);
  if (hit && hit.sig === sig) return hit.map;
  const map: ItemKeyMap = new Map();
  for (const item of items) {
    const k = keyFn(item, fields);
    if (!map.has(k)) map.set(k, item);
  }
  keyMapMemo.set(memoKey, { sig, map });
  return map;
}

function resolveLegacyRef(
  ref: { slug: string; _idx?: number; destiny_code?: string },
  allItems: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  if (ref.destiny_code) {
    const byDestiny = allItems.find((candidate) => (
      String(candidate.destiny_code ?? "") === ref.destiny_code
      && String(candidate.slug ?? candidate.id ?? "") === ref.slug
    ));
    if (byDestiny) return byDestiny;
  }
  // Prefer stable id/slug before positional _idx (filtered FAQ lists shift indices).
  const bySlug = allItems.find((i) => String(i.slug ?? i.id ?? "") === ref.slug);
  if (bySlug) return bySlug;
  if (ref._idx !== undefined && ref._idx >= 0 && ref._idx < allItems.length) {
    const candidate = allItems[ref._idx];
    const candidateSlug = String(candidate.slug ?? candidate.id ?? "");
    // Slugless rows were stored with their position as `slug`.
    if (candidateSlug === ref.slug || !ref.slug || !candidateSlug) {
      return candidate;
    }
  }
  return undefined;
}

/** Resolve hits/refs to items: by key when present, else legacy `_idx`/slug. Drops duplicates. */
export function resolveRefs(
  refs: CacheRef[],
  allItems: Record<string, unknown>[],
  getKeyMap?: () => ItemKeyMap | null,
): { items: Record<string, unknown>[]; scores: Record<string, number>; refs: CacheRef[] } {
  const items: Record<string, unknown>[] = [];
  const scores: Record<string, number> = {};
  const kept: CacheRef[] = [];
  const seen = new Set<Record<string, unknown>>();
  let keyMap: ItemKeyMap | null | undefined;
  for (const ref of refs) {
    let item: Record<string, unknown> | undefined;
    if (ref.key) {
      if (keyMap === undefined) keyMap = getKeyMap?.() ?? null;
      item = keyMap?.get(ref.key);
    } else {
      item = resolveLegacyRef(ref, allItems);
    }
    if (!item || seen.has(item)) continue;
    seen.add(item);
    items.push(item);
    kept.push(ref);
    scores[String(item.slug ?? item.id ?? items.length - 1)] = ref.score;
  }
  return { items, scores, refs: kept };
}

/** Per database: the newest index `changedAt` already applied to L1 in this process. */
const appliedChangedAt = new Map<string, number>();

/** The worker re-embedded rows: drop L1 entries written before that (other processes cannot reach this cache). */
function dropStaleMemory(dbName: string, changedAtMs: number): void {
  if (!Number.isFinite(changedAtMs) || changedAtMs <= 0) return;
  if ((appliedChangedAt.get(dbName) ?? 0) >= changedAtMs) return;
  appliedChangedAt.set(dbName, changedAtMs);
  for (const [key, entry] of memoryCache.entries()) {
    if (key.startsWith(`${dbName}|`) && entry.writtenAt < changedAtMs) memoryCache.delete(key);
  }
}

async function readGcsCache(
  dbName: string,
  normalizedQ: string,
  locale: string | undefined,
  contentFolder: string,
  identity: string,
): Promise<CachePayload | null> {
  if (!gcs.available) return null;
  const key = siteDbSearchCacheKey(
    contentFolder,
    dbName,
    queryHash(normalizedQ, locale, identity),
  );
  try {
    const buf = await gcs.download(key);
    if (!buf) return null;
    const payload = JSON.parse(buf.toString("utf8")) as CachePayload;
    if (!payload?.writtenAt || !Array.isArray(payload.refs) || !payload.semantic) {
      return null;
    }
    if (isExpired(Date.parse(payload.writtenAt))) return null;
    return payload;
  } catch (err) {
    log.warn({ err, dbName }, "[database-search] GCS read failed");
    return null;
  }
}

async function writeGcsCache(
  dbName: string,
  normalizedQ: string,
  locale: string | undefined,
  contentFolder: string,
  identity: string,
  payload: CachePayload,
): Promise<void> {
  if (!gcs.available) return;
  const key = siteDbSearchCacheKey(
    contentFolder,
    dbName,
    queryHash(normalizedQ, locale, identity),
  );
  try {
    await gcs.upload(
      key,
      Buffer.from(JSON.stringify(payload), "utf8"),
      "application/json",
      { cacheControl: "private, max-age=0" },
    );
  } catch (err) {
    // 2A: keep L1; log; do not throw
    log.warn({ err, dbName, key }, "[database-search] GCS write failed");
  }
}

function writeMemory(key: string, payload: CachePayload): void {
  memoryCache.set(key, {
    writtenAt: Date.parse(payload.writtenAt) || Date.now(),
    payload,
  });
}

export function getDatabaseSearchCacheStats(dbName: string): {
  memoryEntries: number;
  lastWrittenAt: string | null;
} {
  let memoryEntries = 0;
  let lastWrittenAtMs = 0;
  for (const [key, entry] of memoryCache.entries()) {
    if (!key.startsWith(`${dbName}|`)) continue;
    if (isExpired(entry.writtenAt)) continue;
    memoryEntries++;
    if (entry.writtenAt > lastWrittenAtMs) lastWrittenAtMs = entry.writtenAt;
  }
  return {
    memoryEntries,
    lastWrittenAt: lastWrittenAtMs > 0 ? new Date(lastWrittenAtMs).toISOString() : null,
  };
}

/** On-demand GCS listing — do not call from polled job-status. */
export async function countDatabaseSearchCacheGcs(
  dbName: string,
  contentFolder: string = getDefaultContentFolder(),
): Promise<number> {
  if (!gcs.available) return 0;
  const prefix = siteDbSearchCachePrefix(contentFolder, dbName);
  try {
    const keys = await gcs.list(prefix);
    return keys.filter((k) => k.endsWith(".json") && !k.endsWith("/")).length;
  } catch (err) {
    log.warn({ err, dbName }, "[database-search] GCS list failed");
    return 0;
  }
}

export async function invalidateDatabaseSearchCache(
  dbName: string,
  contentFolder: string = getDefaultContentFolder(),
): Promise<void> {
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(`${dbName}|`)) memoryCache.delete(key);
  }
  if (!gcs.available) return;
  const prefix = siteDbSearchCachePrefix(contentFolder, dbName);
  try {
    const keys = await gcs.list(prefix);
    await Promise.all(keys.map((k) => gcs.delete(k)));
    log.info({ dbName, cleared: keys.length }, "[database-search] Cache invalidated");
  } catch (err) {
    log.warn({ err, dbName }, "[database-search] GCS invalidate failed");
  }
}

export interface SearchDatabaseItemsOptions {
  /** Requested slice size (after cache ceiling search). Default 20, max 100. */
  limit?: number;
  offset?: number;
  /** Catalog rows only: course, content_piece, or omit for both. */
  kind?: CatalogKind;
  /**
   * Description database only. `descriptions` or omit searches every description.
   * `course` and `content_piece` limit the group. Any other value is an error.
   */
  target?: string;
  locale?: string;
  db?: DatabaseManager;
  contentFolder?: string;
  /** Override keyword fallback fields (e.g. from listing search.fields). */
  keywordFields?: string[];
  /** Service route: search the local ce-catalog index and do not call the playground. */
  localOnly?: boolean;
}

/**
 * The hero asks ce-catalog. That file has vectors turned off, so a phrase only
 * matches when it is written in the description. The description index answers
 * by meaning, then the row is joined back so the card still has its title.
 */
async function catalogItemsFromDescriptions(
  q: string,
  options: SearchDatabaseItemsOptions,
  kind: CatalogKind | undefined,
): Promise<DatabaseSearchResult | null> {
  const dbm = options.db ?? databaseManager;
  let described: DatabaseSearchResult;
  try {
    described = await searchDatabaseItems(CATALOG_DESCRIPTIONS_DB_NAME, q, {
      limit: DESCRIPTION_SEARCH_LIMIT,
      offset: 0,
      locale: options.locale,
      kind,
      target: kind,
      db: dbm,
      contentFolder: options.contentFolder,
      localOnly: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("not found")) return null;
    throw err;
  }
  if (!described.semantic || described.items.length === 0) return null;

  let fatItems: Record<string, unknown>[] = [];
  try {
    fatItems = (await dbm.fetchItems(CATALOG_DB_NAME)).items;
  } catch {
    fatItems = [];
  }

  const items = described.items.map((row) => {
    const code = String(row.destiny_code ?? "");
    const lang = String(row.locale ?? row.lang ?? "");
    const rowKind = String(row.kind ?? "");
    const fat = fatItems.find((item) => (
      String(item.destiny_code ?? "") === code
      && String(item.locale ?? item.lang ?? "") === lang
      && String(item.kind ?? "") === rowKind
    ));
    return fat ?? row;
  });

  const scores: Record<string, number> = {};
  described.items.forEach((row, index) => {
    const descSlug = String(row.slug ?? row.id ?? "");
    const score = descSlug && described.scores ? described.scores[descSlug] : undefined;
    const item = items[index];
    const key = String(item?.slug ?? item?.id ?? descSlug);
    if (key && typeof score === "number") scores[key] = score;
  });

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(Math.max(1, options.limit ?? 20), SEARCH_CACHE_CEILING);
  return {
    items: items.slice(offset, offset + limit),
    count: items.length,
    semantic: true,
    ...(Object.keys(scores).length ? { scores } : {}),
    cache: "miss",
  };
}

/**
 * Semantic search when enabled; keyword fallback otherwise.
 * Caches semantic hits, then slices to limit. Description search asks for 10 neighbors.
 */
export async function searchDatabaseItems(
  dbName: string,
  q: string,
  options: SearchDatabaseItemsOptions = {},
): Promise<DatabaseSearchResult> {
  const normalizedQ = normalizeSearchQuery(q);
  if (!normalizedQ) {
    return { items: [], count: 0, semantic: false, cache: "miss" };
  }

  const descriptionsDb = dbName === CATALOG_DESCRIPTIONS_DB_NAME;
  const target = parseDescriptionSearchTarget(options.target);
  const limit = Math.min(
    Math.max(1, options.limit ?? (descriptionsDb ? DESCRIPTION_SEARCH_LIMIT : 20)),
    SEARCH_CACHE_CEILING,
  );
  const locale = options.locale;
  const offset = Math.max(0, options.offset ?? 0);
  const requestedKind = options.kind === "course" || options.kind === "content_piece" ? options.kind : undefined;
  const kind = descriptionsDb && (target === "course" || target === "content_piece")
    ? target
    : requestedKind;

  if (dbName === CATALOG_DB_NAME && options.localOnly) {
    const fromDescriptions = await catalogItemsFromDescriptions(q, options, requestedKind);
    if (fromDescriptions) return fromDescriptions;
  }

  if (dbName === CATALOG_DB_NAME && !options.localOnly) {
    // Embeddings win when the local index can answer. The playground word score
    // is only the fallback (index missing, Qdrant down, or no vector hits).
    let local: DatabaseSearchResult | null = null;
    try {
      local = await searchDatabaseItems(dbName, q, { ...options, localOnly: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("not found")) throw err;
    }
    if (local?.semantic && local.items.length > 0) return local;
    const playground = await searchPlaygroundCatalog(normalizedQ, { limit, offset, locale, kind });
    if (playground) return playground;
    if (local) return local;
  }
  const dbm = options.db ?? databaseManager;
  const contentFolder = options.contentFolder ?? getDefaultContentFolder();
  const identity = cacheIdentity(dbName, target);
  const memKey = databaseSearchCacheKey(dbName, normalizedQ, locale, target);

  const config = dbm.get(dbName);
  const vsConfig = (config as { vector_search?: { enabled?: boolean; fields?: string[] } })
    .vector_search;
  const vectorEnabled =
    vsConfig?.enabled === true &&
    Array.isArray(vsConfig.fields) &&
    vsConfig.fields.length > 0;

  const cacheResult = await dbm.fetchItems(dbName);
  const rawItems = cacheResult.items;
  // FAQ search only surfaces indexable rows; resolve vector hits by id (not _idx).
  const allItems =
    dbName === FAQ_DB_NAME
      ? rawItems.filter((item) => isFaqIndexable(item))
      : rawItems;

  const contentRoot =
    typeof dbm.getSourceContentRoot === "function"
      ? dbm.getSourceContentRoot(dbName)
      : typeof dbm.getContentRoot === "function"
        ? dbm.getContentRoot()
        : undefined;
  const indexState = getJobState(dbName, contentRoot).index;
  const changedAtMs = indexState.changedAt ? Date.parse(indexState.changedAt) : 0;
  dropStaleMemory(dbName, changedAtMs);

  const vector = vectorEnabled ? await import("./vector-search") : null;
  const fields = vsConfig?.fields ?? [];
  const keyMapFor = (): ItemKeyMap | null =>
    vector && fields.length > 0
      ? getItemKeyMap(
          `${contentRoot ?? contentFolder}|${dbName}`,
          cacheResult.fetched_at,
          allItems,
          fields,
          vector.vectorItemKey,
        )
      : null;

  const mem = memoryCache.get(memKey);
  if (mem && !isExpired(mem.writtenAt)) {
    const { items, scores } = resolveRefs(mem.payload.refs, allItems, keyMapFor);
    const { page: sliced } = pageOf(items, (i) => i, kind, offset, limit);
    return {
      items: sliced,
      count: sliced.length,
      semantic: true,
      scores,
      cache: "memory",
    };
  }

  const gcsRaw = await readGcsCache(dbName, normalizedQ, locale, contentFolder, identity);
  const gcsPayload =
    gcsRaw && !(changedAtMs > 0 && Date.parse(gcsRaw.writtenAt) < changedAtMs) ? gcsRaw : null;
  if (gcsPayload) {
    writeMemory(memKey, gcsPayload);
    const { items, scores } = resolveRefs(gcsPayload.refs, allItems, keyMapFor);
    const { page: sliced } = pageOf(items, (i) => i, kind, offset, limit);
    return {
      items: sliced,
      count: sliced.length,
      semantic: true,
      scores,
      cache: "gcs",
    };
  }

  let fallbackReason: SearchFallbackReason | undefined;
  let fallbackMessage: string | undefined;

  if (vector) {
    const available = await vector.isAvailable();
    const queueSync = () => {
      if (typeof dbm.queueVectorIndex === "function") void dbm.queueVectorIndex(dbName, "missing_collection");
    };

    if (!available) {
      fallbackReason = "vector_store_unavailable";
      fallbackMessage =
        'Vector store (Qdrant) is unreachable. Search fell back to exact keyword matching — related words like "certificate" / "certification" will not match unless the exact substring appears.';
    } else {
      // A partially built site-scoped collection is never searched: until the
      // first sync finishes, use the legacy collection or keyword matching.
      const neighborLimit = descriptionsDb ? DESCRIPTION_SEARCH_LIMIT : SEARCH_CACHE_CEILING;
      const siteCollection = vector.siteCollectionName(contentRoot ?? contentFolder, dbName);
      const siteReady = indexState.ready === true && indexState.collection === siteCollection;
      let collection: string | null = siteReady ? siteCollection : null;
      if (!siteReady) {
        queueSync();
        const legacy = vector.legacyCollectionName(dbName);
        if (await vector.collectionExists(legacy).catch(() => false)) collection = legacy;
      }

      const response = collection
        ? await vector.search(
            collection,
            normalizedQ,
            neighborLimit,
            locale,
            descriptionsDb ? kind : undefined,
          )
        : { hits: [], missingCollection: true };
      if (response.missingCollection && siteReady) {
        setJobState(dbName, "index", { ready: false }, contentRoot);
        queueSync();
      }
      const searchResults = response.hits;

      if (searchResults.length > 0) {
        const orderedWithScores: Array<{
          item: Record<string, unknown>;
          score: number;
          ref: CacheRef;
        }> = [];
        const resolved = resolveRefs(
          searchResults.map((r) => ({
            slug: r.slug,
            score: r.score,
            ...(r.destiny_code ? { destiny_code: r.destiny_code } : {}),
            ...(collection === siteCollection && r.key
              ? { key: r.key }
              : dbName === FAQ_DB_NAME
                ? {}
                : { _idx: r._idx }),
          })),
          dbName === FAQ_DB_NAME ? rawItems : allItems,
          keyMapFor,
        );
        resolved.items.forEach((item, i) => {
          if (dbName === FAQ_DB_NAME && !isFaqIndexable(item)) return;
          if (locale) {
            const itemLocale = String(item.locale ?? item.language ?? item.lang ?? "");
            if (itemLocale.toLowerCase() !== locale.toLowerCase()) return;
          }
          const ref = resolved.refs[i];
          const scoredRef: CacheRef =
            descriptionsDb
              ? {
                  ...ref,
                  destiny_code: String(item.destiny_code ?? ref.destiny_code ?? ""),
                }
              : dbName === FAQ_DB_NAME
                ? { slug: String(item.id ?? item.slug ?? ref.slug), score: ref.score }
                : ref;
          orderedWithScores.push({ item, score: scoredRef.score, ref: scoredRef });
        });

        if (orderedWithScores.length > 0) {
          const payload: CachePayload = {
            writtenAt: new Date().toISOString(),
            semantic: true,
            refs: orderedWithScores.map((o) => o.ref),
          };
          writeMemory(memKey, payload);
          await writeGcsCache(dbName, normalizedQ, locale, contentFolder, identity, payload);

          const { page: sliced, total } = pageOf(orderedWithScores, (o) => o.item, kind, offset, limit);
          return {
            items: sliced.map((o) => o.item),
            count: total,
            semantic: true,
            scores: Object.fromEntries(
              sliced.map((o, i) => [
                String(o.item.slug ?? o.item.id ?? i),
                o.score,
              ]),
            ),
            cache: "miss",
          };
        }
      }

      fallbackReason = "semantic_index_empty";
      fallbackMessage = collection
        ? "Semantic index returned no results (collection may be empty). A background re-index is queued when it is missing. Until then, search uses exact keyword matching only."
        : "Semantic index is being built in the background. Until it finishes, search uses exact keyword matching only.";
    }
  }

  // Keyword fallback — do not cache (5B)
  const qLower = normalizedQ;
  const searchFieldsConfig = (config as { search_fields?: string[] }).search_fields;
  const keywordFields = options.keywordFields?.length
    ? options.keywordFields
    : searchFieldsConfig?.length
      ? searchFieldsConfig
      : vsConfig?.fields?.length
        ? vsConfig.fields
        : null;
  let fallback = allItems.filter((item) => {
    const fieldsToCheck = keywordFields ?? Object.keys(item);
    return fieldsToCheck.some((f) => {
      const val = item[f];
      if (val === null || val === undefined) return false;
      if (typeof val === "object") return JSON.stringify(val).toLowerCase().includes(qLower);
      return String(val).toLowerCase().includes(qLower);
    });
  });

  if (locale) {
    fallback = fallback.filter((item) => {
      const itemLocale = String(item.locale ?? item.language ?? item.lang ?? "");
      return itemLocale.toLowerCase() === locale.toLowerCase();
    });
  }

  const { page: sliced, total } = pageOf(fallback, (i) => i, kind, offset, limit);
  return {
    items: sliced,
    count: total,
    semantic: false,
    cache: "miss",
    ...(fallbackReason && {
      fallback_reason: fallbackReason,
      fallback_message: fallbackMessage,
    }),
  };
}

/** Sync L1 peek for resolveFaqItems — returns refs order or null. */
export function peekDatabaseSearchCacheL1(
  dbName: string,
  q: string,
  locale?: string,
  target?: string,
): CacheRef[] | null {
  const normalizedQ = normalizeSearchQuery(q);
  if (!normalizedQ) return null;
  const mem = memoryCache.get(databaseSearchCacheKey(dbName, normalizedQ, locale, target));
  if (!mem || isExpired(mem.writtenAt) || !mem.payload.semantic) return null;
  return mem.payload.refs;
}

/** Test helper — clears L1 only. */
export function clearDatabaseSearchMemoryCacheForTests(): void {
  memoryCache.clear();
  keyMapMemo.clear();
  appliedChangedAt.clear();
}

/**
 * Intersect ranked search hits with filter-only pool, then backfill (1B) to fill slots.
 * Preserves search rank; appends remaining filter-only items not already selected.
 */
export function intersectSearchWithFiltersAndBackfill(
  searchHits: Record<string, unknown>[],
  filterOnlyItems: Record<string, unknown>[],
  remainingSlots: number,
  itemIdentity: (item: Record<string, unknown>) => string = defaultItemIdentity,
): Record<string, unknown>[] {
  if (remainingSlots <= 0) return [];
  const selected: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const item of searchHits) {
    if (selected.length >= remainingSlots) break;
    const id = itemIdentity(item);
    if (seen.has(id)) continue;
    seen.add(id);
    selected.push(item);
  }

  if (selected.length < remainingSlots) {
    for (const item of filterOnlyItems) {
      if (selected.length >= remainingSlots) break;
      const id = itemIdentity(item);
      if (seen.has(id)) continue;
      seen.add(id);
      selected.push(item);
    }
  }

  return selected;
}

function defaultItemIdentity(item: Record<string, unknown>): string {
  const slug = item.slug ?? item.id;
  if (slug !== undefined && slug !== null && String(slug).length > 0) {
    return `slug:${String(slug)}`;
  }
  const q = String(item.question ?? "");
  return `q:${q.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").slice(0, 80)}`;
}
