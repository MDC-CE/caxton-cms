import { randomUUID } from "crypto";
import fs from "fs";
import type Database from "better-sqlite3";
import { getSiteSqlite } from "../db";
import { child } from "../logger";
import { ensurePipelineDb } from "../pipeline-db/runner";
import { emitEvent } from "../events/event-store";
import { singleAttribution, type EventActor } from "../events/types";
import { getContentForEdit } from "../content-editor";
import { applyFieldUpdates, readFieldValueAtPath } from "../field-write-router";
import type { SiteContext } from "../site-manager";
import { fingerprintEdits, fingerprintNotes, fingerprintIdeas, stableJson } from "./fingerprint";
import {
  resolveProposalEntryActivity,
  type ResolveRecentActivityResult,
} from "./entry-activity";
import { hashVariantFileContents } from "../versioning/promote-with-teardown";
import { isSectionFieldPath, missingRequiredFromOps, type MissingTargetShape } from "./attached-entry-gate";
import { getFolder, getContentTypeConfig, listExtraUrlPatternParams } from "../content-types";
import { isEntryDetached, isTemplateVersioningSlug, resolveWritableVersioningTarget } from "../shared-layout-entry";
import { listRequiredEditorFields } from "@shared/validateRequiredFields";
import { extractParamSlug, validateUrlParamPeerValues } from "../url-param-peers";
import { ensurePublishedAtOnce } from "../published-at";
import { discardSeededAttachedEntry, seedAttachedLocaleFiles } from "./seed-attached-entry";
import {
  sameAgentIdentity,
  formatAgentActorLine,
  isStaffUiActor,
  type AgentActorLike,
} from "@shared/agent-identity";
import {
  DEFAULT_PROPOSAL_SETTINGS,
  getProposalSettings as loadProposalSettingsFromDisk,
  type ProposalSettings,
} from "../settings";
import {
  classifyProposalReview,
  collectDamageClassesForMixedCheck,
  isMixedRiskBundle,
  parseReviewSnapshot,
  snapshotFromReviewContext,
  type EntryExistenceLookup,
  type RelatedOpenProposal,
  type ReviewContext,
} from "./review-context";
import type { ExistenceState } from "./proposal-review-rules";
import {
  askTouchesOutcomeFigures,
  getDecisionClient,
} from "../ai/decisions";
import { anyEntryHasCountsAsLeadForm } from "./counts-as-lead-hint";
import { textFromUnknown, evaluateClaimCues } from "./claim-cues";
import {
  parseReviewSituationIds,
  parseIdeaAuthorSituationIds,
  refreshSituationsAfterRevise,
  type ReviewSituationId,
} from "./review-situations";
import {
  buildDecisionDebug,
  type ProposalDecisionDebug,
} from "./decision-debug";
import {
  compareByAttention,
  deriveProposalAttention,
  emptyAttentionCounts,
  resolvedBlockerCount,
  type AttentionPerspective,
  type ProposalAttention,
} from "./attention";
import {
  ensureKpiCatchUp,
  getKpiHistory,
  invalidateTodayKpiCache,
  liveByKindStatus,
  wipeAndBackfillKpiHistory,
  type KindStatusCardCounts,
  type KpiCardKind,
  type KpiGranularity,
  type KpiHistoryResult,
} from "./kpi-history";
import {
  funnelFromFieldOps,
  hasFunnelFieldOps,
  ideaFunnelComplete,
  ideaFunnelsEqual,
  ideaFunnelToYamlBlock,
  ideaRequiresStructuredFunnel,
  parseIdeaFunnel,
  validateIdeaFunnel,
  IDEA_FUNNEL_CONFLICT,
  IDEA_FUNNEL_FROZEN,
  IDEA_FUNNEL_REQUIRED,
  type IdeaFunnel,
} from "./idea-funnel";

const log = child({ module: "content-proposals" });

export type { AttentionPerspective, ProposalAttention };

export const PROPOSAL_CLAIM_TTL_MS = 30 * 60 * 1000;
export const RAG_SIMILARITY_THRESHOLD = 0.82;
export const MIN_SUMMARY = 80;
export const MIN_BLOCKER_BODY = 80;
export const MIN_CLOSE_NOTE = 20;
export const MIN_ACCEPT_NEXT_STEP = 20;
export const MIN_REJECT_NOTE = 80;

export type ProposalStatus = "open" | "partial" | "finished" | "rejected" | "withdrawn";
export type ProposalKind = "edits" | "notes" | "idea";
export type ProposalCategory = "content.field" | "content.seo";
export type EntryRowStatus = "pending" | "done" | "failed";
export type ReviewMode = "soft" | "soft_variant" | "draft_backed";
export type BlockerStatus = "open" | "resolved";
export type ProposalCloseReason =
  | "wont_fix"
  | "fixed_elsewhere"
  | "tracked_elsewhere"
  | "other"
  | "accepted";

export type ProposalRejectKind =
  | "bad_idea"
  | "not_implementable"
  | "illegal_or_policy"
  | "harmful"
  | "duplicate_weaker"
  | "target_missing";

/** Values stored in close_reason (notes/ideas close, reject kinds, withdraw). */
export type ProposalStoredCloseReason = ProposalCloseReason | ProposalRejectKind | "withdrawn";

export const PROPOSAL_CLOSE_REASONS: ProposalCloseReason[] = [
  "wont_fix",
  "fixed_elsewhere",
  "tracked_elsewhere",
  "other",
  "accepted",
];

export const PROPOSAL_REJECT_KINDS: ProposalRejectKind[] = [
  "bad_idea",
  "not_implementable",
  "illegal_or_policy",
  "harmful",
  "duplicate_weaker",
  "target_missing",
];

/** Close/park reasons for ideas (Accept uses accepted separately). */
export const IDEA_PARK_REASONS: ProposalCloseReason[] = [
  "wont_fix",
  "tracked_elsewhere",
  "other",
];

export type RelatedEntryRef = {
  contentType: string;
  slug: string;
  locale?: string;
};

/** Locked page target set on idea accept (required for follow-through). */
export type AcceptedEntry = {
  contentType: string;
  slug: string;
  locale: string;
};

export function parseAcceptedEntry(raw: unknown): AcceptedEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const contentType = typeof o.contentType === "string" ? o.contentType.trim() : "";
  const slug = typeof o.slug === "string" ? o.slug.trim() : "";
  const locale = typeof o.locale === "string" ? o.locale.trim() : "";
  if (!contentType || !slug || !locale) return null;
  return { contentType, slug, locale };
}

export function acceptedEntryKey(entry: AcceptedEntry): string {
  return `${entry.contentType}/${entry.slug}/${entry.locale}`;
}

export function entriesMatchAccepted(
  entries: Array<{ contentType: string; slug: string; locale: string }>,
  accepted: AcceptedEntry,
): boolean {
  if (entries.length === 0) return false;
  return entries.every(
    (e) =>
      e.contentType === accepted.contentType &&
      e.slug === accepted.slug &&
      e.locale === accepted.locale,
  );
}

export function isProposalCloseReason(raw: string): raw is ProposalCloseReason {
  return (PROPOSAL_CLOSE_REASONS as string[]).includes(raw);
}

export function isProposalRejectKind(raw: string): raw is ProposalRejectKind {
  return (PROPOSAL_REJECT_KINDS as string[]).includes(raw);
}

export type FieldUpdate = { field_path: string; value?: unknown; reset?: boolean };

export type ProposalClaim = {
  by: string;
  expiresAt: string;
  report?: string;
  /** MCP client/model (or ui) when claim was taken — for staff “via …” lines. */
  actor?: EventActor;
};

export type ProposalEntryInput = {
  contentType: string;
  slug: string;
  locale: string;
  variant?: string;
  updates?: FieldUpdate[];
};

export type ProposalEntryRow = {
  id: number;
  proposal_id: string;
  entry_key: string;
  locale: string;
  variant: string | null;
  variant_fingerprint: string | null;
  status: EntryRowStatus;
  ops: FieldUpdate[];
  baseline_context: { values: Record<string, unknown>; note?: string; creates_entry?: boolean };
  last_error: string | null;
  applied_at: number | null;
  applied_by: string | null;
  contentType: string;
  slug: string;
};

export type ProposalBlocker = {
  id: number;
  proposal_id: string;
  kind: "blocker";
  body: string;
  status: BlockerStatus;
  author: string;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
  resolve_note: string | null;
  agent_session_id: string | null;
  author_actor: Record<string, unknown>;
  resolved_by_actor: Record<string, unknown>;
};

export type ProposalRecord = {
  id: string;
  site: string;
  fingerprint: string;
  status: ProposalStatus;
  kind: ProposalKind;
  category: ProposalCategory;
  title: string;
  summary: string;
  rationale: string | null;
  documentation: Record<string, unknown>;
  related_issue_ids: string[];
  proposer_username: string;
  proposer_actor: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  claim: ProposalClaim | null;
  tags: string[];
  search_text: string;
  created_agent_session_id: string | null;
  promote_on_apply: boolean;
  review_mode: ReviewMode;
  open_blocker_count: number;
  no_auto_retry: boolean;
  escalated: boolean;
  escalated_at: number | null;
  escalated_by: string | null;
  escalated_note: string | null;
  close_reason: ProposalStoredCloseReason | null;
  close_note: string | null;
  closed_by: string | null;
  closed_at: number | null;
  related_entries: RelatedEntryRef[];
  entries: ProposalEntryRow[];
  blockers: ProposalBlocker[];
  /** Author-declared review situation ids (edits). Empty → infer on classify. */
  review_situations: string[];
  /** Snapshot JSON for list badges — persisted. */
  review_context_snapshot: Record<string, unknown> | null;
  /** Staff-only freeze of checklist/menu at terminal decide — persisted. */
  decision_debug: ProposalDecisionDebug | null;
  supersedes_proposal_id: string | null;
  replaced_by_proposal_id: string | null;
  /** Set on idea accept — reserved type/slug/locale for follow-up edits. */
  accepted_entry: AcceptedEntry | null;
  /**
   * Structured funnel intent for new-URL ideas (stage + products).
   * Immutable after accept; creating edits must match / seed from this.
   */
  idea_funnel: IdeaFunnel | null;
  /** Edits that implement an accepted idea (optional unless slug is reserved). */
  implements_proposal_id: string | null;
  /** Computed on read — accepted idea whose locked slug is a missing file-based attached post. */
  attached_create_entry?: AcceptedEntry | null;
  /** Last author rewrite or author-marked blocker fix. */
  author_content_at: number | null;
  /** Last reviewer add/reopen/non-author resolve. */
  reviewer_action_at: number | null;
  /** Enriched on read — not persisted. */
  recent_activity?: Array<{ entryKey: string; writeCount: number; windowDays: number }>;
  recent_activity_error?: string;
  /** Other open/partial proposals on overlapping targets that are currently escalated. */
  escalated_siblings?: Array<{ id: string; title: string }>;
};

/** Slim entry stub for multi-row list responses (no ops / baselines). */
export type ProposalEntrySummary = {
  contentType: string;
  slug: string;
  locale: string;
  variant: string | null;
  status: EntryRowStatus;
  last_error?: string | null;
};

/**
 * Thin proposal row for multi-row list / MCP triage.
 * Full ops + baselines stay on GET /:id and list with proposal_id.
 */
export type ProposalSummary = {
  detail: "summary";
  id: string;
  site: string;
  status: ProposalStatus;
  kind: ProposalKind;
  category: ProposalCategory;
  title: string;
  summary: string;
  related_issue_ids: string[];
  proposer_username: string;
  proposer_actor: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  claim: ProposalClaim | null;
  tags: string[];
  created_agent_session_id: string | null;
  promote_on_apply: boolean;
  review_mode: ReviewMode;
  open_blocker_count: number;
  resolved_blocker_count: number;
  /** Derived triage bucket; null when finished/rejected/withdrawn. */
  attention: ProposalAttention | null;
  no_auto_retry: boolean;
  escalated: boolean;
  escalated_at: number | null;
  escalated_by: string | null;
  escalated_note: string | null;
  close_reason: ProposalStoredCloseReason | null;
  close_note: string | null;
  closed_by: string | null;
  closed_at: number | null;
  related_entries: RelatedEntryRef[];
  /** Author-declared review situation ids (edits triage). */
  review_situations: string[];
  review_context_snapshot: Record<string, unknown> | null;
  supersedes_proposal_id: string | null;
  replaced_by_proposal_id: string | null;
  accepted_entry: AcceptedEntry | null;
  /** Structured funnel on ideas (new-URL); null when unset or non-idea. */
  idea_funnel: IdeaFunnel | null;
  implements_proposal_id: string | null;
  /**
   * Accepted idea whose locked slug is a missing file-based attached post.
   * Computed on read — not stored. Author follow-up is edits with no variant.
   */
  attached_create_entry?: AcceptedEntry | null;
  entry_count: number;
  /** Unique field paths across all entry ops (sorted). */
  field_paths: string[];
  entries: ProposalEntrySummary[];
  escalated_siblings?: Array<{ id: string; title: string }>;
};

function attentionForRecord(record: ProposalRecord): ProposalAttention | null {
  return deriveProposalAttention({
    status: record.status,
    escalated: record.escalated,
    open_blocker_count: record.open_blocker_count,
    resolved_blocker_count: resolvedBlockerCount(record.blockers),
    author_content_at: record.author_content_at,
    reviewer_action_at: record.reviewer_action_at,
  });
}

export function toProposalSummary(record: ProposalRecord): ProposalSummary {
  const pathSet = new Set<string>();
  for (const e of record.entries) {
    for (const op of e.ops ?? []) {
      if (typeof op.field_path === "string" && op.field_path.trim()) {
        pathSet.add(op.field_path);
      }
    }
  }
  const field_paths = [...pathSet].sort();
  const resolved_count = resolvedBlockerCount(record.blockers);
  const attention = attentionForRecord(record);
  return {
    detail: "summary",
    id: record.id,
    site: record.site,
    status: record.status,
    kind: record.kind,
    category: record.category,
    title: record.title,
    summary: record.summary,
    related_issue_ids: record.related_issue_ids,
    proposer_username: record.proposer_username,
    proposer_actor: record.proposer_actor,
    created_at: record.created_at,
    updated_at: record.updated_at,
    claim: record.claim,
    tags: record.tags,
    created_agent_session_id: record.created_agent_session_id,
    promote_on_apply: record.promote_on_apply,
    review_mode: record.review_mode,
    open_blocker_count: record.open_blocker_count,
    resolved_blocker_count: resolved_count,
    attention,
    no_auto_retry: record.no_auto_retry,
    escalated: record.escalated,
    escalated_at: record.escalated_at,
    escalated_by: record.escalated_by,
    escalated_note: record.escalated_note,
    close_reason: record.close_reason,
    close_note: record.close_note,
    closed_by: record.closed_by,
    closed_at: record.closed_at,
    related_entries: record.related_entries,
    review_situations: record.review_situations ?? [],
    review_context_snapshot: record.review_context_snapshot,
    supersedes_proposal_id: record.supersedes_proposal_id,
    replaced_by_proposal_id: record.replaced_by_proposal_id,
    accepted_entry: record.accepted_entry,
    idea_funnel: record.idea_funnel,
    implements_proposal_id: record.implements_proposal_id,
    attached_create_entry: record.attached_create_entry ?? null,
    entry_count: record.entries.length,
    field_paths,
    entries: record.entries.map((e) => ({
      contentType: e.contentType,
      slug: e.slug,
      locale: e.locale,
      variant: e.variant,
      status: e.status,
      ...(e.last_error ? { last_error: e.last_error } : {}),
    })),
    ...(record.escalated_siblings?.length
      ? { escalated_siblings: record.escalated_siblings }
      : {}),
  };
}

type ProposalRow = {
  id: string;
  site: string;
  fingerprint: string;
  status: ProposalStatus;
  kind: ProposalKind;
  category: ProposalCategory;
  title: string;
  summary: string;
  rationale: string | null;
  documentation_json: string;
  related_issue_ids_json: string;
  proposer_username: string;
  proposer_actor_json: string;
  created_at: number;
  updated_at: number;
  claim_json: string | null;
  tags_json: string;
  search_text: string;
  created_agent_session_id: string | null;
  promote_on_apply: number;
  no_auto_retry: number;
  escalated?: number;
  escalated_at?: number | null;
  escalated_by?: string | null;
  escalated_note?: string | null;
  close_reason: string | null;
  close_note: string | null;
  closed_by: string | null;
  closed_at: number | null;
  related_entries_json: string | null;
  review_situations_json?: string | null;
  review_context_snapshot_json: string | null;
  decision_debug_json?: string | null;
  supersedes_proposal_id: string | null;
  replaced_by_proposal_id: string | null;
  accepted_entry_json?: string | null;
  idea_funnel_json?: string | null;
  implements_proposal_id?: string | null;
  author_content_at?: number | null;
  reviewer_action_at?: number | null;
};

type EntryDbRow = {
  id: number;
  proposal_id: string;
  entry_key: string;
  locale: string;
  variant: string | null;
  variant_fingerprint: string | null;
  status: EntryRowStatus;
  ops_json: string;
  baseline_context_json: string;
  last_error: string | null;
  applied_at: number | null;
  applied_by: string | null;
};

type BlockerDbRow = {
  id: number;
  proposal_id: string;
  kind: string;
  body: string;
  status: BlockerStatus;
  author: string;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
  resolve_note: string | null;
  agent_session_id: string | null;
  author_actor_json: string | null;
  resolved_by_actor_json: string | null;
};

export type CreateProposalInput = {
  title: string;
  summary: string;
  rationale?: string;
  category?: ProposalCategory;
  documentation?: Record<string, unknown>;
  related_issue_ids?: string[];
  tags?: string[];
  entries?: ProposalEntryInput[];
  confirm_distinct?: boolean;
  /** Soft-confirm after inspecting recent entry writes (see confirm_recent_activity gate). */
  confirm_recent_activity?: boolean;
  situation_note?: string;
  agent_session_id?: string;
  promote_on_apply?: boolean;
  /** Explicit notes|idea when no entries; default notes. Ignored when entries/promote. */
  kind?: "notes" | "idea";
  related_entries?: RelatedEntryRef[];
  /** Optional: link a replacement to a rejected/withdrawn predecessor. */
  supersedes_proposal_id?: string;
  /** Edits: link to an accepted idea this work implements. */
  implements_proposal_id?: string;
  /**
   * Optional author-declared review situations (edits only).
   * Empty/omit → classifier infers from pending ops. Unknown ids fail create.
   */
  review_situations?: string[];
  /**
   * Ideas (new-URL): optional structured funnel `{ stage, products }`.
   * Soft warning when missing on new-URL create; accept refuses until complete.
   */
  idea_funnel?: IdeaFunnel | { stage?: string; products?: unknown };
};

export type SimilarProposal = { id: string; title: string; score: number };

export type ProposalUpdateAction =
  | "claim"
  | "release"
  | "withdraw"
  | "apply"
  | "acknowledge"
  | "close"
  | "reject"
  | "attach_variant"
  | "add_blocker"
  | "resolve_blocker"
  | "reopen_blocker"
  | "set_no_auto_retry"
  | "accept"
  | "revise_entries"
  | "set_review_situations"
  | "set_idea_funnel"
  | "escalate"
  | "deescalate";

