import { QdrantClient } from "@qdrant/js-client-rest";
import { createHash } from "crypto";
import path from "path";
import { CATALOG_CHUNKS_DB_NAME } from "@shared/playground-catalog";
import { setJobState } from "./db-job-state";
import { child } from "./logger";
const log = child({ module: "vector-search" });



const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const VECTOR_SIZE = 384;
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const BATCH_SIZE = 32;
const SCROLL_PAGE = 1000;
const DELETE_CHUNK = 1000;

const AVAILABILITY_TTL_MS = 30_000;

let qdrantClient: QdrantClient | null = null;
let _embedder: ((texts: string[]) => Promise<number[][]>) | null = null;
let _embedderLoading: Promise<void> | null = null;
let _available: boolean | null = null;
let _availabilityCheckedAt = 0;
const recoveredListeners: Array<() => void> = [];
const missingWarned = new Set<string>();

function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({ url: QDRANT_URL });
  }
  return qdrantClient;
}

/** Test hook: swap the Qdrant client and embedder. */
export function __setVectorSearchTestDoubles(doubles: {
  client?: unknown;
  embedder?: (texts: string[]) => Promise<number[][]>;
} | null): void {
  qdrantClient = (doubles?.client as QdrantClient | undefined) ?? null;
  _embedder = doubles?.embedder ?? null;
  _embedderLoading = null;
  _available = null;
  _availabilityCheckedAt = 0;
  missingWarned.clear();
}

async function getEmbedder(): Promise<(texts: string[]) => Promise<number[][]>> {
  if (_embedder) return _embedder;

  if (!_embedderLoading) {
    _embedderLoading = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.cacheDir = ".cache/xenova-models";
      const pipe = await pipeline("feature-extraction", EMBEDDING_MODEL);

      _embedder = async (texts: string[]): Promise<number[][]> => {
        const output = await pipe(texts, { pooling: "mean", normalize: true });
        const data: number[][] = [];
        const dims = output.dims;
        const batchSize = dims[0];
        const vecSize = dims[dims.length - 1];
        for (let i = 0; i < batchSize; i++) {
          data.push(Array.from(output.data.slice(i * vecSize, (i + 1) * vecSize) as Float32Array));
        }
        return data;
      };

      log.info(`[vector-search] Local embedding model "${EMBEDDING_MODEL}" loaded`);
    })();
  }

  await _embedderLoading;
  return _embedder!;
}

function setAvailability(next: boolean): void {
  const wasDown = _available === false;
  _available = next;
  _availabilityCheckedAt = Date.now();
  if (wasDown && next) {
    for (const cb of recoveredListeners) {
      try {
        cb();
      } catch (err) {
        log.warn({ err }, "[vector-search] Recovery listener failed");
      }
    }
  }
}

/** Called when Qdrant goes from unreachable to reachable (seen by this process). */
export function onQdrantRecovered(cb: () => void): void {
  recoveredListeners.push(cb);
}

export async function isAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_available !== null && now - _availabilityCheckedAt < AVAILABILITY_TTL_MS) {
    return _available;
  }
  try {
    const client = getQdrantClient();
    await client.getCollections();
    setAvailability(true);
  } catch {
    setAvailability(false);
  }
  return _available as boolean;
}

function resetAvailabilityCache(): void {
  _availabilityCheckedAt = 0;
}

export interface VectorSearchCollectionStatus {
  name: string;
  points_count: number;
}

export interface VectorSearchStatus {
  available: boolean;
  url: string;
  host: string;
  port: number;
  embedding_model: string;
  vector_size: number;
  distance: "Cosine";
  error: string | null;
  collections: VectorSearchCollectionStatus[];
  embedder_loaded: boolean;
}

function parseQdrantEndpoint(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "localhost";
    const port =
      parsed.port !== ""
        ? Number(parsed.port)
        : parsed.protocol === "https:"
          ? 443
          : 6333;
    return { host, port: Number.isFinite(port) ? port : 6333 };
  } catch {
    return { host: "localhost", port: 6333 };
  }
}

