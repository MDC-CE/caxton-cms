import { describe, expect, it } from "vitest";
import {
  getEagerSectionRefsFromPage,
  areEagerSectionsCached,
} from "@/components/sectionRegistry";

describe("getEagerSectionRefsFromPage", () => {
  it("returns first eager_count sections by default", () => {
    const sections = [
      { type: "hero", variant: "singleColumn" },
      { type: "article", variant: "default" },
      { type: "cta_banner", variant: "default" },
      { type: "faq", variant: "default" },
    ];
    expect(getEagerSectionRefsFromPage(sections)).toEqual([
      { type: "hero", variant: "singleColumn" },
      { type: "article", variant: "default" },
      { type: "cta_banner", variant: "default" },
    ]);
  });

  it("respects load: lazy override", () => {
    const sections = [
      { type: "hero", variant: "singleColumn", load: "lazy" },
      { type: "article", variant: "default" },
    ];
    expect(getEagerSectionRefsFromPage(sections)).toEqual([
      { type: "article", variant: "default" },
    ]);
  });

  it("areEagerSectionsCached is true for empty sections", () => {
    expect(areEagerSectionsCached([])).toBe(true);
    expect(areEagerSectionsCached(undefined)).toBe(true);
  });
});
