import { describe, expect, it } from "vitest";
import { findOldestFirstListingSorts } from "./listing-sort";

describe("findOldestFirstListingSorts", () => {
  it("flags ascending recency sorts", () => {
    const hits = findOldestFirstListingSorts({
      sections: [
        { type: "hero" },
        { type: "list_cards", dynamic_entries: { content_type: "blog", sort: "published_at" } },
      ],
    });
    expect(hits).toEqual([{ sectionIndex: 1, sectionType: "list_cards", sort: "published_at" }]);
  });

  it("accepts descending recency sorts and non-recency fields", () => {
    const hits = findOldestFirstListingSorts({
      sections: [
        { type: "list_cards", dynamic_entries: { sort: "-published_at" } },
        { type: "list_cards", dynamic_entries: { sort: "start_date" } },
        { type: "list_cards", dynamic_entries: { sort: "priority" } },
        { type: "list_cards", dynamic_entries: {} },
      ],
    });
    expect(hits).toEqual([]);
  });
});
