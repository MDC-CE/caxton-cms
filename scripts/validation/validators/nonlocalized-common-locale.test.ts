import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import yaml from "js-yaml";
import {
  nonlocalizedCommonLocaleValidator,
  hasNonlocalizedDefaultUrlPattern,
} from "./nonlocalized-common-locale";
import type { ContentFile, ValidationContext } from "../shared/types";

function makeContext(
  contentRoot: string,
  files: ContentFile[],
  contentIndex?: ValidationContext["contentIndex"],
): ValidationContext {
  return {
    contentRoot,
    contentFiles: files,
    redirectMap: new Map(),
    availableSchemas: new Set(),
    sitemapEntries: [],
    contentIndex,
  };
}

describe("hasNonlocalizedDefaultUrlPattern", () => {
  it("detects url_pattern.default without :locale (e.g. landings)", () => {
    expect(hasNonlocalizedDefaultUrlPattern({ default: "/landing/:slug" })).toBe(true);
  });

  it("rejects patterns that include :locale", () => {
    expect(
      hasNonlocalizedDefaultUrlPattern({ default: "/:locale/landing/:slug" }),
    ).toBe(false);
  });

  it("rejects per-locale url_pattern keys (no default)", () => {
    expect(
      hasNonlocalizedDefaultUrlPattern({
        en: "/en/blog/:slug",
        es: "/es/blog/:slug",
      }),
    ).toBe(false);
  });
});

