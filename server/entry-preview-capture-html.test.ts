import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildOgCardCaptureHtml,
  toAbsolutePublicUrl,
} from "./entry-preview-capture-html";
import { DEFAULT_ENTRY_PREVIEW_SETTINGS } from "./settings";

describe("entry-preview-capture-html", () => {
  const prevSite = process.env.SITE_URL;

  beforeEach(() => {
    process.env.SITE_URL = "https://www.4geeks.com";
  });

  afterEach(() => {
    if (prevSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prevSite;
  });

  it("toAbsolutePublicUrl joins SITE_URL for relative paths", () => {
    expect(toAbsolutePublicUrl("/site_x/images/logo.webp")).toBe(
      "https://www.4geeks.com/site_x/images/logo.webp",
    );
    expect(toAbsolutePublicUrl("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
  });

  it("buildOgCardCaptureHtml includes title and absolute logo URL", () => {
    const html = buildOgCardCaptureHtml({
      title: "Hello Location",
      logoAbsoluteUrl: "https://www.4geeks.com/logo-dark.webp",
      category: ["LatAm"],
      theme: "dark",
    });
    expect(html).toContain("Hello Location");
    expect(html).toContain('src="https://www.4geeks.com/logo-dark.webp"');
    expect(html).toContain('data-og-logo="1"');
    expect(html).toContain("data-screenshot-root");
    expect(html).not.toContain("data-capture-ready");
  });
});

describe("entry_preview defaults", () => {
  it("defaults max_retries to 3", () => {
    expect(DEFAULT_ENTRY_PREVIEW_SETTINGS.max_retries).toBe(3);
  });
});
