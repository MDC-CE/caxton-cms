/**
 * Page-level lead credit for paid traffic. Pure — no I/O.
 *
 * - Each lead is credited to exactly one paid landing page (never split).
 * - Default model: last paid landing within 30 days before the lead; switch: first paid landing.
 * - Test leads never count. Repeats count as submissions, not leads.
 * - The form page (conversion_url) never receives credit.
 */

import { normalizeLandingPath, PAID_LOOKBACK_DAYS } from "./paid-traffic";

export type AttributionModel = "last_paid" | "first_paid";
export const ATTRIBUTION_MODELS: readonly AttributionModel[] = ["last_paid", "first_paid"];

/** A later visit = the lead came more than one GA4 session (30 min) after the credited paid click. */
export const LATER_VISIT_GAP_MS = 30 * 60 * 1000;

export type AttributableLead = {
  submission_id: string;
  created_at: number;
  is_test: boolean | 0 | 1;
  is_repeat: boolean | 0 | 1;
  first_paid_host?: string | null;
  first_paid_path?: string | null;
  first_paid_at?: number | null;
  last_paid_host?: string | null;
  last_paid_path?: string | null;
  last_paid_at?: number | null;
};

export type CreditReason = "credited" | "test" | "no_paid_landing" | "outside_lookback";

export type LeadCredit = {
  submission_id: string;
  reason: CreditReason;
  host: string | null;
  path: string | null;
  paid_at: number | null;
  is_repeat: boolean;
  /** Credited, but the lead came in a later visit without a new paid click. */
  last_visit_organic: boolean;
};

export function parseAttributionModel(raw: unknown): AttributionModel {
  return raw === "first_paid" ? "first_paid" : "last_paid";
}

export function creditLead(
  row: AttributableLead,
  model: AttributionModel = "last_paid",
  lookbackDays: number = PAID_LOOKBACK_DAYS,
): LeadCredit {
  const base = { submission_id: row.submission_id, is_repeat: !!row.is_repeat, last_visit_organic: false };
  if (row.is_test) return { ...base, reason: "test", host: null, path: null, paid_at: null };

  const pick = model === "first_paid"
    ? { host: row.first_paid_host, path: row.first_paid_path, at: row.first_paid_at }
    : { host: row.last_paid_host, path: row.last_paid_path, at: row.last_paid_at };
  if (!pick.host || !pick.path || pick.at == null) {
    return { ...base, reason: "no_paid_landing", host: null, path: null, paid_at: null };
  }
  const age = row.created_at - pick.at;
  if (age < -LATER_VISIT_GAP_MS || age > lookbackDays * 86_400_000) {
    return { ...base, reason: "outside_lookback", host: null, path: null, paid_at: null };
  }
  const lastPaidAt = row.last_paid_at ?? pick.at;
  return {
    ...base,
    reason: "credited",
    host: pick.host.toLowerCase().replace(/^www\./, ""),
    path: normalizeLandingPath(pick.path),
    paid_at: pick.at,
    last_visit_organic: row.created_at - lastPaidAt > LATER_VISIT_GAP_MS,
  };
}

export type LandingCreditTotals = {
  host: string;
  path: string;
  unique_leads: number;
  submissions: number;
  repeat_submissions: number;
  last_visit_organic: number;
};

export function landingKey(host: string, path: string): string {
  return `${host.toLowerCase().replace(/^www\./, "")}|${normalizeLandingPath(path)}`;
}

/** Roll credited leads up per landing page. Totals equal the real (non-test) credited count. */
export function totalsByLanding(credits: LeadCredit[]): Map<string, LandingCreditTotals> {
  const out = new Map<string, LandingCreditTotals>();
  for (const c of credits) {
    if (c.reason !== "credited" || !c.host || !c.path) continue;
    const key = landingKey(c.host, c.path);
    const t = out.get(key) ?? {
      host: c.host,
      path: c.path,
      unique_leads: 0,
      submissions: 0,
      repeat_submissions: 0,
      last_visit_organic: 0,
    };
    t.submissions += 1;
    if (c.is_repeat) t.repeat_submissions += 1;
    else {
      t.unique_leads += 1;
      if (c.last_visit_organic) t.last_visit_organic += 1;
    }
    out.set(key, t);
  }
  return out;
}

export function isLowSample(paidVisits: number, minPaidVisits = 20): boolean {
  return paidVisits < minPaidVisits;
}

/**
 * Days of the window covered by ledger data ("based on N of X days").
 * Dates are YYYY-MM-DD (inclusive); collectingSinceMs null = nothing collected yet.
 */
export function coveredDays(windowStart: string, windowEnd: string, collectingSinceMs: number | null): { covered: number; total: number } {
  const start = Date.parse(`${windowStart}T00:00:00.000Z`);
  const end = Date.parse(`${windowEnd}T00:00:00.000Z`);
  const total = Math.max(0, Math.round((end - start) / 86_400_000) + 1);
  if (collectingSinceMs == null) return { covered: 0, total };
  const since = new Date(collectingSinceMs);
  const sinceDay = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());
  if (sinceDay <= start) return { covered: total, total };
  if (sinceDay > end) return { covered: 0, total };
  return { covered: Math.round((end - sinceDay) / 86_400_000) + 1, total };
}
