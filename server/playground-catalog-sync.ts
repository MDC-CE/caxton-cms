/**
 * Pull the playground catalog over HTTP and store it for the date grid and semantic search.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { child } from "./logger";
import { getSiteContextMap } from "./site-manager";
import {
  CATALOG_DB_NAME,
  fetchAllCatalog,
  fetchCatalogDetail,
  nyDateKey,
  offeringsFromCatalog,
  playgroundCatalogBaseUrl,
  toSearchDocuments,
  type CatalogItem,
  type CatalogKind,
  type CatalogLang,
} from "@shared/playground-catalog";

const log = child({ module: "playground-catalog" });

export const CATALOG_CONTENT_ROOT_NAME = "site_learning-mdc-edu";

export function catalogToken(env: NodeJS.ProcessEnv = process.env): string {
  return env.CAXTON_CATALOG_TOKEN?.trim() || "";
}

function learningSite() {
  for (const ctx of getSiteContextMap().values()) {
    if (ctx.contentRootName === CATALOG_CONTENT_ROOT_NAME) return ctx;
  }
  return null;
}

export function writeCatalogSnapshot(contentRoot: string, items: CatalogItem[], fetchedAt: string): {
  offerings: number;
  documents: number;
} {
  const today = nyDateKey(new Date(fetchedAt));
  const offerings = offeringsFromCatalog(items, today);
  const documents = toSearchDocuments(items);
  const dataDir = path.join(contentRoot, "data");
  const dbDir = path.join(contentRoot, "db", CATALOG_DB_NAME);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(dbDir, { recursive: true });

  const offeringsFile = path.join(dataDir, "ce-offerings.json");
  fs.writeFileSync(
    offeringsFile,
    `${JSON.stringify({
      source: "Playground catalog API /api/v2/destiny/catalog. Not a SQL dump.",
      fetched_at: fetchedAt,
      generated_on: today,
      offerings,
    }, null, 2)}\n`,
  );

  fs.writeFileSync(path.join(dbDir, "items.json"), `${JSON.stringify(documents, null, 2)}\n`);
  const configPath = path.join(dbDir, "config.yml");
  if (!fs.existsSync(configPath)) {
    const config = {
      name: CATALOG_DB_NAME,
      description: "Courses and content pieces from the playground catalog, including ESOL.",
      source: { type: "local", local: { filename: "items.json" } },
      cache: { ttl_minutes: 1440 },
      vector_search: {
        enabled: true,
        fields: ["title", "description", "program_area_name", "kind"],
      },
      search_fields: ["title", "description", "program_area_name", "destiny_code", "landing_slug", "kind"],
    };
    fs.writeFileSync(configPath, yaml.dump(config));
  }
  return { offerings: offerings.length, documents: documents.length };
}

export async function syncPlaygroundCatalog(): Promise<{
  items: number;
  offerings: number;
  documents: number;
  contentRoot: string;
}> {
  const token = catalogToken();
  if (!token) throw new Error("CAXTON_CATALOG_TOKEN is not set");
  const site = learningSite();
  if (!site) throw new Error(`Site ${CATALOG_CONTENT_ROOT_NAME} is not loaded`);

  const baseUrl = playgroundCatalogBaseUrl();
  const items = await fetchAllCatalog(baseUrl, token);
  const fetchedAt = new Date().toISOString();
  const written = writeCatalogSnapshot(site.contentRoot, items, fetchedAt);

  site.database.reload();
  await site.database.fetchItems(CATALOG_DB_NAME, true);

  log.info(
    { items: items.length, ...written, contentRoot: site.contentRootName },
    "[playground-catalog] synced",
  );
  return { items: items.length, ...written, contentRoot: site.contentRoot };
}

/** One catalog row. Same HTTP client the nightly poll uses for the list. */
export async function readCatalogItem(
  kind: CatalogKind,
  destinyCode: string,
  lang: CatalogLang = "en",
): Promise<CatalogItem> {
  const token = catalogToken();
  if (!token) throw new Error("CAXTON_CATALOG_TOKEN is not set");
  return fetchCatalogDetail(playgroundCatalogBaseUrl(), token, kind, destinyCode, lang);
}
