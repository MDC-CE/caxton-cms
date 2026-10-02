/**
 * Ads issue model shared by server, staff UI and MCP: where an issue sits on the ad ladder
 * (account → campaign → ad set → ad), how it is verified after a fix, and the read payload.
 */

import type { AdsIssue, AdsIssuePlatform } from "./ads-diagnostics-rules";

export type AdsIssueLevel = "account" | "campaign" | "adset" | "ad" | "none";

/** How a fix is confirmed. Declared per issue code in code (never stored per issue). */
export type AdsVerify =
  | { kind: "instant" }
  | { kind: "after_sync"; platform: "meta" | "google" | "target" }
  | { kind: "fresh_days"; days: number; lag_days: number };

export type AdsMinDataMetric = "clicks" | "spend" | "sessions" | "leads";
export type AdsMinData = { metric: AdsMinDataMetric; value: number };

/** Ad platforms a Run can check (shared checks ride on the Meta check). */
export type AdsCheckPlatform = "meta" | "google";

/** Pending-verification overlay stored on the issue's completion (`completions[id].verify`). */
export type AdsCompletionVerify = {
  kind: AdsVerify["kind"];
  /** fresh_days: earliest time the post-fix window can be complete (ISO). */
  verify_after?: string | null;
  /** after_sync: the platform whose next successful Sync makes this ready. */
  after_sync_platform?: AdsCheckPlatform | null;
  /** First calendar day (ad account time zone) counted toward fresh_days. */
  window_start?: string | null;
};

/** Outcome note from the last Re-check / Run that touched this issue. */
export type AdsIssueCheckNote = {
  at: string;
  outcome: "partly_fixed" | "couldnt_check" | "still_open" | "reopened_early";
  message: string;
};

/** Ads-only fields on a stored validation issue (`StoredValidationIssue.ads`). */
export type AdsStoredIssueData = {
  platform: AdsIssuePlatform;
  level: AdsIssueLevel;
  /** Ad / ad set / campaign / account id; null for site-wide checks. */
  resource_id: string | null;
  /** Non-ad subject for site-wide checks (conversion id, pixel id, page) — part of identity only when level is none. */
  subject?: string | null;
  account_id?: string | null;
  campaign_id?: string | null;
  adset_id?: string | null;
  /** Ads with the problem (ids). Group issues grow / shrink this list; identity never changes. */
  affected_ads: string[];
  /** Plain-English evidence as measured by the Run (title, why, how to fix, spend, scope, slim details). */
  evidence: AdsIssue;
  /** Run start time the evidence was measured at. */
  measured_at: string;
  window: { start: string; end: string; days: number };
  first_seen: string;
  /** Last mark fixed / undo / Re-check result time — a Run that started earlier leaves this issue alone. */
  last_action_at?: string | null;
  last_check?: AdsIssueCheckNote | null;
};

export type AdsVerifyProgress = {
  days_counted: number;
  days_needed: number;
  metric: AdsMinDataMetric | null;
  value: number;
  needed: number;
  waiting_for_spend: boolean;
};

/** Read-time verify view (computed from code definitions, overlay, rollups and Sync times). */
export type AdsIssueVerifyView = {
  verify: AdsVerify;
  min_data: AdsMinData | null;
  /** open = needs a fix; pending = marked fixed, waiting to confirm. */
  state: "open" | "pending";
  /** recheck (instant), mark_fixed (delay > 0, open), recheck_ready (pending + ready), wait (pending, not ready). */
  action: "recheck" | "mark_fixed" | "recheck_ready" | "wait";
  marked_at: string | null;
  marked_by: string | null;
  report: string | null;
  verify_after: string | null;
  waits_for_sync: AdsCheckPlatform | null;
  ready_to_verify: boolean;
  progress: AdsVerifyProgress | null;
  /** Staff-facing one-liner ("Waiting for 3 days of new data", "Not enough data yet (4 of 30 clicks)"). */
  label: string;
};

export type AdsIssueRow = AdsIssue & {
  /** The check's own key for this finding (e.g. `unrecognized_campaign:{campaign key}`); `id` is the stable issue id. */
  check_key: string;
  level: AdsIssueLevel;
  resource_id: string | null;
  affected_ads: string[];
  affected_ads_total: number;
  measured_at: string;
  window: { start: string; end: string; days: number };
  verify: AdsIssueVerifyView;
  last_check: AdsIssueCheckNote | null;
  /** Re-check requested and waiting in the queue. */
  recheck_queued: boolean;
  /** Platform skipped in the last Run: issue kept from an earlier Run, not re-evaluated. */
  not_checked: { reason: string; last_checked_at: string } | null;
};

export type AdsRunSkip = { platform: AdsCheckPlatform; reason: string };

export type AdsDiagnosticsJobKind = "run" | "recheck";
export type AdsDiagnosticsJobStatus = "queued" | "running" | "completed" | "failed";

export type AdsRecheckScope =
  | { type: "issue"; issue_id: string }
  | { type: "resource"; platform: AdsCheckPlatform; level: Exclude<AdsIssueLevel, "none" | "ad"> | "ad"; id: string };

export type AdsDiagnosticsJobRecord = {
  job_id: string;
  kind: AdsDiagnosticsJobKind;
  /** fork = full Run / big-scope Re-check; queue = Sidequest ads_recheck. */
  lane: "fork" | "queue";
  status: AdsDiagnosticsJobStatus;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  requested_by: string | null;
  scopes?: AdsRecheckScope[];
  checked: AdsCheckPlatform[];
  skipped: AdsRunSkip[];
  /** Validators that emitted an undeclared code (their issues were left as they were). */
  validator_errors?: Array<{ validator: string; error: string }>;
  summary?: { opened: number; updated: number; resolved: number; carried_pending: number; untouched_newer_action: number };
  error?: string;
};

/** Busy / not-ready reasons returned by POST run / recheck. */
export type AdsDiagnosticsRejectCode =
  | "ads_run_busy"
  | "ads_sync_active"
  | "ads_recheck_not_ready"
  | "ads_recheck_not_instant"
  | "ads_issue_not_found";

/** Run / Re-check status on every Ads diagnostics read. */
export type AdsRunInfo = {
  /** No full Run has finished yet: issues are empty until someone presses Run checks. */
  never_run: boolean;
  last_run: { job_id: string; started_at: string | null; finished_at: string | null; checked: AdsCheckPlatform[]; skipped: AdsRunSkip[] } | null;
  active: Array<Pick<AdsDiagnosticsJobRecord, "job_id" | "kind" | "lane" | "status" | "requested_at" | "started_at" | "scopes">>;
  /** Newest job when it failed (interrupted Runs keep the issues they had). */
  last_failed: { job_id: string; kind: AdsDiagnosticsJobKind; finished_at: string | null; error: string } | null;
  /** Why Run checks would be rejected right now (fork busy / Sync running). */
  busy: { code: "ads_run_busy" | "ads_sync_active"; message: string } | null;
};

export type AdsResolvedRow = {
  id: string;
  title: string;
  severity: "error" | "warning" | "info";
  resolved_at: string;
  resolution: "verified_gone" | "soft_complete" | "resource_gone" | "rule_retired";
  reopened_at?: string;
};
