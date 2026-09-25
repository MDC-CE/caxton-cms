import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import { seoDepthValidator } from "./seo-depth";
import { seoDuplicatesValidator } from "./seo-duplicates";
import { resetVariableManagerCache } from "../../../server/variable-manager";
import * as resolveTemplateVars from "../../../server/resolve-template-vars";
import * as resolveEntryMetaModule from "../../../server/resolve-entry-meta";
import { makeSeoContentRoot, makeSeoContext, writeSeoEntry } from "../shared/seoTestFixtures";

const GOOD_DESCRIPTION =
  "Learn AI engineering with mentors, real projects and career support until you get hired.";

describe("seo-depth / seo-duplicates on filled-in meta", () => {
  let root: string;

  beforeEach(() => {
    root = makeSeoContentRoot();
    resetVariableManagerCache();
  });

  afterEach(() => {
    resetVariableManagerCache();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("measures a templated title after filling it in", async () => {
    const files = writeSeoEntry(root, "ai-miami", {
      locales: {
        en: {
          title: "AI Engineering Bootcamp in Miami",
          meta: {
            page_title: "{{ entry.title }} | 4Geeks",
            description: GOOD_DESCRIPTION,
            og_image: "https://example.com/og.png",
          },
        },
      },
    });
    const result = await seoDepthValidator.run(makeSeoContext(root, files));
    const codes = result.warnings.map((w) => w.code);
    expect(codes).not.toContain("TITLE_TOO_SHORT");
    expect(result.artifacts?.pagesWithOptimalTitles).toBe(1);
  });

  it("quotes the filled-in title when it is too short", async () => {
    const files = writeSeoEntry(root, "ai", {
      locales: {
        en: {
          title: "AI",
          meta: {
            page_title: "{{ entry.title }} | 4Geeks",
            description: GOOD_DESCRIPTION,
            og_image: "https://example.com/og.png",
          },
        },
      },
    });
    const result = await seoDepthValidator.run(makeSeoContext(root, files));
    const short = result.warnings.find((w) => w.code === "TITLE_TOO_SHORT");
    expect(short?.message).toContain('"AI | 4Geeks"');
  });

  it("skips length checks when a template is still unresolved", async () => {
    vi.spyOn(resolveTemplateVars, "resolveAllTemplateVars").mockReturnValue({
      page_title: "{{ still.unresolved }}",
      description: "{{ still.unresolved }}",
      og_image: "https://example.com/og.png",
    });
    const files = writeSeoEntry(root, "ai", {
      locales: { en: { meta: { page_title: "{{ still.unresolved }}" } } },
    });
    const result = await seoDepthValidator.run(makeSeoContext(root, files));
    const codes = result.warnings.map((w) => w.code);
    expect(codes).not.toContain("TITLE_TOO_SHORT");
    expect(codes).not.toContain("DESCRIPTION_TOO_SHORT");
  });

  it("treats a templated og_image with no value as missing", async () => {
    const files = writeSeoEntry(root, "ai-miami", {
      locales: {
        en: {
          title: "AI Engineering Bootcamp in Miami",
          meta: {
            page_title: "{{ entry.title }} | 4Geeks",
            description: GOOD_DESCRIPTION,
            og_image: "{{ entry.image }}",
          },
        },
      },
    });
    const result = await seoDepthValidator.run(makeSeoContext(root, files));
    const og = result.warnings.find((w) => w.code === "MISSING_OG_IMAGE");
    expect(og?.message).toContain("variable that has no value");
  });

  it("does not flag a templated og_image when the type generates preview images", async () => {
    fs.rmSync(root, { recursive: true, force: true });
    root = makeSeoContentRoot({ title: "title" }, { preview: { component: "og_image_preview" } });
    resetVariableManagerCache();
    const files = writeSeoEntry(root, "ai-miami", {
      locales: {
        en: {
          title: "AI Engineering Bootcamp in Miami",
          meta: {
            page_title: "{{ entry.title }} | 4Geeks",
            description: GOOD_DESCRIPTION,
            og_image: "{{ entry.image }}",
          },
        },
      },
    });
    const result = await seoDepthValidator.run(makeSeoContext(root, files));
    expect(result.warnings.some((w) => w.code === "MISSING_OG_IMAGE")).toBe(false);
  });

  it("reports META_RESOLVE_FAILED for the broken page only", async () => {
    const original = resolveEntryMetaModule.resolveEntryMeta;
    vi.spyOn(resolveEntryMetaModule, "resolveEntryMeta").mockImplementation((opts) => {
      if (opts.slug === "broken") throw new Error("bad field mapping");
      return original(opts);
    });
    const files = [
      ...writeSeoEntry(root, "broken", {
        locales: { en: { meta: { page_title: "x" } } },
      }),
      ...writeSeoEntry(root, "ok", {
        locales: { en: { title: "AI", meta: { page_title: "{{ entry.title }} | 4Geeks" } } },
      }),
    ];
    const result = await seoDepthValidator.run(makeSeoContext(root, files));
    const failed = result.warnings.filter((w) => w.code === "META_RESOLVE_FAILED");
    expect(failed).toHaveLength(1);
    expect(failed[0].file).toBe("landings/broken/en.yml");
    expect(failed[0].message).toContain("bad field mapping");
    expect(result.warnings.some((w) => w.code === "TITLE_TOO_SHORT" && w.file === "landings/ok/en.yml")).toBe(true);
    expect(result.warnings.some((w) => w.file === "landings/broken/en.yml" && w.code !== "META_RESOLVE_FAILED")).toBe(false);
  });

  it("does not flag templated pages with different filled-in titles as duplicates", async () => {
    const files = [
      ...writeSeoEntry(root, "a", {
        locales: { en: { title: "AI Engineering Bootcamp", meta: { page_title: "{{ entry.title }} | 4Geeks" } } },
      }),
      ...writeSeoEntry(root, "b", {
        locales: { en: { title: "Data Science Bootcamp", meta: { page_title: "{{ entry.title }} | 4Geeks" } } },
      }),
    ];
    const result = await seoDuplicatesValidator.run(makeSeoContext(root, files));
    expect(result.errors.some((e) => e.code === "DUPLICATE_TITLE")).toBe(false);
  });

  it("flags the same filled-in title across languages", async () => {
    const files = writeSeoEntry(root, "outcomes", {
      locales: {
        en: { title: "Outcome Report", meta: { page_title: "{{ entry.title }} | 4Geeks" } },
        es: { title: "Outcome Report", meta: { page_title: "{{ entry.title }} | 4Geeks" } },
      },
    });
    const result = await seoDuplicatesValidator.run(makeSeoContext(root, files));
    const dup = result.errors.find((e) => e.code === "DUPLICATE_TITLE");
    expect(dup?.message).toContain('"Outcome Report | 4Geeks"');
    expect(dup?.suggestion).toContain("landings/outcomes/es.yml (es)");
    expect(dup?.suggestion).toContain("en.yml / es.yml");
  });
});
