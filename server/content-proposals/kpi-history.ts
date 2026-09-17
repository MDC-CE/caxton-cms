/**
 * Proposal stock KPI history: daily end-of-day counts by kind × card status,
 * back-calculated from create/close dates (not live snapshots of "today").
 */

import type Database from "better-sqlite3";
import type { ProposalKind, ProposalStatus } from "./service";

export const KPI_RETENTION_DAYS = 90;

export const KPI_CARD_STATUSES = ["open", "finished", "rejected"] as const;
export type KpiCardStatus = (typeof KPI_CARD_STATUSES)[number];

export const KPI_CARD_KINDS = ["idea", "edits", "notes"] as const;
export type KpiCardKind = (typeof KPI_CARD_KINDS)[number];

export type ProposalKpiSourceRow = {
  kind: ProposalKind;
  status: ProposalStatus;
  created_at: number;
  closed_at: number | null;
  updated_at: number;
};

export type KindStatusCardCounts = Record<KpiCardKind, Record<KpiCardStatus, number>>;

export type KpiHistoryPoint = { day: string; count: number };

export type KpiHistorySeries = {
  kind: KpiCardKind;
  status: KpiCardStatus;
  points: KpiHistoryPoint[];
};

export type KpiHistoryResult = {
  granularity: "day" | "week";
  from: string;
  to: string;
  series: KpiHistorySeries[];
};

export function emptyCardCounts(): Record<KpiCardStatus, number> {
  return { open: 0, finished: 0, rejected: 0 };
}

export function emptyKindStatusCounts(): KindStatusCardCounts {
  return {
    idea: emptyCardCounts(),
    edits: emptyCardCounts(),
    notes: emptyCardCounts(),
  };
}

/** Map live DB statuses into card buckets (partial → open; withdraw omitted). */
export function toCardBuckets(
  rows: Array<{ kind: string; status: string; n: number }>,
): KindStatusCardCounts {
  const out = emptyKindStatusCounts();
  for (const row of rows) {
    if (!isKpiCardKind(row.kind)) continue;
    const n = Number(row.n) || 0;
    if (row.status === "open" || row.status === "partial") {
      out[row.kind].open += n;
    } else if (row.status === "finished") {
      out[row.kind].finished += n;
    } else if (row.status === "rejected") {
      out[row.kind].rejected += n;
    }
  }
  return out;
}

export function isKpiCardKind(raw: string): raw is KpiCardKind {
  return (KPI_CARD_KINDS as readonly string[]).includes(raw);
}

export function isKpiCardStatus(raw: string): raw is KpiCardStatus {
  return (KPI_CARD_STATUSES as readonly string[]).includes(raw);
}

export function utcDayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function endOfUtcDayMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999);
}

export function startOfUtcDayMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0);
}

export function addUtcDays(day: string, delta: number): string {
  const start = startOfUtcDayMs(day);
  return utcDayString(start + delta * 24 * 60 * 60 * 1000);
}

export function yesterdayUtc(now = Date.now()): string {
  return addUtcDays(utcDayString(now), -1);
}

export function retentionFromDay(now = Date.now()): string {
  return addUtcDays(utcDayString(now), -(KPI_RETENTION_DAYS - 1));
}

/** Inclusive YYYY-MM-DD range. */
export function daysInRange(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addUtcDays(cur, 1);
  }
  return out;
}

/**
 * Effective terminal time for finished/rejected/withdrawn.
 * Open/partial → null (still in flight).
 */
export function effectiveCloseAt(row: ProposalKpiSourceRow): number | null {
  if (row.status === "open" || row.status === "partial") return null;
  if (row.status === "finished" || row.status === "rejected" || row.status === "withdrawn") {
    return row.closed_at ?? row.updated_at;
  }
  return row.closed_at ?? row.updated_at;
}

/**
 * End-of-day stock for one UTC day from proposal date fields.
 * Withdrawn never enters card buckets (including historical open).
 */
export function stockForDay(rows: ProposalKpiSourceRow[], day: string): KindStatusCardCounts {
  const out = emptyKindStatusCounts();
  const end = endOfUtcDayMs(day);

  for (const row of rows) {
    if (!isKpiCardKind(row.kind)) continue;
    if (row.status === "withdrawn") continue;
    if (row.created_at > end) continue;

    const close = effectiveCloseAt(row);

    if (row.status === "open" || row.status === "partial") {
      out[row.kind].open += 1;
      continue;
    }

    if (row.status === "finished") {
      if (close != null && close > end) {
        out[row.kind].open += 1;
      } else {
        out[row.kind].finished += 1;
      }
      continue;
    }

    if (row.status === "rejected") {
      if (close != null && close > end) {
        out[row.kind].open += 1;
      } else {
        out[row.kind].rejected += 1;
      }
    }
  }

  return out;
}

function isoWeekKey(day: string): string {
  const ms = startOfUtcDayMs(day);
  const dt = new Date(ms);
  // ISO week: Thursday-based year
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const y = dt.getUTCFullYear();
  return `${y}-W${String(week).padStart(2, "0")}`;
}

export function loadKpiSourceRows(db: Database.Database, site: string): ProposalKpiSourceRow[] {
  try {
    return db
      .prepare(
        `SELECT kind, status, created_at, closed_at, updated_at
         FROM content_proposals WHERE site = ?`,
      )
      .all(site) as ProposalKpiSourceRow[];
  } catch {
    return [];
  }
}

