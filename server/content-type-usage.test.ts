import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { getContentTypeListingUsage, pageReadsDatabase } from "./content-type-usage";

describe("getContentTypeListingUsage", () => {
  let root = "";

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("finds a page that lists a content type and skips unrelated entries", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "html-listings-"));
    fs.writeFileSync(
      path.join(root, "content-types.yml"),
      [
        "page:",
        "  directory: pages",
        "  url_pattern:",
        "    en: /en/:slug",
        "blog:",
        "  directory: blog",
        "  url_pattern:",
        "    en: /en/blog/:category/:slug",
        "",
      ].join("\n"),
    );
    fs.mkdirSync(path.join(root, "pages", "blog"), { recursive: true });
    fs.mkdirSync(path.join(root, "pages", "outcomes"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pages", "blog", "en.yml"),
      [
        "slug: blog",
        "sections:",
        "  - type: list_cards",
        "    dynamic_entries:",
        "      content_type: blog",
        "      item_template:",
        "        title: {{ entry.title }}",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(root, "pages", "outcomes", "en.yml"),
      ["slug: outcomes", "sections:", "  - type: hero", "    title: Outcomes", ""].join("\n"),
    );

    expect(getContentTypeListingUsage(root, "blog")).toEqual([
      { contentType: "page", slug: "blog", locale: "en" },
    ]);
    expect(getContentTypeListingUsage(root, "page")).toEqual([]);
  });
});

describe("pageReadsDatabase", () => {
  it("matches a landing whose section names the database", () => {
    expect(
      pageReadsDatabase(
        { contentType: "page", slug: "home", locale: "en" },
        [{ kind: "direct_database", content_type: "page", slug: "home", locale: "en" }],
      ),
    ).toBe(true);
  });

  it("matches every cached page of a type when the section is on the shared template", () => {
    const queries = [{ kind: "direct_database", content_type: "blog", locale: "es" }];
    expect(
      pageReadsDatabase({ contentType: "blog", slug: "uno", locale: "es" }, queries),
    ).toBe(true);
    expect(
      pageReadsDatabase({ contentType: "blog", slug: "dos", locale: "en" }, queries),
    ).toBe(false);
  });

  it("leaves pages that do not read the database", () => {
    expect(
      pageReadsDatabase(
        { contentType: "page", slug: "pricing", locale: "en" },
        [{ kind: "direct_database", content_type: "page", slug: "home", locale: "en" }],
      ),
    ).toBe(false);
  });

  it("ignores a component picker that is not tied to a page", () => {
    expect(
      pageReadsDatabase(
        { contentType: "testimonials_grid", slug: "home", locale: "en" },
        [{ kind: "field_editor", content_type: "testimonials_grid" }],
      ),
    ).toBe(false);
  });
});
