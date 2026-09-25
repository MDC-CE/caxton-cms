import { describe, expect, it, vi } from "vitest";
import { resolveLocaleHomeAliasTarget } from "./locale-home-alias";

vi.mock("./settings", () => ({
  getHomePage: () => ({ type: "page", slug: "home" }),
  getDefaultLocale: () => "en",
}));

describe("resolveLocaleHomeAliasTarget", () => {
  const ci = {
    contentRoot: "site_test",
    getLocaleUrls: () => ({
      en: "/en/home",
      es: "/es/inicio",
    }),
    buildUrl: (_t: string, locale: string, slug: string) =>
      `/${locale}/${slug}`,
  } as any;

  it("maps bare aliases to final homes", () => {
    expect(resolveLocaleHomeAliasTarget("/", ci)).toBe("/en/home");
    expect(resolveLocaleHomeAliasTarget("/en", ci)).toBe("/en/home");
    expect(resolveLocaleHomeAliasTarget("/es", ci)).toBe("/es/inicio");
    expect(resolveLocaleHomeAliasTarget("/us", ci)).toBe("/en/home");
    expect(resolveLocaleHomeAliasTarget("/es/home", ci)).toBe("/es/inicio");
  });

  it("returns null for canonical homes and other paths", () => {
    expect(resolveLocaleHomeAliasTarget("/en/home", ci)).toBeNull();
    expect(resolveLocaleHomeAliasTarget("/es/inicio", ci)).toBeNull();
    expect(resolveLocaleHomeAliasTarget("/en/about", ci)).toBeNull();
  });
});
