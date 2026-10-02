import { describe, expect, it } from "vitest";
import type { InsightSection } from "../../../shared/schema";
import { layoutTraitFindings } from "./design-layout";

const s = (x: Partial<InsightSection> & { type: string }): InsightSection => ({ variant: "default", ...x }) as InsightSection;

describe("layoutTraitFindings", () => {
  it("flags wrapper padding on self-padded sections", () => {
    const f = layoutTraitFindings([
      s({ type: "features_quad", spacing: { paddingY: "lg" }, traits: { flow: "in", self_padded: true } }),
    ]);
    expect(f.map((x) => x.code)).toEqual(["SELF_PADDED_WRAPPER_PADDING"]);
  });

  it("allows paddingY none on self-padded sections", () => {
    expect(
      layoutTraitFindings([s({ type: "features_quad", spacing: { paddingY: "none" }, traits: { flow: "in", self_padded: true } })]),
    ).toEqual([]);
  });

  it("flags styling on out-of-flow sections and skips other checks for them", () => {
    const f = layoutTraitFindings([
      s({ type: "schema_org", background: "primary", spacing: { marginY: "md" }, traits: { flow: "out", self_padded: true } }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("OUT_OF_FLOW_STYLED");
    expect(f[0]!.message).toContain("background, marginY");
  });

  it("ignores sections without traits", () => {
    expect(layoutTraitFindings([s({ type: "hero", spacing: { paddingY: "lg" } })])).toEqual([]);
  });
});
