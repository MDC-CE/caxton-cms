import { describe, expect, it } from "vitest";
import { pathnameFromSitemapLoc } from "./prebuild-html-cache";

describe("pathnameFromSitemapLoc", () => {
  it("keeps a public path from an absolute sitemap url", () => {
    expect(pathnameFromSitemapLoc("https://4geeks.com/en/blog/ai-tools/how-to")).toBe(
      "/en/blog/ai-tools/how-to",
    );
  });

  it("drops query strings and private previews", () => {
    expect(pathnameFromSitemapLoc("https://4geeks.com/en/pricing?plan=ai")).toBeNull();
    expect(pathnameFromSitemapLoc("https://4geeks.com/private/preview/page/home?locale=en")).toBeNull();
  });
});
