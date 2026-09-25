import { describe, it, expect } from "vitest";
import { hasFullSectionsOp } from "./attached-entry-gate";
import { MAX_SECTION_ISSUES, validateSectionsForProposal } from "./section-proposal-check";

describe("hasFullSectionsOp", () => {
  it("needs one non-empty whole-array sections set", () => {
    expect(hasFullSectionsOp([{ field_path: "sections", value: [{ type: "hero" }] }])).toBe(true);
    expect(hasFullSectionsOp([{ field_path: "sections", value: [] }])).toBe(false);
    expect(hasFullSectionsOp([{ field_path: "sections[0].title", value: "Hero" }])).toBe(false);
    expect(hasFullSectionsOp([{ field_path: "sections", reset: true }])).toBe(false);
    expect(hasFullSectionsOp([{ field_path: "sections", op: "remove" }])).toBe(false);
    expect(hasFullSectionsOp([{ field_path: "title", value: "x" }])).toBe(false);
  });
});

describe("validateSectionsForProposal", () => {
  it("refuses a non-array", () => {
    expect(validateSectionsForProposal("hero")).toEqual([
      { property_path: "sections", message: expect.stringContaining("array") },
    ]);
  });

  it("points at the exact section for shape problems and unknown components", () => {
    const issues = validateSectionsForProposal([
      "hero",
      { title: "No type" },
      { type: "definitely_not_a_component_xyz" },
    ]);
    expect(issues.map((i) => i.property_path)).toEqual([
      "sections[0]",
      "sections[1].type",
      expect.stringMatching(/^sections\[2\]\./),
    ]);
  });

  it("caps the number of issues", () => {
    const many = Array.from({ length: MAX_SECTION_ISSUES + 5 }, () => ({ title: "x" }));
    expect(validateSectionsForProposal(many)).toHaveLength(MAX_SECTION_ISSUES);
  });
});
