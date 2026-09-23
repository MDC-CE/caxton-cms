/**
 * Proposal stock KPI history: daily end-of-day counts by kind × card status,
 * back-calculated from create/close dates. Today mode is computed live (hourly)
 * and cached briefly — never written into proposal_kpi_daily.
 */

import type Database from "better-sqlite3";
import type { ProposalKind, ProposalStatus } from "./service";

export const KPI_RETENTION_DAYS = 90;
export const TODAY_KPI_CACHE_MS = 15 * 60 * 1000;

export const KPI_CARD_STATUSES = ["open", "finished", "rejected"] as const;
export type KpiCardStatus = (typeof KPI_CARD_STATUSES)[number];

export const KPI_CARD_KINDS = ["idea", "edits", "notes"] as const;
export type KpiCardKind = (typeof KPI_CARD_KINDS)[number];

export type KpiGranularity = "today" | "day" | "week";

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
  granularity: KpiGranularity;
  from: string;
  to: string;
  series: KpiHistorySeries[];
  computed_at: number;
};

type TodayCacheEntry = { computed_at: number; payload: KpiHistoryResult };

/** site|kind — kind is "all" when unfiltered */
const todayKpiCache = new Map<string, TodayCacheEntry>();

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

/** e.g. 2026-03-17T14:00Z */
export function utcHourKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:00Z`;
}

export function endOfUtcDayMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999);
}

export function startOfUtcDayMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0);
}

export function endOfUtcHourMs(day: string, hour: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, hour, 59, 59, 999);
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
 * Stock as of an instant (inclusive end).
 * Withdrawn never enters card buckets (including historical open).
 */
export function stockAsOf(rows: ProposalKpiSourceRow[], endMs: number): KindStatusCardCounts {
  const out = emptyKindStatusCounts();

  for (const row of rows) {
    if (!isKpiCardKind(row.kind)) continue;
    if (row.status === "withdrawn") continue;
    if (row.created_at > endMs) continue;

    const close = effectiveCloseAt(row);

    if (row.status === "open" || row.status === "partial") {
      out[row.kind].open += 1;
      continue;
    }

    if (row.status === "finished") {
      if (close != null && close > endMs) {
        out[row.kind].open += 1;
      } else {
        out[row.kind].finished += 1;
      }
      continue;
    }

    if (row.status === "rejected") {
      if (close != null && close > endMs) {
        out[row.kind].open += 1;
      } else {
        out[row.kind].rejected += 1;
      }
    }
  }

  return out;
}

/** End-of-day stock for one UTC day. */
export function stockForDay(rows: ProposalKpiSourceRow[], day: string): KindStatusCardCounts {
  return stockAsOf(rows, endOfUtcDayMs(day));
}

function todayCacheKey(site: string, kind: KpiCardKind | null | undefined): string {
  return `${site}|${kind ?? "all"}`;
}

/** Clear all Today KPI cache entries for a site (all kind filters). */
export function invalidateTodayKpiCache(site: string): void {
  const prefix = `${site}|`;
  for (const key of [...todayKpiCache.keys()]) {
    if (key.startsWith(prefix)) todayKpiCache.delete(key);
  }
}

/** Test helper — wipe entire Today cache. */
export function clearAllTodayKpiCache(): void {
  todayKpiCache.clear();
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
  invalidateTodayKpiCache(site);
}

function clampHistoryRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  now: number,
  granularity: "day" | "week",
): { from: string; to: string } {
  const yesterday = yesterdayUtc(now);
  const keepFrom = retentionFromDay(now);
  let to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : yesterday;
  const defaultFrom =
    granularity === "week" ? addUtcDays(yesterday, -6) : addUtcDays(to, -27);
  let from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : defaultFrom;
  if (to > yesterday) to = yesterday;
  if (from < keepFrom) from = keepFrom;
  if (from > to) from = to;
  return { from, to };
}

function buildTodayHistory(
  rows: ProposalKpiSourceRow[],
  kinds: KpiCardKind[],
  now: number,
): KpiHistoryResult {
  const today = utcDayString(now);
  const currentHour = new Date(now).getUTCHours();
  const series: KpiHistorySeries[] = [];

  for (const kind of kinds) {
    for (const status of KPI_CARD_STATUSES) {
      const points: KpiHistoryPoint[] = [];
      for (let h = 0; h < currentHour; h++) {
        const end = endOfUtcHourMs(today, h);
        points.push({
          day: utcHourKey(end),
          count: stockAsOf(rows, end)[kind][status],
        });
      }
      points.push({
        day: utcHourKey(now),
        count: stockAsOf(rows, now)[kind][status],
      });
      series.push({ kind, status, points });
    }
  }

  return {
    granularity: "today",
    from: today,
    to: today,
    series,
    computed_at: now,
  };
}

function readDailySeries(
  db: Database.Database,
  site: string,
  from: string,
  to: string,
  kinds: KpiCardKind[],
  granularity: "day" | "week",
  computed_at: number,
): KpiHistoryResult {
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
  const series: KpiHistorySeries[] = [];

  for (const kind of kinds) {
    for (const status of KPI_CARD_STATUSES) {
      // week = last N completed days as a day series (no ISO week rollup)
      const points: KpiHistoryPoint[] = days.map((day) => ({
        day,
        count: byKey.get(`${day}|${kind}|${status}`) ?? 0,
      }));
      series.push({ kind, status, points });
    }
  }

  return { granularity, from, to, series, computed_at };
}

export function getKpiHistory(
  db: Database.Database,
  site: string,
  opts?: {
    kind?: KpiCardKind | null;
    granularity?: KpiGranularity;
    from?: string;
    to?: string;
    now?: number;
    fresh?: boolean;
  },
): KpiHistoryResult {
  const now = opts?.now ?? Date.now();
  const raw = opts?.granularity;
  const granularity: KpiGranularity =
    raw === "today" ? "today" : raw === "week" ? "week" : "day";
  const kinds: KpiCardKind[] = opts?.kind ? [opts.kind] : [...KPI_CARD_KINDS];

  if (granularity === "today") {
    const cacheKey = todayCacheKey(site, opts?.kind ?? null);
    if (!opts?.fresh) {
      const hit = todayKpiCache.get(cacheKey);
      if (hit && now - hit.computed_at <= TODAY_KPI_CACHE_MS) {
        return hit.payload;
      }
    }
    const source = loadKpiSourceRows(db, site);
    const payload = buildTodayHistory(source, kinds, now);
    todayKpiCache.set(cacheKey, { computed_at: now, payload });
    return payload;
  }

  const { from, to } = clampHistoryRange(opts?.from, opts?.to, now, granularity);
  ensureKpiCatchUp(db, site, { from, to, now });
  return readDailySeries(db, site, from, to, kinds, granularity, now);
}
