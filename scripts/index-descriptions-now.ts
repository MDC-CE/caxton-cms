/**
 * Embed the description rows already written by the catalog pull.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  CATALOG_DESCRIPTIONS_DB_NAME,
  DESCRIPTION_VECTOR_FIELDS,
} from "@shared/playground-catalog";
import { CATALOG_CONTENT_ROOT_NAME } from "../server/playground-catalog-sync";
import { indexItems } from "../server/vector-search";

const file = path.join(process.cwd(), CATALOG_CONTENT_ROOT_NAME, "db", CATALOG_DESCRIPTIONS_DB_NAME, "items.json");
const descriptions = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>[];
await indexItems(CATALOG_DESCRIPTIONS_DB_NAME, descriptions, [...DESCRIPTION_VECTOR_FIELDS]);
console.log(JSON.stringify({ ok: true, indexed: descriptions.length }));
