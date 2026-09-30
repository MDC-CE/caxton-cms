import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anchors = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("./utils/sectionAnchors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils/sectionAnchors")>()),
  readSectionAnchors: () => ({ aliases: { "hero-1": "gone", "old-section": null }, dependants: {} }),
  writeSectionAnchors: anchors.write,
}));

import { ContentIndex } from "./content-index";
import { resetRegistry } from "./content-types";
import { loadEntryForDelivery, loadMergedSinglePage } from "./entry-delivery";
import { resetVariableManagerCache } from "./variable-manager";
import { mockDatabase } from "./test-helpers/mock-database";

const ORIGINAL_CWD = process.cwd();
let tempDir: string;
let contentRoot: string;
let ci: ContentIndex;
let cachedItems: Record<string, unknown>[] | null;
let refreshes: string[];

function write(rel: string, body: string) {
  const full = path.join(contentRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf-8");
}

function buildIndex() {
  resetRegistry(contentRoot);
  ci = new ContentIndex(contentRoot);
  ci.scanFast();
  vi.spyOn(ci, "getDatabase").mockReturnValue(
    mockDatabase((name) => (name === "exercises" ? cachedItems : null), {
      onRefresh: (name) => refreshes.push(name),
    }),
  );
}

const TEMPLATE = (type: string) => `meta:
  page_title: "{{ entry.title }} | ${type}"
sections:
  - type: hero
    section_id: hero-1
    title: "{{ entry.title }}"
`;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "entry-delivery-test-"));
  contentRoot = path.join(tempDir, "site_test");
  fs.mkdirSync(contentRoot, { recursive: true });
  write(
    "content-types.yml",
    `exercise:
  directory: exercises
  single_template: true
  database:
    slug: exercises
  field_mapping:
    _slug: slug
    _locale: lang
    title: title
  url_pattern:
    en: /en/exercise/:slug
    es: /es/ejercicio/:slug
blog:
  directory: blog
  single_template: true
  field_mapping:
    title: title
  url_pattern:
    en: /en/blog/:slug
`,
  );
  write("exercises/template.en.yml", TEMPLATE("Exercises"));
  write("exercises/template.es.yml", TEMPLATE("Ejercicios"));
  write("blog/template.en.yml", TEMPLATE("Blog"));
  write("blog/real-post/en.yml", "title: Real Post\n");
  cachedItems = [{ slug: "bootstrap-exercises", lang: "en", title: "Bootstrap Exercises" }];
  refreshes = [];
  anchors.write.mockClear();
  process.chdir(tempDir);
  resetVariableManagerCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(ORIGINAL_CWD);
  resetRegistry(contentRoot);
  resetVariableManagerCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("loadEntryForDelivery: database and static pages share one path", () => {
  it("serves a database page: template sections, item fields in page data and singleEntry", async () => {
    buildIndex();
    const page = await loadEntryForDelivery(ci, "exercise", "bootstrap-exercises", "en");
    expect(page).not.toBeNull();
    expect(page!.data.title).toBe("Bootstrap Exercises");
    expect((page!.data.sections as Array<{ type: string }>).map((s) => s.type)).toEqual(["hero"]);
    expect(page!.singleEntry?.title).toBe("Bootstrap Exercises");
    expect(page!.detached).toBe(false);
    expect(refreshes).toEqual(["exercises"]);
  });

  it("serves a static attached page the same way (no refresh for file entries)", async () => {
    buildIndex();
    const page = await loadEntryForDelivery(ci, "blog", "real-post", "en");
    expect(page!.data.title).toBe("Real Post");
    expect((page!.data.sections as unknown[]).length).toBe(1);
    expect(page!.singleEntry?.title).toBe("Real Post");
    expect(refreshes).toEqual([]);
  });

  it("returns null for a missing item or a language the item is not in (never the template shell)", async () => {
    buildIndex();
    expect(await loadEntryForDelivery(ci, "exercise", "no-such-item", "en")).toBeNull();
    expect(await loadEntryForDelivery(ci, "exercise", "bootstrap-exercises", "es")).toBeNull();
    expect(await loadEntryForDelivery(ci, "blog", "missing-post", "en")).toBeNull();
  });

  it("never writes section anchors while delivering", async () => {
    buildIndex();
    await loadEntryForDelivery(ci, "exercise", "bootstrap-exercises", "en");
    await loadEntryForDelivery(ci, "blog", "real-post", "en");
    expect(anchors.write).not.toHaveBeenCalled();
  });

  it("previews and section edits see the same merge as the page", async () => {
    buildIndex();
    const page = await loadEntryForDelivery(ci, "exercise", "bootstrap-exercises", "en");
    const merged = await loadMergedSinglePage(ci, "exercise", "bootstrap-exercises", "en");
    expect(merged?.meta).toEqual(page!.data.meta);
    expect(merged?.sections).toEqual(page!.data.sections);
  });
});

describe("variants follow the layout owner for static and database pages", () => {
  it.each([
    ["static", "blog", "real-post"],
    ["database", "exercise", "bootstrap-exercises"],
  ])("%s page using the template: a draft changes fields only", async (_kind, type, slug) => {
    write(
      `${type === "blog" ? "blog" : "exercises"}/${slug}/draft.en.yml`,
      [
        "title: Draft Title",
        "field_overrides:",
        "  title: Draft Title",
        "sections:",
        "  - type: faq",
        "",
      ].join("\n"),
    );
    buildIndex();
    const draft = await loadEntryForDelivery(ci, type, slug, "en", { entryVariant: "draft" });
    expect(draft!.data.title).toBe("Draft Title");
    expect((draft!.data.sections as Array<{ type: string }>).map((s) => s.type)).toEqual(["hero"]);
    const live = await loadEntryForDelivery(ci, type, slug, "en");
    expect(live!.data.title).not.toBe("Draft Title");
  });

  it.each([
    ["static", "blog", "real-post"],
    ["database", "exercise", "bootstrap-exercises"],
  ])("%s page: a forced preview of a missing variant returns null, not live", async (_kind, type, slug) => {
    buildIndex();
    expect(await loadEntryForDelivery(ci, type, slug, "en", { entryVariant: "nope" })).toBeNull();
    expect(await loadEntryForDelivery(ci, type, slug, "en", { templateVariant: "nope" })).toBeNull();
  });

  it.each([
    ["static", "blog", "real-post"],
    ["database", "exercise", "bootstrap-exercises"],
  ])("%s page with its own layout (detached): the variant is the whole page", async (_kind, type, slug) => {
    const dir = type === "blog" ? "blog" : "exercises";
    write(`${dir}/${slug}/_common.yml`, "detached: true\n");
    write(`${dir}/${slug}/en.yml`, "title: Own Layout\nsections:\n  - type: hero\n");
    write(`${dir}/${slug}/draft.en.yml`, "title: Own Draft\nsections:\n  - type: faq\n  - type: cta\n");
    buildIndex();
    const live = await loadEntryForDelivery(ci, type, slug, "en");
    expect(live!.detached).toBe(true);
    expect((live!.data.sections as Array<{ type: string }>).map((s) => s.type)).toEqual(["hero"]);
    const draft = await loadEntryForDelivery(ci, type, slug, "en", { entryVariant: "draft" });
    expect((draft!.data.sections as Array<{ type: string }>).map((s) => s.type)).toEqual(["faq", "cta"]);
    expect(await loadEntryForDelivery(ci, type, slug, "en", { entryVariant: "missing" })).toBeNull();
  });
});
