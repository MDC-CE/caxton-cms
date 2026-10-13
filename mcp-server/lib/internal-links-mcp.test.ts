import { describe, expect, it } from "vitest";
import {
  brokenInternalLinksResult,
  internalLinkWarnings,
  toUpdateFieldPath,
} from "./internal-links-mcp";

function body(result: { content: Array<{ text: string }> }): Record<string, any> {
  return JSON.parse(result.content[0].text);
}

describe("internal-links-mcp", () => {
  it("converts bracket field paths to update_fields dot paths", () => {
    expect(toUpdateFieldPath("sections[2].data.items[0].url")).toBe("sections.2.data.items.0.url");
  });

  it("builds fix_broken_internal_links with one update per field", () => {
    const res = body(
      brokenInternalLinksResult(
        "BROKEN_INTERNAL_LINKS: ...",
        {
          code: "broken_internal_links",
          broken_internal_links: [
            { link: "/en/blog/nope", field_path: "sections[1].content", closest_live_match: "/en/blog/yes" },
            { link: "/en/other", field_path: "sections[1].content" },
          ],
        },
        { slug: "post", locale: "en", contentType: "blog" },
      ) as any,
    );
    expect(res.action_required).toBe("fix_broken_internal_links");
    expect(res.broken_internal_links).toHaveLength(2);
    expect(res.property_paths).toEqual(["sections.1.content"]);
    expect(res.next_actions[0].tool).toBe("update_fields");
    expect(res.next_actions[0].args_hint.updates).toEqual([
      { field_path: "sections.1.content", value: "<full field value with the broken links fixed>" },
    ]);
    expect(res.warnings[0].message).toMatch(/not only the field you edited/);
  });

  it("reads broken links from promote details", () => {
    const res = body(
      brokenInternalLinksResult(
        "Cannot promote",
        { code: "broken_internal_links", details: { broken_internal_links: [{ link: "/es/x", field_path: "sections[0].url" }] } },
        { slug: "p", locale: "es", contentType: "landing", variant: "v1", publish: true },
      ) as any,
    );
    expect(res.broken_internal_links[0].link).toBe("/es/x");
    expect(res.next_actions[0].args_hint.variant).toBe("v1");
    expect(res.next_actions[0].args_hint.confirm_live_edit).toBeUndefined();
  });

  it("maps link_warnings to MCP warnings", () => {
    expect(
      internalLinkWarnings([{ code: "internal_link_redirects", message: "1 link redirects", links: [] }, null]),
    ).toEqual([{ code: "internal_link_redirects", message: "1 link redirects" }]);
  });
});
