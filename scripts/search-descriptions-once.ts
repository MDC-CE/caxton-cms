import "dotenv/config";
import fs from "fs";
import path from "path";
import { CATALOG_DESCRIPTIONS_DB_NAME } from "@shared/playground-catalog";
import { CATALOG_CONTENT_ROOT_NAME } from "../server/playground-catalog-sync";
import { search } from "../server/vector-search";

const file = path.join(process.cwd(), CATALOG_CONTENT_ROOT_NAME, "db", CATALOG_DESCRIPTIONS_DB_NAME, "items.json");
const rows = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{ slug: string; description: string; destiny_code: string; kind: string }>;
const bySlug = new Map(rows.map((row) => [row.slug, row]));
const hits = await search(CATALOG_DESCRIPTIONS_DB_NAME, "to code", 5, "en", "course");
console.log(JSON.stringify(hits.map((hit) => {
  const row = bySlug.get(hit.slug);
  return {
    score: Number(hit.score.toFixed(3)),
    destiny_code: row?.destiny_code ?? hit.destiny_code,
    kind: row?.kind,
    description: row?.description?.slice(0, 180),
  };
}), null, 2));
