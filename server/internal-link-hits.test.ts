import { describe, expect, it } from "vitest";
import { extractInternalLinkHits, linkToInternalPath } from "./internal-link-hits";

describe("extractInternalLinkHits", () => {
  it("finds markdown links in body text", () => {
    const hits = extractInternalLinkHits({
      content: "Read the [salary guide](/en/blog/salaries/guide) and [this](/es/blog/x/y \"title\").",
    });
    expect(hits.map((h) => [h.link, h.kind])).toEqual([
      ["/en/blog/salaries/guide", "markdown"],
      ["/es/blog/x/y", "markdown"],
    ]);
    expect(hits[0]?.fieldPath).toBe("content");
  });

  it("finds <a href> links", () => {
    const hits = extractInternalLinkHits({ body: '<p><a href="/es/blog/a?utm=1#top">a</a></p>' });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ link: "/es/blog/a?utm=1#top", path: "/es/blog/a", kind: "href" });
  });

  it("trims trailing punctuation from bare paths", () => {
    const hits = extractInternalLinkHits({ text: "go to /es/cursos/b. or /en/apply, then" });
    expect(hits.map((h) => h.link)).toEqual(["/es/cursos/b", "/en/apply"]);
  });

  it("reads url-like fields and keeps section component", () => {
    const hits = extractInternalLinkHits({
      sections: [
        { type: "hero", data: { cta_url: "/en/apply", button: { link: "/es/premios" } } },
        { type: "cta", data: { privacy_url: "https://4geeks.com/privacy" } },
      ],
    });
    expect(hits.map((h) => [h.link, h.fieldPath, h.component])).toEqual([
      ["/en/apply", "sections[0].data.cta_url", "hero"],
      ["/es/premios", "sections[0].data.button.link", "hero"],
    ]);
  });

  it("skips redirects, anchors, mailto, assets and api paths", () => {
    const hits = extractInternalLinkHits({
      meta: { redirects: ["/es/blog/uncategorized/old"] },
      content: "[a](#x) [b](mailto:x@y.z) [c](/images/a.png) [d](/api/foo)",
      path: "/v1/auth/login/",
    });
    expect(hits).toEqual([]);
  });

  it("does not double-count a markdown link", () => {
    const hits = extractInternalLinkHits({ content: "[/en/x](/en/x)" });
    expect(hits).toHaveLength(1);
  });
});

describe("linkToInternalPath", () => {
  it("handles absolute URLs per option", () => {
    expect(linkToInternalPath("https://www.4geeks.com/en/x")).toBeNull();
    expect(linkToInternalPath("https://www.4geeks.com/en/x", { absolute: "all" })).toBe("/en/x");
    expect(linkToInternalPath("https://www.4geeks.com/en/x", { absolute: ["4geeks.com"] })).toBe("/en/x");
    expect(linkToInternalPath("https://other.com/en/x", { absolute: ["4geeks.com"] })).toBeNull();
  });
});
