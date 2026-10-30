import "dotenv/config";
import fs from "fs";
import path from "path";
import { CATALOG_DESCRIPTIONS_DB_NAME } from "@shared/playground-catalog";
import { CATALOG_CONTENT_ROOT_NAME } from "../server/playground-catalog-sync";
import { search } from "../server/vector-search";

const queries = [
  "become a nurse",
  "to speak English at work",
  "how to fix air conditioners",
  "to get my real estate license",
  "to code",
  "to bake sourdough",
  "how to pass the GED",
  "become an EMT",
  "to speak Spanish with patients",
  "how to build iPhone apps",
  "to get my CNA",
  "become a plumber",
  "how to use ChatGPT at work",
  "to start a small business",
  "become a welder",
  "to teach preschool",
  "how to pass CompTIA",
  "to cook Italian at home",
  "become a phlebotomist",
  "to get my CDL",
  "how to do makeup for film",
  "to pass the TOEFL",
  "become an electrician",
  "to take photos for Instagram",
  "how to write a resume",
];

const file = path.join(process.cwd(), CATALOG_CONTENT_ROOT_NAME, "db", CATALOG_DESCRIPTIONS_DB_NAME, "items.json");
const rows = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{
  slug: string;
  description: string;
  destiny_code: string;
  kind: string;
}>;
const bySlug = new Map(rows.map((row) => [row.slug, row]));

const out: Record<string, unknown[]> = {};
for (const q of queries) {
  const hits = await search(CATALOG_DESCRIPTIONS_DB_NAME, q, 3, "en");
  out[q] = hits.map((hit) => {
    const row = bySlug.get(hit.slug);
    return {
      score: Number(hit.score.toFixed(3)),
      destiny_code: row?.destiny_code ?? hit.destiny_code,
      kind: row?.kind ?? hit.kind,
      description: (row?.description ?? "").replace(/\s+/g, " ").slice(0, 160),
    };
  });
}
console.log(JSON.stringify(out));
