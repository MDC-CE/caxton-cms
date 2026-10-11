import { describe, expect, it } from "vitest";
import {
  focalPointToObjectPosition,
  pickAutoObjectFit,
  resolveImageObjectStyle,
} from "./imageFit";

describe("pickAutoObjectFit", () => {
  it("uses cover when aspects are close", () => {
    expect(pickAutoObjectFit(16 / 9, 16 / 10)).toBe("cover");
    expect(pickAutoObjectFit(4 / 3, 4 / 3)).toBe("cover");
  });

  it("uses contain when aspects diverge a lot", () => {
    // Landscape photo in tall portrait slot
    expect(pickAutoObjectFit(16 / 9, 4 / 5)).toBe("contain");
    // Portrait photo in wide landscape slot
    expect(pickAutoObjectFit(3 / 4, 16 / 10)).toBe("contain");
  });
});

describe("focalPointToObjectPosition", () => {
  it("maps gallery focal points", () => {
    expect(focalPointToObjectPosition("top")).toBe("center top");
    expect(focalPointToObjectPosition("top-left")).toBe("left top");
    expect(focalPointToObjectPosition(undefined)).toBeUndefined();
  });
});

describe("resolveImageObjectStyle", () => {
  it("prefers explicit object-fit from props/YAML", () => {
    const style = resolveImageObjectStyle({
      fit: "auto",
      explicitObjectFit: "contain",
      imageWidth: 1600,
      imageHeight: 900,
      slotWidth: 400,
      slotHeight: 500,
      focalPoint: "top",
    });
    expect(style.objectFit).toBe("contain");
    expect(style.objectPosition).toBe("center top");
  });

  it("falls back to cover when dimensions are unknown", () => {
    const style = resolveImageObjectStyle({ fit: "auto", focalPoint: "left" });
    expect(style.objectFit).toBe("cover");
    expect(style.objectPosition).toBe("left center");
  });
});
