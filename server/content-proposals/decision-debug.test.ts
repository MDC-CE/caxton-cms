import { describe, expect, it } from "vitest";
import { buildDecisionDebug } from "./decision-debug";
import { classifyProposalReview } from "./review-context";
import type { ProposalRecord } from "./service";

function baseProposal(
  overrides: Partial<ProposalRecord> & Pick<ProposalRecord, "kind">,
): ProposalRecord {
  return {
    id: "p1",
    site: "test",
    fingerprint: "fp",
    status: "open",
    category: "content.seo",
    title: "T",
    summary: "x".repeat(80),
    rationale: null,
    documentation: {},
    related_issue_ids: [],
    proposer_username: "a",
    proposer_actor: {},
    created_at: 1,
    updated_at: 1,
    claim: null,
    tags: [],
    search_text: "",
    created_agent_session_id: null,
    promote_on_apply: false,
    review_mode: "soft",
    open_blocker_count: 0,
    no_auto_retry: false,
    close_reason: null,
    close_note: null,
    closed_by: null,
    closed_at: null,
    related_entries: [],
    entries: [],
    blockers: [],
    review_situations: [],
    review_context_snapshot: null,
    decision_debug: null,
    supersedes_proposal_id: null,
    replaced_by_proposal_id: null,
    escalated: false,
    escalated_at: null,
    escalated_by: null,
    escalated_note: null,
    accepted_entry: null,
    implements_proposal_id: null,
    author_content_at: null,
    reviewer_action_at: null,
    ...overrides,
  };
}

describe("buildDecisionDebug", () => {
  it("freezes think items and discovery_path with source mcp", () => {
    const proposal = baseProposal({
      kind: "edits",
      entries: [
        {
          id: 1,
          proposal_id: "p1",
          entry_key: "blog/hello",
          locale: "en",
          variant: null,
          variant_fingerprint: null,
          status: "pending",
          ops: [{ field_path: "meta.page_title", value: "New" }],
          baseline_context: { values: {} },
          last_error: null,
          applied_at: null,
          applied_by: null,
          contentType: "blog",
          slug: "hello",
        },
      ],
    });
    const reviewContext = classifyProposalReview({
      proposal,
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    const debug = buildDecisionDebug({
      action: "reject",
      proposal: {
        id: proposal.id,
        status: "open",
        kind: proposal.kind,
        title: proposal.title,
        summary: proposal.summary,
        entries: proposal.entries,
      },
      reviewContext,
      caller: { username: "rev", agent_session_id: "sess-1" },
      captured_at: 100,
    });
    expect(debug.action).toBe("reject");
    expect(debug.source).toBe("mcp");
    expect(debug.captured_at).toBe(100);
    expect(debug.review_context.active_checklists).toContain("title_description_ctr");
    expect(debug.discovery_path).not.toBeNull();
    expect(debug.discovery_path!.items.some((i) => i.kind === "think" && i.id === "title_description_ctr")).toBe(
      true,
    );
  });

  it("marks source staff when asStaff", () => {
    const debug = buildDecisionDebug({
      action: "apply",
      proposal: { id: "p1", status: "open", kind: "notes" },
      reviewContext: null,
      caller: { username: "staff", asStaff: true },
    });
    expect(debug.source).toBe("staff");
    expect(debug.review_context.damage_class).toBe("none");
  });
});
