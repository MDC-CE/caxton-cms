/**
 * Ads diagnostics overview (`/private/diagnostics/ads`): one honest status across platforms.
 * Status = worst of the connected platforms plus shared checks (lead records, consent).
 * Read-only: issues from the last Run / Re-checks, numbers from the saved report windows.
 */

import type { AdsIssueRow, AdsRunInfo } from "@shared/ads-issues";
import { hasMetaData } from "./ads-refresh";
import { assembleAdsReportFromRollups } from "./ads-rollups";
import type { MoneyByCurrency } from "./ads-report";
import { adsIssueCounts, snapKpiDays } from "./diagnostics/read";

export type AdsDiagnosticsStatus = "not_connected" | "ok" | "warnings" | "errors";

export type AdsPlatformCard = {
  connected: boolean;
  status: AdsDiagnosticsStatus;
  open_errors: number;
  open_warnings: number;
  spend: MoneyByCurrency;
  /** Leads the platform reports (Meta pixel + Instant Forms, or Google lead conversions). Never summed with site leads. */
  platform_leads: number;
  site_leads: number;
  last_synced_at: string | null;
  /** Google only: newest day the BigQuery transfer loaded. */
  data_through?: string | null;
  top_issues: Array<Pick<AdsIssueRow, "id" | "code" | "title" | "severity">>;
};

export type AdsDiagnosticsOverview = {
  generated_at: string;
  platform: "overview";
  window_days: number;
  status: AdsDiagnosticsStatus;
  open_errors: number;
  open_warnings: number;
  platforms: { meta: AdsPlatformCard; google: AdsPlatformCard };
  /** Lead records / consent checks, listed once here (also shown on the Meta page). */
  shared_issues: AdsIssueRow[];
  totals: { spend: MoneyByCurrency; site_leads: number; paid_visits: number };
  run: AdsRunInfo;
};

const RANK: Record<AdsDiagnosticsStatus, number> = { not_connected: 0, ok: 1, warnings: 2, errors: 3 };

export function worstStatus(statuses: AdsDiagnosticsStatus[]): AdsDiagnosticsStatus {
  return statuses.reduce<AdsDiagnosticsStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "not_connected");
}

function counts(rows: AdsIssueRow[]): { open_errors: number; open_warnings: number } {
  const open = rows.filter((r) => r.verify.state === "open");
  return { open_errors: open.filter((r) => r.severity === "error").length, open_warnings: open.filter((r) => r.severity === "warning").length };
}

function statusOf(connected: boolean, c: { open_errors: number; open_warnings: number }): AdsDiagnosticsStatus {
  return !connected ? "not_connected" : c.open_errors > 0 ? "errors" : c.open_warnings > 0 ? "warnings" : "ok";
}

function top(rows: AdsIssueRow[]): AdsPlatformCard["top_issues"] {
  return rows
    .filter((i) => i.severity !== "info" && i.verify.state === "open")
    .slice(0, 3)
    .map(({ id, code, title, severity }) => ({ id, code, title, severity }));
}

export async function buildAdsDiagnosticsOverview(opts: { site: string; contentRoot?: string; days?: unknown; now?: Date }): Promise<AdsDiagnosticsOverview> {
  const now = opts.now ?? new Date();
  const kpiDays = snapKpiDays(opts.days);
  const [meta, google, all] = await Promise.all([
    assembleAdsReportFromRollups({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, platform: "meta", includeMetaPlatforms: false }),
    assembleAdsReportFromRollups({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, platform: "google", includeMetaPlatforms: false, noRefresh: true }),
    assembleAdsReportFromRollups({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, platform: "all", includeMetaPlatforms: false, noRefresh: true }),
  ]);
  const { rows, run } = adsIssueCounts(opts.site);
  const metaRows = rows.filter((r) => r.platform === "meta");
  const googleRows = rows.filter((r) => r.platform === "google");
  const shared = rows.filter((r) => r.platform === "shared");
  const metaConnected = hasMetaData(opts.site, opts.contentRoot);
  const metaCounts = counts(metaRows);
  const googleCounts = counts(googleRows);
  const sharedCounts = counts(shared);
  const metaCard: AdsPlatformCard = {
    connected: metaConnected,
    status: statusOf(metaConnected, metaCounts),
    ...metaCounts,
    spend: meta.totals.spend,
    platform_leads: meta.totals.meta_leads,
    site_leads: meta.totals.unique_leads,
    last_synced_at: meta.meta.last_synced_at,
    top_issues: top(metaRows),
  };
  const googleCard: AdsPlatformCard = {
    connected: google.google.connected,
    status: statusOf(google.google.connected, googleCounts),
    ...googleCounts,
    spend: google.totals.spend,
    platform_leads: google.totals.google_leads,
    site_leads: google.totals.unique_leads,
    last_synced_at: google.google.last_synced_at,
    data_through: google.google.data_through,
    top_issues: top(googleRows),
  };
  const sharedStatus = statusOf(metaCard.connected || googleCard.connected, sharedCounts);
  return {
    generated_at: now.toISOString(),
    platform: "overview",
    window_days: kpiDays,
    status: worstStatus([metaCard.status, googleCard.status, sharedStatus]),
    open_errors: metaCounts.open_errors + googleCounts.open_errors + sharedCounts.open_errors,
    open_warnings: metaCounts.open_warnings + googleCounts.open_warnings + sharedCounts.open_warnings,
    platforms: { meta: metaCard, google: googleCard },
    shared_issues: shared,
    totals: { spend: all.totals.spend, site_leads: all.totals.unique_leads, paid_visits: all.totals.paid_visits },
    run,
  };
}

/** Global tab roll-up: cache-only counts across Meta, Google and shared checks (no report read). */
export function adsOverviewSummary(site: string, contentRoot?: string): { status: AdsDiagnosticsStatus; open_errors: number; open_warnings: number; never_run: boolean } {
  const { rows, run } = adsIssueCounts(site);
  const c = counts(rows);
  const connected = hasMetaData(site, contentRoot) || rows.some((r) => r.platform === "google");
  return { status: statusOf(connected || !run.never_run, c), ...c, never_run: run.never_run };
}
