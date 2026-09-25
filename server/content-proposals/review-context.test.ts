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
  undoCostFromDiff,
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
    escalated: false,
    escalated_at: null,
    escalated_by: null,
    escalated_note: null,
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
    accepted_entry: null,
    implements_proposal_id: null,
    idea_funnel: null,
    author_content_at: null,
    reviewer_action_at: null,
    reviewer_action_by: null,
    reviewer_action_by_actor: {},
    outcome_review: null,
    outcome_review_note: null,
    outcome_review_expected: null,
    outcome_review_at: null,
    outcome_review_by: null,
    outcome_review_history: [],
    outcome_lesson_captured_at: null,
    outcome_lesson_captured_by: null,
    outcome_lesson_note: null,
    ...overrides,
  };
}

describe("damageClassForTarget", () => {
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

  it("landing exists is not selling by type alone", () => {
    expect(
      damageClassForTarget({
        contentType: "landing",
        category: "content.seo",
        existence: "exists",
      }),
    ).toBe("existing_metadata");
  });

  it("idea missing program → new_public_content", () => {
    expect(
      damageClassForTarget({
        contentType: "program",
        existence: "missing",
        forIdea: true,
      }),
    ).toBe("new_public_content");
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

describe("undoCostFromDiff (v1.0)", () => {
  const change = (field_path: string, scope: "locale" | "common" = "locale") => ({
    field_path,
    before: "a",
    after: "b",
    scope,
  });
  it("rates by what the draft touches", () => {
    expect(undoCostFromDiff([{ slug: "hello", author_diff: [change("title")] }])).toEqual({
      cost: "low",
      reason: "locale_fields",
    });
    expect(undoCostFromDiff([{ slug: "hello", author_diff: [change("title"), change("meta.page_title")] }])).toEqual({
      cost: "medium",
      reason: "seo_or_url",
    });
    expect(undoCostFromDiff([{ slug: "hello", author_diff: [change("funnel.stage", "common")] }]).cost).toBe("high");
    expect(undoCostFromDiff([{ slug: "hello", author_diff: [change("sections")] }]).reason).toBe("sections");
    expect(undoCostFromDiff([{ slug: "hello", author_diff: [change("title")], liveMissing: true }]).reason).toBe(
      "first_publish",
    );
    expect(undoCostFromDiff([{ slug: "template", author_diff: [change("title")] }]).reason).toBe("shared_template");
  });
});

describe("collectDamageClassesForMixedCheck", () => {
  it("detects mixed outcome figures + blog meta", () => {
    const classes = collectDamageClassesForMixedCheck([
      { contentType: "landing", existence: "exists", outcomeFigures: true },
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

  it("landing without figures is not mixed with blog meta", () => {
    const classes = collectDamageClassesForMixedCheck([
      { contentType: "landing", existence: "exists" },
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

  it("does not block apply when the packet was filed as creates_entry", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/what-is-grok",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "title", value: "What is Grok" }],
            baseline_context: { values: {}, creates_entry: true },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "what-is-grok",
          },
        ],
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "what-is-grok",
          locale: "en",
          existence: "missing",
          draftExists: false,
        },
      ],
    });
    expect(ctx.block_apply).toBe(false);
    expect(ctx.active_checklists).not.toContain("target_missing");
    expect(ctx.damage_class).toBe("new_public_content");
    expect(ctx.staff_summary.situation_description).toContain("Applying creates this post");
    expect(ctx.agent_preview.warnings.some((w) => w.code === "creates_attached_entry")).toBe(true);
  });

  it("treats outcome figures plus a creates_entry post as a mixed risk bundle", () => {
    const classes = collectDamageClassesForMixedCheck([
      { contentType: "program", existence: "exists", outcomeFigures: true },
      { contentType: "blog", existence: "missing", createsEntry: true },
    ]);
    expect(isMixedRiskBundle(classes)).toBe(true);
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

  it("adds adjacent_findings for existing_metadata edits and keeps ≤6 think items", () => {
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
    });
    expect(ctx.damage_class).toBe("existing_metadata");
    expect(ctx.active_checklists).toContain("adjacent_findings");
    expect(ctx.active_checklists).toContain("verify_copy");
    expect(ctx.active_checklists).toContain("disposition");
    expect(ctx.agent_preview.think_items.length).toBeLessThanOrEqual(6);
    expect(ctx.agent_preview.think_items.some((t) => t.id === "adjacent_findings")).toBe(true);
  });

  it("adds adjacent_findings for outcome-figure edits", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "landing/ai",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "content", value: "Our hire rate is 90%" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "landing",
            slug: "ai",
          },
        ],
      }),
      lookups: [
        {
          contentType: "landing",
          slug: "ai",
          locale: "en",
          existence: "exists",
        },
      ],
    });
    expect(ctx.damage_class).toBe("selling_page");
    expect(ctx.staff_summary.badge_label).toBe("Outcome figures");
    expect(ctx.active_checklists).toContain("adjacent_findings");
    expect(ctx.active_checklists).toContain("selling_page_figures");
    expect(ctx.agent_preview.think_items.length).toBeLessThanOrEqual(6);
  });

  it("skips adjacent_findings when target_missing blocks apply", () => {
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
    expect(ctx.active_checklists).not.toContain("adjacent_findings");
  });

  it("idea with no related_entries → none damage, opportunity harm situation", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({ kind: "idea" }),
      lookups: [],
    });
    expect(ctx.damage_class).toBe("none");
    expect(ctx.review_situations).toEqual(["idea_opportunity_harm"]);
    expect(ctx.filed_review_situations).toEqual([]);
    expect(ctx.situation_source).toBe("inferred");
    expect(ctx.active_checklists).toContain("idea_accept");
    expect(ctx.active_checklists).toContain("idea_opportunity_harm");
    expect(ctx.active_checklists).not.toContain("new_content_brand");
    expect(ctx.staff_summary.badge_label).toBe("Idea brief");
  });

  it("idea with anticipated_demand stacks default + demand label", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        review_situations: ["anticipated_demand"],
        title: "New AI tutor product",
        summary: "Launch of tutor product; lasting how-to queries after hype fades.",
      }),
      lookups: [],
    });
    expect(ctx.review_situations).toEqual(["idea_opportunity_harm", "anticipated_demand"]);
    expect(ctx.filed_review_situations).toEqual(["anticipated_demand"]);
    expect(ctx.situation_source).toBe("author");
    expect(ctx.active_checklists).toContain("idea_opportunity_harm");
    expect(ctx.active_checklists).toContain("anticipated_demand");
    expect(ctx.staff_summary.situation_description).toMatch(/lasting questions/i);
  });

  it("idea with broken_url stacks default + broken_url checklist", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        review_situations: ["broken_url"],
        summary: "404 /en/old-path still requested; proof from get_runtime_issues.",
      }),
      lookups: [],
    });
    expect(ctx.review_situations).toEqual(["idea_opportunity_harm", "broken_url"]);
    expect(ctx.active_checklists).toContain("broken_url");
    expect(ctx.active_checklists).toContain("idea_opportunity_harm");
    expect(ctx.staff_summary.situation_description).toMatch(/redirect|missing address/i);
  });

  it("idea does not infer demand labels from title/summary keywords", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        title: "Broken URL redirect for launch news",
        summary:
          "404 on /en/pricing after product launch; anticipated demand and fast decay news mentioned only in prose.",
      }),
      lookups: [],
    });
    expect(ctx.review_situations).toEqual(["idea_opportunity_harm"]);
    expect(ctx.filed_review_situations).toEqual([]);
    expect(ctx.active_checklists).not.toContain("broken_url");
    expect(ctx.active_checklists).not.toContain("anticipated_demand");
    expect(ctx.active_checklists).not.toContain("fast_decay_news");
  });

  it("idea with missing public related → new_public_content damage without brand checklist", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        related_entries: [{ contentType: "blog", slug: "new-spoke", locale: "en" }],
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "new-spoke",
          locale: "en",
          existence: "missing",
          draftExists: false,
        },
      ],
    });
    expect(ctx.damage_class).toBe("new_public_content");
    expect(ctx.review_situations).toEqual(["idea_opportunity_harm"]);
    expect(ctx.active_checklists).toContain("idea_opportunity_harm");
    expect(ctx.active_checklists).toContain("idea_accept");
    expect(ctx.active_checklists).not.toContain("new_content_brand");
    expect(ctx.active_checklists).not.toContain("selling_page_figures");
  });

  it("title/description only → title_description_ctr without verify_copy", () => {
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
            ops: [
              { field_path: "meta.page_title", value: "New" },
              { field_path: "meta.description", value: "Desc" },
            ],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.active_checklists).toContain("title_description_ctr");
    expect(ctx.active_checklists).not.toContain("verify_copy");
    expect(ctx.agent_preview.think_items.some((t) => t.id === "title_description_ctr")).toBe(true);
    expect(ctx.staff_summary.situation_description).toMatch(/search title\/description/i);
    const tpl = ctx.agent_preview.think_items.find((t) => t.id === "title_description_ctr");
    expect(tpl?.why.toLowerCase()).not.toMatch(/punchier|invite the click/);
    expect(tpl?.look_for.some((l) => /get_entry_activity/i.test(l))).toBe(true);
    expect(tpl?.look_for.some((l) => /duplicate_weaker|revise/i.test(l))).toBe(true);
    const disp = ctx.agent_preview.think_items.find((t) => t.id === "disposition");
    expect(disp?.look_for.some((l) => /same-field SERP churn/i.test(l))).toBe(true);
  });

  it("declared internal_links on content → internal_links checklist without verify_copy", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        review_situations: ["internal_links"],
        summary: "Add same-locale internal links to the cluster hub without changing figures.",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/hello",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "content", value: "body with [hub](/en/hub)" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.review_situations).toContain("internal_links");
    expect(ctx.active_checklists).toContain("internal_links");
    expect(ctx.active_checklists).not.toContain("verify_copy");
    expect(ctx.agent_preview.think_items.some((t) => t.id === "internal_links")).toBe(true);
  });

  it("empty situations + content without link keywords → body_copy_edit inferred", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        review_situations: [],
        summary: "Clarify the opening paragraph for accuracy.",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/hello",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "content", value: "updated" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.review_situations).toContain("body_copy_edit");
    expect(ctx.situation_source).toBe("inferred");
    expect(ctx.active_checklists).toContain("verify_copy");
  });

  it("funnel.* only → funnel_persona_product_stage without verify_copy", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        review_situations: [],
        summary:
          "Classify funnel for career-outcomes intent to ai-engineering awareness. Funnel fields only.",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/outcomes",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [
              { field_path: "funnel.stage", value: "awareness" },
              {
                field_path: "funnel.products",
                value: [{ product: "ai-engineering", persona: "the-career-changer" }],
              },
            ],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "outcomes",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "outcomes", locale: "en", existence: "exists" }],
    });
    expect(ctx.review_situations).toContain("funnel_classification");
    expect(ctx.review_situations).not.toContain("body_copy_edit");
    expect(ctx.active_checklists).toContain("funnel_persona_product_stage");
    expect(ctx.active_checklists).not.toContain("verify_copy");
    expect(ctx.agent_preview.think_items.some((t) => t.id === "funnel_persona_product_stage")).toBe(
      true,
    );
    expect(ctx.staff_summary.situation_description).toMatch(/buyer|funnel|product/i);
    const tpl = ctx.agent_preview.think_items.find((t) => t.id === "funnel_persona_product_stage");
    expect(tpl?.look_for.some((l) => /Persona/i.test(l))).toBe(true);
    expect(tpl?.look_for.some((l) => /products:all|breadth/i.test(l))).toBe(true);
  });

  it("title/description mixed with body → both checklists + mixed_serp_and_body", () => {
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
            ops: [
              { field_path: "meta.page_title", value: "New" },
              { field_path: "sections.0.data.title", value: "Body" },
            ],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.active_checklists).toContain("title_description_ctr");
    expect(ctx.active_checklists).toContain("verify_copy");
    expect(ctx.agent_preview.warnings.some((w) => w.code === "mixed_serp_and_body")).toBe(true);
  });

  it("seo.main_keyword only → no title_description_ctr", () => {
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
            ops: [{ field_path: "seo.main_keyword", value: "x" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.active_checklists).not.toContain("title_description_ctr");
    expect(ctx.active_checklists).toContain("verify_copy");
  });

  it("landing + title/desc without claim cues → title_description_ctr only", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "landing/ai",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "meta.description", value: "New desc" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "landing",
            slug: "ai",
          },
        ],
      }),
      lookups: [{ contentType: "landing", slug: "ai", locale: "en", existence: "exists" }],
    });
    expect(ctx.damage_class).not.toBe("selling_page");
    expect(ctx.active_checklists).not.toContain("selling_page_figures");
    expect(ctx.active_checklists).toContain("title_description_ctr");
  });

  it("blog body with salary → selling_page_figures", () => {
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
            ops: [{ field_path: "content", value: "Average salary is $85,000" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.damage_class).toBe("selling_page");
    expect(ctx.active_checklists).toContain("selling_page_figures");
    expect(ctx.needs_jev_claim_check).toBeFalsy();
    expect(ctx.review_situations).toContain("selling_figures");
  });

  it("blog body typo without cues → no figures", () => {
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
            ops: [{ field_path: "content", value: "Fixed a typo in the intro." }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.active_checklists).not.toContain("selling_page_figures");
    expect(ctx.damage_class).toBe("existing_content");
  });

  it("landing funnel-only → no figures", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "landing/ai",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "funnel.stage", value: "consideration" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "landing",
            slug: "ai",
          },
        ],
      }),
      lookups: [{ contentType: "landing", slug: "ai", locale: "en", existence: "exists" }],
    });
    expect(ctx.active_checklists).not.toContain("selling_page_figures");
    expect(ctx.review_situations).toContain("funnel_classification");
  });

  it("ambiguous cues + Jev yes → figures", () => {
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
            ops: [{ field_path: "content", value: "About 50% of the chapter covers recursion." }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
      claimCueJevOutcome: "yes",
    });
    expect(ctx.active_checklists).toContain("selling_page_figures");
    expect(ctx.jev?.outcome).toBe("yes");
  });

  it("ambiguous cues without Jev → needs_jev_claim_check", () => {
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
            ops: [{ field_path: "content", value: "About 50% of the chapter covers recursion." }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "hello",
          },
        ],
      }),
      lookups: [{ contentType: "blog", slug: "hello", locale: "en", existence: "exists" }],
    });
    expect(ctx.needs_jev_claim_check).toBe(true);
    expect(ctx.active_checklists).not.toContain("selling_page_figures");
  });

  it("promoteDraftText with salary → figures", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        promote_on_apply: true,
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/hello",
            locale: "en",
            variant: "draft.es",
            variant_fingerprint: "fp",
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
          variant: "draft.es",
          existence: "exists",
          draftExists: true,
        },
      ],
      promoteDraftText: "Graduates report an average salary of $72,000.",
    });
    expect(ctx.active_checklists).toContain("selling_page_figures");
  });

  it("countsAsLeadForm soft hint without figures", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "landing/ai",
            locale: "en",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "title", value: "AI course" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "landing",
            slug: "ai",
          },
        ],
      }),
      lookups: [{ contentType: "landing", slug: "ai", locale: "en", existence: "exists" }],
      countsAsLeadForm: true,
    });
    expect(ctx.counts_as_lead_hint).toBe(true);
    expect(ctx.active_checklists).not.toContain("selling_page_figures");
    expect(ctx.agent_preview.warnings.some((w) => w.code === "counts_as_lead_form")).toBe(true);
  });

  it("done title ops do not keep title_description_ctr when only body remains", () => {
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
            status: "done",
            ops: [{ field_path: "meta.page_title", value: "Shipped" }],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: 1,
            applied_by: "a",
            contentType: "blog",
            slug: "hello",
          },
          {
            id: 2,
            proposal_id: "p1",
            entry_key: "blog/hello",
            locale: "es",
            variant: null,
            variant_fingerprint: null,
            status: "pending",
            ops: [{ field_path: "sections.0.data.title", value: "Body" }],
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
        { contentType: "blog", slug: "hello", locale: "es", existence: "exists" },
      ],
    });
    expect(ctx.active_checklists).not.toContain("title_description_ctr");
    expect(ctx.active_checklists).toContain("verify_copy");
  });

  it("declared locale_translation promote packet → locale_translation checklist without verify_copy", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "edits",
        promote_on_apply: true,
        review_mode: "draft_backed",
        review_situations: ["locale_translation"],
        summary:
          "Translated from en → es. Promote draft.es for how-much — facts match source; slug locale-fitting.",
        entries: [
          {
            id: 1,
            proposal_id: "p1",
            entry_key: "blog/how-much",
            locale: "es",
            variant: "draft",
            variant_fingerprint: "x",
            status: "pending",
            ops: [],
            baseline_context: { values: {} },
            last_error: null,
            applied_at: null,
            applied_by: null,
            contentType: "blog",
            slug: "how-much",
          },
        ],
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "how-much",
          locale: "es",
          variant: "draft",
          existence: "exists",
          draftExists: true,
        },
      ],
    });
    expect(ctx.review_situations).toContain("locale_translation");
    expect(ctx.active_checklists).toContain("locale_translation");
    expect(ctx.active_checklists).not.toContain("verify_copy");
    expect(ctx.staff_summary.situation_description).toMatch(/locale translation/i);
    expect(ctx.agent_preview.think_items.some((t) => t.id === "locale_translation")).toBe(true);
  });

  it("warns undeclared existing_demand and stacks staff note when labeled", () => {
    const unlabeled = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        title: "Rank for what is machine learning",
        summary:
          "We want to rank and get cited for what is machine learning with a new explainer. ".repeat(2),
      }),
    });
    expect(unlabeled.agent_preview.warnings.some((w) => w.code === "existing_demand_undeclared")).toBe(true);

    const labeled = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        title: "Rank for what is machine learning",
        summary:
          "We want to rank and get cited for what is machine learning with a new explainer. ".repeat(2),
        review_situations: ["existing_demand"],
      }),
    });
    expect(labeled.review_situations).toContain("existing_demand");
    expect(labeled.agent_preview.warnings.some((w) => w.code === "existing_demand_undeclared")).toBe(false);
    expect(labeled.staff_summary.situation_description).toMatch(/search demand|SERP|weight/i);
  });

  it("warns idea_funnel_missing for new-URL ideas without structured funnel", () => {
    const ctx = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        title: "New article about Grok",
        summary: "Create a page that explains Grok for beginners searching the query. ".repeat(2),
        related_entries: [{ contentType: "blog", slug: "what-is-grok", locale: "en" }],
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "what-is-grok",
          locale: "en",
          existence: "missing",
          draftExists: false,
        },
      ],
    });
    expect(ctx.agent_preview.warnings.some((w) => w.code === "idea_funnel_missing")).toBe(true);

    const withFunnel = classifyProposalReview({
      proposal: baseProposal({
        kind: "idea",
        title: "New article about Grok",
        summary: "Create a page that explains Grok for beginners searching the query. ".repeat(2),
        related_entries: [{ contentType: "blog", slug: "what-is-grok", locale: "en" }],
        idea_funnel: { stage: "awareness", products: "all" },
      }),
      lookups: [
        {
          contentType: "blog",
          slug: "what-is-grok",
          locale: "en",
          existence: "missing",
          draftExists: false,
        },
      ],
    });
    expect(withFunnel.agent_preview.warnings.some((w) => w.code === "idea_funnel_missing")).toBe(false);
  });
});