export type ProposalUpdateCaller = {
  username: string;
  report?: string;
  asStaff?: boolean;
  agent_session_id?: string;
  /** Provenance for claim (and any future actor-storing actions). */
  actor?: EventActor;
  body?: string;
  blocker_id?: number;
  resolve_note?: string;
  variant?: string;
  contentType?: string;
  slug?: string;
  locale?: string;
  confirm_end_experiment?: boolean;
  /** Soft-confirm after inspecting recent entry writes on apply. */
  confirm_recent_activity?: boolean;
  /** Apply of a new attached post: principal approved a URL param not seen on peers. */
  confirm_new_values?: boolean;
  promote_on_apply?: boolean;
  close_reason?: string;
  close_note?: string;
  no_auto_retry?: boolean;
  /** Accept idea: free-text next step (min MIN_ACCEPT_NEXT_STEP). */
  next_step?: string;
  /** Accept idea: required locked page target. */
  accepted_entry?: AcceptedEntry | { contentType?: string; slug?: string; locale?: string };
  /** Reject: must be true for MCP; staff UI sends true after dialog. */
  confirm_reject?: boolean;
  reject_kind?: string;
  /** revise_entries: replacement pending entry set. */
  entries?: ProposalEntryInput[];
  /** set_review_situations: author-declared situation ids (edits). */
  review_situations?: string[];
  /** set_idea_funnel / create: structured funnel for new-URL ideas. */
  idea_funnel?: IdeaFunnel | { stage?: string; products?: unknown };
  /** escalate: required steward note (min MIN_CLOSE_NOTE). */
  escalated_note?: string;
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function splitEntryKey(entryKey: string): { contentType: string; slug: string } {
  const i = entryKey.indexOf("/");
  if (i <= 0) return { contentType: entryKey, slug: "" };
  return { contentType: entryKey.slice(0, i), slug: entryKey.slice(i + 1) };
}

function makeEntryKey(contentType: string, slug: string): string {
  return `${contentType}/${slug}`;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function rollupStatus(kind: ProposalKind, entries: ProposalEntryRow[]): ProposalStatus {
  if (kind === "notes" || kind === "idea") return "open";
  if (entries.length === 0) return "open";
  if (entries.every((e) => e.status === "done")) return "finished";
  if (entries.some((e) => e.status === "done")) return "partial";
  return "open";
}

export function deriveReviewMode(opts: {
  promote_on_apply: boolean;
  entries: Array<{ variant?: string | null }>;
}): ReviewMode {
  if (opts.promote_on_apply) return "draft_backed";
  if (opts.entries.some((e) => Boolean(e.variant))) return "soft_variant";
  return "soft";
}

function parseActorRecord(raw: string | null): Record<string, unknown> {
  const parsed = parseJson<unknown>(raw, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

/** Snapshot replace: missing or non-object actor fields stay SQL NULL. */
function blockerActorColumn(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return JSON.stringify(raw);
}

function mapBlocker(row: BlockerDbRow): ProposalBlocker {
  return {
    id: row.id,
    proposal_id: row.proposal_id,
    kind: "blocker",
    body: row.body,
    status: row.status,
    author: row.author,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    resolved_by: row.resolved_by,
    resolve_note: row.resolve_note,
    agent_session_id: row.agent_session_id,
    author_actor: parseActorRecord(row.author_actor_json),
    resolved_by_actor: parseActorRecord(row.resolved_by_actor_json),
  };
}

function mapEntry(row: EntryDbRow): ProposalEntryRow {
  const { contentType, slug } = splitEntryKey(row.entry_key);
  return {
    id: row.id,
    proposal_id: row.proposal_id,
    entry_key: row.entry_key,
    locale: row.locale,
    variant: row.variant,
    variant_fingerprint: row.variant_fingerprint ?? null,
    status: row.status,
    ops: parseJson(row.ops_json, []),
    baseline_context: parseJson(row.baseline_context_json, { values: {} }),
    last_error: row.last_error,
    applied_at: row.applied_at,
    applied_by: row.applied_by,
    contentType,
    slug,
  };
}

function mapProposal(
  row: ProposalRow,
  entries: ProposalEntryRow[],
  blockers: ProposalBlocker[],
): ProposalRecord {
  const promote_on_apply = Boolean(row.promote_on_apply);
  return {
    id: row.id,
    site: row.site,
    fingerprint: row.fingerprint,
    status: row.status,
    kind: row.kind,
    category: row.category,
    title: row.title,
    summary: row.summary,
    rationale: row.rationale,
    documentation: parseJson(row.documentation_json, {}),
    related_issue_ids: parseJson(row.related_issue_ids_json, []),
    proposer_username: row.proposer_username,
    proposer_actor: parseJson(row.proposer_actor_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    claim: parseJson(row.claim_json, null),
    tags: parseJson(row.tags_json, []),
    search_text: row.search_text,
    created_agent_session_id: row.created_agent_session_id ?? null,
    promote_on_apply,
    review_mode: deriveReviewMode({ promote_on_apply, entries }),
    open_blocker_count: blockers.filter((b) => b.status === "open").length,
    no_auto_retry: Boolean(row.no_auto_retry),
    escalated: Boolean(row.escalated),
    escalated_at: row.escalated_at ?? null,
    escalated_by: row.escalated_by ?? null,
    escalated_note: row.escalated_note ?? null,
    close_reason: (row.close_reason as ProposalStoredCloseReason | null) ?? null,
    close_note: row.close_note ?? null,
    closed_by: row.closed_by ?? null,
    closed_at: row.closed_at ?? null,
    related_entries: parseJson(row.related_entries_json ?? null, [] as RelatedEntryRef[]),
    review_situations: parseJson(row.review_situations_json ?? null, [] as string[]),
    review_context_snapshot: parseJson(row.review_context_snapshot_json ?? null, null as Record<
      string,
      unknown
    > | null),
    decision_debug: parseJson(row.decision_debug_json ?? null, null as ProposalDecisionDebug | null),
    supersedes_proposal_id: row.supersedes_proposal_id ?? null,
    replaced_by_proposal_id: row.replaced_by_proposal_id ?? null,
    accepted_entry: parseAcceptedEntry(parseJson(row.accepted_entry_json ?? null, null)),
    idea_funnel: parseIdeaFunnel(parseJson(row.idea_funnel_json ?? null, null)),
    implements_proposal_id: row.implements_proposal_id ?? null,
    author_content_at: row.author_content_at ?? null,
    reviewer_action_at: row.reviewer_action_at ?? null,
    entries,
    blockers,
  };
}

function dbFor(site: string): Database.Database {
  ensurePipelineDb(site);
  return getSiteSqlite(site);
}

function loadEntries(db: Database.Database, proposalId: string): ProposalEntryRow[] {
  const rows = db
    .prepare(`SELECT * FROM content_proposal_entries WHERE proposal_id = ? ORDER BY id`)
    .all(proposalId) as EntryDbRow[];
  return rows.map(mapEntry);
}

function loadBlockers(db: Database.Database, proposalId: string): ProposalBlocker[] {
  try {
    const rows = db
      .prepare(`SELECT * FROM content_proposal_blockers WHERE proposal_id = ? ORDER BY id`)
      .all(proposalId) as BlockerDbRow[];
    return rows.map(mapBlocker);
  } catch {
    return [];
  }
}

function loadProposal(db: Database.Database, id: string): ProposalRecord | null {
  const row = db.prepare(`SELECT * FROM content_proposals WHERE id = ?`).get(id) as ProposalRow | undefined;
  if (!row) return null;
  return mapProposal(row, loadEntries(db, id), loadBlockers(db, id));
}

function persistRollup(
  db: Database.Database,
  proposal: ProposalRecord,
  opts?: { closedBy?: string },
): ProposalStatus {
  if (proposal.kind === "notes" || proposal.kind === "idea") return proposal.status;
  const next = rollupStatus(proposal.kind, proposal.entries);
  const now = Date.now();
  if (next === "finished" && proposal.status !== "finished") {
    db.prepare(
      `UPDATE content_proposals
       SET status = ?, updated_at = ?,
           closed_at = COALESCE(closed_at, ?),
           closed_by = COALESCE(closed_by, ?)
       WHERE id = ?`,
    ).run(next, now, now, opts?.closedBy ?? null, proposal.id);
  } else {
    db.prepare(`UPDATE content_proposals SET status = ?, updated_at = ? WHERE id = ?`).run(
      next,
      now,
      proposal.id,
    );
  }
  return next;
}

function activeClaim(
  proposal: ProposalRecord,
  now = Date.now(),
): { active: ProposalClaim | null; expired: boolean } {
  const claim = proposal.claim;
  if (!claim) return { active: null, expired: false };
  if (new Date(claim.expiresAt).getTime() <= now) return { active: null, expired: true };
  return { active: claim, expired: false };
}

/** Open/partial notes with no_auto_retry that share any related issue id. */
function findOpenNotesBlockingRetry(
  db: Database.Database,
  site: string,
  relatedIssueIds: string[],
): ProposalRecord | null {
  if (relatedIssueIds.length === 0) return null;
  const rows = db
    .prepare(
      `SELECT * FROM content_proposals
       WHERE site = ? AND kind = 'notes' AND status IN ('open', 'partial') AND no_auto_retry = 1`,
    )
    .all(site) as ProposalRow[];
  for (const row of rows) {
    const ids = parseJson<string[]>(row.related_issue_ids_json, []);
    if (relatedIssueIds.some((id) => ids.includes(id))) {
      return mapProposal(row, loadEntries(db, row.id), loadBlockers(db, row.id));
    }
  }
  return null;
}

function validateCloseReason(
  reasonRaw: string | undefined,
  noteRaw: string | undefined,
):
  | { ok: true; reason: ProposalCloseReason; note: string | null }
  | { ok: false; code: string; error: string } {
  const reason = (reasonRaw || "").trim();
  if (reason === "accepted") {
    return {
      ok: false,
      code: "use_accept",
      error: "Use action accept with next_step to greenlight an idea",
    };
  }
  if (!isProposalCloseReason(reason)) {
    return {
      ok: false,
      code: "close_reason_required",
      error: `close_reason required: ${PROPOSAL_CLOSE_REASONS.join(" | ")}`,
    };
  }
  const note = (noteRaw || "").trim();
  if (reason !== "wont_fix" && note.length < MIN_CLOSE_NOTE) {
    return {
      ok: false,
      code: "close_note_required",
      error: `close_note required (min ${MIN_CLOSE_NOTE} characters) for ${reason}: say where / what`,
    };
  }
  return { ok: true, reason, note: note || null };
}

function emitProposalEvent(
  site: string,
  type:
    | "proposal_created"
    | "proposal_applied_progress"
    | "proposal_finished"
    | "proposal_acknowledged"
    | "proposal_closed"
    | "proposal_rejected"
    | "proposal_withdrawn"
    | "proposal_revised"
    | "proposal_escalated"
    | "proposal_deescalated"
    | "proposal_review_situations_set"
    | "proposal_idea_funnel_set",
  proposalId: string,
  author: string,
  payload: Record<string, unknown> = {},
  actor?: EventActor,
): void {
  if (
    type === "proposal_created" ||
    type === "proposal_finished" ||
    type === "proposal_closed" ||
    type === "proposal_rejected" ||
    type === "proposal_withdrawn" ||
    type === "proposal_applied_progress"
  ) {
    invalidateTodayKpiCache(site);
  }
  emitEvent({
    site,
    type,
    attribution: singleAttribution(author, actor),
    payload: { proposal_id: proposalId, ...payload },
  });
}

export type ProposalServiceDeps = {
  site: string;
  issueExists: (id: string) => boolean;
  captureBaseline: (entry: ProposalEntryInput) => { values: Record<string, unknown>; error?: string };
  applyUpdates: (
    entry: ProposalEntryRow,
    author: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readVariantFingerprint?: (entry: {
    contentType: string;
    slug: string;
    locale: string;
    variant: string;
  }) => { fingerprint: string; error?: string };
  promoteEntry?: (
    entry: ProposalEntryRow,
    author: string,
    opts: { confirm_end_experiment?: boolean },
  ) => Promise<{
    ok: boolean;
    error?: string;
    code?: string;
    traffic_siblings?: Array<{ slug: string; locale: string; allocation: number }>;
  }>;
  findSimilar?: (query: string) => Promise<SimilarProposal[]>;
  indexSearch?: (proposal: ProposalRecord) => Promise<void>;
  /** Override for tests; default uses event-store recent writes. */
  resolveRecentActivity?: (opts: {
    entries: Array<{ contentType: string; slug: string; locale: string; variant?: string | null }>;
    excludeAgentSessionId?: string | null;
    excludeProposalApplies?: Array<{
      contentType: string;
      slug: string;
      locale: string;
      variant?: string | null;
      applied_at: number | null;
      applied_by: string | null;
    }>;
  }) => ResolveRecentActivityResult;
  /**
   * Resolve whether live (and optional draft) content exists.
   * Default assumes exists (tests); production wires getContentForEdit.
   */
  resolveExistence?: (entry: {
    contentType: string;
    slug: string;
    locale: string;
    variant?: string | null;
  }) => { live: ExistenceState; draftExists: boolean };
  /**
   * When live content is missing: database row vs file-based attached post vs anything else.
   * Default (tests): other — missing live stays entry_not_found.
   */
  inspectMissingTarget?: (entry: { contentType: string; slug: string }) => MissingTargetShape;
  /** Validate and seed a new attached locale before field ops. seeded means this apply created the folder. */
  prepareCreatesEntry?: (
    entry: ProposalEntryRow,
    opts: {
      confirmNewValues?: boolean;
      author: string;
      /** When implementing an accepted idea, seed matching funnel onto _common.yml. */
      ideaFunnel?: IdeaFunnel | null;
    },
  ) => Promise<{ ok: boolean; error?: string; code?: string; seeded?: boolean }>;
  /** Delete a folder this apply created after a later step failed. */
  discardSeededEntry?: (entry: ProposalEntryRow) => void;
  /** Stamp published_at on first go-live when still empty. */
  stampPublishedAt?: (entry: ProposalEntryRow, author: string) => { ok: boolean; error?: string };
  /** Site Agents Rules policy; default = hardcoded defaults (tests / omitted). */
  getProposalSettings?: () => ProposalSettings;
};

export type ProposalStats = {
  total: number;
  by_status: Record<ProposalStatus, number>;
  by_kind: Record<ProposalKind, number>;
  escalated_count: number;
  /** Open|partial rows by derived attention (escalated label wins when flagged). */
  by_attention: Record<ProposalAttention, number>;
  /** Live stock for KPI cards: open includes partial; withdrawn omitted. */
  by_kind_status: KindStatusCardCounts;
  /** Accepted ideas with locked entry and no open/partial/finished implements child. */
  stalled_ideas: number;
  /** Open|partial edits in awaiting_rereview or no_feedback (not blocked, not escalated). */
  needs_review_edits: number;
};

const EMPTY_STATUS_COUNTS: Record<ProposalStatus, number> = {
  open: 0,
  partial: 0,
  finished: 0,
  rejected: 0,
  withdrawn: 0,
};

const EMPTY_KIND_COUNTS: Record<ProposalKind, number> = {
  edits: 0,
  notes: 0,
  idea: 0,
};

function asAgentActor(actor: EventActor | Record<string, unknown> | undefined | null): AgentActorLike | null {
  if (!actor || typeof actor !== "object") return null;
  const type = (actor as { type?: string }).type;
  if (type !== "ui" && type !== "mcp" && type !== "system") return null;
  return actor as AgentActorLike;
}

function fourEyesBlocked(
  proposerUsername: string,
  proposerActor: Record<string, unknown> | EventActor | undefined,
  callerUsername: string,
  callerActor: EventActor | undefined,
): boolean {
  return sameAgentIdentity(
    proposerUsername,
    asAgentActor(proposerActor),
    callerUsername,
    asAgentActor(callerActor),
  );
}

function fourEyesBlockedForCaller(
  policy: ProposalSettings,
  proposerUsername: string,
  proposerActor: Record<string, unknown> | EventActor | undefined,
  callerUsername: string,
  callerActor: EventActor | undefined,
): boolean {
  if (!policy.four_eyes.enabled) return false;
  if (policy.four_eyes.staff_ui_exempt && isStaffUiActor(asAgentActor(callerActor))) {
    return false;
  }
  return fourEyesBlocked(proposerUsername, proposerActor, callerUsername, callerActor);
}

export const PROPOSAL_SORT_FIELDS = ["created_at", "updated_at", "attention"] as const;
export type ProposalSortField = (typeof PROPOSAL_SORT_FIELDS)[number];
export type ProposalSortDir = "asc" | "desc";

export const PROPOSER_ACTOR_TYPES = ["ui", "mcp", "system"] as const;
export type ProposerActorType = (typeof PROPOSER_ACTOR_TYPES)[number];

export function parseProposalSort(
  sort?: string | null,
  sortDir?: string | null,
):
  | { ok: true; sort: ProposalSortField; sortDir: ProposalSortDir }
  | { ok: false; error: string } {
  const fieldRaw = sort == null || String(sort).trim() === "" ? "updated_at" : String(sort).trim();
  if (fieldRaw !== "created_at" && fieldRaw !== "updated_at" && fieldRaw !== "attention") {
    return {
      ok: false,
      error: `Invalid sort '${fieldRaw}'. Allowed: created_at, updated_at, attention`,
    };
  }
  // Attention rank is fixed; sort_dir is accepted but ignored by list().
  const dirRaw =
    sortDir == null || String(sortDir).trim() === "" ? "desc" : String(sortDir).trim();
  if (dirRaw !== "asc" && dirRaw !== "desc") {
    return {
      ok: false,
      error: `Invalid sort_dir '${dirRaw}'. Allowed: asc, desc`,
    };
  }
  return { ok: true, sort: fieldRaw, sortDir: dirRaw };
}

/** Empty/missing → undefined (no filter). Invalid non-empty → error. */
export function parseProposerActorType(
  raw?: string | null,
):
  | { ok: true; type: ProposerActorType | undefined }
  | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, type: undefined };
  }
  const trimmed = String(raw).trim();
  if (trimmed === "ui" || trimmed === "mcp" || trimmed === "system") {
    return { ok: true, type: trimmed };
  }
  return {
    ok: false,
    error: `Invalid proposer_actor_type '${trimmed}'. Allowed: ui, mcp, system`,
  };
}

/** Empty/missing → undefined (no filter). `1`/`true`/`0`/`false` (case-insensitive). */
export function parseEscalatedQuery(
  raw?: string | null,
): { ok: true; escalated: boolean | undefined } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, escalated: undefined };
  }
  const trimmed = String(raw).trim().toLowerCase();
  if (trimmed === "1" || trimmed === "true") return { ok: true, escalated: true };
  if (trimmed === "0" || trimmed === "false") return { ok: true, escalated: false };
  return {
    ok: false,
    error: `Invalid escalated '${raw}'. Allowed: 1, 0, true, false`,
  };
}

function compareProposalsBySort(
  a: ProposalRecord,
  b: ProposalRecord,
  sort: ProposalSortField,
  sortDir: ProposalSortDir,
): number {
  if (sort === "attention") {
    // Callers should use compareByAttention; keep a safe chronological fallback.
    const factor = sortDir === "asc" ? 1 : -1;
    if (a.updated_at !== b.updated_at) return (a.updated_at - b.updated_at) * factor;
    return a.id.localeCompare(b.id);
  }
  const factor = sortDir === "asc" ? 1 : -1;
  const av = a[sort];
  const bv = b[sort];
  if (av !== bv) return (av - bv) * factor;
  return a.id.localeCompare(b.id);
}