/** Fresh Qdrant health check for admin UI — bypasses the availability TTL cache. */
export async function getStatus(): Promise<VectorSearchStatus> {
  resetAvailabilityCache();
  const { host, port } = parseQdrantEndpoint(QDRANT_URL);
  const base: Omit<VectorSearchStatus, "available" | "error" | "collections"> = {
    url: QDRANT_URL,
    host,
    port,
    embedding_model: EMBEDDING_MODEL,
    vector_size: VECTOR_SIZE,
    distance: "Cosine",
    embedder_loaded: _embedder !== null,
  };

  try {
    const client = getQdrantClient();
    const listed = await client.getCollections();
    const collections: VectorSearchCollectionStatus[] = [];

    for (const col of listed.collections ?? []) {
      try {
        const info = await client.getCollection(col.name);
        collections.push({
          name: col.name,
          points_count: info.points_count ?? 0,
        });
      } catch {
        collections.push({ name: col.name, points_count: 0 });
      }
    }

    setAvailability(true);

    return {
      ...base,
      available: true,
      error: null,
      collections,
    };
  } catch (err) {
    setAvailability(false);
    return {
      ...base,
      available: false,
      error: err instanceof Error ? err.message : String(err),
      collections: [],
    };
  }
}

/** Site-scoped collection name: `<contentFolder>__<dbName>`. Accepts a folder name or a content root path. */
export function siteCollectionName(contentFolderOrRoot: string, dbName: string): string {
  const folder = path.basename(contentFolderOrRoot).replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${folder}__${dbName}`;
}

/** Pre-site-scoping collection name (bare database name). */
export function legacyCollectionName(dbName: string): string {
  return dbName;
}

function isMissingCollectionError(err: unknown): boolean {
  const e = err as { status?: number; message?: string; data?: { status?: { error?: string } } } | null;
  if (!e) return false;
  if (e.status === 404) return true;
  const text = `${e.message ?? ""} ${e.data?.status?.error ?? ""}`;
  return /doesn't exist|not found/i.test(text);
}

export async function collectionExists(name: string): Promise<boolean> {
  const client = getQdrantClient();
  const res = await client.collectionExists(name);
  return Boolean((res as { exists?: boolean }).exists);
}

/** Point count, or null when the collection does not exist. Throws when Qdrant is unreachable. */
export async function getCollectionPointCount(name: string): Promise<number | null> {
  const client = getQdrantClient();
  try {
    const info = await client.getCollection(name);
    return info.points_count ?? 0;
  } catch (err) {
    if (isMissingCollectionError(err)) return null;
    throw err;
  }
}

export async function listCollections(): Promise<string[]> {
  const client = getQdrantClient();
  const listed = await client.getCollections();
  return (listed.collections ?? []).map((c) => c.name);
}

/** Best effort — never throws. */
export async function deleteCollection(name: string): Promise<boolean> {
  try {
    const client = getQdrantClient();
    if (!(await collectionExists(name))) return false;
    await client.deleteCollection(name);
    log.info(`[vector-search] Deleted collection "${name}"`);
    return true;
  } catch (err) {
    log.warn({ err, name }, "[vector-search] deleteCollection failed");
    return false;
  }
}

async function createCollection(name: string): Promise<void> {
  await getQdrantClient().createCollection(name, {
    vectors: { size: VECTOR_SIZE, distance: "Cosine" },
  });
  log.info(`[vector-search] Created collection "${name}" (size=${VECTOR_SIZE})`);
}

async function ensureCollection(name: string): Promise<void> {
  const client = getQdrantClient();
  if (!(await collectionExists(name))) {
    await createCollection(name);
    return;
  }
  const info = await client.getCollection(name);
  const existingSize = (info.config?.params?.vectors as { size?: number } | undefined)?.size;
  if (existingSize !== undefined && existingSize !== VECTOR_SIZE) {
    log.info(`[vector-search] Collection "${name}" has vector size ${existingSize}, expected ${VECTOR_SIZE} — recreating`);
    await client.deleteCollection(name);
    await createCollection(name);
  }
}

function buildText(item: Record<string, unknown>, fields: string[]): string {
  return fields
    .map((f) => {
      const val = item[f];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    })
    .filter(Boolean)
    .join(" ");
}

function itemLocale(item: Record<string, unknown>): string | null {
  if (typeof item.locale === "string") return item.locale;
  if (typeof item.language === "string") return item.language;
  if (typeof item.lang === "string") return item.lang;
  return null;
}

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/**
 * Stable identity for a database row in the vector index: `slug`, else `id`,
 * else `c:` + hash of locale and embedded text (rows without a slug, e.g. testimonials).
 */
export function vectorItemKey(item: Record<string, unknown>, fields: string[]): string {
  const raw = item.slug ?? item.id;
  if (raw !== undefined && raw !== null && String(raw) !== "") return String(raw);
  return `c:${sha1(`${itemLocale(item) ?? ""}\n${buildText(item, fields)}`)}`;
}

function textHash(text: string, fields: string[]): string {
  return sha1(`${EMBEDDING_MODEL}\n${fields.join(",")}\n${text}`);
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embed = await getEmbedder();
  return embed(texts);
}

function toQdrantId(raw: unknown, fallback: number): number | string {
  if (raw === undefined || raw === null) return fallback;
  const str = String(raw);
  const asNum = Number(str);
  if (Number.isInteger(asNum) && asNum > 0 && String(asNum) === str) return asNum;
  const h = createHash("md5").update(str).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

function itemId(item: Record<string, unknown>, index: number): number | string {
  const raw = item.slug ?? item.id;
  return toQdrantId(raw, index + 1);
}

/** Identity stored beside the vector. Meaning stays in the embedding. */
export function pointPayload(item: Record<string, unknown>, index: number): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    _idx: index,
    slug: String(item.slug ?? item.id ?? index),
    locale: itemLocale(item),
  };
  if (typeof item.kind === "string" && item.kind) payload.kind = item.kind;
  if (item.destiny_code != null && String(item.destiny_code).trim()) {
    payload.destiny_code = String(item.destiny_code);
  }
  return payload;
}

export function vectorSearchFilter(options: {
  locale?: string;
  kind?: string;
  destinyCodes?: string[];
}): { must: Array<{ key: string; match: { value?: string; any?: string[] } }> } | undefined {
  const must: Array<{ key: string; match: { value?: string; any?: string[] } }> = [];
  if (options.locale) must.push({ key: "locale", match: { value: options.locale } });
  if (options.kind) must.push({ key: "kind", match: { value: options.kind } });
  const codes = (options.destinyCodes ?? []).map((code) => code.trim()).filter(Boolean);
  if (codes.length > 0) must.push({ key: "destiny_code", match: { any: codes } });
  return must.length > 0 ? { must } : undefined;
}

function pointPayloadForSync(
  item: Record<string, unknown>,
  key: string,
  hash: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    key,
    slug: String(item.slug ?? item.id ?? ""),
    locale: itemLocale(item),
    text_hash: hash,
  };
  if (typeof item.kind === "string" && item.kind) payload.kind = item.kind;
  if (item.destiny_code != null && String(item.destiny_code).trim()) {
    payload.destiny_code = String(item.destiny_code);
  }
  return payload;
}

export interface SyncIndexResult {
  collection: string;
  embedded: number;
  unchanged: number;
  deleted: number;
  total: number;
}

export interface SyncIndexOptions {
  /** Delete the collection first and embed every item. */
  rebuild?: boolean;
  onProgress?: (embedded: number, toEmbed: number) => void;
}

/**
 * Bring `collection` in line with `items`: embed only new or changed rows
 * (by text_hash), delete rows that are gone. Throws when Qdrant is unreachable.
 */
export async function syncIndex(
  collection: string,
  items: Record<string, unknown>[],
  fields: string[],
  opts: SyncIndexOptions = {},
): Promise<SyncIndexResult> {
  const client = getQdrantClient();

  if (opts.rebuild) {
    if (await collectionExists(collection)) await client.deleteCollection(collection);
    await createCollection(collection);
  } else {
    await ensureCollection(collection);
  }

  const desired = new Map<string, {
    id: number | string;
    key: string;
    hash: string;
    text: string;
    item: Record<string, unknown>;
  }>();
  for (const item of items) {
    const key = vectorItemKey(item, fields);
    const id = toQdrantId(key, 0);
    const idKey = String(id);
    if (desired.has(idKey)) continue;
    const text = buildText(item, fields);
    desired.set(idKey, { id, key, hash: textHash(text, fields), text, item });
  }

  const existing = new Map<string, { id: number | string; hash: unknown }>();
  if (!opts.rebuild) {
    let offset: unknown = undefined;
    do {
      const page = await client.scroll(collection, {
        limit: SCROLL_PAGE,
        offset: offset as string | number | undefined,
        with_payload: ["text_hash"],
        with_vector: false,
      });
      for (const p of page.points ?? []) {
        const payload = p.payload as Record<string, unknown> | null | undefined;
        existing.set(String(p.id), { id: p.id, hash: payload?.text_hash });
      }
      offset = page.next_page_offset;
    } while (offset !== null && offset !== undefined);
  }

  const toEmbed = [...desired.entries()]
    .filter(([idKey, d]) => existing.get(idKey)?.hash !== d.hash)
    .map(([, d]) => d);
  const toDelete = [...existing.entries()]
    .filter(([idKey]) => !desired.has(idKey))
    .map(([, e]) => e.id);

  let embedded = 0;
  for (let start = 0; start < toEmbed.length; start += BATCH_SIZE) {
    const batch = toEmbed.slice(start, start + BATCH_SIZE);
    const vectors = await generateEmbeddings(batch.map((d) => d.text));
    await client.upsert(collection, {
      wait: true,
      points: batch.map((d, i) => ({
        id: d.id,
        vector: vectors[i],
        payload: pointPayloadForSync(d.item, d.key, d.hash),
      })),
    });
    embedded += batch.length;
    opts.onProgress?.(embedded, toEmbed.length);
  }

  for (let start = 0; start < toDelete.length; start += DELETE_CHUNK) {
    await client.delete(collection, {
      wait: true,
      points: toDelete.slice(start, start + DELETE_CHUNK),
    });
  }

  const result: SyncIndexResult = {
    collection,
    embedded,
    unchanged: desired.size - toEmbed.length,
    deleted: toDelete.length,
    total: desired.size,
  };
  log.info(result, `[vector-search] Synced "${collection}"`);
  return result;
}

export async function upsertItem(
  dbName: string,
  item: Record<string, unknown>,
  fields: string[],
): Promise<void> {
  if (!(await isAvailable())) return;
  try {
    await ensureCollection(dbName);
    const client = getQdrantClient();
    const text = buildText(item, fields);
    const [vector] = await generateEmbeddings([text]);
    await client.upsert(dbName, {
      points: [
        {
          id: itemId(item, 0),
          vector,
          payload: {
            slug: String(item.slug ?? item.id ?? ""),
            status: typeof item.status === "string" ? item.status : null,
          },
        },
      ],
    });
  } catch (err) {
    log.warn({ err, dbName }, "[vector-search] upsertItem failed");
    resetAvailabilityCache();
  }
}

export interface SearchResult {
  slug: string;
  score: number;
  /** Row key (see vectorItemKey); absent on legacy points. */
  key?: string;
  /** Row position; legacy points only. */
  _idx?: number;
  destiny_code?: string;
  kind?: string;
}

export interface VectorSearchResponse {
  hits: SearchResult[];
  /** Qdrant answered but the collection does not exist. */
  missingCollection: boolean;
}

export async function search(
  collection: string,
  query: string,
  limit = 20,
  localeFilter?: string,
  kindFilter?: string,
): Promise<VectorSearchResponse> {
  if (!(await isAvailable())) {
    return { hits: [], missingCollection: false };
  }

  try {
    const client = getQdrantClient();

    const [queryEmbedding] = await generateEmbeddings([query]);

    const filter = vectorSearchFilter({ locale: localeFilter, kind: kindFilter });

    const results = await client.search(collection, {
      vector: queryEmbedding,
      limit,
      filter,
      with_payload: true,
    });
    missingWarned.delete(collection);

    return {
      missingCollection: false,
      hits: results.map((r) => {
        const payload = r.payload as Record<string, unknown> | null | undefined;
        return {
          slug: String(payload?.slug ?? r.id),
          score: r.score,
          key: typeof payload?.key === "string" ? payload.key : undefined,
          _idx: typeof payload?._idx === "number" ? payload._idx : undefined,
          destiny_code: typeof payload?.destiny_code === "string" ? payload.destiny_code : undefined,
          kind: typeof payload?.kind === "string" ? payload.kind : undefined,
        };
      }),
    };
  } catch (err) {
    if (isMissingCollectionError(err)) {
      if (!missingWarned.has(collection)) {
        missingWarned.add(collection);
        log.warn({ collection }, `[vector-search] Collection "${collection}" does not exist yet`);
      }
      return { hits: [], missingCollection: true };
    }
    log.error({ err: err }, `[vector-search] Search failed for "${collection}":`);
    resetAvailabilityCache();
    return { hits: [], missingCollection: false };
  }
}

const indexInFlight = new Map<string, Promise<void>>();
const indexLatest = new Map<string, { items: Record<string, unknown>[]; fields: string[] }>();

/** The catalog sync waits on this so search does not run against a half-written index. */
export function indexInFlightFor(dbName: string): Promise<void> | undefined {
  return indexInFlight.get(dbName);
}

function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  const causeText = cause instanceof Error ? cause.message : cause ? String(cause) : "";
  return causeText ? `${err.message}: ${causeText}` : err.message;
}

async function replaceCollection(name: string): Promise<void> {
  const client = getQdrantClient();
  try {
    await client.deleteCollection(name);
  } catch {
    // The collection may not exist yet.
  }
  try {
    await client.createCollection(name, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      optimizers_config: { indexing_threshold: 0 },
    });
  } catch (err) {
    log.warn({ err }, "[vector-search] creating the collection without optimizer settings");
    await client.createCollection(name, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
  }
}

type IndexPoint = {
  id: number | string;
  vector: number[];
  payload: Record<string, unknown>;
};

async function upsertPoints(
  name: string,
  points: IndexPoint[],
  skipped: string[],
  streak: { count: number },
): Promise<void> {
  const client = getQdrantClient();
  const finite = points.filter((point) => {
    const ok = point.vector.length === VECTOR_SIZE && point.vector.every((value) => Number.isFinite(value));
    if (!ok) skipped.push(String(point.payload.slug ?? point.id));
    return ok;
  });
  if (finite.length === 0) return;
  try {
    await client.upsert(name, { points: finite });
    streak.count = 0;
  } catch (err) {
    if (finite.length === 1) {
      streak.count += 1;
      if (streak.count >= 5) throw err;
      skipped.push(String(finite[0]?.payload.slug ?? finite[0]?.id));
      log.warn({ err, slug: finite[0]?.payload.slug }, "[vector-search] skipped one description");
      return;
    }
    const mid = Math.ceil(finite.length / 2);
    await upsertPoints(name, finite.slice(0, mid), skipped, streak);
    await upsertPoints(name, finite.slice(mid), skipped, streak);
  }
}

/**
 * Full replace index for MDC playground catalog/FAQ sync (legacy bare collection name).
 * Platform databases use syncIndex via the vector-index queue instead.
 */
async function runIndex(
  dbName: string,
  items: Record<string, unknown>[],
  fields: string[],
): Promise<void> {
  if (!(await isAvailable())) {
    log.info(`[vector-search] Qdrant not available — skipping index for "${dbName}"`);
    return;
  }
  if (items.length === 0) {
    log.info(`[vector-search] No rows to index for "${dbName}"`);
    return;
  }

  setJobState(dbName, "index", {
    status: "running",
    fetched: 0,
    total: items.length,
    startedAt: new Date().toISOString(),
  });

  const name = legacyCollectionName(dbName);
  try {
    // The live collection stopped accepting new rows after 160. Replace it, then
    // keep going if a single row is rejected.
    await replaceCollection(name);
    let indexed = 0;
    const skipped: string[] = [];
    const streak = { count: 0 };

    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = items.slice(start, start + BATCH_SIZE);
      const texts = batch.map((item) => buildText(item, fields));
      const embeddings = await generateEmbeddings(texts);

      const points = batch.map((item, i) => ({
        id: itemId(item, start + i),
        vector: embeddings[i] ?? [],
        payload: pointPayload(item, start + i),
      }));

      await upsertPoints(name, points, skipped, streak);
      indexed += batch.length;
      setJobState(dbName, "index", {
        status: "running",
        fetched: indexed,
        total: items.length,
      });
      log.info(
        `[vector-search] Indexed batch ${Math.floor(start / BATCH_SIZE) + 1} (${batch.length} items) for "${dbName}"`
      );
    }

    if (skipped.length > 50) {
      throw new Error(`Skipped ${skipped.length} descriptions`);
    }
    if (skipped.length > 0) {
      log.warn({ count: skipped.length, sample: skipped.slice(0, 20) }, "[vector-search] some descriptions were skipped");
    }

    setJobState(dbName, "index", {
      status: "done",
      fetched: items.length,
      total: items.length,
      finishedAt: new Date().toISOString(),
    });
    log.info(`[vector-search] Indexed ${items.length} items for "${dbName}"`);
    try {
      const { invalidateDatabaseSearchCache } = await import("./database-search");
      await invalidateDatabaseSearchCache(dbName);
    } catch (invErr) {
      log.warn({ err: invErr, dbName }, "[vector-search] Search cache invalidate failed");
    }
  } catch (err) {
    setJobState(dbName, "index", {
      status: "error",
      error: errorDetail(err),
      finishedAt: new Date().toISOString(),
    });
    log.error({ err: err }, `[vector-search] Failed to index "${dbName}":`);
    resetAvailabilityCache();
    throw err;
  }
}

export function indexItems(
  dbName: string,
  items: Record<string, unknown>[],
  fields: string[],
): Promise<void> {
  indexLatest.set(dbName, { items, fields });
  const existing = indexInFlight.get(dbName);
  if (existing) return existing;
  const run = (async () => {
    let error: unknown;
    for (;;) {
      const next = indexLatest.get(dbName);
      if (!next) break;
      indexLatest.delete(dbName);
      try {
        await runIndex(dbName, next.items, next.fields);
        error = undefined;
      } catch (err) {
        error = err;
      }
    }
    if (error) throw error;
  })().finally(() => {
    if (indexInFlight.get(dbName) === run) indexInFlight.delete(dbName);
  });
  indexInFlight.set(dbName, run);
  return run;
}

/**
 * Second pass: the same phrase, only against chunks of the codes the first pass returned.
 * The home search and the nightly description sync do not call this.
 */
export async function searchChunks(
  query: string,
  destinyCodes: string[],
  limit = 10,
  localeFilter?: string,
): Promise<SearchResult[]> {
  const codes = destinyCodes.map((code) => code.trim()).filter(Boolean);
  if (!query.trim() || codes.length === 0) return [];
  if (!(await isAvailable())) return [];

  try {
    const client = getQdrantClient();
    const [queryEmbedding] = await generateEmbeddings([query]);
    const results = await client.search(legacyCollectionName(CATALOG_CHUNKS_DB_NAME), {
      vector: queryEmbedding,
      limit,
      filter: vectorSearchFilter({ locale: localeFilter, destinyCodes: codes }),
      with_payload: true,
    });
    return results.map((r) => {
      const payload = r.payload as Record<string, unknown> | null | undefined;
      return {
        slug: String(payload?.slug ?? r.id),
        score: r.score,
        destiny_code: typeof payload?.destiny_code === "string" ? payload.destiny_code : undefined,
        kind: typeof payload?.kind === "string" ? payload.kind : undefined,
      };
    });
  } catch (err) {
    log.error({ err }, "[vector-search] Chunk search failed");
    resetAvailabilityCache();
    return [];
  }
}
