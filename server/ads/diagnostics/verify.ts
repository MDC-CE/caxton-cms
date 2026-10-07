/**
 * Pending verification for Ads issues (marked fixed, waiting to confirm).
 *
 * - instant: never pending — Re-check confirms right away.
 * - after_sync: ready once that platform's Sync succeeds after the mark.
 * - fresh_days: judged only on days after the mark, starting the first full day after the mark
 *   in the ad account's time zone. Missing rollup days don't count; below `min_data` it stays
 *   pending ("not enough data yet"); no spend at all → "waiting for spend".
 */

import type { StoredValidationIssue, ValidationIssueCompletion } from "../../../scripts/validation/shared/types";
import type {
  AdsCheckPlatform,
  AdsCompletionVerify,
  AdsIssueVerifyView,
  AdsMinData,
  AdsVerify,
  AdsVerifyProgress,
} from "@shared/ads-issues";
import { addDays, utcDate } from "../meta-ads-days";
import { sumRollupsSince, type RollupSum, type RollupTarget } from "../ads-rollups";
import { adsVerifyFor } from "./codes";

const METRIC_LABEL: Record<AdsMinData["metric"], string> = { clicks: "clicks", spend: "spend", sessions: "visits", leads: "leads" };

/** Calendar date of an instant in an IANA time zone (falls back to UTC). */
export function localDate(iso: string, timeZone: string | null | undefined): string {
  const d = new Date(iso);
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch {
      /* unknown zone → UTC */
    }
  }
  return d.toISOString().slice(0, 10);
}

/** First full day after the mark, in the ad account's time zone (the day of the fix never counts). */
export function verifyWindowStart(markedAtIso: string, timeZone: string | null | undefined): string {
  return addDays(localDate(markedAtIso, timeZone), 1);
}

/** Earliest time a fresh_days window can be complete: last needed day + lag days. */
export function estimateVerifyAfter(windowStart: string, verify: Extract<AdsVerify, { kind: "fresh_days" }>): string {
  const lastDay = addDays(windowStart, verify.days - 1);
  return `${addDays(lastDay, verify.lag_days)}T00:00:00.000Z`;
}

export function syncPlatformFor(issue: Pick<StoredValidationIssue, "ads">, verify: AdsVerify): AdsCheckPlatform | null {
  if (verify.kind !== "after_sync") return null;
  if (verify.platform !== "target") return verify.platform;
  return issue.ads?.platform === "google" ? "google" : "meta";
}

/** Overlay written on Mark as fixed. */
export function completionVerifyFor(
  issue: StoredValidationIssue,
  markedAtIso: string,
  timeZone: string | null | undefined,
): AdsCompletionVerify | null {
  const def = adsVerifyFor(issue.validator, issue.code);
  if (!def || def.verify.kind === "instant") return null;
  if (def.verify.kind === "after_sync") return { kind: "after_sync", after_sync_platform: syncPlatformFor(issue, def.verify) };
  const windowStart = verifyWindowStart(markedAtIso, timeZone);
  return { kind: "fresh_days", window_start: windowStart, verify_after: estimateVerifyAfter(windowStart, def.verify) };
}

export function rollupTargetFor(issue: StoredValidationIssue): RollupTarget {
  const a = issue.ads!;
  const platform = a.platform === "google" ? "google" : "meta";
  if (a.affected_ads.length > 0) return { platform, ad_ids: a.affected_ads };
  if (a.level === "campaign" && a.resource_id) return { platform, campaign_id: a.resource_id };
  if (a.level === "adset" && a.resource_id) return { platform, adset_id: a.resource_id };
  if (a.level === "account" && a.resource_id) return { platform, account_id: a.resource_id };
  return { platform };
}

function metricValue(sum: RollupSum, metric: AdsMinData["metric"]): number {
  return metric === "spend" ? sum.spend_total : sum[metric];
}

export type VerifyContext = {
  site: string;
  now: Date;
  /** Last successful Sync per platform (ISO). */
  lastSyncAt: Partial<Record<AdsCheckPlatform, string | null>>;
  timeZoneFor: (issue: StoredValidationIssue) => string | null;
  /** Test seam. */
  sumRollups?: typeof sumRollupsSince;
};

export type FreshDaysStatus = {
  window_start: string;
  until: string;
  sum: RollupSum;
  progress: AdsVerifyProgress;
  /** Days + min data reached → can pass. */
  ready: boolean;
  /** min data reached (enough post-fix data to fail early). */
  min_data_met: boolean;
};

