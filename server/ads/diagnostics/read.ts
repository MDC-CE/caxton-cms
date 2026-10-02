/**
 * Read side of Ads diagnostics (GET /api/diagnostics/ads, MCP get_paid_traffic diagnostics).
 * Never runs checks: issues come from the validation cache (saved by Runs / Re-checks), KPIs
 * from the report windows saved after each Sync, verify state from rollups + Sync times.
 */

import type { AdsIssue, AdsIssuePlatform } from "@shared/ads-diagnostics-rules";
import { ADS_ISSUE_WINDOW_DAYS, currenciesMissingFloor, sortAdsIssues } from "@shared/ads-diagnostics-rules";
import type { AdsIssueRow, AdsResolvedRow, AdsRunInfo } from "@shared/ads-issues";
import { META_UTM_TEMPLATE, adsThresholds } from "@shared/ads-settings";
import { GOOGLE_URL_SUFFIX_TEMPLATE } from "@shared/paid-traffic";
import type { StoredValidationIssue, ValidationIssueCompletion } from "../../../scripts/validation/shared/types";
import { getAdsSettings } from "../../settings";
import { getSiteContextMap } from "../../site-manager";
import { consentTotals, loadConsentWindow } from "../../legal/legal-diagnostics";
import { assembleAdsReportFromRollups } from "../ads-rollups";
import type { MoneyByCurrency } from "../ads-report";
import { metaKpis } from "./kpis";
import { hasMetaData } from "../ads-refresh";
import { NO_SITE_KINDS } from "../google-ads-diagnostics";
import { loadPaidLandingState } from "../paid-detection";
import { adsBusyReason, isAdsForkBusy } from "./fork-service";
import { verifyContextFor } from "./context";
import { activeAdsJobs, latestCompletedRun, listAdsJobRecords, updateAdsJobRecord } from "./jobs";
import { adsValidationCache } from "./save";
import { computeVerifyView, type VerifyContext } from "./verify";

/** Queued Re-checks older than this never reached the worker (lost on restart) → failed. */
const QUEUE_STALE_MS = 30 * 60 * 1000;

export const ADS_KPI_WINDOWS = [7, 28, 90] as const;

/** KPI tiles read the saved 7 / 28 / 90 day windows; anything else snaps to the nearest. */
export function snapKpiDays(raw: unknown): 7 | 28 | 90 {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 28;
  return n <= 7 ? 7 : n <= 28 ? 28 : 90;
}

export function adsRunInfo(site: string, now = Date.now()): AdsRunInfo {
  for (const r of activeAdsJobs(site)) {
    if (r.lane === "fork" && r.status === "running" && !isAdsForkBusy(site)) {
      updateAdsJobRecord(site, r.job_id, { status: "failed", finished_at: new Date(now).toISOString(), error: "Interrupted. Issues were left as they were — start a new Run." });
    } else if (r.lane === "queue" && now - Date.parse(r.requested_at) > QUEUE_STALE_MS) {
      updateAdsJobRecord(site, r.job_id, { status: "failed", finished_at: new Date(now).toISOString(), error: "The Re-check never started. Try again." });
    }
  }
  const records = listAdsJobRecords(site);
  const last = latestCompletedRun(site);
  const newest = records[0];
  const busy = adsBusyReason(site);
  return {
    never_run: !last,
    last_run: last ? { job_id: last.job_id, started_at: last.started_at, finished_at: last.finished_at, checked: last.checked, skipped: last.skipped } : null,
    active: records
      .filter((r) => r.status === "queued" || r.status === "running")
      .map(({ job_id, kind, lane, status, requested_at, started_at, scopes }) => ({ job_id, kind, lane, status, requested_at, started_at, scopes })),
    last_failed: newest?.status === "failed" ? { job_id: newest.job_id, kind: newest.kind, finished_at: newest.finished_at, error: newest.error ?? "Failed" } : null,
    busy: busy && !busy.ok ? { code: busy.code, message: busy.message } : null,
  };
}

