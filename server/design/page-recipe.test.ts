import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { InsightPageRecord, InsightSection } from "@shared/schema";
import {
  buildPageRecipe,
  buildSkeleton,
  checkRules,
  learnRules,
  readDesignRulePins,
  weighLayouts,
  writeDesignRulePin,
} from "./page-recipe";

function rec(key: string, sections: InsightSection[], extra: Partial<InsightPageRecord> = {}): InsightPageRecord {
  return {
    key,
    contentType: "landing",
    slug: key,
    kind: "entry",
    intent: "general",
    weight: 1,
    instanceCount: 1,
    sections,
    ...extra,
  } as InsightPageRecord;
}

const hero = (v = "default"): InsightSection => ({ type: "hero", variant: v, traits: { edge: "top_of_page" } }) as InsightSection;
const sec = (type: string, variant = "default", extra: Partial<InsightSection> = {}): InsightSection =>
  ({ type, variant, ...extra }) as InsightSection;

describe("weighLayouts", () => {
  it("applies content type relevance, locale and skips overlays / zero weight", () => {
    const out = weighLayouts(
      [
        rec("a", [hero()], { baseWeight: 2, locales: ["en"] }),
        rec("b", [hero()], { contentType: "program", baseWeight: 1, locales: ["en"] }),
        rec("c", [hero()], { baseWeight: 1, locales: ["es"] }),
        rec("o", [hero()], { kind: "overlay" } as Partial<InsightPageRecord>),
        rec("z", [hero()], { baseWeight: 0 }),
      ],
      { contentType: "landing", locale: "en" },
    );
    expect(out.map((l) => [l.record.key, l.weight])).toEqual([
      ["a", 2],
      ["b", 0.3],
      ["c", 0.2],
    ]);
  });

  it("weighs adjacent funnel stages at half", () => {
    const [l] = weighLayouts([rec("a", [hero()], { funnelStage: "consideration" })], { stage: "decision" });
    expect(l!.breakdown.relevance).toBe(0.5);
  });
});

describe("buildPageRecipe", () => {
  it("falls back to site-wide when fewer than 3 scoped layouts", () => {
    const r = buildPageRecipe(
      [rec("a", [hero()]), rec("b", [hero()], { contentType: "program" }), rec("c", [hero()], { contentType: "program" })],
      { contentType: "landing" },
    );
    expect(r.fallback).toBe("site_wide");
    expect(r.sample.scoped_layouts).toBe(1);
    expect(r.sample.layouts).toBe(3);
  });

  it("uses only same-type layouts when the scope has enough samples", () => {
    const pages = ["a", "b", "c"].map((k) => rec(k, [hero(), sec("cta")]));
    pages.push(rec("p", [hero(), sec("faq")], { contentType: "program", baseWeight: 10 }));
    const r = buildPageRecipe(pages, { contentType: "landing" });
    expect(r.fallback).toBeNull();
    expect(r.slots[1]!.options.map((o) => o.type)).toEqual(["cta"]);
  });
});

describe("buildSkeleton", () => {
  it("normalizes positions, marks required slots and lists out-of-flow add-ons", () => {
    const sticky = sec("sticky_cta", "default", { traits: { flow: "out" } } as Partial<InsightSection>);
    const layouts = weighLayouts(
      [
        rec("a", [hero(), sec("features"), sec("cta"), sticky]),
        rec("b", [hero(), sec("features"), sec("cta")]),
        rec("c", [hero(), sec("testimonials"), sec("faq"), sec("cta")]),
      ],
      {},
    );
    const { slots, out_of_flow } = buildSkeleton(layouts);
    expect(slots).toHaveLength(3);
    expect(slots[0]!.options[0]!.type).toBe("hero");
    expect(slots[0]!.required).toBe(true);
    expect(slots[2]!.options[0]!.type).toBe("cta");
    expect(slots[1]!.options[0]!.type).toBe("features");
    expect(out_of_flow).toEqual([{ type: "sticky_cta", variant: "default", share: 0.33 }]);
  });
});

describe("learnRules / checkRules", () => {
  const approved = { approval: { state: "approved" as const, factor: 2 } };
  const good = (k: string) =>
    rec(k, [hero(), sec("features", "default", { background: "primary", spacing: { paddingY: "lg" } }), sec("cta")], approved);

  it("stays a suggestion below the approved-page threshold", () => {
    const rules = learnRules([good("a"), good("b")]);
    expect(rules.find((r) => r.id === "colored_section_has_padding")!.status).toBe("suggestion");
  });

  it("activates with 5 agreeing approved pages and flags violations", () => {
    const rules = learnRules(["a", "b", "c", "d", "e"].map(good));
    const padding = rules.find((r) => r.id === "colored_section_has_padding")!;
    expect(padding.status).toBe("active");
    expect(padding.evidence.agreement).toBe(1);
    const violations = checkRules([hero(), sec("features", "default", { background: "primary" }), sec("cta")], rules);
    expect(violations.map((v) => [v.rule.id, v.index])).toEqual([["colored_section_has_padding", 1]]);
  });

  it("ignores pages that are not approved or trusted", () => {
    const rules = learnRules(["a", "b", "c", "d", "e"].map((k) => rec(k, good(k).sections)));
    expect(rules.every((r) => r.evidence.approved_pages === 0)).toBe(true);
  });

  it("pins override learned status", () => {
    const rules = learnRules(["a", "b", "c", "d", "e"].map(good), {
      colored_section_has_padding: { status: "disabled" },
      no_stacked_same_color: { status: "pinned" },
    });
    expect(rules.find((r) => r.id === "colored_section_has_padding")!.status).toBe("disabled");
    expect(rules.find((r) => r.id === "no_stacked_same_color")!.status).toBe("pinned");
    expect(checkRules([hero(), sec("features", "default", { background: "primary" })], rules)).toEqual([]);
  });
});

describe("design-rules.yml pins", () => {
  it("round-trips pin, update and clear", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-rules-"));
    writeDesignRulePin(dir, "no_adjacent_same_component", { status: "pinned", by: "staff@x.com" });
    expect(readDesignRulePins(dir).no_adjacent_same_component?.status).toBe("pinned");
    writeDesignRulePin(dir, "no_adjacent_same_component", null);
    expect(readDesignRulePins(dir)).toEqual({});
  });
});
