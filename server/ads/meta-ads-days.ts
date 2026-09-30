/**
 * Per-day Meta ad insights cache on persistent `.cache/{site}/meta-ads-days/`.
 * Refresh re-fetches the last 10 days (7-day click attribution + processing),
 * first connect backfills 90 days, retention is 13 months.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { getAdsSettings } from "../settings";
import { child } from "../logger";
import {
  fetchAccountInfo,
  fetchAdCreatives,
  fetchAdInsights,
  isMetaTokenConfigured,
  MetaApiError,
  type MetaAccountInfo,
  type MetaAdCreativeInfo,
  type MetaAdDayRow,
} from "./meta-client";

const log = child({ module: "ads/meta-ads-days" });

export const META_REFRESH_DAYS = 10;
export const META_BACKFILL_DAYS = 90;
export const META_RETENTION_DAYS = 395;
export const META_STALE_MS = 24 * 60 * 60 * 1000;
const FETCH_CHUNK_DAYS = 15;

export type MetaAdsDayFile = {
  date: string;
  fetched_at: string;
  rows: MetaAdDayRow[];
};

export type MetaAdsSyncState = {
  requested_at?: string;
  last_attempt_at?: string;
  last_success_at?: string;
  last_failure_at?: string;
  last_error?: string;
  last_error_kind?: MetaApiError["kind"];
  consecutive_failures: number;
  /** Earliest date we have fetched (inclusive). */
  history_since?: string;
  accounts: Record<string, Pick<MetaAccountInfo, "name" | "currency" | "account_status"> & { error?: string }>;
};

export type MetaAdsCreatives = {
  fetched_at: string;
  ads: Record<string, MetaAdCreativeInfo>;
};

export type MetaSyncMode = "refresh" | "backfill" | "older";

export type MetaSyncResult = {
  ok: boolean;
  mode: MetaSyncMode;
  dates: string[];
  rows: number;
  error?: string;
  skipped?: "not_enabled" | "no_accounts" | "no_token" | "in_progress";
};

function dir(site: string): string {
  return path.join(CACHE_DIR, site, "meta-ads-days");
}

function dayPath(site: string, date: string): string {
  return path.join(dir(site), `${date}.json`);
}

function statePath(site: string): string {
  return path.join(CACHE_DIR, site, "meta-ads-state.json");
}

function creativesPath(site: string): string {
  return path.join(CACHE_DIR, site, "meta-ads-creatives.json");
}

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), "utf-8");
  fs.renameSync(tmp, file);
}

export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcDate(d);
}

export function dateRange(since: string, until: string): string[] {
  const out: string[] = [];
  for (let d = since; d <= until; d = addDays(d, 1)) out.push(d);
  return out;
}

