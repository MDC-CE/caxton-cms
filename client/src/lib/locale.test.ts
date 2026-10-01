import { describe, expect, it } from "vitest";
import { buildContentUrlFromPattern } from "./locale";

describe("buildContentUrlFromPattern", () => {
  const pattern = {
    en: "/en/career-programs/:slug",
    es: "/es/programas-de-carrera/:slug",
  };

  it("builds a normal URL", () => {
    expect(buildContentUrlFromPattern(pattern, "full-stack", "en")).toBe(
      "/en/career-programs/full-stack",
    );
  });

  it("returns empty for reserved or nullish slugs", () => {
    expect(buildContentUrlFromPattern(pattern, "null", "en")).toBe("");
    expect(buildContentUrlFromPattern(pattern, "undefined", "es")).toBe("");
    expect(buildContentUrlFromPattern(pattern, "inline", "en")).toBe("");
    expect(buildContentUrlFromPattern(pattern, null as unknown as string, "en")).toBe("");
  });

  it("skips reserved extra params instead of coercing to the string null", () => {
    const withCampus = {
      en: "/en/career-programs/:slug/:campus",
    };
    expect(
      buildContentUrlFromPattern(withCampus, "full-stack", "en", {
        campus: "null",
      }),
    ).toBe("/en/career-programs/full-stack/:campus");
  });
});
