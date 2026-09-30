import { describe, expect, it } from "vitest";
import {
  collectPendingOpValueText,
  findFactVariableTokens,
  findFigureVariableTokens,
} from "./figure-variable-tokens";

const DEFS = {
  "global.global_job_placement_rate": { category: "outcome_claim", default: "84" },
  "global.rating": { category: "social_proof", default: "4.8" },
  "global.campus_phone": { category: "contact", default: "+1" },
  "global.tagline": { category: "copy", default: "Hi" },
};

describe("findFigureVariableTokens", () => {
  it("returns names + categories for figure tokens only, deduped", () => {
    const text =
      "{{ global.global_job_placement_rate | 84 }}% hired, {{global.rating}} stars, {{ global.global_job_placement_rate }} again, {{ global.tagline }}";
    expect(findFigureVariableTokens(text, DEFS)).toEqual([
      { name: "global.global_job_placement_rate", category: "outcome_claim" },
      { name: "global.rating", category: "social_proof" },
    ]);
  });

  it("ignores unknown and non-figure tokens", () => {
    expect(findFigureVariableTokens("{{ global.unknown }} {{ global.campus_phone }}", DEFS)).toEqual([]);
    expect(findFactVariableTokens("{{ global.campus_phone }}", DEFS)).toEqual([
      { name: "global.campus_phone", category: "contact" },
    ]);
  });

  it("collects values from pending ops only", () => {
    const text = collectPendingOpValueText([
      { status: "pending", ops: [{ field_path: "cta.label", value: "{{ global.rating }}" }] },
      { status: "applied", ops: [{ field_path: "content", value: "skip me" }] },
    ]);
    expect(text).toBe("{{ global.rating }}");
  });
});
