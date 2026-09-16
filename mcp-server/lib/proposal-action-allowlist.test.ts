import { describe, expect, it } from "vitest";
import {
  allowedProposalUpdateActions,
  PROPOSAL_AUTHOR_ACTIONS,
  PROPOSAL_REVIEW_ACTIONS,
  PROPOSAL_ALL_UPDATE_ACTIONS,
} from "../tools/proposals";

describe("allowedProposalUpdateActions", () => {
  it("review-only gets decide toolkit without withdraw/attach", () => {
    const a = allowedProposalUpdateActions(false, true);
    expect(a.has("apply")).toBe(true);
    expect(a.has("reject")).toBe(true);
    expect(a.has("add_blocker")).toBe(true);
    expect(a.has("withdraw")).toBe(false);
    expect(a.has("attach_variant")).toBe(false);
    expect(a.has("set_no_auto_retry")).toBe(false);
    expect(a.size).toBe(PROPOSAL_REVIEW_ACTIONS.length);
  });

  it("create-only gets author toolkit without apply/reject", () => {
    const a = allowedProposalUpdateActions(true, false);
    expect(a.has("withdraw")).toBe(true);
    expect(a.has("attach_variant")).toBe(true);
    expect(a.has("revise_entries")).toBe(true);
    expect(a.has("set_review_situations")).toBe(true);
    expect(a.has("apply")).toBe(false);
    expect(a.has("reject")).toBe(false);
    expect(a.has("accept")).toBe(false);
    expect(a.has("close")).toBe(false);
    expect(a.size).toBe(PROPOSAL_AUTHOR_ACTIONS.length);
  });

  it("review-only cannot revise_entries or set_review_situations", () => {
    const a = allowedProposalUpdateActions(false, true);
    expect(a.has("revise_entries")).toBe(false);
    expect(a.has("set_review_situations")).toBe(false);
    expect(a.has("reject")).toBe(true);
  });

  it("both caps get full toolkit", () => {
    const a = allowedProposalUpdateActions(true, true);
    expect(a.size).toBe(PROPOSAL_ALL_UPDATE_ACTIONS.length);
    expect(a.has("apply")).toBe(true);
    expect(a.has("withdraw")).toBe(true);
  });

  it("neither cap gets empty set", () => {
    expect(allowedProposalUpdateActions(false, false).size).toBe(0);
  });

  it("never includes escalate or deescalate", () => {
    const both = allowedProposalUpdateActions(true, true);
    expect(both.has("escalate" as never)).toBe(false);
    expect(both.has("deescalate" as never)).toBe(false);
    expect(PROPOSAL_ALL_UPDATE_ACTIONS.includes("escalate" as never)).toBe(false);
  });
});
