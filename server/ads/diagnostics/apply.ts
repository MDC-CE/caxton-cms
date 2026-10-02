/**
 * Save step for Ads diagnostics results (full Runs and Re-checks). Pure: turns grouped drafts +
 * the current cache into one `AdsCacheChanges` batch.
 *
 * Rules:
 * - Only validators that ran (and didn't fail) replace their issues; a skipped platform keeps its issues.
 * - Race rule: an issue whose human action (mark fixed, undo, Re-check result, claim) is newer
 *   than the Run start is left untouched.
 * - Pending issues are carried over until ready; then found → reopen (+ failed attempt), gone →
 *   verified_gone. fresh_days issues are judged on post-fix data only (`postFix`), which also
 *   allows an early fail once min data is reached. Never an early pass.
 * - Issues whose validator / code is no longer declared → `rule_retired` (full Runs only).
 * - Gone issues whose resource was deleted in the platform → `resource_gone`.
 * - A group whose affected list shrinks is "partly fixed", not a failed attempt.
 */

import type { StoredValidationIssue, ValidationIssueClaim, ValidationIssueCompletion } from "../../../scripts/validation/shared/types";
import type { AdsCacheChanges } from "../../services/validationCacheService";
import type { AdsIssueCheckNote, AdsStoredIssueData } from "@shared/ads-issues";
import { ADS_VALIDATORS, getAdsCodeDefinition, type AdsValidatorName } from "./codes";
import type { AdsIssueDraft } from "./grouping";

export type AdsApplyScope = {
  /** Existing issue ids evaluated by this Re-check (issue scope = one id). */
  issueIds: Set<string>;
  /** Resource Re-checks may also open new issues for these ads. */
  adIds?: Set<string>;
  /** Resource Re-checks: ladder key (`campaign:123`) whose group drafts may open. */
  resourceKey?: string | null;
};

export type AdsApplyInput = {
  mode: "full" | "scope";
  runStartedAt: string;
  nowIso: string;
  window: AdsStoredIssueData["window"];
  /** Validators (and codes) whose results this job carries; missing = not checked (issues kept). */
  checked: AdsCheckedMap;
  drafts: AdsIssueDraft[];
  superseded: Array<{ id: string; by: string }>;
  existing: StoredValidationIssue[];
  completions: Record<string, ValidationIssueCompletion | undefined>;
  claims: Record<string, ValidationIssueClaim | undefined>;
  /** Readiness of pending issues (computed in the web process at save time). */
  isReady: (issue: StoredValidationIssue, completion: ValidationIssueCompletion) => boolean;
  /** fresh_days post-fix judgments (only when min data was reached): found / not found. */
  postFix: Record<string, "found" | "not_found" | undefined>;
  /** Resource deleted in the platform's setup catalog. */
  isResourceGone: (issue: StoredValidationIssue) => boolean;
  scope?: AdsApplyScope;
  actorLabel?: string;
};

/** Per validator: every code, or only some (e.g. Meta access failed → only the access codes). */
export type AdsCheckedMap = Partial<Record<AdsValidatorName, "all" | string[]>>;

export function isCodeChecked(checked: AdsCheckedMap, validator: string, code: string): boolean {
  const c = checked[validator as AdsValidatorName];
  return c === "all" || (Array.isArray(c) && c.includes(code));
}

export type AdsApplySummary = {
  opened: number;
  updated: number;
  resolved: number;
  carried_pending: number;
  untouched_newer_action: number;
};

export type AdsApplyPlan = { changes: AdsCacheChanges; summary: AdsApplySummary };

function newerThanRun(id: string, issue: StoredValidationIssue, input: AdsApplyInput): boolean {
  const start = input.runStartedAt;
  const c = input.completions[id];
  if (c && c.completedAt > start) return true;
  if (issue.ads?.last_action_at && issue.ads.last_action_at > start) return true;
  const claim = input.claims[id];
  if (claim && claim.claimedAt > start) return true;
  return false;
}

export function draftToStored(
  draft: AdsIssueDraft,
  input: Pick<AdsApplyInput, "runStartedAt" | "window">,
  prior?: StoredValidationIssue,
  note?: AdsIssueCheckNote | null,
): StoredValidationIssue {
  const firstSeen = prior?.ads?.first_seen ?? input.runStartedAt;
  const ev = { ...draft.evidence, first_seen: firstSeen };
  const message = `${ev.title}. ${ev.why}`;
  return {
    id: draft.id,
    validator: draft.validator,
    code: draft.code,
    severity: ev.severity,
    message,
    suggestion: ev.how_to_fix,
    targets: [{ type: "ads", platform: draft.platform, level: draft.level, id: draft.resource_id }],
    scopes: ["ads"],
    category: "ads",
    lastSeenAt: input.runStartedAt,
    lastRunAt: input.runStartedAt,
    ads: {
      platform: draft.platform,
      level: draft.level,
      resource_id: draft.resource_id,
      ...(draft.subject ? { subject: draft.subject } : {}),
      account_id: draft.account_id,
      campaign_id: draft.campaign_id,
      adset_id: draft.adset_id,
      affected_ads: draft.affected_ads,
      evidence: ev,
      measured_at: input.runStartedAt,
      window: input.window,
      first_seen: firstSeen,
      last_action_at: prior?.ads?.last_action_at ?? null,
      last_check: note === undefined ? (prior?.ads?.last_check ?? null) : note,
    },
  };
}

