import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  page: null as Record<string, unknown> | null,
  draftEntry: false,
}));
vi.mock("./entry-layer", () => ({
  loadEntry: () => (state.page ? { data: structuredClone(state.page), filePath: "x" } : null),
}));
vi.mock("./draft-entry", () => ({ isDraftEntry: () => state.draftEntry }));

import { evaluateEditTextLimits } from "./text-limits-edit";
import { textLimitRulesForSection } from "./text-limits";

const hero = (brand: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  type: "hero",
  version: "1.0",
  variant: "productShowcase",
  section_id: "hero-1",
  brand_mark: brand,
  ...extra,
});

const SITE_ROOT = "site_learning-mdc-edu";

function run(operations: unknown[], variant?: string) {
  return evaluateEditTextLimits({
    ci: {} as never,
    contentType: "landing",
    slug: "x",
    locale: "en",
    variant,
    operations: operations as never,
    contentRoot: SITE_ROOT,
  });
}

beforeEach(() => {
  state.page = { sections: [hero({ prefix: "Launch Your", highlight: "Tech Career." })] };
  state.draftEntry = false;
});

describe("textLimitRulesForSection", () => {
  it("reads hero productShowcase rules from the real schema.yml", () => {
    const rules = textLimitRulesForSection(hero({ prefix: "a", highlight: "b" }), SITE_ROOT);
    expect(rules.map((r) => r.label)).toEqual(
      expect.arrayContaining(["H1", "H2", "H1 + H2", "Bullets"]),
    );
    expect(
      textLimitRulesForSection({ type: "hero", variant: "singleColumn" }, SITE_ROOT),
    ).toEqual([]);
  });
});

describe("evaluateEditTextLimits", () => {
  const longPrefix = "Launch Your Career as an AI Engineer and Build Real Agentic Systems From Day One";

  it("flags a live update_field that lengthens the H1 (nested path)", () => {
    const r = run([{ action: "update_field", path: "sections.0.brand_mark.prefix", value: longPrefix }]);
    expect(r.isDraftWrite).toBe(false);
    expect(r.violations.map((v) => v.label)).toContain("H1");
  });

  it("marks variant writes as drafts (warn only)", () => {
    const r = run([{ action: "update_field", path: "sections.0.brand_mark.prefix", value: longPrefix }], "draft");
    expect(r.isDraftWrite).toBe(true);
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it("ignores over-limit copy that the edit did not touch", () => {
    state.page = {
      sections: [hero({ prefix: longPrefix, highlight: "Now." }, { bullets: [{ text: "a" }] })],
    };
    const r = run([{ action: "update_field", path: "sections.0.bullets.0.text", value: "b" }]);
    expect(r.violations).toEqual([]);
  });

  it("checks a newly added section", () => {
    const r = run([
      { action: "add_item", path: "sections", item: hero({ prefix: longPrefix, highlight: "Now." }, { section_id: "hero-2" }) },
    ]);
    expect(r.violations.map((v) => v.section_path)).toEqual(["sections[1]"]);
  });

  it("returns nothing when the operations cannot apply", () => {
    const r = run([{ action: "update_field", path: "sections.9.title", value: "x" }]);
    expect(r.violations).toEqual([]);
  });
});
