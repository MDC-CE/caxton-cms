import { describe, expect, it } from "vitest";
import { migrateBackgroundLines } from "./migrate-theme-backgrounds";

const backgrounds = [
  { id: "muted", cssVar: "--muted" },
  { id: "light-blue-5", value: "hsl(210 100% 50% / 0.05)" },
];

describe("migrateBackgroundLines", () => {
  it("rewrites only section-level legacy CSS backgrounds", () => {
    const src = [
      "slug: x",
      "sections:",
      "  - type: hero",
      '    background: "hsl(var(--muted))"',
      "    card:",
      "      background: hsl(var(--muted))",
      "  - background: hsl(210 100% 50% / 0.05)",
      "    type: faq",
      "  - type: cta",
      "    background: '#fff'",
      "meta:",
      "  background: hsl(var(--muted))",
    ].join("\n");
    const { text, changes } = migrateBackgroundLines(src, backgrounds);
    expect(changes.map((c) => c.to)).toEqual(["muted", "light-blue-5"]);
    expect(text).toContain("    background: muted\n");
    expect(text).toContain("  - background: light-blue-5\n");
    expect(text).toContain("      background: hsl(var(--muted))");
    expect(text).toContain("    background: '#fff'");
    expect(text).toContain("  background: hsl(var(--muted))");
  });

  it("handles registry examples and the legacy-safe filter", () => {
    const src = ["name: Demo", "yaml: |", "  - type: hero", "    background: hsl(var(--muted))", "  - type: faq", "    background: hsl(210 100% 50% / 0.05)"].join("\n");
    const { changes } = migrateBackgroundLines(src, backgrounds, { onlyIds: new Set(["muted"]) });
    expect(changes.map((c) => c.to)).toEqual(["muted"]);
  });
});
