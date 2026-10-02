import { describe, expect, it } from "vitest";
import { literalizeThemeColor, resolveSectionBackground } from "@/lib/section-background";

describe("literalizeThemeColor", () => {
  it("turns a theme variable into a literal hsl color", () => {
    expect(literalizeThemeColor("hsl(var(--secondary))")).toBe("hsl(0 0% 96%)");
  });

  it("keeps an alpha channel", () => {
    expect(literalizeThemeColor("hsl(var(--primary) / 0.05)")).toBe("hsl(210 100% 50% / 0.05)");
  });

  it("leaves an unknown variable in place", () => {
    expect(literalizeThemeColor("hsl(var(--not-a-token))")).toBe("hsl(var(--not-a-token))");
  });

  it("resolves variables inside a gradient and still returns a background image", () => {
    expect(
      resolveSectionBackground("linear-gradient(to bottom, hsl(var(--primary) / 0.05), transparent)"),
    ).toEqual({
      style: {
        backgroundImage: "linear-gradient(to bottom, hsl(210 100% 50% / 0.05), transparent)",
      },
    });
  });

  it("leaves Tailwind class tokens as class names", () => {
    expect(resolveSectionBackground("bg-gradient-to-b from-primary/5 to-background")).toEqual({
      className: "bg-gradient-to-b from-primary/5 to-background",
    });
  });
});