function findOpenProposalForVariant(
  db: Database.Database,
  site: string,
  contentType: string,
  slug: string,
  locale: string,
  variant: string,
): ProposalRecord | null {
  const entryKey = makeEntryKey(contentType, slug);
  const rows = db
    .prepare(
      `SELECT p.id FROM content_proposals p
       INNER JOIN content_proposal_entries e ON e.proposal_id = p.id
       WHERE p.site = ? AND p.status IN ('open','partial')
         AND e.entry_key = ? AND e.locale = ? AND e.variant = ?
       LIMIT 1`,
    )
    .all(site, entryKey, locale, variant) as Array<{ id: string }>;
  if (!rows[0]) return null;
  return loadProposal(db, rows[0].id);
}

/** Open/partial edits targeting same type+slug+locale (any variant). */
function findOpenEditsForEntry(
  db: Database.Database,
  site: string,
  contentType: string,
  slug: string,
  locale: string,
  excludeProposalId?: string,
): ProposalRecord | null {
  const entryKey = makeEntryKey(contentType, slug);
  const rows = db
    .prepare(
      `SELECT p.id FROM content_proposals p
       INNER JOIN content_proposal_entries e ON e.proposal_id = p.id
       WHERE p.site = ? AND p.kind = 'edits' AND p.status IN ('open','partial')
         AND e.entry_key = ? AND e.locale = ?
       LIMIT 5`,
    )
    .all(site, entryKey, locale) as Array<{ id: string }>;
  for (const row of rows) {
    if (excludeProposalId && row.id === excludeProposalId) continue;
    return loadProposal(db, row.id);
  }
  return null;
}

const STALLED_IMPLEMENTS_STATUSES = "('open','partial','finished')";

/** SQL predicate for stalled accepted ideas. Pass table alias (e.g. `p`) or `""` for unqualified columns. */
function stalledIdeaSqlPredicate(alias: string): string {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  return (
    `${col("kind")} = 'idea' AND ${col("status")} = 'finished' AND ${col("close_reason")} = 'accepted' ` +
    `AND ${col("accepted_entry_json")} IS NOT NULL AND TRIM(${col("accepted_entry_json")}) != '' ` +
    `AND ${col("accepted_entry_json")} != 'null' AND NOT EXISTS (` +
    `SELECT 1 FROM content_proposals c WHERE c.site = ${col("site")} ` +
    `AND c.implements_proposal_id = ${col("id")} AND c.kind = 'edits' ` +
    `AND c.status IN ${STALLED_IMPLEMENTS_STATUSES})`
  );
}

function countStalledIdeas(db: Database.Database, site: string): number {
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM content_proposals p WHERE p.site = ? AND ${stalledIdeaSqlPredicate("p")}`,
      )
      .get(site) as { n: number };
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}

function findAcceptedIdeaOwningEntry(
  db: Database.Database,
  site: string,
  contentType: string,
  slug: string,
  locale: string,
  excludeIdeaId?: string,
): ProposalRecord | null {
  const key = acceptedEntryKey({ contentType, slug, locale });
  const rows = db
    .prepare(
      `SELECT id, accepted_entry_json FROM content_proposals
       WHERE site = ? AND kind = 'idea' AND status = 'finished' AND close_reason = 'accepted'
         AND accepted_entry_json IS NOT NULL`,
    )
    .all(site) as Array<{ id: string; accepted_entry_json: string }>;
  for (const row of rows) {
    if (excludeIdeaId && row.id === excludeIdeaId) continue;
    const entry = parseAcceptedEntry(parseJson(row.accepted_entry_json, null));
    if (!entry) continue;
    if (acceptedEntryKey(entry) === key) {
      return loadProposal(db, row.id);
    }
  }
  return null;
}

function findOpenImplementsForIdea(
  db: Database.Database,
  site: string,
  ideaId: string,
  excludeProposalId?: string,
): ProposalRecord | null {
  const rows = db
    .prepare(
      `SELECT id FROM content_proposals
       WHERE site = ? AND kind = 'edits' AND status IN ('open','partial')
         AND implements_proposal_id = ?
       LIMIT 5`,
    )
    .all(site, ideaId) as Array<{ id: string }>;
  for (const row of rows) {
    if (excludeProposalId && row.id === excludeProposalId) continue;
    return loadProposal(db, row.id);
  }
  return null;
}

/** Open proposals referencing a variant (for delete_variant warnings). */
export function listOpenProposalsForVariant(
  site: string,
  contentType: string,
  slug: string,
  locale: string,
  variant: string,
): Array<{ id: string; title: string; status: ProposalStatus }> {
  const db = dbFor(site);
  const entryKey = makeEntryKey(contentType, slug);
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.status FROM content_proposals p
       INNER JOIN content_proposal_entries e ON e.proposal_id = p.id
       WHERE p.site = ? AND p.status IN ('open','partial')
         AND e.entry_key = ? AND e.locale = ? AND e.variant = ?`,
    )
    .all(site, entryKey, locale, variant) as Array<{
    id: string;
    title: string;
    status: ProposalStatus;
  }>;
  return rows;
}

function proposalTargetKeys(proposal: {
  entries?: Array<{ contentType: string; slug: string; locale: string }>;
  related_entries?: RelatedEntryRef[];
}): Set<string> {
  const keys = new Set<string>();
  for (const e of proposal.entries ?? []) {
    keys.add(`${e.contentType}\0${e.slug}\0${e.locale}`);
  }
  for (const r of proposal.related_entries ?? []) {
    keys.add(`${r.contentType}\0${r.slug}\0${r.locale ?? ""}`);
  }
  return keys;
}

function findEscalatedSiblings(
  db: Database.Database,
  site: string,
  proposal: ProposalRecord,
): Array<{ id: string; title: string }> {
  const mine = proposalTargetKeys(proposal);
  if (mine.size === 0) return [];
  const rows = db
    .prepare(
      `SELECT * FROM content_proposals
       WHERE site = ? AND status IN ('open','partial') AND escalated = 1 AND id != ?`,
    )
    .all(site, proposal.id) as ProposalRow[];
  const out: Array<{ id: string; title: string }> = [];
  for (const row of rows) {
    const other = mapProposal(row, loadEntries(db, row.id), []);
    const theirs = proposalTargetKeys(other);
    let overlap = false;
    for (const k of mine) {
      if (theirs.has(k)) {
        overlap = true;
        break;
      }
    }
    if (overlap) out.push({ id: row.id, title: row.title });
  }
  return out;
}

