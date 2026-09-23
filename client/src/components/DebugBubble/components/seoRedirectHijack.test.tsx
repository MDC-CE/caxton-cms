import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildSlugRenamePreviewUrls,
  hijackDestination,
  isLiveUrlRedirectHijack,
  LiveUrlRedirectHijackBanner,
  privateRedirectsInspectHref,
  resolveSeoLiveProbePath,
} from "./seoRedirectHijack";

describe("resolveSeoLiveProbePath", () => {
  it("prefers seo-preview livePath", () => {
    expect(
      resolveSeoLiveProbePath(
        { livePath: "/en/blog/coding-bootcamp/php" },
        "/en/other",
      ),
    ).toBe("/en/blog/coding-bootcamp/php");
  });

  it("falls back to canonical path and strips trailing slash", () => {
    expect(resolveSeoLiveProbePath({}, "/en/blog/foo/")).toBe("/en/blog/foo");
    expect(
      resolveSeoLiveProbePath(null, "https://4geeks.com/en/blog/foo/"),
    ).toBe("/en/blog/foo");
  });

  it("returns null when nothing usable", () => {
    expect(resolveSeoLiveProbePath({}, "")).toBeNull();
    expect(resolveSeoLiveProbePath({ livePath: "not-a-path" }, "relative")).toBeNull();
  });
});

describe("buildSlugRenamePreviewUrls", () => {
  const blogPattern = {
    en: "/en/blog/:category/:slug",
    es: "/es/blog/:category/:slug",
  };

  it("uses livePath and swaps trailing slug (resolves :category)", () => {
    expect(
      buildSlugRenamePreviewUrls({
        seoData: { livePath: "/en/blog/trends-and-tech/4geeks-in-the-ai-era" },
        canonicalUrl: "",
        oldSlug: "4geeks-in-the-ai-era",
        newSlug: "4geeks-in-the-ai-eraa",
        urlPattern: blogPattern,
        locale: "en",
      }),
    ).toEqual({
      oldUrl: "/en/blog/trends-and-tech/4geeks-in-the-ai-era",
      newUrl: "/en/blog/trends-and-tech/4geeks-in-the-ai-eraa",
    });
  });

  it("works for simple /:locale/:slug live paths", () => {
    expect(
      buildSlugRenamePreviewUrls({
        seoData: { livePath: "/en/coding-bootcamp" },
        canonicalUrl: null,
        oldSlug: "coding-bootcamp",
        newSlug: "coding-bootcamps",
        urlPattern: { en: "/en/:slug", es: "/es/:slug" },
        locale: "en",
      }),
    ).toEqual({
      oldUrl: "/en/coding-bootcamp",
      newUrl: "/en/coding-bootcamps",
    });
  });

  it("falls back to pattern when livePath and canonical are missing", () => {
    expect(
      buildSlugRenamePreviewUrls({
        seoData: null,
        canonicalUrl: "",
        oldSlug: "old-post",
        newSlug: "new-post",
        urlPattern: blogPattern,
        locale: "en",
      }),
    ).toEqual({
      oldUrl: "/en/blog/:category/old-post",
      newUrl: "/en/blog/:category/new-post",
    });
  });
});

describe("isLiveUrlRedirectHijack", () => {
  it("is true when match and overwrites_content conflict", () => {
    expect(
      isLiveUrlRedirectHijack({
        match: true,
        resolvedTo: "/en/coding-bootcamp",
        source: "pages/coding-bootcamp/en.yml",
        conflicts: [{ kind: "overwrites_content" }],
      }),
    ).toBe(true);
  });

  it("is false when no match or no overwrite conflict", () => {
    expect(isLiveUrlRedirectHijack({ match: false, pageExists: true } as never)).toBe(false);
    expect(
      isLiveUrlRedirectHijack({
        match: true,
        conflicts: [{ kind: "duplicate_from" }],
      }),
    ).toBe(false);
    expect(isLiveUrlRedirectHijack(null)).toBe(false);
  });
});

describe("hijackDestination / privateRedirectsInspectHref", () => {
  it("prefers resolvedTo", () => {
    expect(
      hijackDestination({ resolvedTo: "/en/coding-bootcamp", to: "/other" }),
    ).toBe("/en/coding-bootcamp");
  });

  it("builds redirects inspect link", () => {
    expect(privateRedirectsInspectHref("/en/blog/foo")).toBe(
      "/private/redirects?url=%2Fen%2Fblog%2Ffoo",
    );
  });
});

describe("LiveUrlRedirectHijackBanner", () => {
  it("shows framing, destination, source, and Open in Redirects link", () => {
    const html = renderToStaticMarkup(
      <LiveUrlRedirectHijackBanner
        livePath="/en/blog/coding-bootcamp/php"
        destination="/en/coding-bootcamp"
        sourceLabel="pages / coding-bootcamp / en.yml"
      />,
    );
    expect(html).toContain('data-testid="banner-seo-live-url-hijack"');
    expect(html).toContain("are sent elsewhere");
    expect(html).toContain("/en/blog/coding-bootcamp/php");
    expect(html).toContain("/en/coding-bootcamp");
    expect(html).toContain("pages / coding-bootcamp / en.yml");
    expect(html).toContain('data-testid="link-seo-hijack-open-redirects"');
    expect(html).toContain("/private/redirects?url=%2Fen%2Fblog%2Fcoding-bootcamp%2Fphp");
    expect(html).toContain("Open in Redirects");
    expect(html).toContain("does not change the old");
  });
});
