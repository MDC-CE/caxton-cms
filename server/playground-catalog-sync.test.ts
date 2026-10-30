import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  CATALOG_CHUNKS_DB_NAME,
  CATALOG_DB_NAME,
  CATALOG_DESCRIPTIONS_DB_NAME,
  type CatalogItem,
} from "@shared/playground-catalog";
import { catalogDatabasesToRefresh, writeCatalogSnapshot } from "./playground-catalog-sync";

const items: CatalogItem[] = [
  {
    kind: "course",
    destiny_code: "1170129",
    title: "Practical Nursing",
    lang: "en",
    description: "Patient care and the Florida exam.",
    sections: [],
  },
  {
    kind: "content_piece",
    destiny_code: "CM000080",
    title: "A blog post",
    lang: "en",
    description: "",
    sections: [],
  },
];

describe("catalog snapshot", () => {
  it("writes description rows and turns off vectors on the fat catalog", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-snapshot-"));
    const fatConfig = path.join(root, "db", CATALOG_DB_NAME, "config.yml");
    fs.mkdirSync(path.dirname(fatConfig), { recursive: true });
    fs.writeFileSync(fatConfig, yaml.dump({
      name: CATALOG_DB_NAME,
      vector_search: { enabled: true, fields: ["title", "description", "program_area_name", "kind"] },
      search_fields: ["title"],
    }));

    const written = writeCatalogSnapshot(root, items, "2026-10-30T12:00:00.000Z");
    const fat = yaml.load(fs.readFileSync(fatConfig, "utf8")) as {
      vector_search: { enabled: boolean };
      search_fields: string[];
    };
    const descriptions = yaml.load(fs.readFileSync(
      path.join(root, "db", CATALOG_DESCRIPTIONS_DB_NAME, "config.yml"),
      "utf8",
    )) as { vector_search: { enabled: boolean; fields: string[] } };
    const descriptionItems = JSON.parse(fs.readFileSync(
      path.join(root, "db", CATALOG_DESCRIPTIONS_DB_NAME, "items.json"),
      "utf8",
    )) as Array<{ destiny_code: string }>;

    expect(fat.vector_search.enabled).toBe(false);
    expect(fat.search_fields).toEqual(["title"]);
    expect(descriptions.vector_search).toEqual({ enabled: true, fields: ["description"] });
    expect(descriptionItems.map((item) => item.destiny_code)).toEqual(["1170129"]);
    expect(fs.existsSync(path.join(root, "db", CATALOG_CHUNKS_DB_NAME))).toBe(false);
    expect(written.descriptionDocuments).toBe(1);
    expect(catalogDatabasesToRefresh()).toEqual([CATALOG_DB_NAME, CATALOG_DESCRIPTIONS_DB_NAME]);
    expect(catalogDatabasesToRefresh()).not.toContain(CATALOG_CHUNKS_DB_NAME);
  });
});
