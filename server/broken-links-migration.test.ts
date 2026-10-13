import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { applyLinkFixesToText, type LinkFix } from "./broken-links-migration";

const fix = (f: Partial<LinkFix> & Pick<LinkFix, "link" | "kind" | "action">): LinkFix => ({
  field_path: "content",
  reason: "no_live_match",
  ...f,
});

describe("applyLinkFixesToText", () => {
  it("rewrites a markdown link and keeps the title and query", () => {
    const text = 'content: |\n  See [guide](/en/blog/wrong/x?utm=1 "Guide") now.\n';
    const res = applyLinkFixesToText(text, [
      fix({ link: "/en/blog/wrong/x?utm=1", kind: "markdown", action: "rewrite", to: "/en/blog/right/x?utm=1" }),
    ]);
    expect(res.text).toBe('content: |\n  See [guide](/en/blog/right/x?utm=1 "Guide") now.\n');
    expect(res.applied).toHaveLength(1);
  });

  it("unlinks a markdown link and keeps the anchor text, not images", () => {
    const text = "content: |\n  Read [the **full** guide](/en/missing) and ![img](/en/missing).\n";
    const res = applyLinkFixesToText(text, [fix({ link: "/en/missing", kind: "markdown", action: "unlink" })]);
    expect(res.text).toBe("content: |\n  Read the **full** guide and ![img](/en/missing).\n");
  });

  it("unlinks an <a href> inside a double-quoted YAML string", () => {
    const text = 'body: "<p>Go <a href=\\"/es/blog/nope\\" class=\\"x\\">aquí</a></p>"\n';
    const res = applyLinkFixesToText(text, [fix({ link: "/es/blog/nope", kind: "href", action: "unlink" })]);
    expect(yaml.load(res.text)).toEqual({ body: "<p>Go aquí</p>" });
  });

  it("clears or rewrites a URL field", () => {
    const text = "sections:\n  - type: hero\n    cta_url: /en/gone # old\n    link: '/en/old'\n";
    const res = applyLinkFixesToText(text, [
      fix({ link: "/en/gone", kind: "field", action: "clear_field", field_path: "sections[0].cta_url" }),
      fix({ link: "/en/old", kind: "field", action: "rewrite", to: "/en/new", field_path: "sections[0].link" }),
    ]);
    expect(res.text).toBe("sections:\n  - type: hero\n    cta_url: \"\" # old\n    link: '/en/new'\n");
  });

  it("leaves bare paths for a human", () => {
    const text = "content: visit /en/gone today\n";
    const res = applyLinkFixesToText(text, [fix({ link: "/en/gone", kind: "bare", action: "manual", reason: "bare_path" })]);
    expect(res.text).toBe(text);
    expect(res.skipped).toHaveLength(1);
  });

  it("is idempotent: nothing left to change on a second pass", () => {
    const text = "content: |\n  Read [guide](/en/missing).\n";
    const once = applyLinkFixesToText(text, [fix({ link: "/en/missing", kind: "markdown", action: "unlink" })]);
    const twice = applyLinkFixesToText(once.text, [fix({ link: "/en/missing", kind: "markdown", action: "unlink" })]);
    expect(twice.text).toBe(once.text);
    expect(twice.applied).toHaveLength(0);
  });
});
