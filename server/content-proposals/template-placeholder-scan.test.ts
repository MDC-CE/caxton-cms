import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_SAMPLE_MAX,
  entryPlaceholdersIn,
  newEntryPlaceholders,
  summarizeUnfilledPlaceholders,
} from "./template-placeholder-scan";

describe("template placeholder scan", () => {
  it("collects entry placeholders without a fallback, including legacy single.*", () => {
    const names = entryPlaceholdersIn([
      { type: "hero", title: "{{ entry.title }}", image: "{{ single.hero_image }}" },
      { type: "cta", text: "{{ entry.cta_text | Join now }}", item_template: { t: "{{ entry.ignored }}" } },
    ]);
    expect([...names].sort()).toEqual(["hero_image", "title"]);
  });

  it("only scans placeholders the live template does not already use", () => {
    const live = [{ type: "hero", title: "{{ entry.title }}" }];
    const draft = [{ type: "hero", title: "{{ entry.title }}", image: "{{ entry.hero_image }}" }];
    expect(newEntryPlaceholders(live, draft)).toEqual(["hero_image"]);
    expect(newEntryPlaceholders(draft, draft)).toEqual([]);
  });

  it("counts missing entries and caps the sample", () => {
    const entries = [
      { slug: "a", bag: { hero_image: "" } },
      { slug: "b", bag: {} },
      { slug: "c", bag: { hero_image: null } },
      { slug: "d", bag: {} },
      { slug: "e", bag: { hero_image: "e.png" } },
    ];
    const gaps = summarizeUnfilledPlaceholders(["hero_image"], entries);
    expect(gaps).toEqual([{ name: "hero_image", missing: 4, total: 5, sample: ["a", "b", "c"] }]);
    expect(gaps[0]!.sample).toHaveLength(PLACEHOLDER_SAMPLE_MAX);
  });

  it("omits placeholders every entry fills, and resolves nested paths", () => {
    const entries = [
      { slug: "a", bag: { meta: { og_image: "a.png" } } },
      { slug: "b", bag: { meta: { og_image: "b.png" } } },
    ];
    expect(summarizeUnfilledPlaceholders(["meta.og_image"], entries)).toEqual([]);
  });
});
