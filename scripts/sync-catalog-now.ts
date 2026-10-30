/**
 * Pull the Destiny catalog now and build the description search index.
 * The nightly poll still runs at 03:00 America/New_York.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  CATALOG_DESCRIPTIONS_DB_NAME,
  DESCRIPTION_VECTOR_FIELDS,
  fetchAllCatalog,
  playgroundCatalogBaseUrl,
} from "@shared/playground-catalog";
import { syncCatalogNow } from "../server/jobs/definitions/playground-catalog-poll";
import {
  CATALOG_CONTENT_ROOT_NAME,
  catalogToken,
  writeCatalogSnapshot,
} from "../server/playground-catalog-sync";
import { indexItems, isAvailable } from "../server/vector-search";

const token = catalogToken();
if (!token) {
  throw new Error("CAXTON_CATALOG_TOKEN is not set");
}

let report: Record<string, unknown>;
try {
  report = await syncCatalogNow();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (!message.includes("is not loaded")) throw err;

  const contentRoot = path.join(process.cwd(), CATALOG_CONTENT_ROOT_NAME);
  const items = await fetchAllCatalog(playgroundCatalogBaseUrl(), token);
  const written = writeCatalogSnapshot(contentRoot, items, new Date().toISOString());
  report = {
    ...written,
    items: items.length,
    contentRoot: CATALOG_CONTENT_ROOT_NAME,
    loadedSite: false,
  };

  if (await isAvailable()) {
    const file = path.join(contentRoot, "db", CATALOG_DESCRIPTIONS_DB_NAME, "items.json");
    const descriptions = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>[];
    await indexItems(CATALOG_DESCRIPTIONS_DB_NAME, descriptions, [...DESCRIPTION_VECTOR_FIELDS]);
    report.indexed = descriptions.length;
  } else {
    report.indexed = 0;
    report.vectorStore = "unavailable";
  }
}

console.log(JSON.stringify({ ok: true, report }));
