/**
 * Proposal KPI history: per-bucket flow by kind × card status, computed live
 * from content_proposals (created_at / close time). Each bucket restarts at
 * zero — "open" = created in the bucket, finished/rejected = closed into that
 * status in the bucket. The bucket containing "now" is marked partial.
 * proposal_kpi_daily is no longer read or written.
 */

import type Database from "better-sqlite3";
import type { ProposalKind, ProposalStatus } from "./service";

export const KPI_RETENTION_DAYS = 90;
export const KPI_CACHE_MS = 15 * 60 * 1000;
export const KPI_DAY_WINDOW = 28;
export const KPI_WEEK_WINDOW = 12;

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

export type KpiHistoryPoint = { day: string; count: number; partial?: boolean };

export type KpiHistorySeries = {
  kind: KpiCardKind;
  status: KpiCardStatus;
  points: KpiHistoryPoint[];
};

export type KpiHistoryResult = {
  granularity: KpiGranularity;
  /** open = created in bucket; finished/rejected = closed in bucket. */
  metric: "flow";
  from: string;
  to: string;
  series: KpiHistorySeries[];
  computed_at: number;
};

export type KpiBucket = { key: string; startMs: number; endMs: number; partial: boolean };

type CacheEntry = { computed_at: number; payload: KpiHistoryResult };

/** site|kind|granularity|from|to — kind is "all" when unfiltered */
const kpiCache = new Map<string, CacheEntry>();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

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
  return utcDayString(start + delta * DAY_MS);
}

export function yesterdayUtc(now = Date.now()): string {
  return addUtcDays(utcDayString(now), -1);
}

export function retentionFromDay(now = Date.now()): string {
  return addUtcDays(utcDayString(now), -(KPI_RETENTION_DAYS - 1));
}

/** Monday (UTC) of the week containing `day`. */
export function mondayOfUtcWeek(day: string): string {
  const dow = new Date(startOfUtcDayMs(day)).getUTCDay();
  return addUtcDays(day, -((dow + 6) % 7));
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

    if (row.status === "finished" || row.status === "rejected") {
      if (close != null && close > endMs) {
        out[row.kind].open += 1;
      } else {
        out[row.kind][row.status] += 1;
      }
    }
  }

  return out;
}

/** End-of-day stock for one UTC day. */
export function stockForDay(rows: ProposalKpiSourceRow[], day: string): KindStatusCardCounts {
  return stockAsOf(rows, endOfUtcDayMs(day));
}

/** Hourly buckets for the UTC day containing `now`, hour 0 through the current hour. */
export function hourBuckets(now: number): KpiBucket[] {
  const today = utcDayString(now);
  const dayStart = startOfUtcDayMs(today);
  const currentHour = new Date(now).getUTCHours();
  const out: KpiBucket[] = [];
  for (let h = 0; h <= currentHour; h++) {
    const startMs = dayStart + h * HOUR_MS;
    out.push({
      key: utcHourKey(startMs),
      startMs,
      endMs: startMs + HOUR_MS - 1,
      partial: h === currentHour,
    });
  }
  return out;
}

/** Daily buckets for [from, to] inclusive; the bucket for today is partial. */
export function dayBuckets(from: string, to: string, now: number): KpiBucket[] {
  const today = utcDayString(now);
  return daysInRange(from, to).map((day) => {
    const startMs = startOfUtcDayMs(day);
    return { key: day, startMs, endMs: startMs + DAY_MS - 1, partial: day === today };
  });
}

/** Monday-start UTC week buckets from the week of `from` through the week of `to`. */
export function weekBuckets(from: string, to: string, now: number): KpiBucket[] {
  const currentMonday = mondayOfUtcWeek(utcDayString(now));
  const lastMonday = mondayOfUtcWeek(to);
  const out: KpiBucket[] = [];
  let cur = mondayOfUtcWeek(from);
  while (cur <= lastMonday) {
    const startMs = startOfUtcDayMs(cur);
    out.push({ key: cur, startMs, endMs: startMs + WEEK_MS - 1, partial: cur === currentMonday });
    cur = addUtcDays(cur, 7);
  }
  return out;
}

/**
 * Per-bucket flow. Buckets must be contiguous and equal width (hour/day/week).
 * open += created in bucket; finished/rejected += closed in bucket. Withdrawn skipped.
 */
