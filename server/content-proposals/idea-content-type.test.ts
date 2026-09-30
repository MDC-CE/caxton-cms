import { describe, expect, it } from "vitest";
import {
  CONTENT_TYPE_FIT_THINK_ID,
  CONTENT_TYPE_STRATEGY_MISSING_WARN,
  IDEA_CONTENT_TYPE_MISSING_WARN,
  IDEA_CONTENT_TYPE_RULE_SINCE,
  IDEA_CONTENT_TYPE_UNKNOWN_WARN,
  IDEA_MULTIPLE_CONTENT_TYPES_WARN,
  MAX_IDEA_CONTENT_TYPES,
  resolveIdeaContentTypeStrategies,
  reviewIdeaContentTypes,
  unknownContentTypeError,
  unknownContentTypes,
} from "./idea-content-type";

const KNOWN = ["landing", "blog", "downloadable", "program", "location"];
const strategyFor = (ct: string) =>
  ct === "location" ? null : { purpose: `${ct} purpose`, constraints: [`${ct} rule`] };

describe("unknownContentTypes", () => {
  it("flags folder names that are not content-types.yml keys", () => {
    expect(unknownContentTypes([{ contentType: "landings" }, { contentType: "blog" }], KNOWN)).toEqual([
      "landings",
    ]);
  });

  it("skips the check when the known list is absent", () => {
    expect(unknownContentTypes([{ contentType: "anything" }], null)).toEqual([]);
  });

  it("builds a refusal with sorted valid_types", () => {
    const err = unknownContentTypeError(["landings"], KNOWN);
    expect(err.code).toBe("unknown_content_type");
    expect(err.details.unknown).toEqual(["landings"]);
    expect(err.details.valid_types).toEqual([...KNOWN].sort());
    expect(err.error).toMatch(/Nothing was saved/);
  });
});

describe("resolveIdeaContentTypeStrategies", () => {
  it("returns pitched types before accept", () => {
    const rows = resolveIdeaContentTypeStrategies({
      related: [{ contentType: "landing" }],
      known: KNOWN,
      strategyFor,
    });
    expect(rows).toEqual([
      { contentType: "landing", role: "pitched", purpose: "landing purpose", constraints: ["landing rule"] },
    ]);
  });

  it("puts the accepted type first and keeps a differing pitched type", () => {
    const rows = resolveIdeaContentTypeStrategies({
      related: [{ contentType: "landing" }],
      accepted: { contentType: "blog" },
      known: KNOWN,
      strategyFor,
    });
    expect(rows.map((r) => [r.contentType, r.role])).toEqual([
      ["blog", "accepted"],
      ["landing", "pitched"],
    ]);
  });

  it("dedupes the accepted type out of pitched rows", () => {
    const rows = resolveIdeaContentTypeStrategies({
      related: [{ contentType: "blog" }],
      accepted: { contentType: "blog" },
      known: KNOWN,
      strategyFor,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("accepted");
  });

  it("marks types without a strategy as missing and skips unknown types", () => {
    const rows = resolveIdeaContentTypeStrategies({
      related: [{ contentType: "location" }, { contentType: "landings" }],
      known: KNOWN,
      strategyFor,
    });
    expect(rows).toEqual([{ contentType: "location", role: "pitched", missing: true }]);
  });

  it("caps the list at MAX_IDEA_CONTENT_TYPES", () => {
    const rows = resolveIdeaContentTypeStrategies({
      related: KNOWN.map((contentType) => ({ contentType })),
      known: KNOWN,
      strategyFor,
    });
    expect(rows).toHaveLength(MAX_IDEA_CONTENT_TYPES);
  });
});

describe("reviewIdeaContentTypes", () => {
  const codes = (r: ReturnType<typeof reviewIdeaContentTypes>) => r.warnings.map((w) => w.code);

  it("warns missing type with blocker guidance only after the cutoff", () => {
    const after = reviewIdeaContentTypes({ related: [], known: KNOWN, createdAt: IDEA_CONTENT_TYPE_RULE_SINCE });
    const before = reviewIdeaContentTypes({ related: [], known: KNOWN, createdAt: IDEA_CONTENT_TYPE_RULE_SINCE - 1 });
    const afterMsg = after.warnings.find((w) => w.code === IDEA_CONTENT_TYPE_MISSING_WARN)!.message;
    const beforeMsg = before.warnings.find((w) => w.code === IDEA_CONTENT_TYPE_MISSING_WARN)!.message;
    expect(afterMsg).toMatch(/add_blocker/);
    expect(afterMsg).toMatch(/set_related_entries/);
    expect(beforeMsg).toMatch(/reminder only/);
    expect(beforeMsg).not.toMatch(/Reviewer: add_blocker/);
  });

  it("warns unknown legacy types and multiple known types", () => {
    const r = reviewIdeaContentTypes({
      related: [{ contentType: "landings" }, { contentType: "landing" }, { contentType: "blog" }],
      known: KNOWN,
    });
    expect(codes(r)).toEqual(expect.arrayContaining([IDEA_CONTENT_TYPE_UNKNOWN_WARN, IDEA_MULTIPLE_CONTENT_TYPES_WARN]));
    expect(codes(r)).not.toContain(IDEA_CONTENT_TYPE_MISSING_WARN);
  });

  it("does not warn multiple types for a single type across locales", () => {
    const r = reviewIdeaContentTypes({
      related: [{ contentType: "blog" }, { contentType: "blog" }],
      known: KNOWN,
    });
    expect(codes(r)).not.toContain(IDEA_MULTIPLE_CONTENT_TYPES_WARN);
  });

  it("warns missing strategy and builds no think item when nothing has a purpose", () => {
    const r = reviewIdeaContentTypes({
      related: [{ contentType: "location" }],
      known: KNOWN,
      strategies: [{ contentType: "location", role: "pitched", missing: true }],
    });
    expect(codes(r)).toContain(CONTENT_TYPE_STRATEGY_MISSING_WARN);
    expect(r.think).toBeNull();
  });

  it("builds one content_type_fit think item with purpose and constraints", () => {
    const r = reviewIdeaContentTypes({
      related: [{ contentType: "landing" }],
      known: KNOWN,
      strategies: [{ contentType: "landing", role: "pitched", purpose: "Convert", constraints: ["One CTA"] }],
    });
    expect(r.think?.id).toBe(CONTENT_TYPE_FIT_THINK_ID);
    expect(r.think?.look_for).toEqual(
      expect.arrayContaining(["landing purpose: Convert", "landing constraint: One CTA"]),
    );
  });

  it("labels roles when accepted and pitched types differ", () => {
    const r = reviewIdeaContentTypes({
      related: [{ contentType: "landing" }],
      known: KNOWN,
      strategies: [
        { contentType: "blog", role: "accepted", purpose: "Teach" },
        { contentType: "landing", role: "pitched", purpose: "Convert" },
      ],
    });
    expect(r.think?.look_for[0]).toBe("blog (accepted) purpose: Teach");
    expect(r.think?.look_for[1]).toBe("landing (pitched) purpose: Convert");
  });
});
