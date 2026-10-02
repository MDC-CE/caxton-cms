/** Meta KPI tiles from a saved report window (pure: no I/O). */

import { isClicksVisitsMismatch } from "@shared/ads-diagnostics-rules";
import type { AdsLeadConversions, AdsReport } from "../ads-report";

export function metaKpis(report: AdsReport, counts: { open_errors: number; open_warnings: number }, consentAcceptPct: number | null, picked: string[], changedAt: string | null) {
  const k = report.totals;
  const lc = report.lead_conversions as AdsLeadConversions | undefined;
  const ratio = k.ratio_clicks > 0 && report.ga4.configured ? k.matched_visits / k.ratio_clicks : null;
  return {
    tracked_spend: k.tracked_spend,
    spend: k.spend,
    ...counts,
    meta_leads: k.meta_leads,
    site_leads: k.unique_leads,
    meta_conversions: lc?.meta ?? [],
    site_conversions: lc?.site ?? [],
    meta_lead_conversions_picked: lc?.meta_picked ?? picked,
    lead_conversions_changed_at: lc?.meta_changed_at ?? changedAt,
    meta_conversions_incomplete_days: lc?.meta_incomplete_days ?? 0,
    snapshot_lacks_conversions: lc?.snapshot_lacks_conversions ?? false,
    repeat_submissions: k.repeat_submissions,
    clicks_to_visits_pct: ratio != null ? Math.round(ratio * 1000) / 10 : null,
    clicks_to_visits_mismatch: isClicksVisitsMismatch(ratio),
    unmatched_meta_visits: k.unmatched_meta_visits,
    untagged_clicks: k.untagged_clicks,
    meta_unclear_pct: k.paid_visits + k.unclear_visits > 0 ? Math.round((k.unclear_visits / (k.paid_visits + k.unclear_visits)) * 1000) / 10 : null,
    consent_accept_pct: consentAcceptPct,
  };
}

