import { describe, expect, it } from "vitest";
import {
  MAX_SECTION_CHANGED_KEYS,
  MAX_SECTION_SUMMARY_ROWS,
  isStructuralSectionsChange,
  summarizeSectionsChange,
} from "./sections-summary";

const hero = { type: "hero", version: "1.0", title: "Hi" };
const cta = { type: "cta_banner", version: "1.0", title: "Go" };
const faq = { type: "faq", version: "1.0", items: [] };

describe("summarizeSectionsChange", () => {
  it("omits unchanged sections and reports changed keys", () => {
    const s = summarizeSectionsChange([hero, cta], [{ ...hero, title: "Hello", image: "x.png" }, cta]);
    expect(s.rows).toEqual([{ index: 0, type: "hero", status: "changed", changed_keys: ["image", "title"] }]);
    expect(isStructuralSectionsChange(s)).toBe(false);
  });

  it("reports added and removed sections (index fallback)", () => {
    const added = summarizeSectionsChange([hero], [hero, cta]);
    expect(added.rows).toEqual([{ index: 1, type: "cta_banner", status: "added" }]);
    expect(isStructuralSectionsChange(added)).toBe(true);

    const removed = summarizeSectionsChange([hero, cta], [hero]);
    expect(removed.rows).toEqual([{ index: 1, type: "cta_banner", status: "removed" }]);
    expect(isStructuralSectionsChange(removed)).toBe(true);
  });

  it("matches by section_id and detects moves", () => {
    const a = { ...hero, section_id: "a" };
    const b = { ...cta, section_id: "b" };
    const c = { ...faq, section_id: "c" };
    const s = summarizeSectionsChange([a, b, c], [c, a, b]);
    expect(s.rows).toEqual([{ index: 0, type: "faq", status: "moved", from_index: 2 }]);
    expect(isStructuralSectionsChange(s)).toBe(true);
  });

  it("section_id match beats index when a section is inserted before it", () => {
    const a = { ...hero, section_id: "a" };
    const b = { ...cta, section_id: "b", title: "Go" };
    const s = summarizeSectionsChange([a, b], [a, { ...faq, section_id: "new" }, { ...b, title: "Now" }]);
    expect(s.rows).toEqual([
      { index: 1, type: "faq", status: "added" },
      { index: 2, type: "cta_banner", status: "changed", changed_keys: ["title"] },
    ]);
  });

  it("without section_id: a swap is a move, a replaced component is removed + added", () => {
    const swap = summarizeSectionsChange([hero, cta], [cta, hero]);
    expect(swap.rows).toHaveLength(1);
    expect(swap.rows[0]).toMatchObject({ status: "moved" });
    expect(isStructuralSectionsChange(swap)).toBe(true);

    const replaced = summarizeSectionsChange([hero, cta], [faq, cta]);
    expect(replaced.rows).toEqual([
      { index: 0, type: "faq", status: "added" },
      { index: 0, type: "hero", status: "removed" },
    ]);
  });

  it("a created layout counts as structural", () => {
    const s = summarizeSectionsChange(undefined, [hero, cta]);
    expect(s.before_count).toBe(0);
    expect(s.after_count).toBe(2);
    expect(isStructuralSectionsChange(s)).toBe(true);
    expect(isStructuralSectionsChange(null)).toBe(false);
  });

  it("caps rows and changed keys", () => {
    const wide = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]));
    const wideAfter = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i + 1]));
    const keys = summarizeSectionsChange([{ type: "hero", ...wide }], [{ type: "hero", ...wideAfter }]);
    expect(keys.rows[0]!.changed_keys).toHaveLength(MAX_SECTION_CHANGED_KEYS);

    const many = Array.from({ length: MAX_SECTION_SUMMARY_ROWS + 5 }, (_, i) => ({ type: "hero", title: String(i) }));
    const rows = summarizeSectionsChange([hero], [hero, ...many]);
    expect(rows.rows).toHaveLength(MAX_SECTION_SUMMARY_ROWS);
    expect(rows.truncated).toBe(true);
  });
});