export function liveByKindStatus(db: Database.Database, site: string): KindStatusCardCounts {
  try {
    const rows = db
      .prepare(
        `SELECT kind, status, COUNT(*) AS n
         FROM content_proposals WHERE site = ?
         GROUP BY kind, status`,
      )
      .all(site) as Array<{ kind: string; status: string; n: number }>;
    return toCardBuckets(rows);
  } catch {
    return emptyKindStatusCounts();
  }
}

function listStoredDays(db: Database.Database, site: string): Set<string> {
  try {
    const rows = db
      .prepare(`SELECT DISTINCT day FROM proposal_kpi_daily WHERE site = ?`)
      .all(site) as Array<{ day: string }>;
    return new Set(rows.map((r) => r.day));
  } catch {
    return new Set();
  }
}

function insertDayStock(
  db: Database.Database,
  site: string,
  day: string,
  stock: KindStatusCardCounts,
): void {
  const upsert = db.prepare(
    `INSERT INTO proposal_kpi_daily (site, day, kind, status, count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site, day, kind, status) DO UPDATE SET count = excluded.count`,
  );
  for (const kind of KPI_CARD_KINDS) {
    for (const status of KPI_CARD_STATUSES) {
      upsert.run(site, day, kind, status, stock[kind][status]);
    }
  }
}

function pruneOlderThan(db: Database.Database, site: string, keepFrom: string): void {
  try {
    db.prepare(`DELETE FROM proposal_kpi_daily WHERE site = ? AND day < ?`).run(site, keepFrom);
  } catch {
    /* table missing on older DBs mid-migration */
  }
}

/**
 * Fill missing days in [from, to] (inclusive) via back-calc.
 * Never writes today (or future). Prunes rows older than retention.
 */
export function ensureKpiCatchUp(
  db: Database.Database,
  site: string,
  opts?: { from?: string; to?: string; now?: number },
): void {
  const now = opts?.now ?? Date.now();
  const yesterday = yesterdayUtc(now);
  const keepFrom = retentionFromDay(now);
  const from = opts?.from && opts.from >= keepFrom ? opts.from : keepFrom;
  let to = opts?.to ?? yesterday;
  if (to > yesterday) to = yesterday;
  if (from > to) {
    pruneOlderThan(db, site, keepFrom);
    return;
  }

  const stored = listStoredDays(db, site);
  const missing = daysInRange(from, to).filter((d) => !stored.has(d));
  if (missing.length > 0) {
    const rows = loadKpiSourceRows(db, site);
    const write = db.transaction(() => {
      for (const day of missing) {
        insertDayStock(db, site, day, stockForDay(rows, day));
      }
    });
    try {
      write();
    } catch {
      /* proposal_kpi_daily may be absent */
    }
  }
  pruneOlderThan(db, site, keepFrom);
}

export function wipeAndBackfillKpiHistory(
  db: Database.Database,
  site: string,
  opts?: { now?: number },
): void {
  const now = opts?.now ?? Date.now();
  try {
    db.prepare(`DELETE FROM proposal_kpi_daily WHERE site = ?`).run(site);
  } catch {
    return;
  }
  ensureKpiCatchUp(db, site, { now });
}

function clampHistoryRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  now: number,
): { from: string; to: string } {
  const yesterday = yesterdayUtc(now);
  const keepFrom = retentionFromDay(now);
  let to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : yesterday;
  let from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : addUtcDays(to, -27);
  if (to > yesterday) to = yesterday;
  if (from < keepFrom) from = keepFrom;
  if (from > to) from = to;
  return { from, to };
}

export function getKpiHistory(
  db: Database.Database,
  site: string,
  opts?: {
    kind?: KpiCardKind | null;
    granularity?: "day" | "week";
    from?: string;
    to?: string;
    now?: number;
  },
): KpiHistoryResult {
  const now = opts?.now ?? Date.now();
  const granularity = opts?.granularity === "week" ? "week" : "day";
  const { from, to } = clampHistoryRange(opts?.from, opts?.to, now);
  ensureKpiCatchUp(db, site, { from, to, now });

  const kinds: KpiCardKind[] = opts?.kind ? [opts.kind] : [...KPI_CARD_KINDS];
  const series: KpiHistorySeries[] = [];

  let rows: Array<{ day: string; kind: string; status: string; count: number }> = [];
  try {
    rows = db
      .prepare(
        `SELECT day, kind, status, count
         FROM proposal_kpi_daily
         WHERE site = ? AND day >= ? AND day <= ?
         ORDER BY day ASC`,
      )
      .all(site, from, to) as Array<{ day: string; kind: string; status: string; count: number }>;
  } catch {
    rows = [];
  }

  const byKey = new Map<string, number>();
  for (const r of rows) {
    if (!isKpiCardKind(r.kind) || !isKpiCardStatus(r.status)) continue;
    byKey.set(`${r.day}|${r.kind}|${r.status}`, Number(r.count) || 0);
  }

  const days = daysInRange(from, to);

  for (const kind of kinds) {
    for (const status of KPI_CARD_STATUSES) {
      if (granularity === "day") {
        const points: KpiHistoryPoint[] = days.map((day) => ({
          day,
          count: byKey.get(`${day}|${kind}|${status}`) ?? 0,
        }));
        series.push({ kind, status, points });
      } else {
        const weekLast = new Map<string, string>();
        for (const day of days) {
          weekLast.set(isoWeekKey(day), day);
        }
        const weekKeys = [...weekLast.keys()].sort();
        const points: KpiHistoryPoint[] = weekKeys.map((wk) => {
          const day = weekLast.get(wk)!;
          return {
            day: wk,
            count: byKey.get(`${day}|${kind}|${status}`) ?? 0,
          };
        });
        series.push({ kind, status, points });
      }
    }
  }

  return { granularity, from, to, series };
}
