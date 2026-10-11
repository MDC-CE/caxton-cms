import { describe, expect, it } from "vitest";
import {
  photoCornerRadius,
  photoCornerRadiusClass,
  photoFrameOuterStyle,
} from "./photoFrame";

describe("photoCornerRadius", () => {
  it("defaults to md (brand card)", () => {
    expect(photoCornerRadius(undefined)).toBe("md");
    expect(photoCornerRadiusClass(undefined)).toBe("rounded-card");
  });

  it("maps staff options", () => {
    expect(photoCornerRadiusClass("none")).toBe("rounded-none");
    expect(photoCornerRadiusClass("sm")).toBe("rounded-sm");
    expect(photoCornerRadiusClass("lg")).toBe("rounded-lg");
    expect(photoCornerRadiusClass("full")).toBe("rounded-full");
  });
});

describe("photoFrameOuterStyle", () => {
  it("includes radius class on the outer box", () => {
    const frame = photoFrameOuterStyle("line", undefined, "full");
    expect(frame.className).toContain("rounded-full");
    expect(frame.className).not.toContain("rounded-card");
  });
});