function queuedIssueIds(run: AdsRunInfo, issues: StoredValidationIssue[]): Set<string> {
  const out = new Set<string>();
  for (const job of run.active) {
    if (job.kind !== "recheck") continue;
    for (const s of job.scopes ?? []) {
      if (s.type === "issue") out.add(s.issue_id);
      else
        for (const i of issues) {
          const a = i.ads;
          if (a && (`${a.level}:${a.resource_id}` === `${s.level}:${s.id}` || a.campaign_id === s.id || a.adset_id === s.id || a.account_id === s.id)) out.add(i.id);
        }
    }
  }
  return out;
}

/** Cache row → API row (evidence + identity + verify view). */
export function toIssueRow(
  issue: StoredValidationIssue,
  ctx: { cacheCompletion: ValidationIssueCompletion | undefined; verify: VerifyContext; queued: Set<string>; run: AdsRunInfo },
): AdsIssueRow {
  const a = issue.ads!;
  const checkPlatform = a.platform === "google" ? "google" : "meta";
  const skip = ctx.run.last_run?.skipped.find((s) => s.platform === checkPlatform);
  const metaPartial = checkPlatform === "meta" && a.platform === "shared";
  return {
    ...a.evidence,
    id: issue.id,
    check_key: a.evidence.id,
    code: issue.code as AdsIssue["code"],
    platform: a.platform,
    severity: issue.severity,
    first_seen: a.first_seen,
    level: a.level,
    resource_id: a.resource_id,
    affected_ads: a.affected_ads,
    affected_ads_total: a.affected_ads.length,
    measured_at: a.measured_at,
    window: a.window,
    verify: computeVerifyView(issue, ctx.cacheCompletion, ctx.verify),
    last_check: a.last_check ?? null,
    recheck_queued: ctx.queued.has(issue.id),
    not_checked: skip && !metaPartial && !(skip.reason.includes("only the access check") && (issue.code === "meta_access_failed" || issue.code === "meta_sync_failing"))
      ? { reason: skip.reason, last_checked_at: a.measured_at }
      : null,
  };
}

function issueRows(site: string, platforms: AdsIssuePlatform[], run: AdsRunInfo): AdsIssueRow[] {
  const cache = adsValidationCache(site);
  if (!cache) return [];
  const issues = cache.getAdsIssues().filter((i) => i.ads && platforms.includes(i.ads.platform));
  const verify = verifyContextFor(site);
  const queued = queuedIssueIds(run, issues);
  const rows = issues.map((i) => toIssueRow(i, { cacheCompletion: cache.getCompletion(i.id), verify, queued, run }));
  return sortAdsIssues(rows);
}

function openCounts(rows: AdsIssueRow[]): { open_errors: number; open_warnings: number } {
  const open = rows.filter((r) => r.verify.state === "open");
  return { open_errors: open.filter((r) => r.severity === "error").length, open_warnings: open.filter((r) => r.severity === "warning").length };
}

function statusFor(connected: boolean, c: { open_errors: number; open_warnings: number }): "not_connected" | "ok" | "warnings" | "errors" {
  return !connected ? "not_connected" : c.open_errors > 0 ? "errors" : c.open_warnings > 0 ? "warnings" : "ok";
}

export function resolvedRows(site: string, validators: string[]): AdsResolvedRow[] {
  const archive = Array.from(getSiteContextMap().values()).find((c) => c.contentRootName === site || c.config.contentFolder === site)?.resolvedIssuesArchive;
  if (!archive) return [];
  const rows = archive.list({ category: "ads", limit: 200 }).rows.filter((r) => !!r.validator && validators.includes(r.validator));
  return rows.slice(0, 50).map((r) => ({
    id: r.issueId,
    title: r.message.split(". ")[0] ?? r.message,
    severity: r.severity,
    resolved_at: r.resolvedAt,
    resolution: r.resolution,
    ...(r.reopenedAt ? { reopened_at: r.reopenedAt } : {}),
  }));
}

