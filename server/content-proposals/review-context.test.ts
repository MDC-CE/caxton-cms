/**
 * Unit tests for proposal review classifier (no sqlite).
 */
import { describe, expect, it } from "vitest";
import {
  classifyProposalReview,
  collectDamageClassesForMixedCheck,
  damageClassForTarget,
  isMixedRiskBundle,
  undoCostFor,
} from "./review-context";
import type { ProposalRecord } from "./service";

function baseProposal(
  overrides: Partial<ProposalRecord> & Pick<ProposalRecord, "kind">,
): ProposalRecord {
  return {
    id: "p1",
    site: "test",
    fingerprint: "fp",
    status: "open",
    category: "content.field",
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
    ...overrides,
  };
}

describe("damageClassForTarget", () => {
  it("selling type wins over seo category", () => {
    expect(
      damageClassForTarget({
        contentType: "landing",
        category: "content.seo",
        existence: "exists",
      }),
    ).toBe("selling_page");
  });

  it("live missing + draft → new_public_content", () => {
    expect(
      damageClassForTarget({
        contentType: "blog",
        existence: "missing",
        draftExists: true,
      }),
    ).toBe("new_public_content");
  });

  it("existing seo blog → existing_metadata", () => {
    expect(
      damageClassForTarget({
        contentType: "blog",
        category: "content.seo",
        existence: "exists",
      }),
    ).toBe("existing_metadata");
  });
});

describe("undoCostFor", () => {
  it("orders soft_variant < soft < draft_backed", () => {
    expect(undoCostFor("edits", "soft_variant")).toBe("low");
    expect(undoCostFor("edits", "soft")).toBe("medium");
    expect(undoCostFor("edits", "draft_backed")).toBe("high");
    expect(undoCostFor("notes", "soft")).toBe("none");
  });
});

describe("collectDamageClassesForMixedCheck", () => {
  it("detects mixed selling + blog meta", () => {
    const classes = collectDamageClassesForMixedCheck([
      { contentType: "landing", existence: "exists" },
      { contentType: "blog", category: "content.seo", existence: "exists" },
    ]);
    expect(isMixedRiskBundle(classes)).toBe(true);
  });

  it("allows existing_metadata + existing_content together", () => {
    const classes = collectDamageClassesForMixedCheck([
      { contentType: "blog", category: "content.field", existence: "exists" },
      { contentType: "blog", category: "content.seo", existence: "exists" },
    ]);
    expect(isMixedRiskBundle(classes)).toBe(false);
  });
});

describe("classifyProposalReview", () => {
  it("marks target_missing and block_apply when live gone and no draft", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
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
            ops: [],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "hello",
          locale: "en",
          existence: "missing",
          draftExists: false,
        },
      ],
    });
    expect(ctx.block_apply).toBe(true);
    expect(ctx.active_checklists).toContain("target_missing");
    expect(ctx.damage_class).not.toBe("new_public_content");
  });

  it("classifies new page via draft as new_public_content without block_apply", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        review_mode: "soft_variant",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/new-post",
            locale: "en",
            variant: "draft-a",
            variant_fingerprint: "x",
            status: "pending",
            ops: [],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "new-post",
          },
        ],
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "new-post",
          locale: "en",
          variant: "draft-a",
          existence: "missing",
          draftExists: true,
        },
      ],
    });
    expect(ctx.damage_class).toBe("new_public_content");
    expect(ctx.block_apply).toBe(false);
    expect(ctx.undo_cost).toBe("low");
  });

  it("adds dedup_fix_pending when notes has edits sibling", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "notes",
        related_issue_ids: ["iss1"],
      }),
      lookups: [],
      relatedOpen: [
        {
          id: "p-edits",
          title: "Fix",
          kind: "edits",
          shared_issue_ids: ["iss1"],
        },
      ],
    });
    expect(ctx.active_checklists).toContain("dedup_fix_pending");
  });

  it("sets situation_changed_since_filed when snapshot differs", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        category: "content.seo",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/hello",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "hello",
          locale: "en",
          existence: "exists",
        },
      ],
      snapshot: { damage_class: "selling_page" },
    });
    expect(ctx.situation_changed_since_filed).toBe(true);
    expect(ctx.damage_class).toBe("existing_metadata");
  });

  it("idea with no related_entries → none", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({ kind: "idea" }),
      lookups: [],
    });
    expect(ctx.damage_class).toBe("none");
    expect(ctx.active_checklists).toContain("idea_accept");
  });
});
