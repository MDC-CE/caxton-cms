import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRegistry } from "./content-types";
import {
  applyFieldUpdates,
  classifyFieldPath,
  readFieldValueAtPath,
} from "./field-write-router";
import { readFunnelBlockFromFile, stripFunnelFromAllLocaleYamls } from "./funnel-fields";

const ORIGINAL_CWD = process.cwd();
let tempDir: string;
let contentRoot: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "field-write-router-"));
  contentRoot = path.join(tempDir, "site_test");
  fs.mkdirSync(path.join(contentRoot, "blog", "post-a"), { recursive: true });
  fs.writeFileSync(
    path.join(contentRoot, "content-types.yml"),
    `blog:
  directory: blog
  single_template: true
  field_mapping:
    title: title
    _slug: slug
    _locale: locale
  url_pattern:
    en: /en/blog/:slug
    es: /es/blog/:slug
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "post-a", "_common.yml"),
    `title: Post A
funnel:
  stage: consideration
  products:
    - ai-engineering
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "post-a", "en.yml"),
    `slug: post-a
title: Post A EN
funnel:
  stage: consideration
  products:
    - persona: the-career-changer
      product: ai-engineering
sections: []
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(contentRoot, "blog", "post-a", "es.yml"),
    `slug: post-a
title: Post A ES
funnel:
  stage: awareness
  products: all
sections: []
`,
    "utf-8",
  );
  process.chdir(tempDir);
  resetRegistry(contentRoot);
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  resetRegistry(contentRoot);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("classifyFieldPath", () => {
  it("routes funnel, seo, common meta, and locale", () => {
    expect(classifyFieldPath("funnel.products")).toBe("funnel");
    expect(classifyFieldPath("funnel.stage")).toBe("funnel");
    expect(classifyFieldPath("seo.main_keyword")).toBe("seo");
    expect(classifyFieldPath("meta.robots")).toBe("meta_common");
    expect(classifyFieldPath("meta.page_title")).toBe("locale");
    expect(classifyFieldPath("meta.custom", "common")).toBe("meta_common");
    expect(classifyFieldPath("title")).toBe("locale");
  });
});

describe("stripFunnelFromAllLocaleYamls", () => {
  it("removes funnel from all locale files, leaves _common", () => {
    const { strippedRelativePaths } = stripFunnelFromAllLocaleYamls(
      "blog",
      "post-a",
      contentRoot,
      "tester",
    );
    expect(strippedRelativePaths.length).toBe(2);
    expect(fs.readFileSync(path.join(contentRoot, "blog", "post-a", "en.yml"), "utf-8")).not.toMatch(
      /^funnel:/m,
    );
    expect(fs.readFileSync(path.join(contentRoot, "blog", "post-a", "es.yml"), "utf-8")).not.toMatch(
      /^funnel:/m,
    );
    expect(readFunnelBlockFromFile(path.join(contentRoot, "blog", "post-a", "_common.yml")).products).toEqual(
      [{ product: "ai-engineering" }],
    );
  });
});

describe("readFieldValueAtPath", () => {
  it("reads funnel from _common only, ignoring locale overlay", () => {
    const { value } = readFieldValueAtPath({
      contentType: "blog",
      slug: "post-a",
      locale: "en",
      field_path: "funnel.products",
      contentRoot,
    });
    expect(value).toEqual([{ product: "ai-engineering" }]);
  });
});

describe("applyFieldUpdates funnel", () => {
  it("writes bindings to _common and strips all locale funnel blocks", async () => {
    const bindings = [
      { persona: "the-career-changer", product: "ai-engineering" },
      { persona: "the-developer", product: "ai-flex" },
    ];
    const result = await applyFieldUpdates({
      contentType: "blog",
      slug: "post-a",
      locale: "en",
      updates: [{ field_path: "funnel.products", value: bindings }],
      author: "tester",
      contentRoot,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "funnel_locale_agnostic")).toBe(true);
    expect(result.warnings.some((w) => w.code === "funnel_stripped_from_locale_yamls")).toBe(true);

    const common = readFunnelBlockFromFile(path.join(contentRoot, "blog", "post-a", "_common.yml"));
    expect(common.products).toEqual([
      { product: "ai-engineering", persona: "the-career-changer" },
      { product: "ai-flex", persona: "the-developer" },
    ]);
    expect(fs.readFileSync(path.join(contentRoot, "blog", "post-a", "en.yml"), "utf-8")).not.toMatch(
      /^funnel:/m,
    );
    expect(fs.readFileSync(path.join(contentRoot, "blog", "post-a", "es.yml"), "utf-8")).not.toMatch(
      /^funnel:/m,
    );
  });

  it("warns funnel_live_despite_variant when variant is set", async () => {
    const result = await applyFieldUpdates({
      contentType: "blog",
      slug: "post-a",
      locale: "en",
      variant: "draft",
      updates: [{ field_path: "funnel.stage", value: "decision" }],
      author: "tester",
      contentRoot,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === "funnel_live_despite_variant")).toBe(true);
    const common = readFunnelBlockFromFile(path.join(contentRoot, "blog", "post-a", "_common.yml"));
    expect(common.stage).toBe("decision");
  });
});
