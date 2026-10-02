import { describe, expect, it } from "vitest";
import { extractMeasurementsJson, filterFindingsByTraits, reviewKey } from "./render-review";

describe("render review helpers", () => {
  it("extracts the measurement JSON from rendered HTML", () => {
    const html = `<html><body><script type="application/json" id="__page_measurements__">{"version":1,"findings":[{"code":"multiple_h1"}],"note":"\\u003cb>"}</script></body></html>`;
    const parsed = extractMeasurementsJson(html);
    expect(parsed?.version).toBe(1);
    expect(parsed?.note).toBe("<b>");
    expect(extractMeasurementsJson("<html></html>")).toBeNull();
  });

  it("drops findings explained by layout traits", () => {
    const findings = [
      { code: "empty_section", severity: "warning" as const, section_path: "sections[0]", message: "x" },
      { code: "color_edge_without_padding", severity: "error" as const, section_path: "sections[1]", message: "x" },
      { code: "heading_order", severity: "warning" as const, section_path: "sections[1]", message: "x" },
      { code: "color_edge_without_padding", severity: "error" as const, section_path: "sections[2]", message: "x" },
      { code: "multiple_h1", severity: "error" as const, section_path: null, message: "x" },
    ];
    const traits = new Map([
      [0, { flow: "out" as const, self_padded: false }],
      [1, { flow: "in" as const, self_padded: true }],
      [2, { flow: "in" as const, self_padded: false }],
    ]);
    const { kept, dropped } = filterFindingsByTraits(findings, traits as never);
    expect(dropped).toBe(2);
    expect(kept.map((f) => `${f.code}@${f.section_path}`)).toEqual([
      "heading_order@sections[1]",
      "color_edge_without_padding@sections[2]",
      "multiple_h1@null",
    ]);
  });

  it("keys reviews per site, entry, locale and variant; demos are not indexed", () => {
    expect(reviewKey("site_a", { source: "entry", contentType: "landing", slug: "x", locale: "en", variant: "draft" })).toBe(
      "site_a|landing|x|en|draft",
    );
    expect(reviewKey("site_a", { source: "entry", contentType: "landing", slug: "x", locale: "es" })).toBe("site_a|landing|x|es|");
    expect(reviewKey("site_a", { source: "demo", hash: "a".repeat(32) })).toBeNull();
  });
});
