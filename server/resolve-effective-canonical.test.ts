import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeCanonicalHref,
  resolveEffectiveCanonical,
} from "./resolve-effective-canonical";

vi.mock("./content-types", () => ({
  resolveContentTypeUrl: vi.fn(),
}));

vi.mock("./hreflang", () => ({
  getBaseUrl: vi.fn(() => "https://4geeks.com"),
}));

import { resolveContentTypeUrl } from "./content-types";

describe("normalizeCanonicalHref", () => {
  it("prefixes relative paths with base URL", () => {
    expect(normalizeCanonicalHref("/en/home", "https://4geeks.com")).toBe(
      "https://4geeks.com/en/home",
    );
  });

  it("keeps absolute https URLs", () => {
    expect(
      normalizeCanonicalHref("https://4geeks.com/en/other", "https://4geeks.com"),
    ).toBe("https://4geeks.com/en/other");
  });

  it("returns empty for template leftovers", () => {
    expect(normalizeCanonicalHref("{{ entry.url }}", "https://4geeks.com")).toBe("");
  });
});

describe("resolveEffectiveCanonical", () => {
  beforeEach(() => {
    vi.mocked(resolveContentTypeUrl).mockReturnValue("/en/home");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefers non-empty manual canonical_url", () => {
    const href = resolveEffectiveCanonical({
      meta: { canonical_url: "https://4geeks.com/en/custom" },
      contentType: "page",
      record: { slug: "home" },
      locale: "en",
    });
    expect(href).toBe("https://4geeks.com/en/custom");
    expect(resolveContentTypeUrl).not.toHaveBeenCalled();
  });

  it("normalizes relative manual override", () => {
    const href = resolveEffectiveCanonical({
      meta: { canonical_url: "/en/custom" },
      contentType: "page",
      record: { slug: "home" },
      locale: "en",
    });
    expect(href).toBe("https://4geeks.com/en/custom");
  });

  it("falls back to auto URL when meta canonical is empty", () => {
    const href = resolveEffectiveCanonical({
      meta: { canonical_url: "  " },
      contentType: "page",
      record: { slug: "home" },
      locale: "en",
    });
    expect(href).toBe("https://4geeks.com/en/home");
  });

  it("keeps listing ?page= when page > 1", () => {
    vi.mocked(resolveContentTypeUrl).mockReturnValue("/en/blog");
    const href = resolveEffectiveCanonical({
      meta: {},
      contentType: "page",
      record: { slug: "blog" },
      locale: "en",
      requestUrl: "/en/blog?page=2&utm_source=x",
    });
    expect(href).toBe("https://4geeks.com/en/blog?page=2");
  });
});
