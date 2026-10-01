import { describe, expect, it, vi } from "vitest";
import {
  isKnownPublicHtmlRoute,
  resolvePublicHtmlStatus,
  shouldSkipPublicSsr,
} from "./public-html-status";

const BLOG_POST = "/es/blog/herramientas-ia/mejores-agentes-de-codigo";

function fakeCi(known: Set<string>) {
  return {
    isKnownUrl: vi.fn((url: string) => known.has(url)),
  };
}

describe("resolvePublicHtmlStatus", () => {
  it("returns 200 when the site index knows the blog post", () => {
    const ci = fakeCi(new Set([BLOG_POST]));
    expect(resolvePublicHtmlStatus({ url: BLOG_POST, contentIndex: ci })).toBe(200);
    expect(ci.isKnownUrl).toHaveBeenCalledWith(BLOG_POST);
  });

  it("returns 404 for /hello when the site index does not know it", () => {
    const ci = fakeCi(new Set([BLOG_POST]));
    expect(resolvePublicHtmlStatus({ url: "/hello", contentIndex: ci })).toBe(404);
  });

  it("lets httpStatus win even when the index knows the URL", () => {
    const ci = fakeCi(new Set(["/es/some-page"]));
    expect(
      resolvePublicHtmlStatus({
        url: "/es/some-page",
        httpStatus: 404,
        contentIndex: ci,
      }),
    ).toBe(404);
    expect(ci.isKnownUrl).not.toHaveBeenCalled();
  });

  it("returns 200 for static and private paths without asking the index", () => {
    const ci = fakeCi(new Set());
    expect(resolvePublicHtmlStatus({ url: "/preview-frame", contentIndex: ci })).toBe(200);
    expect(resolvePublicHtmlStatus({ url: "/private/diagnostics", contentIndex: ci })).toBe(200);
    expect(ci.isKnownUrl).not.toHaveBeenCalled();
  });

  it("does not treat locale-home aliases as static 200", () => {
    const ci = fakeCi(new Set());
    expect(resolvePublicHtmlStatus({ url: "/", contentIndex: ci })).toBe(404);
    expect(resolvePublicHtmlStatus({ url: "/en", contentIndex: ci })).toBe(404);
    expect(resolvePublicHtmlStatus({ url: "/es", contentIndex: ci })).toBe(404);
    expect(resolvePublicHtmlStatus({ url: "/us", contentIndex: ci })).toBe(404);
  });

  it("returns 404 for a blog post path when contentIndex is missing", () => {
    expect(resolvePublicHtmlStatus({ url: BLOG_POST })).toBe(404);
    expect(resolvePublicHtmlStatus({ url: BLOG_POST, contentIndex: null })).toBe(404);
  });

  it("strips query and hash before asking the index", () => {
    const ci = fakeCi(new Set([BLOG_POST]));
    expect(
      resolvePublicHtmlStatus({
        url: `${BLOG_POST}?utm=1#section`,
        contentIndex: ci,
      }),
    ).toBe(200);
    expect(ci.isKnownUrl).toHaveBeenCalledWith(BLOG_POST);
  });
});

describe("shouldSkipPublicSsr", () => {
  it("skips SSR for any non-200 status", () => {
    expect(shouldSkipPublicSsr(200)).toBe(false);
    expect(shouldSkipPublicSsr(404)).toBe(true);
    expect(shouldSkipPublicSsr(403)).toBe(true);
    expect(shouldSkipPublicSsr(500)).toBe(true);
  });
});

describe("isKnownPublicHtmlRoute", () => {
  it("does not use a 4Geeks-only catalog when no index is passed", () => {
    const fourGeeksOnly = fakeCi(new Set([BLOG_POST]));
    expect(isKnownPublicHtmlRoute(BLOG_POST)).toBe(false);
    expect(fourGeeksOnly.isKnownUrl).not.toHaveBeenCalled();
  });
});
