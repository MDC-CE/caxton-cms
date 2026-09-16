import { describe, expect, it } from "vitest";
import {
  proposalProgressExplain,
  proposalStatusExplain,
} from "@/components/agents/ProposalExplainBadges";

describe("proposalStatusExplain", () => {
  it("explains open edits in plain English", () => {
    const e = proposalStatusExplain("open", "edits");
    expect(e.title).toBe("Waiting for review");
    expect(e.body).toMatch(/not live yet/i);
    expect(e.body).toMatch(/does not change the live site/i);
  });
});

describe("proposalProgressExplain", () => {
  it("explains zero applied", () => {
    const e = proposalProgressExplain({ done: 0, total: 1, failed: 0 });
    expect(e.title).toBe("Nothing applied yet");
    expect(e.body).toMatch(/0 of 1/);
    expect(e.body).toMatch(/Approve/i);
  });

  it("explains all done", () => {
    const e = proposalProgressExplain({ done: 2, total: 2, failed: 0 });
    expect(e.title).toBe("All entries applied");
    expect(e.body).toMatch(/All 2/);
  });

  it("explains failures", () => {
    const e = proposalProgressExplain({ done: 1, total: 3, failed: 1 });
    expect(e.title).toBe("Some entries failed");
    expect(e.body).toMatch(/failed on apply/i);
  });
});
