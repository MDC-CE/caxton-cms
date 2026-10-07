/**
 * Legal diagnostics: consent banner rates per region and the ask-region
 * accept-rate drop check, built from the daily consent counters.
 */

import { consentRateDrop } from "@shared/ads-diagnostics-rules";
import type { ConsentRegionRate, LegalDiagnostics, LegalDiagnosticsSummary, LegalIssue } from "@shared/legal-diagnostics";
import { child } from "../logger";
import { addDays, utcDate } from "../ads/meta-ads-days";
import { listConsentDaily, type ConsentDailyRow } from "../ads/consent-store";

const log = child({ module: "legal/legal-diagnostics" });

function pctOf(n: number, total: number): number | null {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : null;
}

export function consentRates(rows: ConsentDailyRow[]): ConsentRegionRate[] {
  const regions: ConsentRegionRate["region"][] = ["ask", "notice", "unknown"];
  return regions.map((region) => {
    const subset = rows.filter((r) => (region === "unknown" ? r.country === "??" : r.country !== "??" && r.mode === region));
    const shown = subset.reduce((s, r) => s + r.shown, 0);
    const granted = subset.reduce((s, r) => s + r.granted_explicit + r.granted_implied, 0);
    const denied = subset.reduce((s, r) => s + r.denied, 0);
    return {
      region,
      shown,
      accept_pct: pctOf(granted, shown),
      reject_pct: pctOf(denied, shown),
      ignore_pct: shown > 0 ? pctOf(Math.max(0, shown - granted - denied), shown) : null,
    };
  });
}

export function askRate(rows: ConsentDailyRow[]): { shown: number; granted: number; decided: number } {
  const ask = rows.filter((r) => r.mode === "ask");
  const granted = ask.reduce((s, r) => s + r.granted_explicit + r.granted_implied, 0);
  const denied = ask.reduce((s, r) => s + r.denied, 0);
  return { shown: ask.reduce((s, r) => s + r.shown, 0), granted, decided: granted + denied };
}

export function consentTotals(rows: ConsentDailyRow[]): LegalDiagnostics["kpis"] {
  const shown = rows.reduce((s, r) => s + r.shown, 0);
  const granted = rows.reduce((s, r) => s + r.granted_explicit + r.granted_implied, 0);
  const denied = rows.reduce((s, r) => s + r.denied, 0);
  return {
    banners_shown: shown,
    accept_pct: pctOf(granted, shown),
    reject_pct: pctOf(denied, shown),
    ignore_pct: shown > 0 ? pctOf(Math.max(0, shown - granted - denied), shown) : null,
  };
}

/** Relative ask-region accept-rate drop vs the 28 days before the window, or null. */
export function consentDropPct(current: ConsentDailyRow[], trailing: ConsentDailyRow[]): number | null {
  const cur = askRate(current);
  const base = askRate(trailing);
  return consentRateDrop(cur, base.decided > 0 ? base.granted / base.decided : null);
}

export function loadConsentWindow(site: string, days: number, now: Date): { current: ConsentDailyRow[]; trailing: ConsentDailyRow[] } {
  try {
    const since = addDays(utcDate(now), -(days - 1));
    return {
      current: listConsentDaily(site, since),
      trailing: listConsentDaily(site, addDays(since, -28)).filter((r) => r.date < since),
    };
  } catch (err) {
    log.warn({ err }, "[legal-diagnostics] consent counters unavailable");
    return { current: [], trailing: [] };
  }
}

export function buildLegalDiagnosticsFromRows(
  current: ConsentDailyRow[],
  trailing: ConsentDailyRow[],
  opts: { days: number; now: Date },
): LegalDiagnostics {
  const kpis = consentTotals(current);
  const issues: LegalIssue[] = [];
  const drop = consentDropPct(current, trailing);
  if (drop != null) {
    issues.push({
      id: "consent_rate_drop",
      code: "consent_rate_drop",
      severity: "warning",
      title: "Fewer visitors accept tracking",
      why: `In countries where we ask, the accept rate fell ${Math.round(drop)}% vs the previous 28 days. Fewer accepts means fewer measured visits, not fewer real visits.`,
      how_to_fix: "Review the banner copy in Settings → Legal → Consent Window; keep Accept and Reject equally visible.",
    });
  }
  return {
    generated_at: opts.now.toISOString(),
    window_days: opts.days,
    status: kpis.banners_shown === 0 ? "no_data" : issues.some((i) => i.severity === "warning") ? "warnings" : "ok",
    kpis,
    consent: consentRates(current),
    issues,
  };
}

export function buildLegalDiagnostics(opts: { site: string; days?: number; now?: Date }): LegalDiagnostics {
  const now = opts.now ?? new Date();
  const days = opts.days === 7 ? 7 : 28;
  const { current, trailing } = loadConsentWindow(opts.site, days, now);
  return buildLegalDiagnosticsFromRows(current, trailing, { days, now });
}

/** Light roll-up for the Global tab. */
export function legalDiagnosticsSummary(site: string): LegalDiagnosticsSummary {
  const d = buildLegalDiagnostics({ site, days: 7 });
  return { status: d.status, open_warnings: d.issues.filter((i) => i.severity === "warning").length };
}
