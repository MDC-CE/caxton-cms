import { describe, expect, it } from "vitest";
import { isThemeIdShape, missingBasePaletteIds, SHARED_BASE_PALETTE } from "@shared/theme-palette";
import { collectSharedExampleBackgrounds } from "./shared-base-palette";

describe("shared base palette", () => {
  const backgrounds = collectSharedExampleBackgrounds();

  it("finds backgrounds in shared examples", () => {
    expect(backgrounds.length).toBeGreaterThan(0);
  });

  it("shared examples only use base palette IDs (no raw CSS, no site-only IDs)", () => {
    const offenders = backgrounds
      .filter((b) => b.value !== "inherit" && b.value !== "none")
      .filter((b) => !isThemeIdShape(b.value) || !(SHARED_BASE_PALETTE as readonly string[]).includes(b.value))
      .map((b) => `${b.file} ${b.path}: ${b.value}`);
    expect(offenders).toEqual([]);
  });

  it("reports missing base IDs in palette order", () => {
    expect(missingBasePaletteIds([{ id: "muted" }, { id: "card" }])).toEqual(
      SHARED_BASE_PALETTE.filter((id) => id !== "muted" && id !== "card"),
    );
    expect(missingBasePaletteIds(SHARED_BASE_PALETTE.map((id) => ({ id })))).toEqual([]);
  });
});
