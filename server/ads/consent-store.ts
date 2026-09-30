/**
 * Daily consent banner counters per site (pipeline SQLite `consent_daily`).
 * Counts only — no visitor identifiers. Feeds the Diagnostics consent-rate check.
 */

import { getSiteSqlite } from "../db";
import { ensurePipelineDb } from "../pipeline-db/runner";
import type { ConsentDecision, ConsentMode } from "@shared/consent";

export type ConsentEventKind = "shown" | ConsentDecision;

const COLUMN_BY_KIND: Record<ConsentEventKind, string> = {
  shown: "shown",
  granted_explicit: "granted_explicit",
  granted_implied: "granted_implied",
  denied: "denied",
};

export const CONSENT_DAILY_RETENTION_DAYS = 25 * 31;

export function utcDateKey(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function recordConsentEvent(
  site: string,
  input: { kind: ConsentEventKind; mode: ConsentMode; country: string | null; at?: number },
): void {
  ensurePipelineDb(site);
  const column = COLUMN_BY_KIND[input.kind];
  const date = utcDateKey(input.at);
  const country = input.country ?? "??";
  getSiteSqlite(site)
    .prepare(
      `INSERT INTO consent_daily (date, country, mode, ${column}) VALUES (?, ?, ?, 1)
       ON CONFLICT(date, country, mode) DO UPDATE SET ${column} = ${column} + 1`,
    )
    .run(date, country, input.mode);
}

export type ConsentDailyRow = {
  date: string;
  country: string;
  mode: ConsentMode;
  shown: number;
  granted_explicit: number;
  granted_implied: number;
  denied: number;
};

export function listConsentDaily(site: string, sinceDate: string): ConsentDailyRow[] {
  ensurePipelineDb(site);
  return getSiteSqlite(site)
    .prepare(
      `SELECT date, country, mode, shown, granted_explicit, granted_implied, denied
       FROM consent_daily WHERE date >= ? ORDER BY date ASC`,
    )
    .all(sinceDate) as ConsentDailyRow[];
}

export type ConsentRateByMode = {
  mode: ConsentMode;
  shown: number;
  granted: number;
  denied: number;
  /** granted / (granted + denied); null when no decisions. */
  grant_rate: number | null;
};

export function summarizeConsentRates(rows: ConsentDailyRow[]): ConsentRateByMode[] {
  const byMode = new Map<ConsentMode, ConsentRateByMode>();
  for (const r of rows) {
    const cur = byMode.get(r.mode) ?? { mode: r.mode, shown: 0, granted: 0, denied: 0, grant_rate: null };
    cur.shown += r.shown;
    cur.granted += r.granted_explicit + r.granted_implied;
    cur.denied += r.denied;
    byMode.set(r.mode, cur);
  }
  return Array.from(byMode.values()).map((m) => ({
    ...m,
    grant_rate: m.granted + m.denied > 0 ? m.granted / (m.granted + m.denied) : null,
  }));
}

export function pruneConsentDaily(site: string, now: number = Date.now()): number {
  ensurePipelineDb(site);
  const cutoff = utcDateKey(now - CONSENT_DAILY_RETENTION_DAYS * 86_400_000);
  const info = getSiteSqlite(site).prepare("DELETE FROM consent_daily WHERE date < ?").run(cutoff);
  return Number(info.changes ?? 0);
}