export function createProposalService(deps: ProposalServiceDeps) {
  const site = deps.site;

  function policy(): ProposalSettings {
    if (deps.getProposalSettings) return deps.getProposalSettings();
    return {
      withdraw: { ...DEFAULT_PROPOSAL_SETTINGS.withdraw },
      four_eyes: { ...DEFAULT_PROPOSAL_SETTINGS.four_eyes },
      hold: { ...DEFAULT_PROPOSAL_SETTINGS.hold },
      claim: { ...DEFAULT_PROPOSAL_SETTINGS.claim },
    };
  }

  function runResolveActivity(opts: {
    entries: Array<{ contentType: string; slug: string; locale: string; variant?: string | null }>;
    excludeAgentSessionId?: string | null;
    excludeProposalApplies?: Array<{
      contentType: string;
      slug: string;
      locale: string;
      variant?: string | null;
      applied_at: number | null;
      applied_by: string | null;
    }>;
  }): ResolveRecentActivityResult {
    if (deps.resolveRecentActivity) return deps.resolveRecentActivity(opts);
    return resolveProposalEntryActivity({ site, ...opts });
  }

  function resolveExistence(entry: {
    contentType: string;
    slug: string;
    locale: string;
    variant?: string | null;
  }): { live: ExistenceState; draftExists: boolean } {
    if (deps.resolveExistence) return deps.resolveExistence(entry);
    return { live: "exists", draftExists: Boolean(entry.variant?.trim()) };
  }

  function attachedCreateKey(contentType: string, slug: string, locale: string): string {
    return `${contentType}\0${slug}\0${locale}`;
  }

  function inspectTarget(contentType: string, slug: string): MissingTargetShape {
    if (!deps.inspectMissingTarget) return { shape: "other" };
    return deps.inspectMissingTarget({ contentType, slug });
  }

  function attachedCreateHintFor(proposal: ProposalRecord): AcceptedEntry | null {
    if (proposal.kind !== "idea" || proposal.close_reason !== "accepted" || !proposal.accepted_entry) {
      return null;
    }
    const ae = proposal.accepted_entry;
    const ex = resolveExistence({ contentType: ae.contentType, slug: ae.slug, locale: ae.locale });
    if (ex.live === "exists") return null;
    const shape = inspectTarget(ae.contentType, ae.slug);
    if (shape.shape !== "attached_file") return null;
    return ae;
  }

  function withAttachedCreate(proposal: ProposalRecord): ProposalRecord {
    const hint = attachedCreateHintFor(proposal);
    if (!hint) return proposal;
    return { ...proposal, attached_create_entry: hint };
  }

  function resolveImplementsForEdits(
    db: Database.Database,
    implementsRaw: string | undefined,
    entriesIn: ProposalEntryInput[],
    excludeProposalId?: string,
  ):
    | { ok: true; idea: ProposalRecord | null }
    | {
        ok: false;
        code: string;
        error: string;
        existing_proposal?: ProposalRecord;
        duplicate_of?: string;
      } {
    const id = implementsRaw?.trim() || "";
    let idea: ProposalRecord | null = null;
    if (id) {
      idea = loadProposal(db, id);
      if (
        !idea ||
        idea.site !== site ||
        idea.kind !== "idea" ||
        idea.close_reason !== "accepted" ||
        idea.status !== "finished"
      ) {
        return {
          ok: false,
          code: "implements_not_found",
          error:
            "implements_proposal_id must reference an accepted idea on this site (finished with close_reason accepted).",
        };
      }
      if (!idea.accepted_entry) {
        return {
          ok: false,
          code: "implements_idea_incomplete",
          error:
            "That accepted idea has no locked page entry. Staff must re-accept with a content type, slug, and locale (legacy ideas).",
          existing_proposal: idea,
        };
      }
      if (!entriesMatchAccepted(entriesIn, idea.accepted_entry)) {
        const ae = idea.accepted_entry;
        return {
          ok: false,
          code: "implements_entry_mismatch",
          error: `Edits must target ${ae.contentType}/${ae.slug} (${ae.locale}) to implement this idea.`,
          existing_proposal: idea,
        };
      }
      const openImpl = findOpenImplementsForIdea(db, site, idea.id, excludeProposalId);
      if (openImpl) {
        return {
          ok: false,
          code: "idea_already_in_progress",
          error: `An open edits proposal already implements this idea (${openImpl.id}). Join it instead of creating another.`,
          duplicate_of: openImpl.id,
          existing_proposal: openImpl,
        };
      }
    }
    for (const e of entriesIn) {
      const owner = findAcceptedIdeaOwningEntry(db, site, e.contentType, e.slug, e.locale);
      if (!owner) continue;
      if (!id) {
        return {
          ok: false,
          code: "implements_required",
          error: `An accepted idea (${owner.id}) already reserved ${e.contentType}/${e.slug} (${e.locale}). Pass implements_proposal_id: "${owner.id}".`,
          duplicate_of: owner.id,
          existing_proposal: owner,
        };
      }
      if (id !== owner.id) {
        return {
          ok: false,
          code: "implements_required",
          error: `That page is reserved by accepted idea ${owner.id}. Pass implements_proposal_id: "${owner.id}".`,
          duplicate_of: owner.id,
          existing_proposal: owner,
        };
      }
    }
    return { ok: true, idea };
  }

  function gateMissingAttachedEntry(opts: {
    entry: ProposalEntryInput;
    promoteOnApply: boolean;
    hasVariant: boolean;
    implementsIdea: ProposalRecord | null;
    db: Database.Database;
  }):
    | { ok: true; createsEntry: boolean }
    | { ok: false; code: string; error: string; existing_proposal?: ProposalRecord; duplicate_of?: string } {
    const e = opts.entry;
    const shape = inspectTarget(e.contentType, e.slug);
    const where = `${e.contentType}/${e.slug} (${e.locale})`;
    if (shape.shape === "database") {
      return {
        ok: false,
        code: "database_entry_required",
        error:
          `${where} is a database entry and has no row yet. This workflow cannot create that row. ` +
          "Field updates still work once the row exists (they write overrides). The accepted idea can stay reserved.",
      };
    }
    if (shape.shape === "attached_file" && (opts.hasVariant || opts.promoteOnApply)) {
      return {
        ok: false,
        code: "attached_no_draft",
        error:
          `${where} is an attached post. Do not attach a draft or promote_on_apply. ` +
          "Resubmit with implements_proposal_id, review_situations [\"new_public_content\"], and field updates only. Apply creates the files.",
      };
    }
    if (shape.shape !== "attached_file") {
      if (!opts.hasVariant) {
        return {
          ok: false,
          code: "entry_not_found",
          error: `Page ${where} does not exist yet. File an idea brief, or create the draft first, then propose edits on that target.`,
        };
      }
      return {
        ok: false,
        code: "entry_not_found",
        error: `Draft variant '${e.variant}' for ${where} was not found. Create the draft first, or use kind idea for a new-page brief.`,
      };
    }
    if (!opts.implementsIdea) {
      const owner = findAcceptedIdeaOwningEntry(opts.db, site, e.contentType, e.slug, e.locale);
      if (owner) {
        return {
          ok: false,
          code: "implements_required",
          error: `An accepted idea (${owner.id}) already reserved ${where}. Pass implements_proposal_id: "${owner.id}".`,
          duplicate_of: owner.id,
          existing_proposal: owner,
        };
      }
      return {
        ok: false,
        code: "entry_not_found",
        error: `Page ${where} does not exist yet. File an idea brief, accept it with this slug, then propose field edits with implements_proposal_id. Do not create a draft.`,
      };
    }
    const updates = e.updates ?? [];
    const sectionPaths = updates.map((u) => u.field_path).filter(isSectionFieldPath);
    if (sectionPaths.length) {
      return {
        ok: false,
        code: "attached_sections_refused",
        error: `Attached posts do not take section writes (${sectionPaths.join(", ")}). Send field updates only. The shared template stays unchanged.`,
      };
    }
    const missing = missingRequiredFromOps(shape.requiredFields, updates);
    if (missing.length) {
      return {
        ok: false,
        code: "required_fields_missing",
        error: `This new post is missing required fields: ${missing.join(", ")}. The accepted idea still holds the slug. Add those field updates and retry.`,
      };
    }
    return { ok: true, createsEntry: true };
  }

  function buildLookupsForProposal(proposal: ProposalRecord): EntryExistenceLookup[] {
    const lookups: EntryExistenceLookup[] = [];
    if (proposal.kind === "edits") {
      for (const e of proposal.entries) {
        const ex = resolveExistence({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant,
        });
        lookups.push({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant,
          existence: ex.live,
          draftExists: ex.draftExists,
        });
      }
    } else if (proposal.kind === "idea") {
      for (const r of proposal.related_entries ?? []) {
        const locale = r.locale?.trim() || "en";
        const ex = resolveExistence({
          contentType: r.contentType,
          slug: r.slug,
          locale,
        });
        lookups.push({
          contentType: r.contentType,
          slug: r.slug,
          locale,
          existence: ex.live,
          draftExists: false,
        });
      }
    }
    return lookups;
  }

  function findRelatedOpenByIssues(proposal: ProposalRecord): RelatedOpenProposal[] {
    const ids = proposal.related_issue_ids ?? [];
    if (!ids.length) return [];
    const db = dbFor(site);
    const rows = db
      .prepare(
        `SELECT * FROM content_proposals WHERE site = ? AND status IN ('open','partial') AND id != ?`,
      )
      .all(site, proposal.id) as ProposalRow[];
    const out: RelatedOpenProposal[] = [];
    for (const row of rows) {
      const issueIds = parseJson<string[]>(row.related_issue_ids_json, []);
      const shared = ids.filter((id) => issueIds.includes(id));
      if (!shared.length) continue;
      out.push({
        id: row.id,
        title: row.title,
        kind: row.kind,
        shared_issue_ids: shared,
      });
    }
    return out;
  }

  function persistSnapshot(proposalId: string, snap: Record<string, unknown>): void {
    dbFor(site)
      .prepare(
        `UPDATE content_proposals SET review_context_snapshot_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(JSON.stringify(snap), Date.now(), proposalId);
  }

  function mergeProposalTags(proposalId: string, add: string[]): void {
    if (!add.length) return;
    const row = dbFor(site)
      .prepare(`SELECT tags_json FROM content_proposals WHERE id = ?`)
      .get(proposalId) as { tags_json: string } | undefined;
    if (!row) return;
    const existing = parseJson<string[]>(row.tags_json, []);
    const next = [...existing];
    for (const t of add) {
      if (!next.includes(t)) next.push(t);
    }
    if (next.length === existing.length) return;
    dbFor(site)
      .prepare(`UPDATE content_proposals SET tags_json = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(next), Date.now(), proposalId);
  }

  function tryLoadPromoteDraftText(proposal: ProposalRecord): string | null {
    if (!proposal.promote_on_apply || !deps.readVariantFingerprint) return null;
    try {
      const e = proposal.entries.find((x) => x.variant?.trim());
      if (!e?.variant?.trim()) return null;
      // Fingerprint path already proved file exists at create; re-read raw via getContentForEdit-style if available
      const baseline = e.baseline_context?.values;
      if (baseline && typeof baseline === "object") {
        const fromBaseline = textFromUnknown(baseline);
        if (fromBaseline.trim()) return fromBaseline;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function classifyLive(
    proposal: ProposalRecord,
    opts?: { persistIfMissingSnapshot?: boolean; refreshSnapshot?: boolean },
  ): Promise<ReviewContext | null> {
    if (proposal.status !== "open" && proposal.status !== "partial") return null;

    const workEntries = proposal.entries.filter(
      (e) => !e.status || e.status === "pending" || e.status === "failed",
    );
    const countsAsLeadForm =
      proposal.kind === "edits"
        ? anyEntryHasCountsAsLeadForm(
            (workEntries.length ? workEntries : proposal.entries).map((e) => ({
              contentType: e.contentType,
              slug: e.slug,
              locale: e.locale,
            })),
          )
        : false;

    const promoteDraftText = tryLoadPromoteDraftText(proposal);

    const classifyOpts = {
      proposal,
      lookups: buildLookupsForProposal(proposal),
      relatedOpen: findRelatedOpenByIssues(proposal),
      snapshot: proposal.review_context_snapshot
        ? {
            damage_class:
              typeof proposal.review_context_snapshot.damage_class === "string"
                ? proposal.review_context_snapshot.damage_class
                : undefined,
          }
        : null,
      promoteDraftText,
      countsAsLeadForm,
    };

    let ctx = classifyProposalReview(classifyOpts);

    if (ctx.needs_jev_claim_check && proposal.kind === "edits") {
      const { outcome } = await askTouchesOutcomeFigures(
        getDecisionClient(),
        ctx.claim_cue_text ?? "",
      );
      ctx = classifyProposalReview({
        ...classifyOpts,
        claimCueJevOutcome: outcome,
      });
      if (outcome === "unavailable") {
        mergeProposalTags(proposal.id, ["used_jev_unavailable"]);
      } else {
        mergeProposalTags(proposal.id, ["used_jev"]);
      }
    }

    const snap = snapshotFromReviewContext(ctx);
    if (opts?.refreshSnapshot) {
      persistSnapshot(proposal.id, snap);
    } else if (opts?.persistIfMissingSnapshot && !proposal.review_context_snapshot) {
      persistSnapshot(proposal.id, snap);
    }
    return ctx;
  }

  function persistDecisionDebug(proposalId: string, blob: ProposalDecisionDebug): void {
    dbFor(site)
      .prepare(`UPDATE content_proposals SET decision_debug_json = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(blob), Date.now(), proposalId);
  }

  function captureDecisionDebug(
    proposal: ProposalRecord,
    action: "apply" | "reject" | "accept" | "close" | "withdraw",
    caller: ProposalUpdateCaller,
    reviewContext: ReviewContext | null,
  ): void {
    const actorRole =
      caller.actor && "role" in caller.actor && typeof caller.actor.role === "string"
        ? caller.actor.role
        : undefined;
    const enriched = enrichRecentActivity(proposal, {
      excludeAgentSessionId: caller.agent_session_id,
    });
    const blob = buildDecisionDebug({
      action,
      proposal: {
        id: proposal.id,
        // discovery_path builder only emits for open|partial — freeze as of pre-terminal.
        status: "open",
        kind: proposal.kind,
        title: proposal.title,
        summary: proposal.summary,
        escalated: proposal.escalated,
        escalated_note: proposal.escalated_note,
        entries: proposal.entries,
        related_entries: proposal.related_entries,
        open_blocker_count: proposal.open_blocker_count,
        blockers: proposal.blockers,
      },
      reviewContext,
      caller: {
        username: caller.username,
        asStaff: Boolean(caller.asStaff || caller.actor?.type === "ui"),
        agent_session_id: caller.agent_session_id ?? null,
        actor: caller.actor
          ? { type: caller.actor.type, ...(actorRole ? { role: actorRole } : {}) }
          : null,
      },
      recentActivity: enriched.recent_activity ?? null,
    });
    persistDecisionDebug(proposal.id, blob);
  }

  function enrichRecentActivity(
    proposal: ProposalRecord,
    opts?: { excludeAgentSessionId?: string | null },
  ): ProposalRecord {
    if (proposal.kind !== "edits" || proposal.entries.length === 0) return proposal;
    const resolved = runResolveActivity({
      entries: proposal.entries.map((e) => ({
        contentType: e.contentType,
        slug: e.slug,
        locale: e.locale,
        variant: e.variant,
      })),
      excludeAgentSessionId: opts?.excludeAgentSessionId,
      // Match apply gate: ignore this proposal's already-applied entry writes.
      excludeProposalApplies: proposal.entries
        .filter((e) => e.status === "done")
        .map((e) => ({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant,
          applied_at: e.applied_at,
          applied_by: e.applied_by,
        })),
    });
    if (!resolved.ok) {
      return { ...proposal, recent_activity_error: resolved.error };
    }
    return { ...proposal, recent_activity: resolved.activity };
  }

  function withSiblings(proposal: ProposalRecord): ProposalRecord {
    const siblings = findEscalatedSiblings(dbFor(site), site, proposal);
    return siblings.length ? { ...proposal, escalated_siblings: siblings } : proposal;
  }

  function get(id: string): ProposalRecord | null {
    const raw = loadProposal(dbFor(site), id);
    return raw ? withAttachedCreate(withSiblings(enrichRecentActivity(raw))) : null;
  }

  /** Unenriched load for internal mutate paths (avoid nested activity reads mid-apply). */
  function getRaw(id: string): ProposalRecord | null {
    return loadProposal(dbFor(site), id);
  }

  function stats(): ProposalStats {
    const db = dbFor(site);
    ensureKpiCatchUp(db, site);
    const by_status = { ...EMPTY_STATUS_COUNTS };
    const by_kind = { ...EMPTY_KIND_COUNTS };
    const by_attention = emptyAttentionCounts();
    let needs_review_edits = 0;
    const statusRows = db
      .prepare(`SELECT status, COUNT(*) AS n FROM content_proposals WHERE site = ? GROUP BY status`)
      .all(site) as Array<{ status: ProposalStatus; n: number }>;
    for (const row of statusRows) {
      if (row.status in by_status) by_status[row.status] = Number(row.n) || 0;
    }
    const kindRows = db
      .prepare(`SELECT kind, COUNT(*) AS n FROM content_proposals WHERE site = ? GROUP BY kind`)
      .all(site) as Array<{ kind: ProposalKind; n: number }>;
    for (const row of kindRows) {
      if (row.kind in by_kind) by_kind[row.kind] = Number(row.n) || 0;
    }
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS n FROM content_proposals WHERE site = ?`)
      .get(site) as { n: number };
    const escalatedRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM content_proposals WHERE site = ? AND escalated = 1`,
      )
      .get(site) as { n: number };

    try {
      const attentionRows = db
        .prepare(
          `SELECT p.id, p.kind, p.status, p.escalated, p.author_content_at, p.reviewer_action_at,
                  (SELECT COUNT(*) FROM content_proposal_blockers b
                   WHERE b.proposal_id = p.id AND b.status = 'open') AS open_n,
                  (SELECT COUNT(*) FROM content_proposal_blockers b
                   WHERE b.proposal_id = p.id AND b.status = 'resolved') AS resolved_n
           FROM content_proposals p
           WHERE p.site = ? AND p.status IN ('open', 'partial')`,
        )
        .all(site) as Array<{
        id: string;
        kind: ProposalKind;
        status: ProposalStatus;
        escalated: number;
        author_content_at: number | null;
        reviewer_action_at: number | null;
        open_n: number;
        resolved_n: number;
      }>;
      for (const row of attentionRows) {
        const bucket = deriveProposalAttention({
          status: row.status,
          escalated: Boolean(row.escalated),
          open_blocker_count: Number(row.open_n) || 0,
          resolved_blocker_count: Number(row.resolved_n) || 0,
          author_content_at: row.author_content_at,
          reviewer_action_at: row.reviewer_action_at,
        });
        if (bucket) by_attention[bucket] += 1;
        if (
          row.kind === "edits" &&
          (bucket === "awaiting_rereview" || bucket === "no_feedback")
        ) {
          needs_review_edits += 1;
        }
      }
    } catch {
      // Blockers table missing in older DBs — leave by_attention zeros.
    }

    return {
      total: Number(totalRow?.n) || 0,
      by_status,
      by_kind,
      escalated_count: Number(escalatedRow?.n) || 0,
      by_attention,
      by_kind_status: liveByKindStatus(db, site),
      stalled_ideas: countStalledIdeas(db, site),
      needs_review_edits,
    };
  }

  function kpiHistory(opts?: {
    kind?: KpiCardKind | null;
    granularity?: KpiGranularity;
    from?: string;
    to?: string;
    fresh?: boolean;
  }): KpiHistoryResult {
    return getKpiHistory(dbFor(site), site, opts);
  }

  /** Distinct proposers with a proposal touched in the last `days` (by updated_at). */
  function listRecentProposers(opts?: { days?: number; limit?: number }): string[] {
    const days = Math.min(Math.max(opts?.days ?? 30, 1), 365);
    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const db = dbFor(site);
    const rows = db
      .prepare(
        `SELECT proposer_username AS username
         FROM content_proposals
         WHERE site = ?
           AND proposer_username IS NOT NULL
           AND TRIM(proposer_username) != ''
           AND updated_at >= ?
         GROUP BY LOWER(proposer_username)
         ORDER BY MAX(updated_at) DESC, LOWER(proposer_username) ASC
         LIMIT ?`,
      )
      .all(site, since, limit) as Array<{ username: string }>;
    return rows.map((r) => r.username).filter((u) => Boolean(u?.trim()));
  }

  function exportAll(): ProposalRecord[] {
    return exportAllProposals(site);
  }

  function list(opts: {
    status?: ProposalStatus;
    kind?: ProposalKind;
    issue_id?: string;
    query?: string;
    proposal_id?: string;
    proposer_username?: string;
    proposer_actor_type?: ProposerActorType;
    proposer_actor_role?: string;
    agent_session_id?: string;
    escalated?: boolean;
    attention?: ProposalAttention;
    /** Accepted ideas with no successful implements follow-up. */
    stalled?: boolean;
    /** Open|partial edits that still need a reviewer (re-check or no feedback). */
    needs_review?: boolean;
    limit?: number;
    offset?: number;
    sort?: ProposalSortField;
    sortDir?: ProposalSortDir;
    attention_perspective?: AttentionPerspective;
    /** Username for within-bucket foreign-claim demotion (attention sort). */
    caller_username?: string;
  }): {
    proposals: ProposalRecord[];
    total: number;
    status_bias_applied: boolean;
    attention_perspective: AttentionPerspective | null;
  } {
    if (opts.proposal_id) {
      const one = get(opts.proposal_id);
      return {
        proposals: one ? [one] : [],
        total: one ? 1 : 0,
        status_bias_applied: false,
        attention_perspective: null,
      };
    }
    const db = dbFor(site);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(0, opts.offset ?? 0);
    const sort: ProposalSortField = opts.sort ?? "updated_at";
    const sortDir: ProposalSortDir = opts.sortDir ?? "desc";
    const perspective: AttentionPerspective = opts.attention_perspective ?? "reviewer";
    const needsReview = opts.needs_review === true;
    const stalled = opts.stalled === true && !needsReview;
    const sortForRank: ProposalSortField = needsReview ? "attention" : sort;
    const useAttentionPath = sortForRank === "attention" || opts.attention != null || needsReview;
    const statusBiasApplied =
      needsReview || (useAttentionPath && opts.status == null && !stalled);
    const tableAlias = stalled ? "p" : "";
    const fromSql = tableAlias ? `content_proposals ${tableAlias}` : `content_proposals`;
    const col = (name: string) => (tableAlias ? `${tableAlias}.${name}` : name);

    let where = `WHERE ${col("site")} = ?`;
    const params: unknown[] = [site];
    if (stalled) {
      where += ` AND ${stalledIdeaSqlPredicate(tableAlias || "p")}`;
    }
    if (needsReview) {
      where += ` AND ${col("kind")} = 'edits' AND ${col("status")} IN ('open', 'partial')`;
    } else {
      if (opts.status) {
        where += ` AND ${col("status")} = ?`;
        params.push(opts.status);
      } else if (statusBiasApplied) {
        where += ` AND ${col("status")} IN ('open', 'partial')`;
      }
      if (opts.kind) {
        where += ` AND ${col("kind")} = ?`;
        params.push(opts.kind);
      }
    }
    if (opts.issue_id) {
      where += ` AND ${col("related_issue_ids_json")} LIKE ?`;
      params.push(`%${opts.issue_id}%`);
    }
    if (opts.query?.trim()) {
      where += ` AND ${col("search_text")} LIKE ?`;
      params.push(`%${opts.query.trim().toLowerCase()}%`);
    }
    const proposerUsername = opts.proposer_username?.trim();
    if (proposerUsername) {
      where += ` AND LOWER(${col("proposer_username")}) = LOWER(?)`;
      params.push(proposerUsername);
    }
    if (opts.proposer_actor_type) {
      where += ` AND json_extract(${col("proposer_actor_json")}, '$.type') = ?`;
      params.push(opts.proposer_actor_type);
    }
    const proposerActorRole = opts.proposer_actor_role?.trim();
    if (proposerActorRole) {
      where += ` AND json_extract(${col("proposer_actor_json")}, '$.role') = ?`;
      params.push(proposerActorRole);
    }
    const agentSessionId = opts.agent_session_id?.trim();
    if (agentSessionId) {
      where += ` AND ${col("created_agent_session_id")} = ?`;
      params.push(agentSessionId);
    }
    if (opts.escalated === true) {
      where += ` AND ${col("escalated")} = 1`;
    } else if (opts.escalated === false) {
      where += ` AND ${col("escalated")} = 0`;
    }

    const mapRow = (r: ProposalRow) =>
      mapProposal(r, loadEntries(db, r.id), loadBlockers(db, r.id));

    const withAttentionMeta = (p: ProposalRecord) => {
      const resolved = resolvedBlockerCount(p.blockers);
      const attention = attentionForRecord(p);
      return { proposal: p, attention, resolved };
    };

    if (useAttentionPath || opts.issue_id) {
      const orderSql =
        sortForRank === "attention"
          ? `ORDER BY ${col("updated_at")} DESC, ${col("id")} ASC`
          : `ORDER BY ${col(sort === "created_at" ? "created_at" : "updated_at")} ${sortDir.toUpperCase()}, ${col("id")} ASC`;
      const rows = db
        .prepare(`SELECT ${tableAlias ? `${tableAlias}.*` : "*"} FROM ${fromSql} ${where} ${orderSql}`)
        .all(...params) as ProposalRow[];
      let records = rows.map(mapRow);
      if (opts.issue_id) {
        records = records.filter((p) => p.related_issue_ids.includes(opts.issue_id!));
      }

      let decorated = records.map(withAttentionMeta);
      if (needsReview) {
        decorated = decorated.filter(
          (d) => d.attention === "awaiting_rereview" || d.attention === "no_feedback",
        );
      }
      if (opts.attention) {
        decorated = decorated.filter((d) => d.attention === opts.attention);
      }

      if (sortForRank === "attention") {
        decorated = [...decorated].sort((a, b) =>
          compareByAttention(
            {
              id: a.proposal.id,
              updated_at: a.proposal.updated_at,
              attention: a.attention,
              claim: a.proposal.claim,
            },
            {
              id: b.proposal.id,
              updated_at: b.proposal.updated_at,
              attention: b.attention,
              claim: b.proposal.claim,
            },
            perspective,
            opts.caller_username,
          ),
        );
      } else if (opts.issue_id) {
        decorated = [...decorated].sort((a, b) =>
          compareProposalsBySort(a.proposal, b.proposal, sort, sortDir),
        );
      }

      const total = decorated.length;
      return {
        proposals: decorated
          .slice(offset, offset + limit)
          .map((d) => withAttachedCreate(withSiblings(enrichRecentActivity(d.proposal)))),
        total,
        status_bias_applied: statusBiasApplied,
        attention_perspective: sortForRank === "attention" ? perspective : null,
      };
    }

    const orderSql = `ORDER BY ${col(sort)} ${sortDir.toUpperCase()}, ${col("id")} ASC`;
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS n FROM ${fromSql} ${where}`)
      .get(...params) as { n: number };
    const total = Number(totalRow?.n) || 0;
    const rows = db
      .prepare(
        `SELECT ${tableAlias ? `${tableAlias}.*` : "*"} FROM ${fromSql} ${where} ${orderSql} LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as ProposalRow[];
    const proposals = rows.map((r) =>
      withAttachedCreate(withSiblings(enrichRecentActivity(mapRow(r)))),
    );
    return {
      proposals,
      total,
      status_bias_applied: false,
      attention_perspective: null,
    };
  }

  async function create(
    input: CreateProposalInput,
    proposer: { username: string; actor?: EventActor | Record<string, unknown> },
  ): Promise<
    | { ok: true; proposal: ProposalRecord; duplicate?: boolean; similar?: SimilarProposal[] }
    | {
        ok: false;
        code: string;
        error: string;
        similar?: SimilarProposal[];
        duplicate_of?: string;
        existing_proposal?: ProposalRecord;
        activity?: Array<{ entryKey: string; writeCount: number; windowDays: number }>;
      }
  > {
    const summary = (input.summary || "").trim();
    if (summary.length < MIN_SUMMARY) {
      return { ok: false, code: "summary_too_short", error: `summary required (min ${MIN_SUMMARY} characters)` };
    }
    const title = (input.title || "").trim();
    if (!title) return { ok: false, code: "title_required", error: "title is required" };

    const related = [...new Set((input.related_issue_ids ?? []).map((id) => id.trim()).filter(Boolean))];
    for (const id of related) {
      if (!deps.issueExists(id)) {
        return { ok: false, code: "unknown_issue_id", error: `Unknown issue id: ${id}` };
      }
    }

    const promote_on_apply = Boolean(input.promote_on_apply);
    const entriesIn = (input.entries ?? []).map((e) => ({
      ...e,
      updates: e.updates ?? [],
    }));
    const createsEntryKeys = new Set<string>();
    let kind: ProposalKind;
    if (entriesIn.length > 0 || promote_on_apply) {
      kind = "edits";
    } else if (input.kind === "idea") {
      kind = "idea";
    } else {
      kind = "notes";
    }
    let filedReviewSituations: ReviewSituationId[] = [];

    if (kind === "notes" && (input.review_situations?.length ?? 0) > 0) {
      return {
        ok: false,
        code: "review_situations_edits_only",
        error: "review_situations is only valid on edits or idea proposals (not notes).",
      };
    }

    if (kind === "idea" && (input.review_situations?.length ?? 0) > 0) {
      const ideaSit = parseIdeaAuthorSituationIds(input.review_situations);
      if (!ideaSit.ok) {
        return {
          ok: false,
          code: ideaSit.code ?? "invalid_review_situations",
          error: ideaSit.error,
        };
      }
      filedReviewSituations = ideaSit.ids;
    }

    if (input.kind === "idea" && (entriesIn.length > 0 || promote_on_apply)) {
      return {
        ok: false,
        code: "invalid_kind",
        error: "kind idea cannot include entries or promote_on_apply — use an edits proposal",
      };
    }

    const relatedEntries: RelatedEntryRef[] = (input.related_entries ?? [])
      .map((r) => ({
        contentType: String(r.contentType || "").trim(),
        slug: String(r.slug || "").trim(),
        ...(r.locale?.trim() ? { locale: r.locale.trim() } : {}),
      }))
      .filter((r) => r.contentType && r.slug);

    if (kind === "notes" && related.length > 0) {
      const blocking = findOpenNotesBlockingRetry(dbFor(site), site, related);
      if (blocking) {
        return {
          ok: false,
          code: "notes_no_auto_retry",
          error: `An open notes proposal already covers linked issue(s) with no auto-retry (${blocking.id}). Claim that proposal or clear no_auto_retry before opening another notes handoff.`,
          existing_proposal: blocking,
        };
      }
    }

    if (promote_on_apply) {
      if (entriesIn.length !== 1) {
        return {
          ok: false,
          code: "promote_entry_required",
          error: "promote_on_apply requires exactly one entry with contentType, slug, locale, and variant",
        };
      }
      const e = entriesIn[0]!;
      if (!e.contentType || !e.slug || !e.locale || !e.variant?.trim()) {
        return {
          ok: false,
          code: "promote_variant_required",
          error: "promote_on_apply requires contentType, slug, locale, and variant on the entry",
        };
      }
    }

    if (kind === "edits") {
      for (const e of entriesIn) {
        if (!e.contentType || !e.slug || !e.locale) {
          return { ok: false, code: "entry_required", error: "Each entry needs contentType, slug, and locale" };
        }
        if (!promote_on_apply && !e.updates?.length) {
          return { ok: false, code: "updates_required", error: `Entry ${e.contentType}/${e.slug} has no field updates` };
        }
      }

      const situationsParse = parseReviewSituationIds(input.review_situations ?? []);
      if (!situationsParse.ok) {
        return {
          ok: false,
          code: "invalid_review_situations",
          error: situationsParse.error,
        };
      }
      filedReviewSituations = situationsParse.ids;

      const dbEarly = dbFor(site);
      const implementsResolved = resolveImplementsForEdits(dbEarly, input.implements_proposal_id, entriesIn);
      if (!implementsResolved.ok) return implementsResolved;
      const implementsIdea = implementsResolved.idea;

      // Existence + mixed risk
      const classTargets: Array<{
        contentType: string;
        category?: ProposalCategory;
        existence: ExistenceState;
        draftExists?: boolean;
        createsEntry?: boolean;
      }> = [];
      for (const e of entriesIn) {
        const hasVariant = Boolean(e.variant?.trim());
        const ex = resolveExistence({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant,
        });
        const liveOk = ex.live === "exists";
        const draftOk = hasVariant && ex.draftExists;
        const liveMissing = !liveOk && ex.live !== "unknown";
        if (liveMissing && !draftOk) {
          const gate = gateMissingAttachedEntry({
            entry: e,
            promoteOnApply: promote_on_apply,
            hasVariant,
            implementsIdea,
            db: dbEarly,
          });
          if (!gate.ok) return gate;
          if (gate.createsEntry) {
            createsEntryKeys.add(attachedCreateKey(e.contentType, e.slug, e.locale));
          }
        } else if (!hasVariant && !liveOk) {
          return {
            ok: false,
            code: "entry_not_found",
            error: `Page ${e.contentType}/${e.slug} (${e.locale}) does not exist yet. File an idea brief, or create the draft first, then propose edits on that target.`,
          };
        } else if (hasVariant && !ex.draftExists) {
          return {
            ok: false,
            code: "entry_not_found",
            error: `Draft variant '${e.variant}' for ${e.contentType}/${e.slug} (${e.locale}) was not found. Create the draft first, or use kind idea for a new-page brief.`,
          };
        }
        const createsEntry = createsEntryKeys.has(attachedCreateKey(e.contentType, e.slug, e.locale));
        const updateText = (e.updates ?? [])
          .map((u) => textFromUnknown(u.value))
          .filter(Boolean)
          .join("\n");
        const outcomeFigures =
          (input.review_situations ?? []).includes("selling_figures") ||
          evaluateClaimCues(updateText) === "clear_yes";
        classTargets.push({
          contentType: e.contentType,
          category:
            input.category ??
            ((e.updates ?? []).some(
              (u) => u.field_path.startsWith("meta.") || u.field_path.startsWith("seo."),
            )
              ? "content.seo"
              : "content.field"),
          existence: ex.live === "unknown" ? "unknown" : liveOk ? "exists" : "missing",
          draftExists: draftOk,
          createsEntry,
          outcomeFigures,
        });
      }
      const classes = collectDamageClassesForMixedCheck(classTargets);
      if (isMixedRiskBundle(classes)) {
        return {
          ok: false,
          code: "mixed_risk_bundle",
          error:
            "This proposal mixes different risk levels (for example outcome figures and a blog metadata fix). Split into separate proposals — one risk class each.",
        };
      }
    }

    if (kind === "idea" && relatedEntries.length > 0) {
      const classTargets = relatedEntries.map((r) => {
        const locale = r.locale?.trim() || "en";
        const ex = resolveExistence({
          contentType: r.contentType,
          slug: r.slug,
          locale,
        });
        return {
          contentType: r.contentType,
          existence: ex.live,
          forIdea: true as const,
        };
      });
      const classes = collectDamageClassesForMixedCheck(classTargets);
      if (isMixedRiskBundle(classes)) {
        return {
          ok: false,
          code: "mixed_risk_bundle",
          error:
            "This idea brief mixes different risk levels across related pages. Split into separate ideas — one risk class each.",
        };
      }
    }

    const db = dbFor(site);

    for (const e of entriesIn) {
      if (!e.variant?.trim()) continue;
      const existingVariant = findOpenProposalForVariant(
        db,
        site,
        e.contentType,
        e.slug,
        e.locale,
        e.variant.trim(),
      );
      if (existingVariant) {
        return {
          ok: false,
          code: "proposal_exists",
          error: `An open proposal already references variant '${e.variant}' for ${e.contentType}/${e.slug} (${e.locale}). Join that proposal instead of creating another.`,
          duplicate_of: existingVariant.id,
          existing_proposal: existingVariant,
        };
      }
    }

    const category: ProposalCategory =
      input.category ??
      (kind === "edits" ? inferCategory(entriesIn) : "content.field");
    const fingerprint =
      kind === "idea"
        ? fingerprintIdeas({
            site,
            title,
            summary,
            relatedIssueIds: related,
            relatedEntries,
          })
        : kind === "notes"
          ? fingerprintNotes({ site, category, relatedIssueIds: related, summary })
          : fingerprintEdits({
              site,
              category,
              entries: entriesIn.map((e) => ({
                contentType: e.contentType,
                slug: e.slug,
                locale: e.locale,
                variant: e.variant,
                updates: e.updates ?? [],
              })),
            });

    const existing = db
      .prepare(
        `SELECT id FROM content_proposals WHERE site = ? AND fingerprint = ? AND status IN ('open','partial') LIMIT 1`,
      )
      .get(site, fingerprint) as { id: string } | undefined;
    if (existing) {
      const dup = get(existing.id)!;
      return { ok: true, proposal: dup, duplicate: true };
    }

    if (kind === "edits") {
      for (const e of entriesIn) {
        const competing = findOpenEditsForEntry(db, site, e.contentType, e.slug, e.locale);
        if (competing) {
          return {
            ok: false,
            code: "competing_entry_edits",
            error: `An open edits proposal already targets ${e.contentType}/${e.slug} (${e.locale}). Join ${competing.id} instead of creating another.`,
            duplicate_of: competing.id,
            existing_proposal: competing,
          };
        }
      }
    }

    const implementsIdForInsert =
      kind === "edits" ? input.implements_proposal_id?.trim() || null : null;

    const searchBlob = [
      title,
      summary,
      input.rationale ?? "",
      ...(input.tags ?? []),
      ...related,
      ...entriesIn.map(
        (e) =>
          `${e.contentType}/${e.slug} ${e.variant ?? ""} ${(e.updates ?? []).map((u) => u.field_path).join(" ")}`,
      ),
      promote_on_apply ? "promote_on_apply" : "",
    ]
      .join(" ")
      .toLowerCase();

    if (!input.confirm_distinct && deps.findSimilar) {
      try {
        const similar = (await deps.findSimilar(searchBlob)).filter((s) => s.score >= RAG_SIMILARITY_THRESHOLD);
        if (similar.length) {
          return {
            ok: false,
            code: "similar_proposals",
            error: "Similar open proposals exist. Pass confirm_distinct: true to create anyway.",
            similar,
          };
        }
      } catch (err) {
        log.warn({ err }, "proposal RAG similar search failed");
      }
    }

    if (kind === "edits" && entriesIn.length > 0) {
      const activityResult = runResolveActivity({
        entries: entriesIn.map((e) => ({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant,
        })),
        excludeAgentSessionId: input.agent_session_id,
      });
      if (!activityResult.ok) {
        return {
          ok: false,
          code: "activity_unavailable",
          error:
            activityResult.error ||
            "Could not load recent entry activity. Retry when activity history is available.",
        };
      }
      if (activityResult.gateWriteCount > 0 && !input.confirm_recent_activity) {
        return {
          ok: false,
          code: "confirm_recent_activity",
          error:
            "This entry has recent writes. Inspect get_entry_activity first. " +
            "If recent writes already delivered a similar same-field SERP/meta fix and live is not broken: " +
            "reject duplicate_weaker (title/description-only) or revise_entries to drop those SERP ops then apply (mixed) — do not confirm. " +
            "Pass confirm_recent_activity: true only if this proposal is still needed and distinct from those writes.",
          activity: activityResult.activity,
        };
      }
    }

    const captured: Array<{
      input: ProposalEntryInput & { updates: FieldUpdate[] };
      baseline: { values: Record<string, unknown>; note?: string; creates_entry?: boolean };
      variant_fingerprint: string | null;
    }> = [];
    for (const e of entriesIn) {
      const updates = e.updates ?? [];
      const createsEntry = createsEntryKeys.has(attachedCreateKey(e.contentType, e.slug, e.locale));
      let baseline: { values: Record<string, unknown>; note?: string; creates_entry?: boolean } = {
        values: {},
        note: input.situation_note,
        ...(createsEntry ? { creates_entry: true } : {}),
      };
      if (updates.length && !createsEntry) {
        const capturedBaseline = deps.captureBaseline({ ...e, updates });
        if (capturedBaseline.error) {
          return { ok: false, code: "baseline_failed", error: capturedBaseline.error };
        }
        baseline = { values: capturedBaseline.values, note: input.situation_note };
      }
      let variant_fingerprint: string | null = null;
      if (e.variant?.trim() && deps.readVariantFingerprint) {
        const fp = deps.readVariantFingerprint({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant.trim(),
        });
        if (fp.error) return { ok: false, code: "baseline_failed", error: fp.error };
        variant_fingerprint = fp.fingerprint;
      }
      captured.push({
        input: { ...e, updates },
        baseline,
        variant_fingerprint,
      });
    }

    if (promote_on_apply && captured.length === 0) {
      return { ok: false, code: "promote_entry_required", error: "promote_on_apply requires an entry" };
    }

    let supersedesId: string | null = null;
    const supersedesRaw = input.supersedes_proposal_id?.trim();
    if (supersedesRaw) {
      const pred = loadProposal(db, supersedesRaw);
      if (!pred || pred.site !== site) {
        return {
          ok: false,
          code: "supersedes_not_found",
          error: `Predecessor proposal ${supersedesRaw} was not found on this site.`,
        };
      }
      if (pred.status !== "rejected" && pred.status !== "withdrawn") {
        return {
          ok: false,
          code: "supersedes_not_closed",
          error: `Predecessor must be rejected or withdrawn (currently ${pred.status}).`,
        };
      }
      if (pred.replaced_by_proposal_id) {
        return {
          ok: false,
          code: "supersedes_already_replaced",
          error: `Predecessor already has a replacement (${pred.replaced_by_proposal_id}).`,
          existing_proposal: pred,
        };
      }
      supersedesId = pred.id;
    }

    let ideaFunnelJson: string | null = null;
    if (kind === "idea" && input.idea_funnel != null) {
      const funnelCheck = validateIdeaFunnel(input.idea_funnel);
      if (!funnelCheck.ok) {
        return { ok: false, code: funnelCheck.code, error: funnelCheck.error };
      }
      ideaFunnelJson = JSON.stringify(funnelCheck.funnel);
    } else if (kind !== "idea" && input.idea_funnel != null) {
      return {
        ok: false,
        code: "idea_funnel_ideas_only",
        error: "idea_funnel is only valid on kind idea proposals.",
      };
    }

    const now = Date.now();
    const id = randomUUID();
    const sessionId = input.agent_session_id?.trim() || null;
    const noAutoRetry = kind === "notes" ? 1 : 0;
    db.prepare(
      `INSERT INTO content_proposals (
        id, site, fingerprint, status, kind, category, title, summary, rationale,
        documentation_json, related_issue_ids_json, proposer_username, proposer_actor_json,
        created_at, updated_at, claim_json, tags_json, search_text,
        created_agent_session_id, promote_on_apply, no_auto_retry, related_entries_json,
        review_context_snapshot_json, supersedes_proposal_id, replaced_by_proposal_id,
        review_situations_json, implements_proposal_id, idea_funnel_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      site,
      fingerprint,
      "open",
      kind,
      category,
      title,
      summary,
      input.rationale?.trim() || null,
      JSON.stringify(input.documentation ?? {}),
      JSON.stringify(related),
      proposer.username,
      JSON.stringify(proposer.actor ?? {}),
      now,
      now,
      null,
      JSON.stringify(input.tags ?? []),
      searchBlob,
      sessionId,
      promote_on_apply ? 1 : 0,
      noAutoRetry,
      JSON.stringify(relatedEntries),
      null,
      supersedesId,
      null,
      JSON.stringify(filedReviewSituations),
      implementsIdForInsert,
      ideaFunnelJson,
    );

    if (supersedesId) {
      db.prepare(
        `UPDATE content_proposals SET replaced_by_proposal_id = ?, updated_at = ? WHERE id = ?`,
      ).run(id, now, supersedesId);
    }

    for (const cap of captured) {
      db.prepare(
        `INSERT INTO content_proposal_entries (
          proposal_id, entry_key, locale, variant, status, ops_json, baseline_context_json, variant_fingerprint
        ) VALUES (?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        makeEntryKey(cap.input.contentType, cap.input.slug),
        cap.input.locale,
        cap.input.variant || null,
        "pending",
        JSON.stringify(cap.input.updates),
        JSON.stringify(cap.baseline),
        cap.variant_fingerprint,
      );
    }

    const proposal = get(id)!;
    const reviewCtx = await classifyLive(proposal, { refreshSnapshot: true });
    const withSnap = get(id)!;
    emitProposalEvent(site, "proposal_created", id, proposer.username, {
      ...(supersedesId ? { supersedes_proposal_id: supersedesId } : {}),
    }, proposer.actor && typeof proposer.actor === "object" && "type" in proposer.actor
      ? (proposer.actor as EventActor)
      : undefined);
    if (deps.indexSearch) {
      deps.indexSearch(withSnap).catch((err) => log.warn({ err }, "proposal index failed"));
    }
    return {
      ok: true,
      proposal: withSnap,
      ...(reviewCtx ? { review_context: reviewCtx } : {}),
    };
  }

  async function update(
    id: string,
    action: ProposalUpdateAction,
    caller: ProposalUpdateCaller,
  ): Promise<
    | {
        ok: true;
        proposal: ProposalRecord;
        warnings?: Array<{ code: string; message: string }>;
        traffic_siblings?: Array<{ slug: string; locale: string; allocation: number }>;
      }
    | {
        ok: false;
        code: string;
        error: string;
        proposal?: ProposalRecord;
        claim_expired?: boolean;
        traffic_siblings?: Array<{ slug: string; locale: string; allocation: number }>;
        existing_proposal?: ProposalRecord;
        activity?: Array<{ entryKey: string; writeCount: number; windowDays: number }>;
      }
  > {
    const db = dbFor(site);
    const proposal = getRaw(id);
    if (!proposal) return { ok: false, code: "not_found", error: "Proposal not found" };

    const report = caller.report?.trim() ?? "";
    const now = Date.now();

    if (action === "escalate" || action === "deescalate") {
      if (caller.actor?.type === "mcp") {
        return {
          ok: false,
          code: "steward_ui_only",
          error: "Escalate and release are staff steward actions in the UI — agents cannot set them.",
          proposal,
        };
      }
    } else if (proposal.escalated && caller.actor?.type === "mcp") {
      return {
        ok: false,
        code: "escalated",
        error:
          "A steward paused agent work on this proposal. Do not claim, add blockers, apply, or reject until they release it.",
        proposal,
      };
    }

    if (action === "escalate") {
      if (proposal.status !== "open" && proposal.status !== "partial") {
        return { ok: false, code: "closed", error: "Cannot escalate a closed proposal" };
      }
      if (proposal.escalated) {
        return { ok: false, code: "already_escalated", error: "Proposal is already escalated", proposal };
      }
      const note = (caller.escalated_note || caller.close_note || caller.body || "").trim();
      if (note.length < MIN_CLOSE_NOTE) {
        return {
          ok: false,
          code: "escalated_note_required",
          error: `escalated_note required (min ${MIN_CLOSE_NOTE} characters): why agents must pause`,
        };
      }
      db.prepare(
        `UPDATE content_proposals
         SET escalated = 1, escalated_at = ?, escalated_by = ?, escalated_note = ?,
             claim_json = NULL, updated_at = ?
         WHERE id = ?`,
      ).run(now, caller.username, note, now, id);
      emitProposalEvent(site, "proposal_escalated", id, caller.username, { note }, caller.actor);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "deescalate") {
      if (!proposal.escalated) {
        return { ok: false, code: "not_escalated", error: "Proposal is not escalated", proposal };
      }
      db.prepare(`UPDATE content_proposals SET escalated = 0, updated_at = ? WHERE id = ?`).run(
        now,
        id,
      );
      emitProposalEvent(site, "proposal_deescalated", id, caller.username, {}, caller.actor);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "claim") {
      const claim = proposal.claim;
      const settings = policy();
      const uiTakeover =
        isStaffUiActor(asAgentActor(caller.actor)) && settings.claim.staff_ui_takeover;
      if (
        claim &&
        new Date(claim.expiresAt).getTime() > now &&
        !sameAgentIdentity(
          claim.by,
          asAgentActor(claim.actor),
          caller.username,
          asAgentActor(caller.actor),
        ) &&
        !uiTakeover
      ) {
        const holder = formatAgentActorLine(claim.by, asAgentActor(claim.actor));
        return { ok: false, code: "claimed", error: `Claimed by ${holder} until ${claim.expiresAt}` };
      }
      const next: ProposalClaim = {
        by: caller.username,
        expiresAt: new Date(now + PROPOSAL_CLAIM_TTL_MS).toISOString(),
        ...(report ? { report } : {}),
        ...(caller.actor ? { actor: caller.actor } : {}),
      };
      db.prepare(`UPDATE content_proposals SET claim_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(next),
        now,
        id,
      );
      return { ok: true, proposal: get(id)! };
    }

    if (action === "release") {
      if (proposal.claim && report && report.length < MIN_SUMMARY) {
        return { ok: false, code: "report_too_short", error: `release report min ${MIN_SUMMARY} characters` };
      }
      db.prepare(`UPDATE content_proposals SET claim_json = NULL, updated_at = ? WHERE id = ?`).run(now, id);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "withdraw") {
      const settings = policy();
      const sameProposer =
        proposal.proposer_username.trim().toLowerCase() === caller.username.trim().toLowerCase();
      const isMcp = caller.actor?.type === "mcp";
      if (isMcp) {
        if (settings.withdraw.mcp === "disabled") {
          return {
            ok: false,
            code: "withdraw_disabled",
            error:
              "Site rules disable agent withdraw — ask staff to withdraw in the UI, or Reject Completely if it must not ship",
          };
        }
        if (settings.withdraw.mcp === "proposer_only" && !sameProposer) {
          return {
            ok: false,
            code: "not_proposer",
            error: "Only the proposer or an editor can withdraw",
          };
        }
        // any_create_author: any MCP author may withdraw
      } else if (!sameProposer && !caller.asStaff) {
        return {
          ok: false,
          code: "not_proposer",
          error: "Only the proposer or an editor can withdraw",
        };
      }
      if (proposal.status === "finished") {
        return { ok: false, code: "already_finished", error: "Finished proposals cannot be withdrawn" };
      }
      if (proposal.status === "rejected" || proposal.status === "withdrawn") {
        return { ok: false, code: "closed", error: "Proposal is already closed" };
      }
      const withdrawNote = (caller.close_note || caller.report || "").trim();
      if (withdrawNote.length < MIN_CLOSE_NOTE) {
        return {
          ok: false,
          code: "withdraw_note_required",
          error: `withdraw note required (min ${MIN_CLOSE_NOTE} characters)`,
        };
      }
      const reviewBeforeWithdraw = await classifyLive(proposal);
      db.prepare(
        `UPDATE content_proposals
         SET status = 'withdrawn', claim_json = NULL, updated_at = ?,
             close_reason = ?, close_note = ?, closed_by = ?, closed_at = ?
         WHERE id = ?`,
      ).run(now, "withdrawn", withdrawNote, caller.username, now, id);
      captureDecisionDebug(proposal, "withdraw", caller, reviewBeforeWithdraw);
      emitProposalEvent(site, "proposal_withdrawn", id, caller.username, {}, caller.actor);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "reject") {
      if (
        fourEyesBlockedForCaller(
          policy(),
          proposal.proposer_username,
          proposal.proposer_actor,
          caller.username,
          caller.actor,
        )
      ) {
        return {
          ok: false,
          code: "four_eyes",
          error: "Four-eyes: a different agent role (or staff UI) must reject",
        };
      }
      if (
        proposal.status === "finished" ||
        proposal.status === "rejected" ||
        proposal.status === "withdrawn"
      ) {
        return { ok: false, code: "closed", error: "Proposal is already closed" };
      }
      if (!caller.confirm_reject) {
        return {
          ok: false,
          code: "confirm_reject",
          error:
            "Reject is for bad/impossible/illegal/harmful ideas only — not polish. Pass confirm_reject: true with reject_kind and close_note. Prefer add_blocker when the idea is fine but needs changes.",
          proposal,
        };
      }
      const kindRaw = (caller.reject_kind || "").trim();
      if (!isProposalRejectKind(kindRaw)) {
        return {
          ok: false,
          code: "reject_kind_required",
          error: `reject_kind required: ${PROPOSAL_REJECT_KINDS.join(" | ")}`,
        };
      }
      const rejectNote = (caller.close_note || caller.body || "").trim();
      if (rejectNote.length < MIN_REJECT_NOTE) {
        return {
          ok: false,
          code: "reject_note_too_short",
          error: `reject note required (min ${MIN_REJECT_NOTE} characters): why this must not ship`,
        };
      }
      const reviewBeforeReject = await classifyLive(proposal);
      db.prepare(
        `UPDATE content_proposals
         SET status = 'rejected', claim_json = NULL, updated_at = ?,
             close_reason = ?, close_note = ?, closed_by = ?, closed_at = ?
         WHERE id = ?`,
      ).run(now, kindRaw, rejectNote, caller.username, now, id);
      captureDecisionDebug(proposal, "reject", caller, reviewBeforeReject);
      emitProposalEvent(site, "proposal_rejected", id, caller.username, {
        reject_kind: kindRaw,
      }, caller.actor);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "accept") {
      if (proposal.kind !== "idea") {
        return {
          ok: false,
          code: "wrong_kind",
          error: "accept is for idea proposals only",
        };
      }
      if (
        proposal.status === "finished" ||
        proposal.status === "rejected" ||
        proposal.status === "withdrawn"
      ) {
        return { ok: false, code: "closed", error: "Proposal is already closed" };
      }
      if (
        fourEyesBlockedForCaller(
          policy(),
          proposal.proposer_username,
          proposal.proposer_actor,
          caller.username,
          caller.actor,
        )
      ) {
        return {
          ok: false,
          code: "four_eyes",
          error: "Four-eyes: a different agent role (or staff UI) must accept",
        };
      }
      if (proposal.open_blocker_count > 0) {
        return {
          ok: false,
          code: "proposal_blocked",
          error: `Cannot accept while ${proposal.open_blocker_count} open blocker(s) remain`,
          proposal,
        };
      }
      const nextStep = (caller.next_step || caller.close_note || "").trim();
      if (nextStep.length < MIN_ACCEPT_NEXT_STEP) {
        return {
          ok: false,
          code: "next_step_required",
          error: `Accept requires a next-step note (min ${MIN_ACCEPT_NEXT_STEP} characters)`,
        };
      }
      const acceptedEntry = parseAcceptedEntry(caller.accepted_entry);
      if (!acceptedEntry) {
        return {
          ok: false,
          code: "accepted_entry_required",
          error:
            "Accept requires accepted_entry with contentType, slug, and locale (the page this idea locks for follow-up work).",
        };
      }
      const taken = findAcceptedIdeaOwningEntry(
        db,
        site,
        acceptedEntry.contentType,
        acceptedEntry.slug,
        acceptedEntry.locale,
        id,
      );
      if (taken) {
        return {
          ok: false,
          code: "accepted_entry_taken",
          error: `Another accepted idea (${taken.id}) already reserved ${acceptedEntryKey(acceptedEntry)}.`,
          existing_proposal: taken,
        };
      }
      const acceptEx = resolveExistence({
        contentType: acceptedEntry.contentType,
        slug: acceptedEntry.slug,
        locale: acceptedEntry.locale,
      });
      const needsFunnel = ideaRequiresStructuredFunnel({
        title: proposal.title,
        summary: proposal.summary,
        accepted_entry: { ...acceptedEntry, existence: acceptEx.live },
      });
      if (needsFunnel && !ideaFunnelComplete(proposal.idea_funnel)) {
        return {
          ok: false,
          code: IDEA_FUNNEL_REQUIRED,
          error:
            "This idea locks a new URL. Set structured idea_funnel (stage + products) via set_idea_funnel before accept. products \"all\" only with stage awareness.",
          proposal,
        };
      }
      const reviewBeforeAccept = await classifyLive(proposal);
      db.prepare(
        `UPDATE content_proposals
         SET status = 'finished', claim_json = NULL, updated_at = ?,
             close_reason = ?, close_note = ?, closed_by = ?, closed_at = ?,
             accepted_entry_json = ?
         WHERE id = ?`,
      ).run(now, "accepted", nextStep, caller.username, now, JSON.stringify(acceptedEntry), id);
      captureDecisionDebug(proposal, "accept", caller, reviewBeforeAccept);
      emitProposalEvent(site, "proposal_closed", id, caller.username, {
        close_reason: "accepted",
        close_note: nextStep,
        accepted_entry: acceptedEntry,
      }, caller.actor);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "close" || action === "acknowledge") {
      if (proposal.kind === "edits") {
        return {
          ok: false,
          code: "wrong_kind",
          error: "close is for notes or idea proposals; use apply for edits",
        };
      }
      if (action === "acknowledge" && proposal.kind !== "notes") {
        return {
          ok: false,
          code: "wrong_kind",
          error: "acknowledge is a notes-only alias of close",
        };
      }
      if (
        proposal.status === "finished" ||
        proposal.status === "rejected" ||
        proposal.status === "withdrawn"
      ) {
        return { ok: false, code: "closed", error: "Proposal is already closed" };
      }
      if (proposal.kind === "idea") {
        const reasonRaw = (caller.close_reason || "").trim();
        if (reasonRaw === "accepted") {
          return {
            ok: false,
            code: "use_accept",
            error: "Use action accept (with next_step) to greenlight an idea",
          };
        }
        if (!IDEA_PARK_REASONS.includes(reasonRaw as ProposalCloseReason)) {
          return {
            ok: false,
            code: "close_reason_invalid",
            error: `Idea close reason must be one of: ${IDEA_PARK_REASONS.join(", ")}`,
          };
        }
      }
      const validated = validateCloseReason(caller.close_reason, caller.close_note);
      if (!validated.ok) {
        return { ok: false, code: validated.code, error: validated.error };
      }
      const reviewBeforeClose = await classifyLive(proposal);
      db.prepare(
        `UPDATE content_proposals
         SET status = 'finished', claim_json = NULL, updated_at = ?,
             close_reason = ?, close_note = ?, closed_by = ?, closed_at = ?
         WHERE id = ?`,
      ).run(now, validated.reason, validated.note, caller.username, now, id);
      captureDecisionDebug(proposal, "close", caller, reviewBeforeClose);
      emitProposalEvent(site, "proposal_closed", id, caller.username, {
        close_reason: validated.reason,
        close_note: validated.note,
      }, caller.actor);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "set_no_auto_retry") {
      if (proposal.kind !== "notes") {
        return {
          ok: false,
          code: "wrong_kind",
          error: "set_no_auto_retry is for notes proposals only",
        };
      }
      if (
        proposal.status === "finished" ||
        proposal.status === "rejected" ||
        proposal.status === "withdrawn"
      ) {
        return { ok: false, code: "closed", error: "Cannot change no_auto_retry on a closed proposal" };
      }
      if (typeof caller.no_auto_retry !== "boolean") {
        return {
          ok: false,
          code: "no_auto_retry_required",
          error: "no_auto_retry boolean is required",
        };
      }
      const isMcp = caller.actor?.type === "mcp";
      if (isMcp) {
        const { active, expired } = activeClaim(proposal, now);
        if (
          !active ||
          !sameAgentIdentity(
            active.by,
            asAgentActor(active.actor),
            caller.username,
            asAgentActor(caller.actor),
          )
        ) {
          return {
            ok: false,
            code: "not_claimant",
            error: expired
              ? "Claim expired. Claim the proposal again, then set_no_auto_retry."
              : "MCP agents must claim the proposal before changing no_auto_retry.",
            claim_expired: expired,
            proposal,
          };
        }
      }
      db.prepare(`UPDATE content_proposals SET no_auto_retry = ?, updated_at = ? WHERE id = ?`).run(
        caller.no_auto_retry ? 1 : 0,
        now,
        id,
      );
      return { ok: true, proposal: get(id)! };
    }

    if (action === "set_idea_funnel") {
      if (proposal.kind !== "idea") {
        return {
          ok: false,
          code: "wrong_kind",
          error: "set_idea_funnel is for idea proposals only",
        };
      }
      if (proposal.status === "finished" || proposal.status === "rejected" || proposal.status === "withdrawn") {
        return {
          ok: false,
          code: proposal.close_reason === "accepted" ? IDEA_FUNNEL_FROZEN : "closed",
          error:
            proposal.close_reason === "accepted"
              ? "idea_funnel is frozen after accept. Reject/refile if the plan was wrong — do not edit the lock."
              : "Cannot change idea_funnel on a closed proposal",
        };
      }
      if (
        !sameAgentIdentity(
          proposal.proposer_username,
          asAgentActor(proposal.proposer_actor),
          caller.username,
          asAgentActor(caller.actor),
        ) &&
        !caller.asStaff
      ) {
        return {
          ok: false,
          code: "not_proposer",
          error: "Only the original proposer (or staff) may set idea_funnel",
        };
      }
      const funnelCheck = validateIdeaFunnel(caller.idea_funnel);
      if (!funnelCheck.ok) {
        return { ok: false, code: funnelCheck.code, error: funnelCheck.error };
      }
      db.prepare(`UPDATE content_proposals SET idea_funnel_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(funnelCheck.funnel),
        now,
        id,
      );
      const after = getRaw(id)!;
      await classifyLive(after, { refreshSnapshot: true });
      emitProposalEvent(site, "proposal_idea_funnel_set", id, caller.username, {
        idea_funnel: funnelCheck.funnel,
      });
      return { ok: true, proposal: get(id)! };
    }

    if (action === "set_review_situations") {
      if (proposal.kind !== "edits" && proposal.kind !== "idea") {
        return {
          ok: false,
          code: "wrong_kind",
          error: "set_review_situations is for edits or idea proposals only",
        };
      }
      if (proposal.status !== "open" && proposal.status !== "partial") {
        return { ok: false, code: "closed", error: "Cannot change situations on a closed proposal" };
      }
      if (
        !sameAgentIdentity(
          proposal.proposer_username,
          asAgentActor(proposal.proposer_actor),
          caller.username,
          asAgentActor(caller.actor),
        ) &&
        !caller.asStaff
      ) {
        return {
          ok: false,
          code: "not_proposer",
          error: "Only the original proposer (or staff) may set review situations",
        };
      }
      let parsedIds: ReviewSituationId[];
      if (proposal.kind === "idea") {
        const ideaSit = parseIdeaAuthorSituationIds(caller.review_situations ?? []);
        if (!ideaSit.ok) {
          return {
            ok: false,
            code: ideaSit.code ?? "invalid_review_situations",
            error: ideaSit.error,
          };
        }
        parsedIds = ideaSit.ids;
      } else {
        const parsed = parseReviewSituationIds(caller.review_situations ?? []);
        if (!parsed.ok) {
          return { ok: false, code: "invalid_review_situations", error: parsed.error };
        }
        parsedIds = parsed.ids;
      }
      db.prepare(
        `UPDATE content_proposals SET review_situations_json = ?, updated_at = ? WHERE id = ?`,
      ).run(JSON.stringify(parsedIds), now, id);
      const after = getRaw(id)!;
      await classifyLive(after, { refreshSnapshot: true });
      emitProposalEvent(site, "proposal_review_situations_set", id, caller.username, {
        review_situations: parsedIds,
      });
      return { ok: true, proposal: get(id)! };
    }

    if (action === "revise_entries") {
      if (proposal.kind !== "edits") {
        return {
          ok: false,
          code: "wrong_kind",
          error: "revise_entries is for edits proposals only",
        };
      }
      if (proposal.status !== "open" && proposal.status !== "partial") {
        return { ok: false, code: "closed", error: "Cannot revise a closed proposal" };
      }
      if (
        !sameAgentIdentity(
          proposal.proposer_username,
          asAgentActor(proposal.proposer_actor),
          caller.username,
          asAgentActor(caller.actor),
        ) &&
        !caller.asStaff
      ) {
        return {
          ok: false,
          code: "not_proposer",
          error: "Only the original proposer (or staff) may revise entries",
        };
      }
      const { active } = activeClaim(proposal, now);
      if (
        active &&
        !sameAgentIdentity(
          active.by,
          asAgentActor(active.actor),
          caller.username,
          asAgentActor(caller.actor),
        ) &&
        !isStaffUiActor(asAgentActor(caller.actor))
      ) {
        const holder = formatAgentActorLine(active.by, asAgentActor(active.actor));
        return {
          ok: false,
          code: "claimed",
          error: `Claimed by ${holder} until ${active.expiresAt}. Wait or coordinate before revising.`,
          proposal,
        };
      }

      const doneEntries = proposal.entries.filter((e) => e.status === "done");
      const entriesIn = (caller.entries ?? []).map((e) => ({
        ...e,
        updates: e.updates ?? [],
      }));
      if (entriesIn.length === 0 && !proposal.promote_on_apply) {
        return {
          ok: false,
          code: "entries_required",
          error: "revise_entries requires entries[] for the pending set",
        };
      }
      if (proposal.promote_on_apply) {
        if (entriesIn.length !== 1) {
          return {
            ok: false,
            code: "promote_entry_required",
            error: "promote_on_apply proposals require exactly one entry when revising",
          };
        }
        const e = entriesIn[0]!;
        if (!e.contentType || !e.slug || !e.locale || !e.variant?.trim()) {
          return {
            ok: false,
            code: "promote_variant_required",
            error: "promote_on_apply requires contentType, slug, locale, and variant",
          };
        }
      }

      for (const e of entriesIn) {
        if (!e.contentType || !e.slug || !e.locale) {
          return { ok: false, code: "entry_required", error: "Each entry needs contentType, slug, and locale" };
        }
        if (!proposal.promote_on_apply && !e.updates?.length) {
          return {
            ok: false,
            code: "updates_required",
            error: `Entry ${e.contentType}/${e.slug} has no field updates`,
          };
        }
      }

      const reviseDb = dbFor(site);
      const implementsResolved = resolveImplementsForEdits(
        reviseDb,
        proposal.implements_proposal_id ?? undefined,
        entriesIn,
        id,
      );
      if (!implementsResolved.ok) return implementsResolved;
      const reviseCreates = new Set<string>();

      const classTargets: Array<{
        contentType: string;
        category?: ProposalCategory;
        existence: ExistenceState;
        draftExists?: boolean;
        createsEntry?: boolean;
        outcomeFigures?: boolean;
      }> = [];
      for (const e of entriesIn) {
        const hasVariant = Boolean(e.variant?.trim());
        const ex = resolveExistence({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant,
        });
        const liveOk = ex.live === "exists";
        const draftOk = hasVariant && ex.draftExists;
        const liveMissing = !liveOk && ex.live !== "unknown";
        if (liveMissing && !draftOk) {
          const gate = gateMissingAttachedEntry({
            entry: e,
            promoteOnApply: proposal.promote_on_apply,
            hasVariant,
            implementsIdea: implementsResolved.idea,
            db: reviseDb,
          });
          if (!gate.ok) return gate;
          if (gate.createsEntry) {
            reviseCreates.add(attachedCreateKey(e.contentType, e.slug, e.locale));
          }
        } else if (!hasVariant && !liveOk) {
          return {
            ok: false,
            code: "entry_not_found",
            error: `Page ${e.contentType}/${e.slug} (${e.locale}) does not exist yet.`,
          };
        } else if (hasVariant && !ex.draftExists) {
          return {
            ok: false,
            code: "entry_not_found",
            error: `Draft variant '${e.variant}' for ${e.contentType}/${e.slug} (${e.locale}) was not found.`,
          };
        }
        const updateText = (e.updates ?? [])
          .map((u) => textFromUnknown(u.value))
          .filter(Boolean)
          .join("\n");
        const outcomeFigures =
          (proposal.review_situations ?? []).includes("selling_figures") ||
          evaluateClaimCues(updateText) === "clear_yes";
        classTargets.push({
          contentType: e.contentType,
          category: (e.updates ?? []).some(
            (u) => u.field_path.startsWith("meta.") || u.field_path.startsWith("seo."),
          )
            ? "content.seo"
            : "content.field",
          existence: ex.live === "unknown" ? "unknown" : liveOk ? "exists" : "missing",
          draftExists: draftOk,
          createsEntry: reviseCreates.has(attachedCreateKey(e.contentType, e.slug, e.locale)),
          outcomeFigures,
        });
      }
      const classes = collectDamageClassesForMixedCheck(classTargets);
      if (isMixedRiskBundle(classes)) {
        return {
          ok: false,
          code: "mixed_risk_bundle",
          error:
            "This revise mixes different risk levels. Keep one risk class per proposal.",
        };
      }

      for (const e of entriesIn) {
        if (e.variant?.trim()) {
          const existingVariant = findOpenProposalForVariant(
            db,
            site,
            e.contentType,
            e.slug,
            e.locale,
            e.variant.trim(),
          );
          if (existingVariant && existingVariant.id !== id) {
            return {
              ok: false,
              code: "proposal_exists",
              error: `An open proposal already references variant '${e.variant}'`,
              existing_proposal: existingVariant,
            };
          }
        }
        const competing = findOpenEditsForEntry(db, site, e.contentType, e.slug, e.locale, id);
        if (competing) {
          return {
            ok: false,
            code: "competing_entry_edits",
            error: `Another open edits proposal already targets ${e.contentType}/${e.slug} (${e.locale}).`,
            existing_proposal: competing,
          };
        }
      }

      if (entriesIn.length > 0) {
        const activityResult = runResolveActivity({
          entries: entriesIn.map((e) => ({
            contentType: e.contentType,
            slug: e.slug,
            locale: e.locale,
            variant: e.variant,
          })),
          excludeAgentSessionId: caller.agent_session_id,
          excludeProposalApplies: doneEntries.map((e) => ({
            contentType: e.contentType,
            slug: e.slug,
            locale: e.locale,
            variant: e.variant,
            applied_at: e.applied_at,
            applied_by: e.applied_by,
          })),
        });
        if (!activityResult.ok) {
          return {
            ok: false,
            code: "activity_unavailable",
            error:
              activityResult.error ||
              "Could not load recent entry activity. Retry when activity history is available.",
            proposal,
          };
        }
        if (activityResult.gateWriteCount > 0 && !caller.confirm_recent_activity) {
          return {
            ok: false,
            code: "confirm_recent_activity",
            error:
              "Linked entries have recent writes. Inspect get_entry_activity first. " +
              "Same-field SERP churn + live not broken → reject (title/description-only) or revise to drop SERP ops (mixed); do not confirm. " +
              "Pass confirm_recent_activity: true only to revise when the change is still needed and distinct.",
            activity: activityResult.activity,
            proposal: enrichRecentActivity({
              ...proposal,
              recent_activity: activityResult.activity,
            }),
          };
        }
      }

      const captured: Array<{
        input: ProposalEntryInput & { updates: FieldUpdate[] };
        baseline: { values: Record<string, unknown>; note?: string };
        variant_fingerprint: string | null;
      }> = [];
      for (const e of entriesIn) {
        const updates = e.updates ?? [];
        const createsEntry = reviseCreates.has(attachedCreateKey(e.contentType, e.slug, e.locale));
        let baseline: { values: Record<string, unknown>; note?: string; creates_entry?: boolean } = {
          values: {},
          ...(createsEntry ? { creates_entry: true } : {}),
        };
        if (updates.length && !createsEntry) {
          const capturedBaseline = deps.captureBaseline({ ...e, updates });
          if (capturedBaseline.error) {
            return { ok: false, code: "baseline_failed", error: capturedBaseline.error };
          }
          baseline = { values: capturedBaseline.values };
        }
        let variant_fingerprint: string | null = null;
        if (e.variant?.trim() && deps.readVariantFingerprint) {
          const fp = deps.readVariantFingerprint({
            contentType: e.contentType,
            slug: e.slug,
            locale: e.locale,
            variant: e.variant.trim(),
          });
          if (fp.error) return { ok: false, code: "baseline_failed", error: fp.error };
          variant_fingerprint = fp.fingerprint;
        }
        captured.push({ input: { ...e, updates }, baseline, variant_fingerprint });
      }

      const fingerprint = fingerprintEdits({
        site,
        category: proposal.category,
        entries: entriesIn.map((e) => ({
          contentType: e.contentType,
          slug: e.slug,
          locale: e.locale,
          variant: e.variant,
          updates: e.updates ?? [],
        })),
      });
      const dup = db
        .prepare(
          `SELECT id FROM content_proposals WHERE site = ? AND fingerprint = ? AND status IN ('open','partial') AND id != ? LIMIT 1`,
        )
        .get(site, fingerprint, id) as { id: string } | undefined;
      if (dup) {
        return {
          ok: false,
          code: "duplicate_fingerprint",
          error: `Another open proposal already has this exact change set (${dup.id}).`,
          existing_proposal: loadProposal(db, dup.id) ?? undefined,
        };
      }

      const searchBlob = [
        proposal.title,
        proposal.summary,
        proposal.rationale ?? "",
        ...(proposal.tags ?? []),
        ...proposal.related_issue_ids,
        ...entriesIn.map(
          (e) =>
            `${e.contentType}/${e.slug} ${e.variant ?? ""} ${(e.updates ?? []).map((u) => u.field_path).join(" ")}`,
        ),
        proposal.promote_on_apply ? "promote_on_apply" : "",
      ]
        .join(" ")
        .toLowerCase();

      db.prepare(
        `DELETE FROM content_proposal_entries WHERE proposal_id = ? AND status IN ('pending','failed')`,
      ).run(id);
      for (const cap of captured) {
        db.prepare(
          `INSERT INTO content_proposal_entries (
            proposal_id, entry_key, locale, variant, status, ops_json, baseline_context_json, variant_fingerprint
          ) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(
          id,
          makeEntryKey(cap.input.contentType, cap.input.slug),
          cap.input.locale,
          cap.input.variant || null,
          "pending",
          JSON.stringify(cap.input.updates),
          JSON.stringify(cap.baseline),
          cap.variant_fingerprint,
        );
      }
      db.prepare(
        `UPDATE content_proposals SET fingerprint = ?, search_text = ?, updated_at = ?, author_content_at = ? WHERE id = ?`,
      ).run(fingerprint, searchBlob, now, now, id);

      const afterOps = getRaw(id)!;
      const priorDeclared = (afterOps.review_situations ?? []) as ReviewSituationId[];
      const refreshed = refreshSituationsAfterRevise(priorDeclared, afterOps.entries, {
        summary: afterOps.summary,
        title: afterOps.title,
        promoteOnApply: afterOps.promote_on_apply,
      });
      // Store author-declared ids that still own remaining ops (inferred extras stay live-only).
      const stillDeclared = refreshed.situations.filter((s) => priorDeclared.includes(s));
      db.prepare(
        `UPDATE content_proposals SET review_situations_json = ?, updated_at = ? WHERE id = ?`,
      ).run(JSON.stringify(stillDeclared), now, id);

      const after = getRaw(id)!;
      persistRollup(db, after);
      await classifyLive(after, { refreshSnapshot: true });
      emitProposalEvent(site, "proposal_revised", id, caller.username, {
        entry_count: captured.length,
        open_blocker_count: after.open_blocker_count,
      }, caller.actor);
      return {
        ok: true,
        proposal: get(id)!,
        warnings: [
          {
            code: "blockers_remain_after_revise",
            message:
              "Open needs-changes still block apply. Resolve each blocker after fixing, then re-preview before apply.",
          },
          ...refreshed.warnings,
        ],
      };
    }

    if (action === "add_blocker") {
      if (proposal.status === "finished" || proposal.status === "rejected" || proposal.status === "withdrawn") {
        return { ok: false, code: "closed", error: "Cannot add blockers to a closed proposal" };
      }
      const body = (caller.body || "").trim();
      if (body.length < MIN_BLOCKER_BODY) {
        return {
          ok: false,
          code: "blocker_too_short",
          error: `blocker body required (min ${MIN_BLOCKER_BODY} characters): what's wrong, what fixed looks like, and why`,
        };
      }
      db.prepare(
        `INSERT INTO content_proposal_blockers (
          proposal_id, kind, body, status, author, created_at, agent_session_id, author_actor_json
        ) VALUES (?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        "blocker",
        body,
        "open",
        caller.username,
        now,
        caller.agent_session_id?.trim() || null,
        JSON.stringify(caller.actor ?? {}),
      );
      db.prepare(
        `UPDATE content_proposals SET updated_at = ?, reviewer_action_at = ? WHERE id = ?`,
      ).run(now, now, id);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "resolve_blocker") {
      const { active, expired } = activeClaim(proposal, now);
      if (
        !active ||
        !sameAgentIdentity(
          active.by,
          asAgentActor(active.actor),
          caller.username,
          asAgentActor(caller.actor),
        )
      ) {
        return {
          ok: false,
          code: "not_claimant",
          error: expired
            ? "Claim expired. Claim the proposal again, then resolve the blocker."
            : "Only the active claimant may resolve blockers. Claim the proposal first.",
          claim_expired: expired,
          proposal,
        };
      }
      const blockerId = caller.blocker_id;
      if (!blockerId) return { ok: false, code: "blocker_required", error: "blocker_id is required" };
      const resolveNote = (caller.resolve_note || "").trim();
      if (resolveNote.length < 20) {
        return {
          ok: false,
          code: "resolve_note_too_short",
          error: "resolve_note required (min 20 characters): what changed",
        };
      }
      const blocker = proposal.blockers.find((b) => b.id === blockerId);
      if (!blocker) return { ok: false, code: "blocker_not_found", error: "Blocker not found" };
      if (blocker.status !== "open") {
        return { ok: false, code: "blocker_not_open", error: "Blocker is not open" };
      }
      db.prepare(
        `UPDATE content_proposal_blockers
         SET status = 'resolved', resolved_at = ?, resolved_by = ?, resolve_note = ?,
             resolved_by_actor_json = ?
         WHERE id = ? AND proposal_id = ?`,
      ).run(now, caller.username, resolveNote, JSON.stringify(caller.actor ?? {}), blockerId, id);
      const authorFixed = sameAgentIdentity(
        proposal.proposer_username,
        asAgentActor(proposal.proposer_actor),
        caller.username,
        asAgentActor(caller.actor),
      );
      if (authorFixed) {
        db.prepare(
          `UPDATE content_proposals SET updated_at = ?, author_content_at = ? WHERE id = ?`,
        ).run(now, now, id);
      } else {
        db.prepare(
          `UPDATE content_proposals SET updated_at = ?, reviewer_action_at = ? WHERE id = ?`,
        ).run(now, now, id);
      }
      const fresh = get(id)!;
      const warnings =
        fresh.open_blocker_count === 0
          ? [
              {
                code: "blockers_cleared_repreview",
                message:
                  "All blockers are resolved. Re-preview the draft (or soft diffs) before apply — cleared blockers do not mean approved.",
              },
            ]
          : undefined;
      return { ok: true, proposal: fresh, warnings };
    }

    if (action === "reopen_blocker") {
      const blockerId = caller.blocker_id;
      if (!blockerId) return { ok: false, code: "blocker_required", error: "blocker_id is required" };
      const blocker = proposal.blockers.find((b) => b.id === blockerId);
      if (!blocker) return { ok: false, code: "blocker_not_found", error: "Blocker not found" };
      if (blocker.status !== "resolved") {
        return { ok: false, code: "blocker_not_resolved", error: "Only resolved blockers can be reopened" };
      }
      db.prepare(
        `UPDATE content_proposal_blockers
         SET status = 'open', resolved_at = NULL, resolved_by = NULL, resolve_note = NULL,
             resolved_by_actor_json = NULL
         WHERE id = ? AND proposal_id = ?`,
      ).run(blockerId, id);
      db.prepare(
        `UPDATE content_proposals SET updated_at = ?, reviewer_action_at = ? WHERE id = ?`,
      ).run(now, now, id);
      return { ok: true, proposal: get(id)! };
    }

    if (action === "attach_variant") {
      if (proposal.status !== "open" && proposal.status !== "partial") {
        return { ok: false, code: "closed", error: "Cannot attach a variant to a closed proposal" };
      }
      const session = caller.agent_session_id?.trim();
      if (!proposal.created_agent_session_id) {
        return {
          ok: false,
          code: "session_required",
          error: "This proposal has no creating session; variant attach is not allowed",
        };
      }
      if (!session || session !== proposal.created_agent_session_id) {
        return {
          ok: false,
          code: "session_mismatch",
          error: "attach_variant is only allowed in the same agent session that created the proposal",
        };
      }
      const entry = proposal.entries[0];
      if (!entry) {
        return { ok: false, code: "entry_required", error: "Proposal has no entries to attach a variant to" };
      }
      if (entry.variant) {
        return {
          ok: false,
          code: "variant_locked",
          error: `Variant '${entry.variant}' is already attached and cannot be changed`,
        };
      }
      const variant = (caller.variant || "").trim();
      if (!variant) return { ok: false, code: "variant_required", error: "variant is required" };

      const existingVariant = findOpenProposalForVariant(
        db,
        site,
        entry.contentType,
        entry.slug,
        entry.locale,
        variant,
      );
      if (existingVariant && existingVariant.id !== id) {
        return {
          ok: false,
          code: "proposal_exists",
          error: `An open proposal already references variant '${variant}'`,
          existing_proposal: existingVariant,
        };
      }

      let fingerprint: string | null = null;
      if (deps.readVariantFingerprint) {
        const fp = deps.readVariantFingerprint({
          contentType: entry.contentType,
          slug: entry.slug,
          locale: entry.locale,
          variant,
        });
        if (fp.error) return { ok: false, code: "baseline_failed", error: fp.error };
        fingerprint = fp.fingerprint;
      }

      db.prepare(
        `UPDATE content_proposal_entries SET variant = ?, variant_fingerprint = ? WHERE id = ?`,
      ).run(variant, fingerprint, entry.id);
      if (caller.promote_on_apply) {
        db.prepare(`UPDATE content_proposals SET promote_on_apply = 1, updated_at = ? WHERE id = ?`).run(now, id);
      } else {
        db.prepare(`UPDATE content_proposals SET updated_at = ? WHERE id = ?`).run(now, id);
      }
      const afterAttach = getRaw(id)!;
      await classifyLive(afterAttach, { refreshSnapshot: true });
      return { ok: true, proposal: get(id)! };
    }

    if (action === "apply") {
      if (proposal.kind !== "edits") {
        return { ok: false, code: "wrong_kind", error: "apply is for edits proposals; use close for notes" };
      }
      if (
        fourEyesBlockedForCaller(
          policy(),
          proposal.proposer_username,
          proposal.proposer_actor,
          caller.username,
          caller.actor,
        )
      ) {
        return {
          ok: false,
          code: "four_eyes",
          error: "Four-eyes: a different agent role (or staff UI) must apply",
        };
      }
      if (proposal.open_blocker_count > 0) {
        return {
          ok: false,
          code: "proposal_blocked",
          error: `Cannot apply while ${proposal.open_blocker_count} open blocker(s) remain`,
          proposal: enrichRecentActivity(proposal),
        };
      }

      const reviewForApply = await classifyLive(proposal);
      if (reviewForApply?.block_apply) {
        return {
          ok: false,
          code: "target_missing",
          error:
            "The page this proposal edits no longer exists — apply is blocked. Reject or withdraw, or restore the page and file a fresh proposal.",
          proposal: enrichRecentActivity(proposal),
          review_context: reviewForApply,
        };
      }

      const work = proposal.entries.filter((e) => e.status === "pending" || e.status === "failed");
      if (work.length > 0) {
        const activityResult = runResolveActivity({
          entries: work.map((e) => ({
            contentType: e.contentType,
            slug: e.slug,
            locale: e.locale,
            variant: e.variant,
          })),
          excludeAgentSessionId: caller.agent_session_id,
          excludeProposalApplies: proposal.entries
            .filter((e) => e.status === "done")
            .map((e) => ({
              contentType: e.contentType,
              slug: e.slug,
              locale: e.locale,
              variant: e.variant,
              applied_at: e.applied_at,
              applied_by: e.applied_by,
            })),
        });
        if (!activityResult.ok) {
          return {
            ok: false,
            code: "activity_unavailable",
            error:
              activityResult.error ||
              "Could not load recent entry activity. Retry when activity history is available.",
            proposal: enrichRecentActivity(proposal),
          };
        }
        if (activityResult.gateWriteCount > 0 && !caller.confirm_recent_activity) {
          return {
            ok: false,
            code: "confirm_recent_activity",
            error:
              "Linked entries have recent writes. Inspect get_entry_activity first. " +
              "Same-field SERP churn + live not broken → reject duplicate_weaker (title/description-only) or revise_entries to drop SERP ops then apply (mixed); do not confirm. " +
              "Pass confirm_recent_activity: true only if this proposal is still needed and distinct from those writes.",
            activity: activityResult.activity,
            proposal: enrichRecentActivity({
              ...proposal,
              recent_activity: activityResult.activity,
            }),
          };
        }
      }

      for (const entry of work) {
        if (proposal.promote_on_apply) {
          if (!entry.variant) {
            db.prepare(
              `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
            ).run("promote_on_apply requires an attached variant", entry.id);
            continue;
          }
          if (deps.readVariantFingerprint && entry.variant_fingerprint) {
            const fp = deps.readVariantFingerprint({
              contentType: entry.contentType,
              slug: entry.slug,
              locale: entry.locale,
              variant: entry.variant,
            });
            if (fp.error || fp.fingerprint !== entry.variant_fingerprint) {
              db.prepare(
                `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
              ).run(
                fp.error
                  ? `context_stale: ${fp.error}`
                  : "context_stale: variant file contents changed since the proposal was created",
                entry.id,
              );
              continue;
            }
          }
          if (!deps.promoteEntry) {
            db.prepare(
              `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
            ).run("promote not configured", entry.id);
            continue;
          }
          const promoted = await deps.promoteEntry(entry, caller.username, {
            confirm_end_experiment: caller.confirm_end_experiment,
          });
          if (!promoted.ok) {
            if (promoted.code === "confirm_end_experiment") {
              return {
                ok: false,
                code: "confirm_end_experiment",
                error: promoted.error ?? "confirm_end_experiment required",
                traffic_siblings: promoted.traffic_siblings,
                proposal,
              };
            }
            db.prepare(
              `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
            ).run(promoted.error ?? "promote failed", entry.id);
            continue;
          }
          db.prepare(
            `UPDATE content_proposal_entries SET status = 'done', last_error = NULL, applied_at = ?, applied_by = ? WHERE id = ?`,
          ).run(Date.now(), caller.username, entry.id);
          continue;
        }

        // Soft apply (live or into variant)
        if (!entry.ops.length) {
          db.prepare(
            `UPDATE content_proposal_entries SET status = 'done', last_error = NULL, applied_at = ?, applied_by = ? WHERE id = ?`,
          ).run(Date.now(), caller.username, entry.id);
          continue;
        }

        if (entry.baseline_context.creates_entry && !entry.variant) {
          const exNow = resolveExistence({
            contentType: entry.contentType,
            slug: entry.slug,
            locale: entry.locale,
          });
          if (exNow.live !== "exists") {
            const failEntry = (message: string) => {
              db.prepare(
                `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
              ).run(message, entry.id);
            };
            if (!deps.prepareCreatesEntry) {
              failEntry("create not configured");
              continue;
            }
            let seedFunnel: IdeaFunnel | null = null;
            if (proposal.implements_proposal_id) {
              const idea = loadProposal(db, proposal.implements_proposal_id);
              const locked = idea?.idea_funnel ?? null;
              if (locked && ideaFunnelComplete(locked)) {
                const fromOps = funnelFromFieldOps(entry.ops);
                if (fromOps && !ideaFunnelsEqual(fromOps, locked)) {
                  failEntry(
                    `${IDEA_FUNNEL_CONFLICT}: ops funnel does not match the accepted idea's frozen idea_funnel (stage=${locked.stage}).`,
                  );
                  continue;
                }
                if (hasFunnelFieldOps(entry.ops) && !fromOps) {
                  failEntry(
                    `${IDEA_FUNNEL_CONFLICT}: incomplete funnel.* ops — must match the accepted idea's idea_funnel or omit funnel fields to auto-seed.`,
                  );
                  continue;
                }
                if (!fromOps) seedFunnel = locked;
              }
            }
            const prepared = await deps.prepareCreatesEntry(entry, {
              confirmNewValues: caller.confirm_new_values === true,
              author: caller.username,
              ideaFunnel: seedFunnel,
            });
            if (!prepared.ok && prepared.code === "confirm_new_values") {
              return {
                ok: false,
                code: "confirm_new_values",
                error: prepared.error ?? "confirm_new_values required",
                proposal: get(id)!,
              };
            }
            if (!prepared.ok) {
              if (prepared.seeded) deps.discardSeededEntry?.(entry);
              failEntry(prepared.error ?? "create failed");
              continue;
            }
            const appliedCreate = await deps.applyUpdates(entry, caller.username);
            if (!appliedCreate.ok) {
              if (prepared.seeded) deps.discardSeededEntry?.(entry);
              failEntry(appliedCreate.error ?? "apply failed");
              continue;
            }
            if (deps.stampPublishedAt) {
              const stamped = deps.stampPublishedAt(entry, caller.username);
              if (!stamped.ok) {
                if (prepared.seeded) deps.discardSeededEntry?.(entry);
                failEntry(stamped.error ?? "published_at stamp failed");
                continue;
              }
            }
            db.prepare(
              `UPDATE content_proposal_entries SET status = 'done', last_error = NULL, applied_at = ?, applied_by = ? WHERE id = ?`,
            ).run(Date.now(), caller.username, entry.id);
            continue;
          }
        }

        // First write for a locked idea funnel without creates_entry auto-seed (e.g. DB types).
        if (proposal.implements_proposal_id && !entry.baseline_context.creates_entry) {
          const idea = loadProposal(db, proposal.implements_proposal_id);
          const locked = idea?.idea_funnel ?? null;
          if (locked && ideaFunnelComplete(locked)) {
            const fromOps = funnelFromFieldOps(entry.ops);
            if (fromOps && !ideaFunnelsEqual(fromOps, locked)) {
              db.prepare(
                `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
              ).run(
                `${IDEA_FUNNEL_CONFLICT}: ops funnel does not match the accepted idea's frozen idea_funnel.`,
                entry.id,
              );
              continue;
            }
            const liveNow = resolveExistence({
              contentType: entry.contentType,
              slug: entry.slug,
              locale: entry.locale,
              variant: entry.variant,
            });
            if (liveNow.live !== "exists" && (!fromOps || !ideaFunnelsEqual(fromOps, locked))) {
              db.prepare(
                `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
              ).run(
                `${IDEA_FUNNEL_REQUIRED}: this implements an accepted idea with idea_funnel — include matching funnel.stage + funnel.products ops on the first write.`,
                entry.id,
              );
              continue;
            }
          }
        }

        if (entry.variant && deps.readVariantFingerprint && entry.variant_fingerprint) {
          const fp = deps.readVariantFingerprint({
            contentType: entry.contentType,
            slug: entry.slug,
            locale: entry.locale,
            variant: entry.variant,
          });
          if (fp.error || fp.fingerprint !== entry.variant_fingerprint) {
            db.prepare(
              `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
            ).run(
              fp.error
                ? `context_stale: ${fp.error}`
                : "context_stale: variant file contents changed since the proposal was created",
              entry.id,
            );
            continue;
          }
        }

        const live = deps.captureBaseline({
          contentType: entry.contentType,
          slug: entry.slug,
          locale: entry.locale,
          variant: entry.variant || undefined,
          updates: entry.ops,
        });
        if (live.error) {
          db.prepare(
            `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
          ).run(live.error, entry.id);
          continue;
        }
        const stalePaths: string[] = [];
        for (const op of entry.ops) {
          const was = entry.baseline_context.values[op.field_path];
          const nowVal = live.values[op.field_path];
          if (!valuesEqual(was, nowVal)) stalePaths.push(op.field_path);
        }
        if (stalePaths.length) {
          db.prepare(
            `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
          ).run(`context_stale: ${stalePaths.join(", ")}`, entry.id);
          continue;
        }
        const applied = await deps.applyUpdates(entry, caller.username);
        if (!applied.ok) {
          db.prepare(
            `UPDATE content_proposal_entries SET status = 'failed', last_error = ? WHERE id = ?`,
          ).run(applied.error ?? "apply failed", entry.id);
          continue;
        }
        db.prepare(
          `UPDATE content_proposal_entries SET status = 'done', last_error = NULL, applied_at = ?, applied_by = ? WHERE id = ?`,
        ).run(Date.now(), caller.username, entry.id);
      }
      const updated = get(id)!;
      const next = persistRollup(db, updated, { closedBy: caller.username });
      const fresh = get(id)!;
      emitProposalEvent(site, "proposal_applied_progress", id, caller.username, {
        status: next,
        done: fresh.entries.filter((e) => e.status === "done").length,
        total: fresh.entries.length,
      }, caller.actor);
      if (next === "finished") {
        captureDecisionDebug(proposal, "apply", caller, reviewForApply);
        emitProposalEvent(site, "proposal_finished", id, caller.username, {}, caller.actor);
      }
      return { ok: true, proposal: fresh };
    }

    return { ok: false, code: "unknown_action", error: `Unknown action: ${action}` };
  }

  return { get, list, stats, kpiHistory, listRecentProposers, exportAll, create, update, classifyLive };
}

/** Full site dump for production → local pull (includes entries + blockers). */
export function exportAllProposals(site: string): ProposalRecord[] {
  const db = dbFor(site);
  const rows = db
    .prepare(`SELECT * FROM content_proposals WHERE site = ? ORDER BY updated_at DESC, id ASC`)
    .all(site) as ProposalRow[];
  return rows.map((r) => mapProposal(r, loadEntries(db, r.id), loadBlockers(db, r.id)));
}

function syncAutoincrement(db: Database.Database, table: string): void {
  const row = db.prepare(`SELECT MAX(id) AS m FROM ${table}`).get() as { m: number | null };
  const max = Number(row?.m) || 0;
  try {
    if (max <= 0) {
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
      return;
    }
    const existing = db
      .prepare(`SELECT seq FROM sqlite_sequence WHERE name = ?`)
      .get(table) as { seq: number } | undefined;
    if (existing) {
      db.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`).run(max, table);
    } else {
      db.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)`).run(table, max);
    }
  } catch {
    /* sqlite_sequence may be absent until first AUTOINCREMENT write */
  }
}

