import { describe, expect, it } from "vitest";
import {
  buildInlineDiffParts,
  chooseProposalDiffMode,
  formatProposalDiffValue,
} from "./ProposalFieldDiff";

describe("chooseProposalDiffMode", () => {
  it("returns plain when identical", () => {
    expect(chooseProposalDiffMode("same", "same")).toBe("plain");
  });

  it("returns word for a single long paragraph", () => {
    const a = "El Artículo 99 fija tres tramos de multa hasta 35 millones.";
    const b = "El Artículo 99 fija tres tramos de multa hasta 40 millones.";
    expect(chooseProposalDiffMode(a, b)).toBe("word");
  });

  it("returns line for multi-line JSON-like pairs", () => {
    const a = '{\n  "a": 1,\n  "b": 2\n}';
    const b = '{\n  "a": 1,\n  "b": 3\n}';
    expect(chooseProposalDiffMode(a, b)).toBe("line");
  });

  it("returns plain when either side is oversized", () => {
    const huge = "x".repeat(50_001);
    expect(chooseProposalDiffMode(huge, "y")).toBe("plain");
    expect(chooseProposalDiffMode("y", huge)).toBe("plain");
  });
});

describe("buildInlineDiffParts", () => {
  it("marks added and removed words; filters by side", () => {
    const before = "hello world";
    const after = "hello there";
    const current = buildInlineDiffParts(before, after, "current");
    const proposed = buildInlineDiffParts(before, after, "proposed");

    expect(current.some((p) => p.kind === "added")).toBe(false);
    expect(proposed.some((p) => p.kind === "removed")).toBe(false);
    expect(current.filter((p) => p.kind === "removed").map((p) => p.text).join("")).toContain(
      "world",
    );
    expect(proposed.filter((p) => p.kind === "added").map((p) => p.text).join("")).toContain(
      "there",
    );
  });

  it("returns only context when identical", () => {
    const parts = buildInlineDiffParts("x", "x", "current");
    expect(parts.every((p) => p.kind === "context")).toBe(true);
  });

  it("produces parts for empty formatted string vs full text", () => {
    const empty = formatProposalDiffValue("");
    const full = formatProposalDiffValue("new copy");
    expect(empty).toBe('""');
    const proposed = buildInlineDiffParts(empty, full, "proposed");
    expect(proposed.some((p) => p.kind === "added")).toBe(true);
    const current = buildInlineDiffParts(empty, full, "current");
    expect(current.some((p) => p.kind === "removed")).toBe(true);
  });
});
