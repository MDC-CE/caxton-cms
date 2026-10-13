import { describe, expect, it } from "vitest";
import { addPadding, effectivePadding, maskBindings } from "./lib";

const split = (m: number, d: number) => ({ mobile: { top: m, bottom: m }, desktop: { top: d, bottom: d } });

describe("section padding move", () => {
  it("mobile inherits desktop like the section wrapper", () => {
    expect(effectivePadding({ desktop: "md lg" })).toEqual({
      mobile: { top: 32, bottom: 64 },
      desktop: { top: 32, bottom: 64 },
    });
  });

  it("uses presets when exact and px otherwise, writing mobile only when it differs", () => {
    expect(addPadding(undefined, split(32, 32))).toEqual({ desktop: "md" });
    expect(addPadding({ desktop: "sm" }, split(32, 32))).toEqual({ desktop: "48px" });
    expect(addPadding({ desktop: "none" }, split(48, 64))).toEqual({ mobile: "48px", desktop: "lg" });
    expect(addPadding({ desktop: "md none" }, split(64, 96))).toEqual({ mobile: "xl lg", desktop: "128px xl" });
  });

  it("keeps an existing mobile key and unrelated keys", () => {
    expect(addPadding({ mobile: "sm none", desktop: "md none", section_id: "x" }, split(56, 56))).toEqual({
      section_id: "x",
      mobile: "72px 56px",
      desktop: "88px 56px",
    });
  });

  it("refuses values it cannot add to", () => {
    expect(addPadding({ desktop: "2rem" }, split(16, 16))).toBeNull();
  });

  it("masks template bindings and restores them verbatim", () => {
    const text = "meta:\n  page_title: {{ entry.title }} | 4Geeks\n  x: {{ a | {\"m\": 1} }}\n";
    const { masked, unmask } = maskBindings(text);
    expect(masked).not.toContain("{{");
    expect(unmask(masked)).toBe(text);
  });
});