function withNote(issue: StoredValidationIssue, note: AdsIssueCheckNote): StoredValidationIssue {
  return { ...issue, ads: { ...issue.ads!, last_check: note, last_action_at: note.at } };
}

function inScope(id: string, input: AdsApplyInput): boolean {
  return input.mode === "full" || !!input.scope?.issueIds.has(id);
}

function draftInScope(d: AdsIssueDraft, input: AdsApplyInput): boolean {
  if (input.mode === "full") return true;
  const s = input.scope;
  if (!s) return false;
  if (s.issueIds.has(d.id)) return true;
  if (s.resourceKey && `${d.level}:${d.resource_id}` === s.resourceKey) return true;
  return !!s.adIds && d.affected_ads.length > 0 && d.affected_ads.every((a) => s.adIds!.has(a));
}

export function planAdsApply(input: AdsApplyInput): AdsApplyPlan {
  const changes: AdsCacheChanges = { upserts: [], reopen: [], removals: [], drops: [] };
  const summary: AdsApplySummary = { opened: 0, updated: 0, resolved: 0, carried_pending: 0, untouched_newer_action: 0 };
  const drafts = new Map(input.drafts.map((d) => [d.id, d]));
  const existingById = new Map(input.existing.map((i) => [i.id, i]));
  const handled = new Set<string>();
  const by = input.actorLabel ?? "ads-diagnostics";
  const supersededIds = new Map(input.superseded.map((s) => [s.id, s.by]));

  for (const issue of input.existing) {
    const id = issue.id;
    if (!issue.ads) continue;
    // Retired rules first: undeclared validator / code (full Runs only).
    if (input.mode === "full" && (!ADS_VALIDATORS[issue.validator as AdsValidatorName] || !getAdsCodeDefinition(issue.validator, issue.code))) {
      changes.removals.push({ id, resolution: "rule_retired", resolvedBy: by });
      summary.resolved += 1;
      handled.add(id);
      continue;
    }
    const def = getAdsCodeDefinition(issue.validator, issue.code);
    if (!def || !isCodeChecked(input.checked, issue.validator, issue.code) || !inScope(id, input)) {
      handled.add(id);
      continue;
    }
    handled.add(id);
    if (newerThanRun(id, issue, input)) {
      summary.untouched_newer_action += 1;
      continue;
    }
    const draft = drafts.get(id);
    const completion = input.completions[id];
    const nowIso = input.nowIso;

    if (completion?.verify) {
      if (def.verify.kind === "fresh_days") {
        const judged = input.postFix[id];
        const ready = input.isReady(issue, completion);
        if (judged === "found") {
          const note: AdsIssueCheckNote = {
            at: nowIso,
            outcome: ready ? "still_open" : "reopened_early",
            message: ready
              ? "Checked on the days after the fix: the problem is still there."
              : "The days after the fix already show the problem, so it reopened early.",
          };
          changes.reopen.push({ id, attempt: { by, report: note.message } });
          changes.upserts.push(draft ? draftToStored(draft, input, issue, note) : withNote(issue, note));
          summary.updated += 1;
        } else if (judged === "not_found" && ready) {
          changes.removals.push({ id, resolution: "verified_gone", resolvedBy: by });
          summary.resolved += 1;
        } else {
          summary.carried_pending += 1;
        }
        continue;
      }
      if (!input.isReady(issue, completion)) {
        summary.carried_pending += 1;
        continue;
      }
      if (draft) {
        const note: AdsIssueCheckNote = { at: nowIso, outcome: "still_open", message: "Checked after the fix: the problem is still there." };
        changes.reopen.push({ id, attempt: { by, report: note.message } });
        changes.upserts.push(draftToStored(draft, input, issue, note));
        summary.updated += 1;
      } else {
        changes.removals.push({ id, resolution: input.isResourceGone(issue) ? "resource_gone" : "verified_gone", resolvedBy: by });
        summary.resolved += 1;
      }
      continue;
    }

    // Open issue.
    if (draft) {
      const before = issue.ads.affected_ads.length;
      const after = draft.affected_ads.length;
      const shrunk = before > 0 && after < before && draft.affected_ads.every((a) => issue.ads!.affected_ads.includes(a));
      const note: AdsIssueCheckNote | undefined = shrunk
        ? { at: nowIso, outcome: "partly_fixed", message: `Partly fixed (${after} of ${before} ads still affected)` }
        : undefined;
      changes.upserts.push(draftToStored(draft, input, issue, note));
      summary.updated += 1;
      continue;
    }
    const supersededBy = supersededIds.get(id);
    if (supersededBy && drafts.has(supersededBy) && draftInScope(drafts.get(supersededBy)!, input)) {
      changes.drops.push(id);
      continue;
    }
    changes.removals.push({ id, resolution: input.isResourceGone(issue) ? "resource_gone" : "verified_gone", resolvedBy: by });
    summary.resolved += 1;
  }

  for (const d of input.drafts) {
    if (handled.has(d.id) || existingById.has(d.id)) continue;
    if (!isCodeChecked(input.checked, d.validator, d.code) || !draftInScope(d, input)) continue;
    changes.upserts.push(draftToStored(d, input));
    summary.opened += 1;
  }

  if (input.mode === "full") {
    changes.runAt = input.runStartedAt;
    changes.validators = Object.keys(input.checked);
  }
  return { changes, summary };
}
