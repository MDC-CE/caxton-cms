/**
 * Ads diagnostics overview (`/private/diagnostics/ads`): one honest status across platforms.
 * Status = worst of the connected platforms plus shared checks (lead records, consent).
 * Deep dives live on the per-platform pages; this only shows cards, top issues and shared issues.
 */

import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import { ADS_ISSUE_WINDOW_DAYS, resolveAdsDiagnosticsWindows } from "@shared/ads-diagnostics-rules";
import { buildAdsDiagnostics, summarizeMetaDiagnostics, type AdsDiagnostics } from "./ads-diagnostics";
import { buildGoogleAdsDiagnostics } from "./google-ads-diagnostics";
import { buildAdsReport, type MoneyByCurrency } from "./ads-report";

export type AdsDiagnosticsStatus = AdsDiagnostics["status"];

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
  top_issues: Array<Pick<AdsIssue, "id" | "code" | "title" | "severity">>;
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
  shared_issues: AdsIssue[];
  totals: { spend: MoneyByCurrency; site_leads: number; paid_visits: number };
};

const RANK: Record<AdsDiagnosticsStatus, number> = { not_connected: 0, ok: 1, warnings: 2, errors: 3 };

export function worstStatus(statuses: AdsDiagnosticsStatus[]): AdsDiagnosticsStatus {
  return statuses.reduce<AdsDiagnosticsStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "not_connected");
}

function top(issues: AdsIssue[]): AdsPlatformCard["top_issues"] {
  return issues
    .filter((i) => i.severity !== "info")
    .slice(0, 3)
    .map(({ id, code, title, severity }) => ({ id, code, title, severity }));
}

export async function buildAdsDiagnosticsOverview(opts: { site: string; contentRoot?: string; days?: number; now?: Date }): Promise<AdsDiagnosticsOverview> {
  const now = opts.now ?? new Date();
  const { kpiDays } = resolveAdsDiagnosticsWindows(opts.days);
  const [meta, google] = await Promise.all([
    buildAdsDiagnostics({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, probe: false, now }),
    buildGoogleAdsDiagnostics({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, persist: false, now }),
  ]);
  const metaSummary = summarizeMetaDiagnostics(opts.site, meta);
  const shared = meta.issues.filter((i) => i.platform === "shared");
  const metaOnly = meta.issues.filter((i) => i.platform !== "shared");
  const sharedErrors = shared.filter((i) => i.severity === "error").length;
  const sharedWarnings = shared.filter((i) => i.severity === "warning").length;
  const metaConnected = meta.status !== "not_connected";
  const metaCard: AdsPlatformCard = {
    connected: metaConnected,
    status: metaConnected
      ? metaSummary.open_errors - sharedErrors > 0
        ? "errors"
        : metaSummary.open_warnings - sharedWarnings > 0
          ? "warnings"
          : "ok"
      : "not_connected",
    open_errors: Math.max(0, metaSummary.open_errors - sharedErrors),
    open_warnings: Math.max(0, metaSummary.open_warnings - sharedWarnings),
    spend: meta.kpis.spend,
    platform_leads: meta.kpis.meta_leads,
    site_leads: meta.kpis.site_leads,
    last_synced_at: meta.meta.last_synced_at,
    top_issues: top(metaOnly),
  };
  const googleCard: AdsPlatformCard = {
    connected: google.status !== "not_connected",
    status: google.status,
    open_errors: google.kpis.open_errors,
    open_warnings: google.kpis.open_warnings,
    spend: google.kpis.spend,
    platform_leads: google.kpis.google_leads,
    site_leads: google.kpis.site_leads,
    last_synced_at: google.google.last_synced_at,
    data_through: google.google.data_through,
    top_issues: top(google.issues),
  };
  const anyConnected = metaCard.connected || googleCard.connected;
  const sharedStatus: AdsDiagnosticsStatus = !anyConnected ? "not_connected" : sharedErrors > 0 ? "errors" : sharedWarnings > 0 ? "warnings" : "ok";
  const all = buildAdsReport({ site: opts.site, contentRoot: opts.contentRoot, days: kpiDays, platform: "all", includeMetaPlatforms: false, noRefresh: true, now });
  return {
    generated_at: now.toISOString(),
    platform: "overview",
    window_days: kpiDays,
    status: worstStatus([metaCard.status, googleCard.status, sharedStatus]),
    open_errors: metaCard.open_errors + googleCard.open_errors + sharedErrors,
    open_warnings: metaCard.open_warnings + googleCard.open_warnings + sharedWarnings,
    platforms: { meta: metaCard, google: googleCard },
    shared_issues: shared,
    totals: { spend: all.totals.spend, site_leads: all.totals.unique_leads, paid_visits: all.totals.paid_visits },
  };
}

/** Global tab roll-up: worst status and open counts across Meta, Google and shared checks. */
export async function adsOverviewSummary(site: string, contentRoot?: string): Promise<{ status: AdsDiagnosticsStatus; open_errors: number; open_warnings: number }> {
  const o = await buildAdsDiagnosticsOverview({ site, contentRoot, days: ADS_ISSUE_WINDOW_DAYS });
  return { status: o.status, open_errors: o.open_errors, open_warnings: o.open_warnings };
}
