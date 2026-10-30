/**
 * Pull the playground catalog over HTTP and store it for the date grid and semantic search.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { indexInFlightFor, indexItems } from "./vector-search";
import { child } from "./logger";
import { getSiteContextMap } from "./site-manager";
import {
  CATALOG_DB_NAME,
  CATALOG_DESCRIPTIONS_DB_NAME,
  DESCRIPTION_VECTOR_FIELDS,
  fetchAllCatalog,
  fetchCatalogDetail,
  nyDateKey,
  offeringsFromCatalog,
  playgroundCatalogBaseUrl,
  toDescriptionDocuments,
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

/**
 * Save description fingerprints from the catalog already on disk.
 * A hung playground download must not leave search on the old index.
 */
export function startCatalogDescriptionReindex(): { documents: number; indexing: "started" | "already_running" } {
  const site = learningSite();
  if (!site) throw new Error(`Site ${CATALOG_CONTENT_ROOT_NAME} is not loaded`);
  const file = path.join(site.contentRoot, "db", CATALOG_DESCRIPTIONS_DB_NAME, "items.json");
  if (!fs.existsSync(file)) throw new Error("Description rows are not on disk yet");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Description rows are not on disk yet");
  const already = Boolean(indexInFlightFor(CATALOG_DESCRIPTIONS_DB_NAME));
  void indexItems(CATALOG_DESCRIPTIONS_DB_NAME, parsed as Record<string, unknown>[], [...DESCRIPTION_VECTOR_FIELDS])
    .catch((err) => log.error({ err }, "[playground-catalog] description reindex failed"));
  return { documents: parsed.length, indexing: already ? "already_running" : "started" };
}

/** Databases the nightly pull reloads. Chunks are not in this list. */
export function catalogDatabasesToRefresh(): string[] {
  return [CATALOG_DB_NAME, CATALOG_DESCRIPTIONS_DB_NAME];
}

function writeYaml(filePath: string, value: Record<string, unknown>): void {
  fs.writeFileSync(filePath, yaml.dump(value));
}

function disableFatCatalogVectors(dbDir: string): void {
  const configPath = path.join(dbDir, "config.yml");
  if (!fs.existsSync(configPath)) {
    writeYaml(configPath, {
      name: CATALOG_DB_NAME,
      description: "Courses and content pieces from the playground catalog, including ESOL.",
      source: { type: "local", local: { filename: "items.json" } },
      cache: { ttl_minutes: 1440 },
      vector_search: {
        enabled: false,
        fields: ["title", "description", "program_area_name", "kind"],
      },
      search_fields: ["title", "description", "program_area_name", "destiny_code", "landing_slug", "kind"],
    });
    return;
  }
  const loaded = yaml.load(fs.readFileSync(configPath, "utf8"));
  const config = loaded && typeof loaded === "object" ? loaded as Record<string, unknown> : {};
  const current = config.vector_search;
  const fields = current && typeof current === "object" && Array.isArray((current as { fields?: unknown }).fields)
    ? (current as { fields: string[] }).fields
    : ["title", "description", "program_area_name", "kind"];
  config.vector_search = { ...(current && typeof current === "object" ? current as object : {}), enabled: false, fields };
  writeYaml(configPath, config);
}

export function writeCatalogSnapshot(contentRoot: string, items: CatalogItem[], fetchedAt: string): {
  offerings: number;
  documents: number;
  descriptionDocuments: number;
} {
  const today = nyDateKey(new Date(fetchedAt));
  const offerings = offeringsFromCatalog(items, today);
  const documents = toSearchDocuments(items);
  const descriptions = toDescriptionDocuments(items);
  const dataDir = path.join(contentRoot, "data");
  const dbDir = path.join(contentRoot, "db", CATALOG_DB_NAME);
  const descriptionsDir = path.join(contentRoot, "db", CATALOG_DESCRIPTIONS_DB_NAME);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(descriptionsDir, { recursive: true });

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
  disableFatCatalogVectors(dbDir);

  fs.writeFileSync(path.join(descriptionsDir, "items.json"), `${JSON.stringify(descriptions, null, 2)}\n`);
  writeYaml(path.join(descriptionsDir, "config.yml"), {
    name: CATALOG_DESCRIPTIONS_DB_NAME,
    description: "Destiny descriptions for semantic search. One row per language and destiny code.",
    source: { type: "local", local: { filename: "items.json" } },
    cache: { ttl_minutes: 1440 },
    vector_search: {
      enabled: true,
      fields: [...DESCRIPTION_VECTOR_FIELDS],
    },
    search_fields: ["description", "destiny_code"],
  });

  return {
    offerings: offerings.length,
    documents: documents.length,
    descriptionDocuments: descriptions.length,
  };
}

export async function syncPlaygroundCatalog(): Promise<{
  items: number;
  offerings: number;
  documents: number;
  descriptionDocuments: number;
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
  for (const name of catalogDatabasesToRefresh()) {
    await site.database.fetchItems(name, true);
    const pending = indexInFlightFor(name);
    if (pending) await pending;
  }

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
