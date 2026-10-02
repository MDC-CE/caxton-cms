import { describe, expect, it } from "vitest";
import { evaluatePageThemeColors } from "./theme-gate";
import { classifyThemeValue, resolveSectionBackgroundCss, buildThemeBackgroundCss } from "@shared/theme-palette";
import { findOffThemeInlineStyles } from "@shared/rich-text-inline-styles";
import type { SiteThemeConfig } from "../theme-config";

const theme: SiteThemeConfig = {
  backgrounds: [
    { id: "muted", label: "Muted", cssVar: "--muted" },
    { id: "light-blue-5", label: "Light blue", value: "hsl(210 100% 50% / 0.05)" },
  ],
  text: [{ id: "primary", label: "Primary", cssVar: "--primary" }],
  fontSizes: [{ id: "lg", value: "1.25rem" }],
};

describe("classifyThemeValue", () => {
  it("separates IDs, legacy CSS and off-theme values", () => {
    expect(classifyThemeValue("muted", theme.backgrounds)).toEqual({ kind: "theme_id", id: "muted" });
    expect(classifyThemeValue("hsl(var(--muted))", theme.backgrounds)).toEqual({ kind: "theme_css", id: "muted" });
    expect(classifyThemeValue("hsl(210 100%  50% / 0.05)", theme.backgrounds)).toEqual({
      kind: "theme_css",
      id: "light-blue-5",
    });
    expect(classifyThemeValue("#ff0000", theme.backgrounds)).toEqual({ kind: "off_theme" });
    expect(classifyThemeValue("", theme.backgrounds)).toEqual({ kind: "empty" });
  });
});

describe("resolveSectionBackgroundCss", () => {
  it("resolves IDs through theme vars with legacy fallback", () => {
    expect(resolveSectionBackgroundCss("muted")).toBe("var(--theme-bg-muted, hsl(var(--muted)))");
    expect(resolveSectionBackgroundCss("light-blue-5")).toBe("var(--theme-bg-light-blue-5)");
    expect(resolveSectionBackgroundCss("#fff")).toBe("#fff");
    expect(resolveSectionBackgroundCss("bg-muted/30")).toBe("bg-muted/30");
  });

  it("emits vars for every background entry", () => {
    const css = buildThemeBackgroundCss(theme);
    expect(css).toContain("--theme-bg-muted: hsl(var(--muted));");
    expect(css).toContain("--theme-bg-light-blue-5: hsl(210 100% 50% / 0.05);");
  });
});

describe("findOffThemeInlineStyles", () => {
  it("allows theme-backed styles and flags hardcoded ones", () => {
    expect(findOffThemeInlineStyles('<span style="color: hsl(var(--primary))">x</span>', theme)).toEqual([]);
    expect(findOffThemeInlineStyles('<span style="font-size: 1.25rem">x</span>', theme)).toEqual([]);
    expect(findOffThemeInlineStyles('<span style="color: rgb(0, 7, 26); font-size: 13px">x</span>', theme)).toEqual([
      { property: "color", value: "rgb(0, 7, 26)" },
      { property: "font-size", value: "13px" },
    ]);
  });
});

describe("evaluatePageThemeColors", () => {
  const page = {
    sections: [
      { type: "hero", background: "muted", title: "Hi" },
      { type: "faq", background: "#123456" },
      { type: "two_column", background: "hsl(var(--muted))", body: '<span style="color: #3b82f6">x</span>' },
    ],
  };

  it("reports every violation without a before page", () => {
    const v = evaluatePageThemeColors(page, { theme });
    expect(v.map((x) => x.code)).toEqual([
      "off_theme_background",
      "legacy_background_css",
      "off_theme_inline_style",
    ]);
    expect(v[1].suggested_id).toBe("muted");
    expect(v[2].property_path).toBe("sections[2].body");
  });

  it("skips values already on the saved page", () => {
    const before = { sections: [page.sections[2], page.sections[1]] };
    expect(evaluatePageThemeColors(page, { theme, before })).toEqual([]);
  });

  it("flags only the value the edit changed", () => {
    const before = { sections: [page.sections[0], { type: "faq", background: "#abcdef" }, page.sections[2]] };
    const v = evaluatePageThemeColors(page, { theme, before });
    expect(v).toHaveLength(1);
    expect(v[0].property_path).toBe("sections[1].background");
  });
});
