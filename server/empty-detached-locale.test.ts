import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convertEmptyLiveLocaleToDraft } from "./convert-empty-locale-to-draft";
import { assertNotEmptyDetachedLocale } from "./live-entry-seo-gate";
import { detachEntry } from "./shared-layout-detach";
import { isEmptyDetachedLocaleEntry } from "./empty-locale";
import { resetRegistry } from "./content-types";

const ORIGINAL_CWD = process.cwd();
let tempDir: string;
let contentRoot: string;

function writeTypes() {
  fs.writeFileSync(
    path.join(contentRoot, "content-types.yml"),
    `blog:
  directory: blog
  single_template: true
  field_mapping:
    title: title
    description: description
    _slug: slug
    _locale: locale
  url_pattern:
    en: /en/blog/:slug
    es: /es/blog/:slug
downloadable:
  directory: downloadable
  field_mapping:
    title: title
    _slug: slug
    _locale: locale
  url_pattern:
    en: /en/downloadable/:slug
    es: /es/descargable/:slug
`,
    "utf-8",
  );
}

function writeSingleTemplates() {
  const blogDir = path.join(contentRoot, "blog");
  fs.mkdirSync(blogDir, { recursive: true });
  for (const loc of ["en", "es"]) {
    fs.writeFileSync(
      path.join(blogDir, `single.${loc}.yml`),
      [
        "meta:",
        '  page_title: "{{ single.title }}"',
        '  description: "{{ single.description }}"',
        "sections:",
        "  - type: hero",
        "    id: hero-1",
        "    data:",
        '      title: "{{ single.title }}"',
        "",
      ].join("\n"),
      "utf-8",
    );
  }
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "empty-detached-"));
  contentRoot = path.join(tempDir, "site_test");
  fs.mkdirSync(contentRoot, { recursive: true });
  writeTypes();
  writeSingleTemplates();
  process.chdir(tempDir);
  resetRegistry(contentRoot);
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  resetRegistry(contentRoot);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("detachEntry locale inventory", () => {
  it("fails when the entry has zero live locale files", () => {
    const entryDir = path.join(contentRoot, "blog", "lonely");
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(path.join(entryDir, "_common.yml"), "title: Lonely\n", "utf-8");

    expect(() =>
      detachEntry({ contentType: "blog", slug: "lonely", contentRoot }),
    ).toThrow(/no live locale files/i);
  });

  it("bakes only existing locales and does not invent sibling es.yml", () => {
    const entryDir = path.join(contentRoot, "blog", "en-only");
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(
      path.join(entryDir, "_common.yml"),
      "title: EN Only\ndescription: Desc\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(entryDir, "en.yml"),
      "slug: en-only\nsections: []\n",
      "utf-8",
    );

    const result = detachEntry({ contentType: "blog", slug: "en-only", contentRoot });
    expect(result.locales).toEqual(["en"]);
    expect(fs.existsSync(path.join(entryDir, "en.yml"))).toBe(true);
    expect(fs.existsSync(path.join(entryDir, "es.yml"))).toBe(false);
    const common = fs.readFileSync(path.join(entryDir, "_common.yml"), "utf-8");
    expect(common).toMatch(/detached:\s*true/);
    const en = fs.readFileSync(path.join(entryDir, "en.yml"), "utf-8");
    expect(en).toMatch(/type:\s*hero/);
  });
});

describe("convertEmptyLiveLocaleToDraft", () => {
  it("moves empty detached live locale to draft and registers versioning", () => {
    const entryDir = path.join(contentRoot, "blog", "stub");
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(
      path.join(entryDir, "_common.yml"),
      "title: Stub\ndetached: true\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(entryDir, "es.yml"),
      "slug: stub\nsections: []\n",
      "utf-8",
    );

    const merged = { slug: "stub", sections: [] as unknown[] };
    expect(
      isEmptyDetachedLocaleEntry({
        contentType: "blog",
        slug: "stub",
        locale: "es",
        contentRoot,
        merged,
      }),
    ).toBe(true);

    const ci = {
      loadMergedContent: () => ({ data: merged }),
    } as unknown as import("./content-index").ContentIndex;

    const result = convertEmptyLiveLocaleToDraft({
      contentType: "blog",
      slug: "stub",
      locale: "es",
      contentRoot,
      ci,
      author: "test",
    });

    expect(result?.converted).toBe(true);
    expect(fs.existsSync(path.join(entryDir, "es.yml"))).toBe(false);
    expect(fs.existsSync(path.join(entryDir, "draft.es.yml"))).toBe(true);
    const versioning = fs.readFileSync(path.join(entryDir, "versioning.yml"), "utf-8");
    expect(versioning).toMatch(/slug:\s*draft/);
    expect(versioning).toMatch(/allocation:\s*0/);
  });
});

describe("assertNotEmptyDetachedLocale", () => {
  it("blocks empty detached payload and allows content body", () => {
    const entryDir = path.join(contentRoot, "blog", "gate");
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(
      path.join(entryDir, "_common.yml"),
      "title: Gate\ndetached: true\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(entryDir, "en.yml"),
      "slug: gate\nsections: []\n",
      "utf-8",
    );

    const emptyErr = assertNotEmptyDetachedLocale({
      contentType: "blog",
      slug: "gate",
      locale: "en",
      pageData: { sections: [] },
      contentRoot,
    });
    expect(emptyErr).toMatch(/EMPTY_LOCALE/);

    const ok = assertNotEmptyDetachedLocale({
      contentType: "blog",
      slug: "gate",
      locale: "en",
      pageData: { sections: [], content: "Hello body" },
      contentRoot,
    });
    expect(ok).toBeNull();
  });

  it("does not flag attached shared-layout empty sections", () => {
    const entryDir = path.join(contentRoot, "blog", "attached");
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(path.join(entryDir, "_common.yml"), "title: Attached\n", "utf-8");
    fs.writeFileSync(
      path.join(entryDir, "en.yml"),
      "slug: attached\nsections: []\n",
      "utf-8",
    );

    const err = assertNotEmptyDetachedLocale({
      contentType: "blog",
      slug: "attached",
      locale: "en",
      pageData: { sections: [] },
      contentRoot,
    });
    expect(err).toBeNull();
  });

  it("blocks an empty section-built page (not shared layout) and allows sections or body", () => {
    const entryDir = path.join(contentRoot, "downloadable", "kit");
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(path.join(entryDir, "_common.yml"), "slug: kit\n", "utf-8");

    const empty = assertNotEmptyDetachedLocale({
      contentType: "downloadable",
      slug: "kit",
      locale: "en",
      pageData: { title: "Kit" },
      contentRoot,
    });
    expect(empty).toMatch(/^EMPTY_PAGE: downloadable\/kit \(en\)/);

    const withSections = assertNotEmptyDetachedLocale({
      contentType: "downloadable",
      slug: "kit",
      locale: "en",
      pageData: { title: "Kit", sections: [{ type: "hero" }] },
      contentRoot,
    });
    expect(withSections).toBeNull();

    const withBody = assertNotEmptyDetachedLocale({
      contentType: "downloadable",
      slug: "kit",
      locale: "en",
      pageData: { content: "Body" },
      contentRoot,
    });
    expect(withBody).toBeNull();
  });

  it("ignores unknown content types", () => {
    expect(
      assertNotEmptyDetachedLocale({
        contentType: "nope",
        slug: "x",
        locale: "en",
        pageData: {},
        contentRoot,
      }),
    ).toBeNull();
  });
});
