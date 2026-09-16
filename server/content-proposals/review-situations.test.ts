import { describe, expect, it } from "vitest";
import {
  inferSituationsFromOps,
  mergeSituations,
  parseReviewSituationIds,
  refreshSituationsAfterRevise,
  checklistIdsForSituations,
} from "./review-situations";

describe("review-situations", () => {
  it("parses known ids and rejects unknown", () => {
    expect(parseReviewSituationIds(["internal_links", "body_copy_edit"])).toEqual({
      ok: true,
      ids: ["internal_links", "body_copy_edit"],
    });
    const bad = parseReviewSituationIds(["nope"]);
    expect(bad.ok).toBe(false);
  });

  it("infers serp from title/description ops", () => {
    const ids = inferSituationsFromOps([
      {
        status: "pending",
        ops: [{ field_path: "meta.page_title" }, { field_path: "meta.description" }],
      },
    ]);
    expect(ids).toEqual(["serp_title_description"]);
  });

  it("infers internal_links from content + summary keywords when undeclared", () => {
    const ids = inferSituationsFromOps(
      [{ status: "pending", ops: [{ field_path: "content" }] }],
      { summary: "Add two same-locale internal links to the cluster hub." },
    );
    expect(ids).toContain("internal_links");
    expect(ids).not.toContain("body_copy_edit");
  });

  it("infers body_copy_edit for content without link intent", () => {
    const ids = inferSituationsFromOps(
      [{ status: "pending", ops: [{ field_path: "content" }] }],
      { summary: "Clarify the salary paragraph for accuracy and sources." },
    );
    expect(ids).toEqual(["body_copy_edit"]);
  });

  it("merges author declared with inferred extras", () => {
    const merged = mergeSituations(
      ["internal_links"],
      ["internal_links", "serp_title_description"],
      [
        {
          status: "pending",
          ops: [{ field_path: "content" }, { field_path: "meta.page_title" }],
        },
      ],
    );
    expect(merged.situations).toEqual(
      expect.arrayContaining(["internal_links", "serp_title_description"]),
    );
    expect(merged.source).toBe("merged");
    expect(merged.warnings.some((w) => w.code === "situation_ops_mismatch")).toBe(true);
  });

  it("refresh after revise drops stale declared serp when only content remains", () => {
    const refreshed = refreshSituationsAfterRevise(
      ["internal_links", "serp_title_description"],
      [{ status: "pending", ops: [{ field_path: "content" }] }],
      { summary: "Hub links only remaining." },
    );
    expect(refreshed.situations).toContain("internal_links");
    expect(refreshed.situations).not.toContain("serp_title_description");
  });

  it("checklist ids for internal_links", () => {
    expect(checklistIdsForSituations(["internal_links"])).toEqual(["internal_links"]);
  });

  it("promote-only infers promote_draft", () => {
    expect(inferSituationsFromOps([], { promoteOnApply: true })).toEqual(["promote_draft"]);
  });
});
