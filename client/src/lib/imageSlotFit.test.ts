import { describe, expect, it } from "vitest";
import { evaluateImageSlotFit, resolveSlotHint } from "./imageSlotFit";

describe("resolveSlotHint", () => {
  it("builds mins and aspect from rendered size", () => {
    const hint = resolveSlotHint({ width: 800, height: 1000 });
    expect(hint).toEqual({
      minWidth: 800,
      minHeight: 1000,
      aspectRatio: 0.8,
      label: undefined,
    });
  });

  it("keeps the stricter minimum when explicit and rendered both exist", () => {
    const hint = resolveSlotHint(
      { width: 600, height: 600 },
      { minWidth: 1200, aspectRatio: 16 / 9, label: "hero photo" },
    );
    expect(hint?.minWidth).toBe(1200);
    expect(hint?.minHeight).toBe(600);
    expect(hint?.aspectRatio).toBeCloseTo(16 / 9);
    expect(hint?.label).toBe("hero photo");
  });
});

describe("evaluateImageSlotFit", () => {
  const slot = { minWidth: 800, minHeight: 1000, aspectRatio: 4 / 5 };

  it("is ok when the photo meets size and aspect", () => {
    const result = evaluateImageSlotFit({ width: 1200, height: 1500 }, slot);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when the photo is too small", () => {
    const result = evaluateImageSlotFit({ width: 400, height: 500 }, slot);
    expect(result.ok).toBe(false);
    expect(result.warnings.some((w) => w.code === "too_small")).toBe(true);
  });

  it("warns when aspect drifts a lot", () => {
    const result = evaluateImageSlotFit({ width: 1600, height: 900 }, slot);
    expect(result.ok).toBe(false);
    expect(result.warnings.some((w) => w.code === "aspect_mismatch")).toBe(true);
  });

  it("does not warn when dimensions are unknown", () => {
    const result = evaluateImageSlotFit({ width: undefined, height: undefined }, slot);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("never blocks — Save stays available (soft only)", () => {
    const result = evaluateImageSlotFit({ width: 10, height: 10 }, slot);
    expect(result.ok).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