/**
 * Dev-only helper: wipe this site's proposals and insert a production snapshot.
 * Remaps `site` to the local content root; preserves proposal / entry / blocker ids.
 */
export function replaceProposalsFromSnapshot(site: string, proposals: ProposalRecord[]): number {
  const db = dbFor(site);
  const insertProposal = db.prepare(
    `INSERT INTO content_proposals (
      id, site, fingerprint, status, kind, category, title, summary, rationale,
      documentation_json, related_issue_ids_json, proposer_username, proposer_actor_json,
      created_at, updated_at, claim_json, tags_json, search_text,
      created_agent_session_id, promote_on_apply, no_auto_retry,
      close_reason, close_note, closed_by, closed_at, related_entries_json,
      review_context_snapshot_json, supersedes_proposal_id, replaced_by_proposal_id,
      escalated, escalated_at, escalated_by, escalated_note, decision_debug_json,
      review_situations_json, accepted_entry_json, implements_proposal_id,
      author_content_at, reviewer_action_at, idea_funnel_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertEntry = db.prepare(
    `INSERT INTO content_proposal_entries (
      id, proposal_id, entry_key, locale, variant, status, ops_json, baseline_context_json,
      last_error, applied_at, applied_by, variant_fingerprint
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertBlocker = db.prepare(
    `INSERT INTO content_proposal_blockers (
      id, proposal_id, kind, body, status, author, created_at, resolved_at, resolved_by,
      resolve_note, agent_session_id, author_actor_json, resolved_by_actor_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  const run = db.transaction((rows: ProposalRecord[]) => {
    db.prepare(
      `DELETE FROM content_proposal_blockers
       WHERE proposal_id IN (SELECT id FROM content_proposals WHERE site = ?)`,
    ).run(site);
    db.prepare(
      `DELETE FROM content_proposal_entries
       WHERE proposal_id IN (SELECT id FROM content_proposals WHERE site = ?)`,
    ).run(site);
    db.prepare(`DELETE FROM content_proposals WHERE site = ?`).run(site);

    for (const p of rows) {
      insertProposal.run(
        p.id,
        site,
        p.fingerprint,
        p.status,
        p.kind,
        p.category,
        p.title,
        p.summary,
        p.rationale,
        JSON.stringify(p.documentation ?? {}),
        JSON.stringify(p.related_issue_ids ?? []),
        p.proposer_username,
        JSON.stringify(p.proposer_actor ?? {}),
        p.created_at,
        p.updated_at,
        p.claim ? JSON.stringify(p.claim) : null,
        JSON.stringify(p.tags ?? []),
        p.search_text ?? "",
        p.created_agent_session_id ?? null,
        p.promote_on_apply ? 1 : 0,
        p.no_auto_retry ? 1 : 0,
        p.close_reason ?? null,
        p.close_note ?? null,
        p.closed_by ?? null,
        p.closed_at ?? null,
        JSON.stringify(p.related_entries ?? []),
        p.review_context_snapshot ? JSON.stringify(p.review_context_snapshot) : null,
        p.supersedes_proposal_id ?? null,
        p.replaced_by_proposal_id ?? null,
        p.escalated ? 1 : 0,
        p.escalated_at ?? null,
        p.escalated_by ?? null,
        p.escalated_note ?? null,
        p.decision_debug ? JSON.stringify(p.decision_debug) : null,
        JSON.stringify(p.review_situations ?? []),
        p.accepted_entry ? JSON.stringify(p.accepted_entry) : null,
        p.implements_proposal_id ?? null,
        p.author_content_at ?? null,
        p.reviewer_action_at ?? null,
        p.idea_funnel ? JSON.stringify(p.idea_funnel) : null,
      );
      for (const e of p.entries ?? []) {
        insertEntry.run(
          e.id,
          p.id,
          e.entry_key || makeEntryKey(e.contentType, e.slug),
          e.locale,
          e.variant ?? null,
          e.status,
          JSON.stringify(e.ops ?? []),
          JSON.stringify(e.baseline_context ?? { values: {} }),
          e.last_error ?? null,
          e.applied_at ?? null,
          e.applied_by ?? null,
          e.variant_fingerprint ?? null,
        );
      }
      for (const b of p.blockers ?? []) {
        insertBlocker.run(
          b.id,
          p.id,
          b.kind || "blocker",
          b.body,
          b.status,
          b.author,
          b.created_at,
          b.resolved_at ?? null,
          b.resolved_by ?? null,
          b.resolve_note ?? null,
          b.agent_session_id ?? null,
          blockerActorColumn(b.author_actor),
          blockerActorColumn(b.resolved_by_actor),
        );
      }
    }

    syncAutoincrement(db, "content_proposal_entries");
    syncAutoincrement(db, "content_proposal_blockers");
    return rows.length;
  });

  const n = run(proposals);
  wipeAndBackfillKpiHistory(db, site);
  return n;
}

function inferCategory(entries: ProposalEntryInput[]): ProposalCategory {
  const seo = entries.some((e) =>
    (e.updates ?? []).some((u) => u.field_path.startsWith("meta.") || u.field_path.startsWith("seo.")),
  );
  return seo ? "content.seo" : "content.field";
}

export function captureBaselineFromSite(ctx: SiteContext, entry: ProposalEntryInput): {
  values: Record<string, unknown>;
  error?: string;
} {
  const loaded = getContentForEdit(
    entry.contentType,
    entry.slug,
    entry.locale,
    entry.variant,
    undefined,
    ctx.contentIndex,
  );
  if (!loaded.content) {
    return { values: {}, error: loaded.error || "Content not found" };
  }
  const values: Record<string, unknown> = {};
  for (const u of entry.updates ?? []) {
    const read = readFieldValueAtPath({
      contentType: entry.contentType,
      slug: entry.slug,
      locale: entry.locale,
      variant: entry.variant,
      field_path: u.field_path,
      contentRoot: ctx.contentRoot,
      ci: ctx.contentIndex,
    });
    values[u.field_path] = read.value;
  }
  return { values };
}

export function readVariantFingerprintFromSite(
  ctx: SiteContext,
  entry: { contentType: string; slug: string; locale: string; variant: string },
): { fingerprint: string; error?: string } {
  const resolved = resolveWritableVersioningTarget(entry.contentType, entry.slug, ctx.contentRoot);
  if (!resolved.ok) {
    return { fingerprint: "", error: resolved.error };
  }
  const filePath = ctx.versioningManager.getVariantFilePath(
    entry.contentType,
    resolved.slug,
    entry.variant,
    entry.locale,
  );
  if (!fs.existsSync(filePath)) {
    return { fingerprint: "", error: "Variant file not found" };
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return { fingerprint: hashVariantFileContents(raw) };
}

export async function applyUpdatesOnSite(
  ctx: SiteContext,
  entry: ProposalEntryRow,
  author: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!entry.ops.length) return { ok: true };
  const result = await applyFieldUpdates({
    contentType: entry.contentType,
    slug: entry.slug,
    locale: entry.locale,
    variant: entry.variant || undefined,
    updates: entry.ops.map((u) => ({
      field_path: u.field_path,
      value: u.value,
      reset: u.reset === true,
    })),
    author,
    contentRoot: ctx.contentRoot,
    contentRootName: ctx.contentRootName,
    ci: ctx.contentIndex,
    skipSharedLayoutFanOut: true,
  });
  if (!result.ok) return { ok: false, error: result.error || "Write failed" };
  return { ok: true };
}

export async function promoteEntryOnSite(
  ctx: SiteContext,
  entry: ProposalEntryRow,
  author: string,
  opts: { confirm_end_experiment?: boolean },
): Promise<{
  ok: boolean;
  error?: string;
  code?: string;
  traffic_siblings?: Array<{ slug: string; locale: string; allocation: number }>;
}> {
  if (!entry.variant) return { ok: false, code: "variant_required", error: "variant required for promote" };
  const { promoteVariantWithOptionalTeardown } = await import("../versioning/promote-with-teardown");
  const resolved = resolveWritableVersioningTarget(entry.contentType, entry.slug, ctx.contentRoot);
  if (!resolved.ok) {
    return { ok: false, code: "not_found", error: resolved.error };
  }
  const folder = getFolder(entry.contentType);
  const result = await promoteVariantWithOptionalTeardown({
    contentType: entry.contentType,
    slug: resolved.slug,
    locale: entry.locale,
    variantSlug: entry.variant,
    author,
    contentRoot: ctx.contentRoot,
    contentRootName: ctx.contentRootName,
    folder,
    templateMode: resolved.templateMode,
    versioningManager: ctx.versioningManager,
    ci: ctx.contentIndex,
    cache: ctx.validationCache,
    confirmEndExperiment: opts.confirm_end_experiment,
    endExperimentMode: true,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      error: result.error,
      traffic_siblings: result.traffic_siblings,
    };
  }
  return { ok: true };
}

function proposalCollection(site: string): string {
  return `cms_proposals_${site.replace(/[^\w-]+/g, "-")}`;
}

async function indexProposalSearch(site: string, proposal: ProposalRecord): Promise<void> {
  const { upsertItem } = await import("../vector-search");
  await upsertItem(
    proposalCollection(site),
    {
      id: proposal.id,
      slug: proposal.id,
      title: proposal.title,
      summary: proposal.summary,
      rationale: proposal.rationale ?? "",
      tags: proposal.tags.join(" "),
      search_text: proposal.search_text,
      status: proposal.status,
    },
    ["title", "summary", "rationale", "tags", "search_text"],
  );
}

async function findSimilarProposals(site: string, query: string): Promise<SimilarProposal[]> {
  const { search } = await import("../vector-search");
  const hits = await search(proposalCollection(site), query, 8);
  return hits.map((h) => ({ id: h.slug, title: h.slug, score: h.score }));
}

export function resolveExistenceFromSite(
  ctx: SiteContext,
  entry: { contentType: string; slug: string; locale: string; variant?: string | null },
): { live: ExistenceState; draftExists: boolean } {
  const liveLoaded = getContentForEdit(
    entry.contentType,
    entry.slug,
    entry.locale,
    undefined,
    undefined,
    ctx.contentIndex,
  );
  let live: ExistenceState = "missing";
  if (liveLoaded.content) live = "exists";
  else if (liveLoaded.error && !/not found/i.test(liveLoaded.error)) live = "unknown";

  let draftExists = false;
  if (entry.variant?.trim()) {
    const draftLoaded = getContentForEdit(
      entry.contentType,
      entry.slug,
      entry.locale,
      entry.variant.trim(),
      undefined,
      ctx.contentIndex,
    );
    draftExists = Boolean(draftLoaded.content);
  }
  return { live, draftExists };
}

export function inspectMissingTargetFromSite(
  ctx: SiteContext,
  entry: { contentType: string; slug: string },
): MissingTargetShape {
  const config = getContentTypeConfig(entry.contentType, ctx.contentRoot);
  if (!config) return { shape: "other" };
  if (config.database?.slug) return { shape: "database" };
  if (!config.single_template) return { shape: "other" };
  if (isTemplateVersioningSlug(entry.slug)) return { shape: "other" };
  if (isEntryDetached(entry.contentType, entry.slug, ctx.contentRoot)) return { shape: "other" };
  const requiredFields = listRequiredEditorFields(config.editor, {
    isSharedLayout: true,
    isDetached: false,
  });
  return { shape: "attached_file", requiredFields };
}

export async function prepareCreatesEntryOnSite(
  ctx: SiteContext,
  entry: ProposalEntryRow,
  opts: {
    confirmNewValues?: boolean;
    author: string;
    ideaFunnel?: IdeaFunnel | null;
  },
): Promise<{ ok: boolean; error?: string; code?: string; seeded?: boolean }> {
  const config = getContentTypeConfig(entry.contentType, ctx.contentRoot);
  if (!config || config.database?.slug || !config.single_template) {
    return { ok: false, code: "not_attached_file", error: "This page is not a file-based attached post." };
  }
  const requiredFields = listRequiredEditorFields(config.editor, {
    isSharedLayout: true,
    isDetached: false,
  });
  const missing = missingRequiredFromOps(requiredFields, entry.ops);
  if (missing.length) {
    return {
      ok: false,
      code: "required_fields_missing",
      error: `This new post is missing required fields: ${missing.join(", ")}.`,
    };
  }
  const params = listExtraUrlPatternParams(config.url_pattern);
  const proposed: Record<string, string> = {};
  for (const op of entry.ops) {
    if (op.reset) continue;
    const head = op.field_path.split(".")[0] ?? op.field_path;
    const key = params.includes(op.field_path) ? op.field_path : params.includes(head) ? head : "";
    if (!key) continue;
    const slug = extractParamSlug(op.value);
    if (slug) proposed[key] = slug;
  }
  const peer = validateUrlParamPeerValues(
    ctx.contentRoot,
    entry.contentType,
    config,
    { [entry.locale]: proposed },
    opts.confirmNewValues,
  );
  if (peer) {
    return {
      ok: false,
      code: "confirm_new_values",
      error:
        `New ${peer.param} "${peer.proposed_value}" is not an existing ${peer.locale} value. ` +
        `Observed: ${peer.observed_values.slice(0, 20).join(", ")}. ` +
        "Pass confirm_new_values: true on apply after principal approval, or pick an observed value.",
    };
  }
  seedAttachedLocaleFiles({
    contentType: entry.contentType,
    slug: entry.slug,
    locale: entry.locale,
    contentRoot: ctx.contentRoot,
    author: opts.author,
    funnel: opts.ideaFunnel ? ideaFunnelToYamlBlock(opts.ideaFunnel) : null,
  });
  ctx.contentIndex.refresh();
  return { ok: true, seeded: true };
}

export function discardSeededEntryOnSite(ctx: SiteContext, entry: ProposalEntryRow): void {
  discardSeededAttachedEntry({
    contentType: entry.contentType,
    slug: entry.slug,
    locale: entry.locale,
    contentRoot: ctx.contentRoot,
  });
  ctx.contentIndex.refresh();
}

export function stampPublishedAtOnSite(
  ctx: SiteContext,
  entry: ProposalEntryRow,
  author: string,
): { ok: boolean; error?: string } {
  const stamped = ensurePublishedAtOnce(entry.contentType, entry.slug, {
    author,
    contentRoot: ctx.contentRoot,
  });
  if (stamped.error) return { ok: false, error: stamped.error };
  return { ok: true };
}

export function proposalServiceForSite(ctx: SiteContext) {
  const site = ctx.contentRootName;
  return createProposalService({
    site,
    issueExists: (id) => Boolean(ctx.validationCache.getIssueById(id)),
    captureBaseline: (entry) => captureBaselineFromSite(ctx, entry),
    applyUpdates: (entry, author) => applyUpdatesOnSite(ctx, entry, author),
    readVariantFingerprint: (entry) => readVariantFingerprintFromSite(ctx, entry),
    promoteEntry: (entry, author, opts) => promoteEntryOnSite(ctx, entry, author, opts),
    findSimilar: (q) => findSimilarProposals(site, q),
    indexSearch: (p) => indexProposalSearch(site, p),
    resolveExistence: (entry) => resolveExistenceFromSite(ctx, entry),
    inspectMissingTarget: (entry) => inspectMissingTargetFromSite(ctx, entry),
    prepareCreatesEntry: (entry, opts) => prepareCreatesEntryOnSite(ctx, entry, opts),
    discardSeededEntry: (entry) => discardSeededEntryOnSite(ctx, entry),
    stampPublishedAt: (entry, author) => stampPublishedAtOnSite(ctx, entry, author),
    getProposalSettings: () => loadProposalSettingsFromDisk(ctx.contentRoot),
  });
}
