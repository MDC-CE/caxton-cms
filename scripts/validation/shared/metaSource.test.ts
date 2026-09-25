import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import { findInheritedMetaSource } from "./metaSource";
import { makeSeoContentRoot, makeSeoContext, writeSeoEntry } from "./seoTestFixtures";
import { seoDepthValidator } from "../validators/seo-depth";
import { resetVariableManagerCache } from "../../../server/variable-manager";

describe("findInheritedMetaSource", () => {
  let root: string | undefined;

  afterEach(() => {
    resetVariableManagerCache();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function setup(fieldMapping?: Record<string, string>) {
    root = makeSeoContentRoot(fieldMapping);
    resetVariableManagerCache();
    return root;
  }

  it("flags an entry title that only lives in _common.yml", () => {
    const r = setup();
    const files = writeSeoEntry(r, "outcomes", {
      common: { title: "Outcome Report", meta: { page_title: "{{ entry.title }} | 4Geeks" } },
      locales: { en: {}, es: {} },
    });
    const ctx = makeSeoContext(r, files);
    expect(findInheritedMetaSource(files[1], "page_title", ctx)).toEqual({
      field: "title",
      fromTemplateVar: true,
    });
  });

  it("does not flag when the language file sets the title", () => {
    const r = setup();
    const files = writeSeoEntry(r, "outcomes", {
      common: { title: "Outcome Report", meta: { page_title: "{{ entry.title }} | 4Geeks" } },
      locales: { en: {}, es: { title: "Reporte de Resultados" } },
    });
    const ctx = makeSeoContext(r, files);
    expect(findInheritedMetaSource(files[1], "page_title", ctx)).toBeNull();
  });

  it("flags a plain-text page_title that only lives in _common.yml", () => {
    const r = setup();
    const files = writeSeoEntry(r, "outcomes", {
      common: { meta: { page_title: "Outcome Report | 4Geeks" } },
      locales: { en: {}, es: {} },
    });
    const ctx = makeSeoContext(r, files);
    expect(findInheritedMetaSource(files[0], "page_title", ctx)).toEqual({
      field: "meta.page_title",
      fromTemplateVar: false,
    });
  });

  it("flags {{ entry.description }} when description only lives in _common.yml", () => {
    const r = setup({ title: "title", description: "description" });
    const files = writeSeoEntry(r, "outcomes", {
      common: { description: "Shared copy", meta: { description: "{{ entry.description }}" } },
      locales: { en: {}, es: {} },
    });
    const ctx = makeSeoContext(r, files);
    expect(findInheritedMetaSource(files[1], "description", ctx)).toEqual({
      field: "description",
      fromTemplateVar: true,
    });
  });

  it("flags a canonical_url in _common.yml", () => {
    const r = setup();
    const files = writeSeoEntry(r, "outcomes", {
      common: { meta: { canonical_url: "https://4geeks.com/outcomes" } },
      locales: { en: {}, es: {} },
    });
    const ctx = makeSeoContext(r, files);
    expect(findInheritedMetaSource(files[1], "canonical_url", ctx)?.field).toBe("meta.canonical_url");
  });

  it("skips single-language entries", () => {
    const r = setup();
    const files = writeSeoEntry(r, "outcomes", {
      common: { title: "Outcome Report", meta: { page_title: "{{ entry.title }} | 4Geeks" } },
      locales: { en: {} },
    });
    const ctx = makeSeoContext(r, files);
    expect(findInheritedMetaSource(files[0], "page_title", ctx)).toBeNull();
  });

  it("follows the field mapping (title -> hero.title)", () => {
    const r = setup({ title: "hero.title" });
    const files = writeSeoEntry(r, "outcomes", {
      common: { hero: { title: "Outcome Report" }, meta: { page_title: "{{ entry.title }} | 4Geeks" } },
      locales: { en: {}, es: {} },
    });
    const ctx = makeSeoContext(r, files);
    expect(findInheritedMetaSource(files[1], "page_title", ctx)?.field).toBe("hero.title");
  });

  it("seo-depth emits the three codes and ignores shared og_image / robots", async () => {
    const r = setup({ title: "title", description: "description" });
    const files = writeSeoEntry(r, "outcomes", {
      common: {
        title: "Outcome Report",
        description: "Shared description",
        meta: {
          page_title: "{{ entry.title }} | 4Geeks",
          description: "{{ entry.description }}",
          canonical_url: "https://4geeks.com/outcomes",
          og_image: "https://example.com/og.png",
          robots: "index, follow",
        },
      },
      locales: { en: {}, es: {} },
    });
    const result = await seoDepthValidator.run(makeSeoContext(r, files));
    const esCodes = result.warnings
      .filter((w) => w.file === "landings/outcomes/es.yml")
      .map((w) => w.code);
    expect(esCodes).toEqual(
      expect.arrayContaining([
        "TITLE_INHERITED_FROM_COMMON",
        "DESCRIPTION_INHERITED_FROM_COMMON",
        "CANONICAL_INHERITED_FROM_COMMON",
      ]),
    );
    expect(esCodes).not.toContain("MISSING_OG_IMAGE");
    const title = result.warnings.find(
      (w) => w.code === "TITLE_INHERITED_FROM_COMMON" && w.file === "landings/outcomes/es.yml",
    );
    expect(title?.message).toContain('"Outcome Report | 4Geeks"');
    expect(title?.suggestion).toBe("Set a translated title in es.yml");
  });
});
