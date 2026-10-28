/**
 * Local semantic search for the playground service route.
 * Reads the ce-catalog index only. Does not call the playground catalog API.
 */
import { databaseManager, type DatabaseManager } from "./database";
import {
  SEARCH_CACHE_CEILING,
  searchDatabaseItems,
  type DatabaseSearchResult,
} from "./database-search";
import { getSiteContextMap } from "./site-manager";

export const CATALOG_DB_NAME = "ce-catalog";
const LEARNING_ROOT = "site_learning-mdc-edu";

export type CatalogServiceKind = "course" | "content_piece";
export type CatalogServiceLang = "en" | "es" | "ht";

export interface CatalogServiceQuery {
  q: string;
  kind?: CatalogServiceKind;
  offset: number;
  limit: number;
  lang?: CatalogServiceLang;
}

export function resolveCatalogDatabase(): DatabaseManager {
  let sites: ReturnType<typeof getSiteContextMap>;
  try {
    sites = getSiteContextMap();
  } catch {
    return databaseManager;
  }
  for (const ctx of sites.values()) {
    const name = ctx.contentRootName.replace(/\\/g, "/");
    const learning = name === LEARNING_ROOT || name.endsWith(`/${LEARNING_ROOT}`);
    if (learning && ctx.database.exists(CATALOG_DB_NAME)) return ctx.database;
  }
  for (const ctx of sites.values()) {
    if (ctx.database.exists(CATALOG_DB_NAME)) return ctx.database;
  }
  return databaseManager;
}

function pageScores(
  page: Record<string, unknown>[],
  scores: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!scores) return undefined;
  const kept: Record<string, number> = {};
  for (const item of page) {
    const key = String(item.slug ?? item.id ?? "");
    if (!key) continue;
    const score = scores[key];
    if (typeof score === "number") kept[key] = score;
  }
  return Object.keys(kept).length ? kept : undefined;
}

/** Existing semantic search over ce-catalog. Kind narrows the local hits. */
export async function searchLocalCatalog(
  query: CatalogServiceQuery,
  db: DatabaseManager,
): Promise<DatabaseSearchResult> {
  const result = await searchDatabaseItems(CATALOG_DB_NAME, query.q, {
    limit: SEARCH_CACHE_CEILING,
    locale: query.lang,
    db,
    contentFolder: LEARNING_ROOT,
    localOnly: true,
  });
  const matched = query.kind
    ? result.items.filter((item) => item.kind === query.kind)
    : result.items;
  const page = matched.slice(query.offset, query.offset + query.limit);
  const scores = pageScores(page, result.scores);
  return {
    items: page,
    count: matched.length,
    semantic: result.semantic,
    ...(scores ? { scores } : {}),
    ...(result.fallback_reason
      ? { fallback_reason: result.fallback_reason, fallback_message: result.fallback_message }
      : {}),
  };
}