describe("nonlocalizedCommonLocaleValidator", () => {
  let tmp = "";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nonloc-common-loc-"));
    fs.writeFileSync(
      path.join(tmp, "content-types.yml"),
      yaml.dump({
        landing: {
          directory: "landings",
          url_pattern: { default: "/landing/:slug" },
          field_mapping: { title: "title", locale: "locale", slug: "slug" },
        },
        blog: {
          directory: "blog",
          url_pattern: {
            en: "/en/blog/:slug",
            es: "/es/blog/:slug",
          },
          field_mapping: { title: "title", slug: "slug" },
        },
      }),
    );
    fs.mkdirSync(path.join(tmp, "landings", "ad-mx"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "landings", "chile"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "blog", "post-a"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function mockIndex(commons: Record<string, Record<string, unknown> | null>) {
    return {
      loadCommonData: (contentType: string, slug: string) =>
        commons[`${contentType}/${slug}`] ?? null,
      getAvailableLocalesOrVariants: (contentType: string, slug: string) => {
        // Infer from contentFiles in each test via the context; index may still be asked.
        void contentType;
        void slug;
        return ["es"];
      },
    } as unknown as ValidationContext["contentIndex"];
  }

  it("errors when landing _common.yml has no locale (discovered via live locale file)", async () => {
    const commonPath = path.join(tmp, "landings", "ad-mx", "_common.yml");
    const esPath = path.join(tmp, "landings", "ad-mx", "es.yml");
    fs.writeFileSync(commonPath, yaml.dump({ slug: "ad-mx" }));
    fs.writeFileSync(esPath, yaml.dump({ slug: "ad-mx", title: "MX", locale: "es" }));

    const result = await nonlocalizedCommonLocaleValidator.run(
      makeContext(
        tmp,
        [
          {
            type: "landing",
            slug: "ad-mx",
            locale: "es",
            filePath: esPath,
            title: "MX",
            entryFields: { slug: "ad-mx", title: "MX", locale: "es" },
          },
        ],
        mockIndex({ "landing/ad-mx": { slug: "ad-mx" } }),
      ),
    );

    expect(result.status).toBe("failed");
    const issue = result.errors.find((e) => e.code === "NONLOCALIZED_COMMON_LOCALE_MISSING");
    expect(issue).toBeTruthy();
    // Attach to live locale file so page diagnostics / cache entryKey resolve
    expect(issue?.file).toBe(esPath);
    expect(issue?.suggestion).toMatch(/locale: es/);
  });

  it("passes when landing _common.yml has locale matching es.yml", async () => {
    const commonPath = path.join(tmp, "landings", "chile", "_common.yml");
    const esPath = path.join(tmp, "landings", "chile", "es.yml");
    fs.writeFileSync(commonPath, yaml.dump({ slug: "chile", locale: "es" }));
    fs.writeFileSync(esPath, yaml.dump({ slug: "chile", title: "Chile", locale: "es" }));

    const result = await nonlocalizedCommonLocaleValidator.run(
      makeContext(
        tmp,
        [
          {
            type: "landing",
            slug: "chile",
            locale: "es",
            filePath: esPath,
            title: "Chile",
            entryFields: { slug: "chile", title: "Chile", locale: "es" },
          },
        ],
        mockIndex({ "landing/chile": { slug: "chile", locale: "es" } }),
      ),
    );

    expect(result.status).toBe("passed");
    expect(result.errors).toEqual([]);
  });

  it("errors when common.locale has no matching locale file", async () => {
    const commonPath = path.join(tmp, "landings", "ad-mx", "_common.yml");
    const esPath = path.join(tmp, "landings", "ad-mx", "es.yml");
    fs.writeFileSync(commonPath, yaml.dump({ slug: "ad-mx", locale: "en" }));
    fs.writeFileSync(esPath, yaml.dump({ slug: "ad-mx", title: "MX", locale: "es" }));

    const result = await nonlocalizedCommonLocaleValidator.run(
      makeContext(
        tmp,
        [
          {
            type: "landing",
            slug: "ad-mx",
            locale: "es",
            filePath: esPath,
            title: "MX",
            entryFields: { slug: "ad-mx", title: "MX", locale: "es" },
          },
        ],
        mockIndex({ "landing/ad-mx": { slug: "ad-mx", locale: "en" } }),
      ),
    );

    expect(result.status).toBe("failed");
    expect(result.errors.some((e) => e.code === "NONLOCALIZED_COMMON_LOCALE_NO_FILE")).toBe(
      true,
    );
    expect(result.errors[0]?.file).toBe(esPath);
  });

  it("ignores blog (localized url_pattern, no nonlocalized default)", async () => {
    const esPath = path.join(tmp, "blog", "post-a", "es.yml");
    fs.writeFileSync(esPath, yaml.dump({ slug: "post-a" }));

    const result = await nonlocalizedCommonLocaleValidator.run(
      makeContext(
        tmp,
        [
          {
            type: "blog",
            slug: "post-a",
            locale: "es",
            filePath: esPath,
            title: "post",
            entryFields: { slug: "post-a" },
          },
        ],
        mockIndex({}),
      ),
    );

    expect(result.status).toBe("passed");
    expect(result.errors).toEqual([]);
  });

  it("checks once but fans out to every live locale file in the run", async () => {
    const commonPath = path.join(tmp, "landings", "ad-mx", "_common.yml");
    const esPath = path.join(tmp, "landings", "ad-mx", "es.yml");
    const enPath = path.join(tmp, "landings", "ad-mx", "en.yml");
    fs.writeFileSync(commonPath, yaml.dump({ slug: "ad-mx" }));
    fs.writeFileSync(esPath, yaml.dump({ slug: "ad-mx", locale: "es" }));
    fs.writeFileSync(enPath, yaml.dump({ slug: "ad-mx", locale: "en" }));

    const index = {
      loadCommonData: () => ({ slug: "ad-mx" }),
      getAvailableLocalesOrVariants: () => ["en", "es"],
    } as unknown as ValidationContext["contentIndex"];

    const result = await nonlocalizedCommonLocaleValidator.run(
      makeContext(
        tmp,
        [
          {
            type: "landing",
            slug: "ad-mx",
            locale: "es",
            filePath: esPath,
            title: "MX",
            entryFields: {},
          },
          {
            type: "landing",
            slug: "ad-mx",
            locale: "en",
            filePath: enPath,
            title: "MX EN",
            entryFields: {},
          },
        ],
        index,
      ),
    );

    const missing = result.errors.filter((e) => e.code === "NONLOCALIZED_COMMON_LOCALE_MISSING");
    expect(missing).toHaveLength(2);
    expect(missing.map((e) => e.file).sort()).toEqual([enPath, esPath].sort());
    expect((result.artifacts as { checked?: number })?.checked).toBe(1);
  });
});
