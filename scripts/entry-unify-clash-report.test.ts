import { describe, expect, it, vi } from "vitest";

vi.mock("../server/database", () => ({ DatabaseManager: class {} }));
vi.mock("../server/content-index", () => ({
  ContentIndex: class {
    loadMergedContent(_ct: string, slug: string) {
      if (slug === "a") return { data: { title: "Template title", summary: "{{ entry.summary }}", meta: { page_title: "Same" } } };
      return { data: { title: "B" } };
    }
  },
}));
vi.mock("../server/entry-layer", () => ({
  listEntryKeys: () => ({
    keys: [
      { contentType: "how-to", slug: "a", locales: ["en"] },
      { contentType: "how-to", slug: "b", locales: ["en"] },
      { contentType: "page", slug: "static", locales: ["en"] },
    ],
    itemsByType: new Map([["how-to", []]]),
  }),
  entryItemLayer: (_ci: unknown, _ct: string, slug: string) =>
    slug === "a"
      ? { fields: { title: "Item title", summary: "S", slug: "a", meta: { page_title: "Same" } } }
      : { fields: { title: "B" } },
}));

import { buildClashReport, clashReportMarkdown } from "./entry-unify-clash-report";

describe("entry-unify clash report", () => {
  it("lists literal template values the item overrides and skips bindings, equal values, and static types", async () => {
    const report = await buildClashReport("site_test");
    expect(report.pages_checked).toBe(2);
    expect(report.bindings_skipped).toBe(1);
    expect(report.clashes).toEqual([
      { contentType: "how-to", slug: "a", locale: "en", key: "title", current: "Template title", after: "Item title" },
    ]);
    const md = clashReportMarkdown(report);
    expect(md).toContain("| how-to.title | 1 |");
    expect(md).toContain("| how-to/a (en) | title | Template title | Item title |");
  });

  it("says so when there are no clashes", () => {
    const md = clashReportMarkdown({
      contentFolder: "site_test",
      generated_at: "now",
      pages_checked: 0,
      clashes: [],
      bindings_skipped: 0,
    });
    expect(md).toContain("No clashes.");
  });
});
