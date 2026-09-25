/**
 * Stats-first helpers for list_proposals MCP tool.
 */

import {
  parseProposalSort,
  parseProposerActorType,
  type OutcomeReviewFilter,
  type ProposalSortDir,
  type ProposalSortField,
  type ProposerActorType,
} from "../../server/content-proposals/service.js";
import {
  PROPOSAL_ATTENTION_VALUES,
  type AttentionPerspective,
  type ProposalAttention,
} from "../../server/content-proposals/attention.js";
import {
  emptyKindStatusCounts,
  KPI_CARD_KINDS,
  KPI_CARD_STATUSES,
  type KindStatusCardCounts,
} from "../../server/content-proposals/kpi-history.js";
import type { CatalogGrant } from "./tool-catalog.js";
import { hasCapAnyScope } from "./tool-catalog.js";

export type ListProposalsArgs = {
  proposal_id?: string;
  query?: string;
  status?: string;
  kind?: string;
  issue_id?: string;
  proposer_username?: string;
  proposer_actor?: {
    type?: ProposerActorType;
    role?: string;
  };
  agent_session_id?: string;
  /** Latest non-author feedback or finished/rejected closer (exact, case-insensitive). */
  reviewer_username?: string;
  /** When true, only escalated proposals. */
  escalated?: boolean;
  /** Steward outcome review on closed proposals (human-only, informational). */
  outcome_review?: OutcomeReviewFilter;
  attention?: ProposalAttention;
  /** Accepted ideas with no successful implements follow-up. */
  stalled?: boolean;
  /** Open|partial edits that still need a reviewer. */
  needs_review?: boolean;
  limit?: number;
  offset?: number;
  sort?: string;
  sort_dir?: string;
};

export function isProposalsScoped(args: ListProposalsArgs): boolean {
  return Boolean(
    args.proposal_id?.trim() ||
      args.query?.trim() ||
      args.issue_id?.trim() ||
      args.status ||
      args.kind ||
      args.proposer_username?.trim() ||
      args.proposer_actor?.type ||
      args.proposer_actor?.role?.trim() ||
      args.agent_session_id?.trim() ||
      args.reviewer_username?.trim() ||
      args.escalated === true ||
      args.escalated === false ||
      args.outcome_review ||
      args.attention ||
      args.stalled === true ||
      args.stalled === false ||
      args.needs_review === true ||
      args.needs_review === false,
  );
}

/**
 * Reviewer order if proposals_review (alone or with create).
 * Create-only → author. View-only → reviewer.
 */
export function attentionPerspectiveFromGrants(
  grants: CatalogGrant[] | undefined,
): AttentionPerspective {
  if (grants && hasCapAnyScope(grants, "proposals_review")) return "reviewer";
  if (grants && hasCapAnyScope(grants, "proposals_create")) return "author";
  return "reviewer";
}

/** Scoped default: attention sort when sort omitted. */
export function resolveListProposalsSort(args: ListProposalsArgs): {
  sort: ProposalSortField;
  sortDir: ProposalSortDir;
  sortDefaultedToAttention: boolean;
} {
  const omitted = args.sort == null || String(args.sort).trim() === "";
  if (omitted) {
    return { sort: "attention", sortDir: "desc", sortDefaultedToAttention: true };
  }
  const parsed = parseProposalSort(args.sort, args.sort_dir);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return {
    sort: parsed.sort,
    sortDir: parsed.sortDir,
    sortDefaultedToAttention: false,
  };
}

export function shouldWarnAuthorAttentionScope(
  perspective: AttentionPerspective,
  args: ListProposalsArgs,
): boolean {
  if (perspective !== "author") return false;
  if (args.proposer_username?.trim() || args.agent_session_id?.trim()) return false;
  return true;
}

export function clampProposalLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return 20;
  return Math.min(200, Math.max(1, Math.floor(limit)));
}

export function clampProposalOffset(offset?: number): number {
  if (offset == null || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

export function proposalNextOffset(
  offset: number,
  limit: number,
  total: number,
  pageLen: number,
): number | null {
  const next = offset + pageLen;
  return next < total ? next : null;
}

/** Warning when scoped list still carries site-wide live KPI counts. */
export const PROPOSAL_STATS_SITE_WIDE_WARNING = {
  code: "proposal_stats_site_wide",
  message:
    "proposal_stats.by_kind_status is whole-site live stock (same as the staff KPI strip), not counts for this filter/page.",
} as const;

/**
 * Ensure by_kind_status always has idea|edits|notes × open|finished|rejected (zeros allowed).
 * Leaves other proposal_stats fields untouched.
 */
export function normalizeProposalStatsByKindStatus(
  stats: unknown,
): Record<string, unknown> | null {
  if (stats == null || typeof stats !== "object" || Array.isArray(stats)) return null;
  const base = { ...(stats as Record<string, unknown>) };
  const raw = base.by_kind_status;
  const out = emptyKindStatusCounts();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const src = raw as Record<string, Record<string, unknown>>;
    for (const kind of KPI_CARD_KINDS) {
      const bucket = src[kind];
      if (!bucket || typeof bucket !== "object") continue;
      for (const status of KPI_CARD_STATUSES) {
        const n = Number(bucket[status]);
        out[kind][status] = Number.isFinite(n) ? n : 0;
      }
    }
  }
  base.by_kind_status = out as KindStatusCardCounts;
  return base;
}

export {
  parseProposalSort,
  parseProposerActorType,
  PROPOSAL_ATTENTION_VALUES,
  type ProposalSortField,
  type ProposalSortDir,
  type ProposerActorType,
  type ProposalAttention,
  type AttentionPerspective,
};
