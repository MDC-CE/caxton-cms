import { describe, expect, it } from "vitest";
import { summarizeProposalBulkDelete, type ProposalBulkDeleteResult } from "./proposalBulkDelete";

const base = { drafts_removed: [], drafts_unlinked: [], drafts_kept: [] };

describe("summarizeProposalBulkDelete", () => {
  it("reports only deleted when everything succeeded", () => {
    const s = summarizeProposalBulkDelete([
      { id: "a", status: "deleted", ...base },
      { id: "b", status: "deleted", ...base },
    ]);
    expect(s.headline).toBe("Deleted 2");
    expect(s.details).toEqual([]);
  });

  it("names blocked ideas with their open proposals, failures and kept drafts", () => {
    const results: ProposalBulkDeleteResult[] = [
      { id: "a", status: "deleted", ...base, drafts_kept: ["x.yml", "y.yml"] },
      {
        id: "idea-1",
        status: "blocked_dependents",
        dependents: [{ id: "p-2", title: "Implement hero" }],
        ...base,
      },
      { id: "c", status: "error", reason: "disk full", ...base },
    ];
    const s = summarizeProposalBulkDelete(results, (id) => (id === "idea-1" ? "Hero idea" : undefined));
    expect(s.headline).toBe("Deleted 1 · 1 blocked · 1 failed · 2 drafts kept because others edited them");
    expect(s.details[0]).toContain('"Hero idea"');
    expect(s.details[0]).toContain('"Implement hero"');
    expect(s.details[1]).toContain("disk full");
  });
});