export function listMetaDayDates(site: string): string[] {
  const d = dir(site);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function loadMetaDay(site: string, date: string): MetaAdsDayFile | null {
  const f = readJson<MetaAdsDayFile>(dayPath(site, date));
  return f && f.date === date && Array.isArray(f.rows) ? f : null;
}

export function saveMetaDay(site: string, file: MetaAdsDayFile): void {
  writeJson(dayPath(site, file.date), file);
}

export function loadMetaState(site: string): MetaAdsSyncState {
  return readJson<MetaAdsSyncState>(statePath(site)) ?? { consecutive_failures: 0, accounts: {} };
}

export function saveMetaState(site: string, state: MetaAdsSyncState): void {
  writeJson(statePath(site), state);
}

export function loadMetaCreatives(site: string): MetaAdsCreatives {
  return readJson<MetaAdsCreatives>(creativesPath(site)) ?? { fetched_at: "", ads: {} };
}

/** Rows for configured accounts only, inclusive window. */
export function loadMetaRows(site: string, since: string, until: string, accountIds?: string[]): MetaAdDayRow[] {
  const allow = accountIds && accountIds.length > 0 ? new Set(accountIds) : null;
  const out: MetaAdDayRow[] = [];
  for (const date of listMetaDayDates(site)) {
    if (date < since || date > until) continue;
    const file = loadMetaDay(site, date);
    if (!file) continue;
    for (const r of file.rows) if (!allow || allow.has(r.account_id)) out.push(r);
  }
  return out;
}

export function pruneMetaDays(site: string, now = new Date()): number {
  const cutoff = addDays(utcDate(now), -META_RETENTION_DAYS);
  let removed = 0;
  for (const d of listMetaDayDates(site)) {
    if (d >= cutoff) break;
    try {
      fs.unlinkSync(dayPath(site, d));
      removed++;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

export function isMetaStale(state: MetaAdsSyncState, now = Date.now()): boolean {
  const last = state.last_success_at ? Date.parse(state.last_success_at) : NaN;
  return !Number.isFinite(last) || now - last > META_STALE_MS;
}

/** Which dates a sync mode should (re)fetch. */
export function datesForMode(
  mode: MetaSyncMode,
  existing: string[],
  now = new Date(),
): { since: string; until: string } | null {
  const today = utcDate(now);
  const floor = addDays(today, -META_RETENTION_DAYS + 1);
  if (mode === "refresh" && existing.length > 0) {
    return { since: addDays(today, -(META_REFRESH_DAYS - 1)), until: today };
  }
  if (mode === "refresh" || mode === "backfill") {
    return { since: addDays(today, -(META_BACKFILL_DAYS - 1)), until: today };
  }
  const earliest = existing[0] ?? today;
  const until = addDays(earliest, -1);
  if (until < floor) return null;
  const since = addDays(earliest, -META_BACKFILL_DAYS);
  return { since: since < floor ? floor : since, until };
}

const inFlight = new Set<string>();

export function isMetaSyncInFlight(site: string): boolean {
  return inFlight.has(site);
}

export async function syncMetaAds(opts: {
  site: string;
  contentRoot?: string;
  mode?: MetaSyncMode;
  now?: Date;
}): Promise<MetaSyncResult> {
  const mode = opts.mode ?? "refresh";
  const settings = getAdsSettings(opts.contentRoot).meta;
  const base = { mode, dates: [] as string[], rows: 0 };
  if (!settings.enabled) return { ...base, ok: false, skipped: "not_enabled" };
  if (settings.ad_account_ids.length === 0) return { ...base, ok: false, skipped: "no_accounts" };
  if (!isMetaTokenConfigured()) return { ...base, ok: false, skipped: "no_token" };
  if (inFlight.has(opts.site)) return { ...base, ok: false, skipped: "in_progress" };

  inFlight.add(opts.site);
  const state = loadMetaState(opts.site);
  state.last_attempt_at = new Date().toISOString();
  try {
    const window = datesForMode(mode, listMetaDayDates(opts.site), opts.now);
    if (!window) {
      state.last_success_at = new Date().toISOString();
      state.consecutive_failures = 0;
      saveMetaState(opts.site, state);
      return { ...base, ok: true };
    }
    const byDate = new Map<string, MetaAdDayRow[]>();
    for (const d of dateRange(window.since, window.until)) byDate.set(d, []);

    const creatives = loadMetaCreatives(opts.site);
    for (const accountId of settings.ad_account_ids) {
      const info = await fetchAccountInfo(accountId);
      state.accounts[accountId] = { name: info.name, currency: info.currency, account_status: info.account_status };
      for (let start = window.since; start <= window.until; start = addDays(start, FETCH_CHUNK_DAYS)) {
        const endCandidate = addDays(start, FETCH_CHUNK_DAYS - 1);
        const end = endCandidate > window.until ? window.until : endCandidate;
        const rows = await fetchAdInsights(accountId, start, end, info.currency);
        for (const r of rows) byDate.get(r.date)?.push(r);
      }
      try {
        for (const c of await fetchAdCreatives(accountId)) creatives.ads[c.ad_id] = c;
      } catch (err) {
        log.warn({ err, accountId }, "[meta] creatives fetch failed (non-fatal)");
      }
    }

    const fetchedAt = new Date().toISOString();
    let total = 0;
    for (const [date, rows] of Array.from(byDate.entries())) {
      saveMetaDay(opts.site, { date, fetched_at: fetchedAt, rows });
      total += rows.length;
    }
    creatives.fetched_at = fetchedAt;
    writeJson(creativesPath(opts.site), creatives);
    pruneMetaDays(opts.site, opts.now);

    const dates = listMetaDayDates(opts.site);
    state.history_since = dates[0];
    state.last_success_at = fetchedAt;
    state.last_error = undefined;
    state.last_error_kind = undefined;
    state.consecutive_failures = 0;
    saveMetaState(opts.site, state);
    return { ...base, ok: true, dates: Array.from(byDate.keys()), rows: total };
  } catch (err) {
    const e = err as MetaApiError;
    state.last_error = e?.message || String(err);
    state.last_error_kind = e instanceof MetaApiError ? e.kind : "other";
    state.consecutive_failures = (state.consecutive_failures || 0) + 1;
    state.last_failure_at = new Date().toISOString();
    saveMetaState(opts.site, state);
    log.warn({ err, site: opts.site, mode }, "[meta] sync failed");
    return { ...base, ok: false, error: state.last_error };
  } finally {
    inFlight.delete(opts.site);
  }
}