export function flowSeries(
  rows: ProposalKpiSourceRow[],
  kinds: KpiCardKind[],
  buckets: KpiBucket[],
): KpiHistorySeries[] {
  const counts = buckets.map(() => emptyKindStatusCounts());
  if (buckets.length > 0) {
    const start0 = buckets[0]!.startMs;
    const width = buckets[0]!.endMs - start0 + 1;
    const lastEnd = buckets[buckets.length - 1]!.endMs;
    const indexOf = (t: number): number => {
      if (t < start0 || t > lastEnd) return -1;
      return Math.floor((t - start0) / width);
    };

    for (const row of rows) {
      if (!isKpiCardKind(row.kind)) continue;
      if (row.status === "withdrawn") continue;

      const createdIdx = indexOf(row.created_at);
      if (createdIdx >= 0) counts[createdIdx]![row.kind].open += 1;

      if (row.status === "finished" || row.status === "rejected") {
        const close = effectiveCloseAt(row);
        const closeIdx = close == null ? -1 : indexOf(close);
        if (closeIdx >= 0) counts[closeIdx]![row.kind][row.status] += 1;
      }
    }
  }

  const series: KpiHistorySeries[] = [];
  for (const kind of kinds) {
    for (const status of KPI_CARD_STATUSES) {
      series.push({
        kind,
        status,
        points: buckets.map((b, i) => ({
          day: b.key,
          count: counts[i]![kind][status],
          ...(b.partial ? { partial: true } : {}),
        })),
      });
    }
  }
  return series;
}

function cacheKey(
  site: string,
  kind: KpiCardKind | null | undefined,
  granularity: KpiGranularity,
  from: string,
  to: string,
): string {
  return `${site}|${kind ?? "all"}|${granularity}|${from}|${to}`;
}

/** Clear all KPI history cache entries for a site (all kinds and granularities). */
export function invalidateKpiCache(site: string): void {
  const prefix = `${site}|`;
  for (const key of Array.from(kpiCache.keys())) {
    if (key.startsWith(prefix)) kpiCache.delete(key);
  }
}

/** Test helper — wipe the entire KPI cache. */
export function clearAllKpiCache(): void {
  kpiCache.clear();
}

/** Rows that can land in a bucket starting at `sinceMs` (created or closed since then). */
export function loadKpiSourceRows(
  db: Database.Database,
  site: string,
  sinceMs = 0,
): ProposalKpiSourceRow[] {
  try {
    return db
      .prepare(
        `SELECT kind, status, created_at, closed_at, updated_at
         FROM content_proposals
         WHERE site = ? AND (created_at >= ? OR COALESCE(closed_at, updated_at) >= ?)`,
      )
      .all(site, sinceMs, sinceMs) as ProposalKpiSourceRow[];
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

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveBuckets(
  granularity: KpiGranularity,
  fromRaw: string | undefined,
  toRaw: string | undefined,
  now: number,
): { from: string; to: string; buckets: KpiBucket[] } {
  const today = utcDayString(now);

  if (granularity === "today") {
    return { from: today, to: today, buckets: hourBuckets(now) };
  }

  let to = toRaw && DAY_RE.test(toRaw) ? toRaw : today;
  if (to > today) to = today;

  if (granularity === "week") {
    const floor = addUtcDays(mondayOfUtcWeek(today), -7 * KPI_WEEK_WINDOW);
    const defaultFrom = addUtcDays(mondayOfUtcWeek(to), -7 * KPI_WEEK_WINDOW);
    let from = fromRaw && DAY_RE.test(fromRaw) ? mondayOfUtcWeek(fromRaw) : defaultFrom;
    if (from < floor) from = floor;
    if (from > to) from = mondayOfUtcWeek(to);
    return { from, to, buckets: weekBuckets(from, to, now) };
  }

  const keepFrom = retentionFromDay(now);
  let from = fromRaw && DAY_RE.test(fromRaw) ? fromRaw : addUtcDays(to, -(KPI_DAY_WINDOW - 1));
  if (from < keepFrom) from = keepFrom;
  if (from > to) from = to;
  return { from, to, buckets: dayBuckets(from, to, now) };
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

  const { from, to, buckets } = resolveBuckets(granularity, opts?.from, opts?.to, now);
  const key = cacheKey(site, opts?.kind ?? null, granularity, from, to);
  if (!opts?.fresh) {
    const hit = kpiCache.get(key);
    if (hit && now - hit.computed_at <= KPI_CACHE_MS) return hit.payload;
  }

  const sinceMs = buckets[0]?.startMs ?? now;
  const rows = loadKpiSourceRows(db, site, sinceMs);
  const payload: KpiHistoryResult = {
    granularity,
    metric: "flow",
    from,
    to,
    series: flowSeries(rows, kinds, buckets),
    computed_at: now,
  };
  kpiCache.set(key, { computed_at: now, payload });
  return payload;
}
