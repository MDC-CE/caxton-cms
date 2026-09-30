/**
 * Pure Ads diagnostics rules (thresholds from settings.yml ads.meta.alert_thresholds).
 * Server gathers inputs; these functions decide whether an issue exists and how severe it is.
 */

import type { AdsAlertThresholds } from "./ads-settings";
import { isPaidMedium } from "./paid-traffic";

export type AdsIssueSeverity = "error" | "warning" | "info";

export type AdsIssueCode =
  | "meta_access_failed"
  | "meta_sync_failing"
  | "spend_zero_visits"
  | "landing_http_error"
  | "redirect_drops_params"
  | "missing_tracking_params"
  | "non_paid_medium"
  | "pixel_not_reporting_leads"
  | "ga4_ledger_gap"
  | "clicks_visits_low"
  | "unclear_share_high"
  | "consent_rate_drop"
  | "off_site_destination"
  | "instant_form_destination"
  | "unmanaged_destination";

export type AdsIssue = {
  id: string;
  code: AdsIssueCode;
  severity: AdsIssueSeverity;
  title: string;
  why: string;
  how_to_fix: string;
  /** Spend affected, per currency. */
  spend_affected: Record<string, number>;
  scope: { page_key?: string; url?: string; ad_id?: string; campaign_id?: string; campaign_name?: string };
  /** True when the fix is on our site (content/redirects) — Solve with AI is offered only then. */
  site_fixable: boolean;
};

/**
 * Error only when the issue touches enough money: ≥ share % of total spend in any
 * currency, or ≥ that currency's floor. Otherwise it is a warning.
 * A currency without a configured floor falls back to the share rule only.
 */
export function severityForSpend(
  affected: Record<string, number>,
  totalSpend: Record<string, number>,
  t: AdsAlertThresholds,
): "error" | "warning" {
  for (const [cur, amount] of Object.entries(affected)) {
    if (amount <= 0) continue;
    const total = totalSpend[cur] ?? 0;
    if (total > 0 && (amount / total) * 100 >= t.severity_spend_share_pct) return "error";
    const floor = t.severity_spend_floor[cur];
    if (floor != null && amount >= floor) return "error";
  }
  return "warning";
}

/** Currencies with spend but no configured floor (settings prompt). */
export function currenciesMissingFloor(totalSpend: Record<string, number>, t: AdsAlertThresholds): string[] {
  return Object.keys(totalSpend).filter((c) => (totalSpend[c] ?? 0) > 0 && t.severity_spend_floor[c] == null);
}

/** Clicks → visits: warn below the floor, or on a relative drop vs the trailing baseline. */
export function clicksVisitsIssue(
  current: { clicks: number; visits: number },
  baselineRatio: number | null,
  t: AdsAlertThresholds,
): { ratio: number; reason: "floor" | "drop" } | null {
  if (current.clicks < t.ratio_min_clicks) return null;
  const ratio = current.visits / current.clicks;
  if (ratio * 100 < t.clicks_visits_floor_pct) return { ratio, reason: "floor" };
  if (baselineRatio != null && baselineRatio > 0) {
    const dropPct = ((baselineRatio - ratio) / baselineRatio) * 100;
    if (dropPct >= t.clicks_visits_drop_pct) return { ratio, reason: "drop" };
  }
  return null;
}

export function unclearShareIssue(paid: number, unclear: number, t: AdsAlertThresholds): number | null {
  const total = paid + unclear;
  if (total < t.unclear_min_sessions) return null;
  const share = (unclear / total) * 100;
  return share > t.unclear_share_pct ? share : null;
}

/** Relative gap between GA4 lead events and ledger submissions, in percent (0–100). */
export function leadGapPct(ga4Leads: number, ledgerSubmissions: number): number | null {
  const max = Math.max(ga4Leads, ledgerSubmissions);
  if (max === 0) return null;
  return (Math.abs(ga4Leads - ledgerSubmissions) / max) * 100;
}

/**
 * During the first 28 days of ledger data a fixed gap threshold applies; afterwards
 * we warn only when the gap widens by ≥ N points vs the trailing baseline.
 */
export function ga4LedgerGapIssue(
  gapPct: number | null,
  baselineGapPct: number | null,
  ledgerAgeDays: number,
  t: AdsAlertThresholds,
): boolean {
  if (gapPct == null) return false;
  if (ledgerAgeDays < 28 || baselineGapPct == null) return gapPct >= t.ga4_ledger_gap_bootstrap_pct;
  return gapPct - baselineGapPct >= t.ga4_ledger_gap_widen_pts;
}

/** Ask-region accept rate drop vs trailing 28 days (relative %, volume guard 100 impressions). */
export function consentRateDrop(
  current: { shown: number; granted: number; decided: number },
  baselineRate: number | null,
  minImpressions = 100,
  dropPct = 30,
): number | null {
  if (current.shown < minImpressions || current.decided === 0 || baselineRate == null || baselineRate <= 0) return null;
  const rate = current.granted / current.decided;
  const drop = ((baselineRate - rate) / baselineRate) * 100;
  return drop >= dropPct ? drop : null;
}

/** Parse `url_tags` / a destination query string into lowercase params. */
export function parseTrackingParams(raw: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
  for (const part of q.split(/[&#]/)) {
    const [k, v = ""] = part.split("=");
    if (k) out[k.trim().toLowerCase()] = decodeSafe(v.trim());
  }
  return out;
}

function decodeSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Which required template params an ad is missing (ids enable matching). */
export function missingTemplateParams(params: Record<string, string>): string[] {
  const required = ["utm_source", "utm_medium", "utm_id", "utm_content"];
  return required.filter((k) => !params[k]);
}

export function hasNonPaidMedium(params: Record<string, string>): boolean {
  return !!params.utm_medium && !params.utm_medium.includes("{{") && !isPaidMedium(params.utm_medium);
}

/** Tracking params lost across redirects (present on the ad URL, missing on the final URL). */
export function droppedParams(original: string, final: string): string[] {
  const a = parseTrackingParams(original);
  const b = parseTrackingParams(final);
  return Object.keys(a).filter((k) => (k.startsWith("utm_") || k.endsWith("clid")) && !(k in b));
}
