import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../server/database";
import { resetRegistry } from "../../server/content-types";
import {
  entryLocales,
  entryNotFoundNote,
  loadPage,
  loadVariantPage,
  resolveContentType,
  scanPages,
} from "./content";
import { resetEntrySourceRoots } from "./entry-source";

let tempDir: string;
let contentRoot: string;
let dbName: string;
let db: DatabaseManager;

function write(rel: string, body: string) {
  const full = path.join(contentRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf-8");
}

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-entry-layer-"));
  contentRoot = path.join(tempDir, "site_test");
  dbName = `mcp-entries-${Math.random().toString(36).slice(2, 10)}`;
  write(
    "content-types.yml",
    yaml.dump({
      exercise: {
        directory: "exercises",
        single_template: true,
        database: { slug: dbName },
        field_mapping: { _slug: "slug", _locale: "lang", title: "title", description: "description" },
        url_pattern: { en: "/en/exercise/:slug", es: "/es/ejercicio/:slug" },
      },
      page: { directory: "pages", url_pattern: { en: "/en/:slug" } },
    }),
  );
  write("exercises/template.en.yml", `sections:\n  - type: hero\n    title: "{{ entry.title }}"\n`);
  write("pages/about/en.yml", yaml.dump({ title: "About" }));
  write(
    "exercises/flexbox/en.yml",
    yaml.dump({ field_overrides: { title: "Flexbox (edited)" }, meta: { redirects: ["/en/old-flexbox"] } }),
  );
  write("exercises/flexbox/draft-v2.en.yml", yaml.dump({ description: "Draft description" }));

  const dbDir = path.join(contentRoot, "db", dbName);
  fs.mkdirSync(dbDir, { recursive: true });
  fs.writeFileSync(
    path.join(dbDir, "config.yml"),
    yaml.dump({ name: "Exercises", source: { type: "local", local: { filename: "rows.yml" } } }),
  );
  fs.writeFileSync(
    path.join(dbDir, "rows.yml"),
    yaml.dump([
      { slug: "flexbox", lang: "en", title: "Flexbox", description: "Layouts", repo: "x" },
      { slug: "bootstrap", lang: "en", title: "Bootstrap", description: "Grids" },
    ]),
  );
  db = new DatabaseManager(contentRoot);
  db.reload();
  await db.fetchItems(dbName, true);
  resetRegistry(contentRoot);
  resetEntrySourceRoots();
});

afterEach(() => {
  db.clearCache(dbName);
  resetRegistry(contentRoot);
  resetEntrySourceRoots();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("MCP entry reads (database entries are just entries)", () => {
  it("resolves a database slug with and without a type hint; a typo is not found", () => {
    expect(resolveContentType("bootstrap", "exercise", contentRoot)?.contentType).toBe("exercise");
    expect(resolveContentType("bootstrap", undefined, contentRoot)?.contentType).toBe("exercise");
    expect(resolveContentType("about", undefined, contentRoot)?.contentType).toBe("page");
    expect(resolveContentType("bootstrapp", "exercise", contentRoot)).toBeNull();
    expect(resolveContentType("bootstrapp", undefined, contentRoot)).toBeNull();
  });

  it("loads the entry layer: mapped fields with overrides, plus the entry's own file", () => {
    const page = loadPage("exercise", "flexbox", "en", contentRoot);
    expect(page?.data.title).toBe("Flexbox (edited)");
    expect(page?.data.description).toBe("Layouts");
    expect(page?.data.repo).toBeUndefined();
    expect(page?.data.field_overrides).toBeUndefined();
    expect((page?.data.meta as { redirects: string[] }).redirects).toEqual(["/en/old-flexbox"]);
    expect(page?.filePath).toBe(path.join(contentRoot, "exercises", "flexbox", "en.yml"));

    const noFile = loadPage("exercise", "bootstrap", "en", contentRoot);
    expect(noFile?.data.title).toBe("Bootstrap");
    expect(loadPage("exercise", "bootstrap", "es", contentRoot)).toBeNull();
    expect(loadPage("page", "about", "en", contentRoot)?.data).toEqual({ title: "About" });
  });

  it("reads a variant over the item fields", () => {
    const v = loadVariantPage("exercise", "flexbox", "en", "draft-v2", contentRoot);
    expect(v?.data.description).toBe("Draft description");
    expect(v?.data.title).toBe("Flexbox (edited)");
  });

  it("lists database entries with their languages and URLs", () => {
    expect(entryLocales("exercise", "bootstrap", contentRoot)).toEqual(["en"]);
    const pages = scanPages(contentRoot).filter((p) => p.contentType === "exercise");
    expect(pages.map((p) => p.slug).sort()).toEqual(["bootstrap", "flexbox"]);
    const flexbox = pages.find((p) => p.slug === "flexbox")!;
    expect(flexbox.title).toBe("Flexbox (edited)");
    expect(flexbox.urls).toEqual({ en: "/en/exercise/flexbox" });
  });

  it("explains not-found when the database was never copied", () => {
    db.clearCache(dbName);
    resetEntrySourceRoots();
    expect(resolveContentType("bootstrap", "exercise", contentRoot)).toBeNull();
    expect(entryNotFoundNote("exercise", contentRoot)).toContain(`empty_databases: ${dbName}`);
  });
});