export async function readMetaDiagnostics(opts: { site: string; contentRoot?: string; days?: unknown; now?: Date }) {
  const now = opts.now ?? new Date();
  const kpiDays = snapKpiDays(opts.days);
  const settings = getAdsSettings(opts.contentRoot);
  const report = await assembleAdsReportFromRollups({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, platform: "meta" });
  const run = adsRunInfo(opts.site, now.getTime());
  const issues = issueRows(opts.site, ["meta", "shared"], run);
  const counts = openCounts(issues);
  const consent = consentTotals(loadConsentWindow(opts.site, ADS_ISSUE_WINDOW_DAYS, now).current).accept_pct;
  return {
    generated_at: now.toISOString(),
    platform: "meta" as const,
    window_days: kpiDays,
    issue_window_days: ADS_ISSUE_WINDOW_DAYS,
    status: statusFor(hasMetaData(opts.site, opts.contentRoot), counts),
    meta: report.meta,
    ga4: report.ga4,
    refreshing: report.refreshing,
    refresh: report.refresh,
    collecting_since: report.collecting_since,
    kpis: metaKpis(report, counts, consent, settings.meta.lead_conversions ?? [], settings.meta.lead_conversions_changed_at ?? null),
    missing_floor_currencies: currenciesMissingFloor(report.totals.spend, adsThresholds(settings)),
    meta_platforms: report.meta_platforms ?? null,
    issues,
    resolved: resolvedRows(opts.site, ["ads-meta", "ads-shared"]),
    utm_template: META_UTM_TEMPLATE,
    warnings: report.warnings,
    run,
  };
}

export async function readGoogleDiagnostics(opts: { site: string; contentRoot?: string; days?: unknown; now?: Date }) {
  const now = opts.now ?? new Date();
  const kpiDays = snapKpiDays(opts.days);
  const report = await assembleAdsReportFromRollups({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, platform: "google", includeMetaPlatforms: false });
  const run = adsRunInfo(opts.site, now.getTime());
  const issues = issueRows(opts.site, ["google"], run);
  const counts = openCounts(issues);
  const paidState = loadPaidLandingState(opts.site);
  const k = report.totals;
  const noSite: MoneyByCurrency = {};
  for (const d of report.destinations) {
    if (!NO_SITE_KINDS.has(d.kind)) continue;
    for (const [c, v] of Object.entries(d.spend)) noSite[c] = Math.round(((noSite[c] ?? 0) + v) * 100) / 100;
  }
  const vm = report.google.visit_match;
  const googleVisits = vm.ga4_link + vm.gclid + vm.tags + vm.none;
  const ratio = k.ratio_clicks > 0 && report.ga4.configured ? k.matched_visits / k.ratio_clicks : null;
  return {
    generated_at: now.toISOString(),
    platform: "google" as const,
    window_days: kpiDays,
    issue_window_days: ADS_ISSUE_WINDOW_DAYS,
    status: statusFor(report.google.connected, counts),
    google: report.google,
    ga4: report.ga4,
    refreshing: report.refreshing,
    refresh: report.refresh,
    collecting_since: report.collecting_since,
    kpis: {
      spend: k.spend,
      tracked_spend: k.tracked_spend,
      no_site_spend: noSite,
      ...counts,
      google_leads: k.google_leads,
      site_leads: k.unique_leads,
      paid_visits: k.paid_visits,
      clicks: k.clicks,
      clicks_to_visits_pct: ratio != null ? Math.round(ratio * 1000) / 10 : null,
      matched_visits_pct: googleVisits > 0 ? Math.round(((googleVisits - vm.none) / googleVisits) * 1000) / 10 : null,
    },
    networks: report.google_networks ?? null,
    matching: {
      ga4_link_available: paidState.google_link_available ?? null,
      gclid_join_tables: paidState.gclid_join_tables ?? 0,
      gclid_join_error: paidState.gclid_join_error ?? null,
    },
    issues,
    resolved: resolvedRows(opts.site, ["ads-google"]),
    url_suffix_template: GOOGLE_URL_SUFFIX_TEMPLATE,
    warnings: report.warnings,
    run,
  };
}

/** Counts only (Global tab roll-up): cache read, no report build. */
export function adsIssueCounts(site: string, platforms: AdsIssuePlatform[] = ["meta", "google", "shared"]) {
  const run = adsRunInfo(site);
  const rows = issueRows(site, platforms, run);
  return { ...openCounts(rows), rows, run };
}
