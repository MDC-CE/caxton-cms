import { describe, it, expect } from "vitest";
import {
  attentionPerspectiveFromGrants,
  clampProposalLimit,
  clampProposalOffset,
  isProposalsScoped,
  normalizeProposalStatsByKindStatus,
  parseProposalSort,
  PROPOSAL_STATS_SITE_WIDE_WARNING,
  proposalNextOffset,
  resolveListProposalsSort,
  shouldWarnAuthorAttentionScope,
} from "./list-proposals-mcp";

describe("list-proposals-mcp", () => {
  it("treats status or kind alone as scoped", () => {
    expect(isProposalsScoped({})).toBe(false);
    expect(isProposalsScoped({ limit: 20 })).toBe(false);
    expect(isProposalsScoped({ status: "open" })).toBe(true);
    expect(isProposalsScoped({ kind: "notes" })).toBe(true);
    expect(isProposalsScoped({ query: "cta" })).toBe(true);
  });

  it("treats escalated boolean and attention as scoped", () => {
    expect(isProposalsScoped({ escalated: true })).toBe(true);
    expect(isProposalsScoped({ escalated: false })).toBe(true);
    expect(isProposalsScoped({ attention: "blocked" })).toBe(true);
    expect(isProposalsScoped({ stalled: true })).toBe(true);
    expect(isProposalsScoped({ stalled: false })).toBe(true);
  });

  it("treats proposer filters as scoped", () => {
    expect(isProposalsScoped({ proposer_username: "alice@4geeks.com" })).toBe(true);
    expect(isProposalsScoped({ proposer_actor: { type: "ui" } })).toBe(true);
    expect(isProposalsScoped({ proposer_actor: { role: "copy_editor" } })).toBe(true);
    expect(isProposalsScoped({ proposer_actor: {} })).toBe(false);
    expect(isProposalsScoped({ agent_session_id: "sess-1" })).toBe(true);
  });

  it("clamps limit and computes next_offset", () => {
    expect(clampProposalLimit(undefined)).toBe(20);
    expect(clampProposalLimit(500)).toBe(200);
    expect(clampProposalOffset(-3)).toBe(0);
    expect(proposalNextOffset(0, 20, 50, 20)).toBe(20);
    expect(proposalNextOffset(40, 20, 50, 10)).toBe(null);
  });

  it("parseProposalSort defaults and rejects invalid", () => {
    expect(parseProposalSort(undefined, undefined)).toEqual({
      ok: true,
      sort: "updated_at",
      sortDir: "desc",
    });
    expect(parseProposalSort("created_at", "asc")).toEqual({
      ok: true,
      sort: "created_at",
      sortDir: "asc",
    });
    expect(parseProposalSort("attention", "desc")).toEqual({
      ok: true,
      sort: "attention",
      sortDir: "desc",
    });
    expect(parseProposalSort("published_at", "desc").ok).toBe(false);
    expect(parseProposalSort("updated_at", "sideways").ok).toBe(false);
  });

  it("resolveListProposalsSort defaults scoped lists to attention", () => {
    expect(resolveListProposalsSort({})).toEqual({
      sort: "attention",
      sortDir: "desc",
      sortDefaultedToAttention: true,
    });
    expect(resolveListProposalsSort({ sort: "updated_at" })).toEqual({
      sort: "updated_at",
      sortDir: "desc",
      sortDefaultedToAttention: false,
    });
  });

  it("attentionPerspectiveFromGrants is role-aware", () => {
    expect(attentionPerspectiveFromGrants([{ name: "proposals_review" } as never])).toBe(
      "reviewer",
    );
    expect(
      attentionPerspectiveFromGrants([
        { name: "proposals_create" } as never,
        { name: "proposals_review" } as never,
      ]),
    ).toBe("reviewer");
    expect(attentionPerspectiveFromGrants([{ name: "proposals_create" } as never])).toBe("author");
    expect(attentionPerspectiveFromGrants([{ name: "content_view" } as never])).toBe("reviewer");
  });

  it("shouldWarnAuthorAttentionScope when create-only without self filter", () => {
    expect(shouldWarnAuthorAttentionScope("author", {})).toBe(true);
    expect(shouldWarnAuthorAttentionScope("author", { proposer_username: "a" })).toBe(false);
    expect(shouldWarnAuthorAttentionScope("author", { agent_session_id: "s" })).toBe(false);
    expect(shouldWarnAuthorAttentionScope("reviewer", {})).toBe(false);
  });

  it("normalizeProposalStatsByKindStatus fills all nine buckets including zeros", () => {
    expect(normalizeProposalStatsByKindStatus(null)).toBe(null);
    expect(normalizeProposalStatsByKindStatus(undefined)).toBe(null);

    const empty = normalizeProposalStatsByKindStatus({ total: 0 });
    expect(empty).toMatchObject({
      total: 0,
      by_kind_status: {
        idea: { open: 0, finished: 0, rejected: 0 },
        edits: { open: 0, finished: 0, rejected: 0 },
        notes: { open: 0, finished: 0, rejected: 0 },
      },
    });

    const partial = normalizeProposalStatsByKindStatus({
      total: 3,
      by_kind_status: { edits: { open: 2 } },
    });
    expect(partial?.by_kind_status).toEqual({
      idea: { open: 0, finished: 0, rejected: 0 },
      edits: { open: 2, finished: 0, rejected: 0 },
      notes: { open: 0, finished: 0, rejected: 0 },
    });
  });

  it("PROPOSAL_STATS_SITE_WIDE_WARNING documents site-wide live stock", () => {
    expect(PROPOSAL_STATS_SITE_WIDE_WARNING.code).toBe("proposal_stats_site_wide");
    expect(PROPOSAL_STATS_SITE_WIDE_WARNING.message).toMatch(/site-wide|whole-site/i);
    expect(PROPOSAL_STATS_SITE_WIDE_WARNING.message).toMatch(/by_kind_status/);
  });
});
