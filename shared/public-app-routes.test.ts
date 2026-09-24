import { describe, expect, it } from "vitest";
import {
  isLocaleHomeAlias,
  isPublicHtmlStaticPath,
  normalizePublicPath,
  PUBLIC_HTML_STATIC,
  LOCALE_HOME_ALIASES,
} from "./public-app-routes";

describe("normalizePublicPath", () => {
  it("strips query hash and trailing slash", () => {
    expect(normalizePublicPath("/en/?x=1#y")).toBe("/en");
    expect(normalizePublicPath("/")).toBe("/");
  });
});

describe("isLocaleHomeAlias", () => {
  it("matches bare locale and legacy /us", () => {
    for (const p of LOCALE_HOME_ALIASES) {
      expect(isLocaleHomeAlias(p)).toBe(true);
    }
    expect(isLocaleHomeAlias("/en/")).toBe(true);
    expect(isLocaleHomeAlias("/us?utm=1")).toBe(true);
  });

  it("does not match canonical homes or deeper paths", () => {
    expect(isLocaleHomeAlias("/en/home")).toBe(false);
    expect(isLocaleHomeAlias("/es/inicio")).toBe(false);
    expect(isLocaleHomeAlias("/en/apply")).toBe(false);
  });

  it("matches legacy /es/home", () => {
    expect(isLocaleHomeAlias("/es/home")).toBe(true);
    expect(isLocaleHomeAlias("/es/home/")).toBe(true);
  });
});

describe("isPublicHtmlStaticPath", () => {
  it("includes apply and legal pages", () => {
    for (const p of PUBLIC_HTML_STATIC) {
      expect(isPublicHtmlStaticPath(p)).toBe(true);
    }
  });

  it("excludes locale-home aliases", () => {
    expect(isPublicHtmlStaticPath("/")).toBe(false);
    expect(isPublicHtmlStaticPath("/en")).toBe(false);
    expect(isPublicHtmlStaticPath("/es")).toBe(false);
    expect(isPublicHtmlStaticPath("/us")).toBe(false);
  });
});