export function freshDaysStatus(
  issue: StoredValidationIssue,
  completion: ValidationIssueCompletion,
  verify: Extract<AdsVerify, { kind: "fresh_days" }>,
  minData: AdsMinData,
  ctx: VerifyContext,
): FreshDaysStatus {
  const windowStart = completion.verify?.window_start ?? verifyWindowStart(completion.completedAt, ctx.timeZoneFor(issue));
  const until = addDays(utcDate(ctx.now), -verify.lag_days);
  const sum = (ctx.sumRollups ?? sumRollupsSince)(ctx.site, rollupTargetFor(issue), windowStart, until, ctx.now);
  const value = metricValue(sum, minData.metric);
  const minMet = value >= minData.value;
  return {
    window_start: windowStart,
    until,
    sum,
    min_data_met: minMet,
    ready: sum.days_counted >= verify.days && minMet,
    progress: {
      days_counted: sum.days_counted,
      days_needed: verify.days,
      metric: minData.metric,
      value: Math.round(value * 100) / 100,
      needed: minData.value,
      waiting_for_spend: sum.days_counted > 0 && sum.days_with_spend === 0 && (minData.metric === "clicks" || minData.metric === "spend"),
    },
  };
}

/** Read-time verify view for one Ads issue. */
export function computeVerifyView(issue: StoredValidationIssue, completion: ValidationIssueCompletion | undefined, ctx: VerifyContext): AdsIssueVerifyView {
  const def = adsVerifyFor(issue.validator, issue.code) ?? { verify: { kind: "instant" } as AdsVerify, min_data: null };
  const base = {
    verify: def.verify,
    min_data: def.min_data,
    marked_at: completion?.completedAt ?? null,
    marked_by: completion?.completedBy ?? null,
    report: completion?.report ?? null,
  };
  if (!completion?.verify) {
    const instant = def.verify.kind === "instant";
    return {
      ...base,
      state: "open",
      action: instant ? "recheck" : "mark_fixed",
      verify_after: null,
      waits_for_sync: null,
      ready_to_verify: instant,
      progress: null,
      label: instant ? "Fix it, then press Re-check" : verifyDelayLabel(def.verify, issue),
    };
  }
  if (def.verify.kind === "after_sync") {
    const platform = completion.verify.after_sync_platform ?? syncPlatformFor(issue, def.verify) ?? "meta";
    const last = ctx.lastSyncAt[platform];
    const ready = !!last && last > completion.completedAt;
    return {
      ...base,
      state: "pending",
      action: ready ? "recheck_ready" : "wait",
      verify_after: null,
      waits_for_sync: ready ? null : platform,
      ready_to_verify: ready,
      progress: null,
      label: ready ? "Ready to confirm: press Re-check" : `Waiting for the next ${platform === "google" ? "Google" : "Meta"} Sync`,
    };
  }
  if (def.verify.kind === "fresh_days" && def.min_data) {
    const s = freshDaysStatus(issue, completion, def.verify, def.min_data, ctx);
    const p = s.progress;
    const left = Math.max(0, p.days_needed - p.days_counted);
    const label = s.ready
      ? "Ready to confirm: press Re-check"
      : p.waiting_for_spend
        ? "Waiting for spend (ads paused or not spending)"
        : left > 0
          ? `Waiting for ${left} more day${left === 1 ? "" : "s"} of new data`
          : `Not enough data yet (${formatMetric(p.value, def.min_data.metric)} of ${formatMetric(p.needed, def.min_data.metric)})`;
    return {
      ...base,
      state: "pending",
      action: s.ready ? "recheck_ready" : "wait",
      verify_after: completion.verify.verify_after ?? estimateVerifyAfter(s.window_start, def.verify),
      waits_for_sync: null,
      ready_to_verify: s.ready,
      progress: p,
      label,
    };
  }
  return {
    ...base,
    state: "pending",
    action: "recheck_ready",
    verify_after: null,
    waits_for_sync: null,
    ready_to_verify: true,
    progress: null,
    label: "Ready to confirm: press Re-check",
  };
}

function formatMetric(v: number, metric: AdsMinData["metric"]): string {
  return metric === "spend" ? `${Math.round(v)} spend` : `${Math.round(v)} ${METRIC_LABEL[metric]}`;
}

function verifyDelayLabel(verify: AdsVerify, issue: StoredValidationIssue): string {
  if (verify.kind === "after_sync") {
    const p = syncPlatformFor(issue, verify);
    return `Fix it, then Mark as fixed: confirms after the next ${p === "google" ? "Google" : "Meta"} Sync`;
  }
  if (verify.kind === "fresh_days") return `Fix it, then Mark as fixed: confirms after ${verify.days} days of new data`;
  return "Fix it, then press Re-check";
}

/** Readiness used by Re-check routing and the save step. */
export function isReadyToVerify(issue: StoredValidationIssue, completion: ValidationIssueCompletion | undefined, ctx: VerifyContext): boolean {
  return computeVerifyView(issue, completion, ctx).ready_to_verify;
}
