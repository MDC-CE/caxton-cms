import { describe, expect, it } from "vitest";
import {
  collectClaimCueTextFromOps,
  evaluateClaimCues,
  hasClaimRelevantPendingOps,
} from "./claim-cues";

describe("evaluateClaimCues", () => {
  it("clear_yes for salary + currency", () => {
    expect(evaluateClaimCues("Average salary is $85,000 after graduation")).toBe("clear_yes");
  });

  it("clear_yes for hire rate percent", () => {
    expect(evaluateClaimCues("Our hire rate is 86%")).toBe("clear_yes");
  });

  it("clear_no for plain typo body", () => {
    expect(evaluateClaimCues("Fixed a typo in the introduction paragraph.")).toBe("clear_no");
  });

  it("ambiguous for percent without outcome words", () => {
    expect(evaluateClaimCues("About 50% of the chapter covers recursion.")).toBe("ambiguous");
  });

  it("ambiguous for salary word without number", () => {
    expect(evaluateClaimCues("We discuss salary expectations in interviews.")).toBe("ambiguous");
  });

  it("clear_no for empty", () => {
    expect(evaluateClaimCues("")).toBe("clear_no");
    expect(evaluateClaimCues(null)).toBe("clear_no");
  });
});

describe("collectClaimCueTextFromOps", () => {
  it("collects body op values and ignores funnel", () => {
    const text = collectClaimCueTextFromOps([
      {
        status: "pending",
        ops: [
          { field_path: "content", value: "Hire rate 90%" },
          { field_path: "funnel.stage", value: "awareness" },
        ],
      },
    ]);
    expect(text).toContain("Hire rate 90%");
    expect(text).not.toContain("awareness");
    expect(hasClaimRelevantPendingOps([
      { status: "pending", ops: [{ field_path: "funnel.stage", value: "x" }] },
    ])).toBe(false);
  });
});
