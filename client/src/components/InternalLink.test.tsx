import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InternalLink } from "./InternalLink";

vi.mock("@/hooks/useInternalNav", () => ({
  useInternalNav: () => {
    const handler = () => {};
    (handler as { onMouseDown?: () => void }).onMouseDown = () => {};
    return handler;
  },
}));

vi.mock("@/lib/prefetchNavigation", () => ({
  isExternalHref: () => false,
  isInternalHref: () => true,
  isPrefetchableHref: () => false,
  prefetchNavigationHref: () => {},
}));

describe("InternalLink", () => {
  it("does not emit href for reserved / non-navigable values", () => {
    const html = renderToStaticMarkup(
      <InternalLink href="null" className="nav-item">
        Label
      </InternalLink>,
    );
    expect(html).toContain("Label");
    expect(html).not.toContain('href="null"');
    expect(html).toContain("nav-item");
    expect(html).toMatch(/^<span/);
  });

  it("emits a normal anchor for valid hrefs", () => {
    const html = renderToStaticMarkup(
      <InternalLink href="/en/home">Home</InternalLink>,
    );
    expect(html).toContain('href="/en/home"');
    expect(html).toMatch(/^<a/);
  });
});
