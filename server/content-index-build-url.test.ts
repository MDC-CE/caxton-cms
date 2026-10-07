import { describe, expect, it } from "vitest";
import { ContentIndex } from "./content-index";

describe("ContentIndex.buildUrl reserved slugs", () => {
  const ci = Object.create(ContentIndex.prototype) as ContentIndex & {
    contentTypeConfigs: Record<string, { directory: string; url_pattern: Record<string, string> }>;
    normalizeType: (t: string) => string;
  };
  ci.contentTypeConfigs = {
    program: {
      directory: "programs",
      url_pattern: {
        en: "/en/career-programs/:slug",
        es: "/es/programas-de-carrera/:slug",
      },
    },
    landing: {
      directory: "landings",
      url_pattern: {
        default: "/landing/:slug",
      },
    },
  };
  ci.normalizeType = (t: string) => t;

  it("returns empty for nullish or reserved slugs", () => {
    expect(ci.buildUrl("program", "en", "null")).toBe("");
    expect(ci.buildUrl("program", "en", "undefined")).toBe("");
    expect(ci.buildUrl("landing", "en", "inline")).toBe("");
    expect(ci.buildUrl("program", "en", null as unknown as string)).toBe("");
  });

  it("still builds valid program URLs", () => {
    expect(ci.buildUrl("program", "en", "full-stack")).toBe("/en/career-programs/full-stack");
    expect(ci.buildUrl("landing", "en", "ai-engineering")).toBe("/landing/ai-engineering");
  });

  it("does not coerce nullish params to the string null", () => {
    ci.contentTypeConfigs.program.url_pattern.en = "/en/career-programs/:slug/:campus";
    expect(
      ci.buildUrl("program", "en", "full-stack", {
        campus: null as unknown as string,
      }),
    ).toBe("/en/career-programs/full-stack/");
    expect(
      ci.buildUrl("program", "en", "full-stack", {
        campus: "null",
      }),
    ).toBe("/en/career-programs/full-stack/");
  });
});
