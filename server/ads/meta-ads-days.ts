/**
 * Per-day Meta ad insights cache on persistent `.cache/{site}/meta-ads-days/`.
 * Refresh re-fetches the last 10 days (7-day click attribution + processing),
 * first connect backfills 90 days, retention is 13 months. Per-placement rows
 * (Facebook / Instagram / …) live apart in `meta-ads-platform-days/` so main totals never change.
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
  fetchAdPlatformInsights,
  isMetaTokenConfigured,
  MetaApiError,
  type MetaAccountInfo,
  type MetaAdCreativeInfo,
  type MetaAdDayRow,
  type MetaAdPlatformDayRow,
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

export type MetaAdsPlatformDayFile = {
  date: string;
  fetched_at: string;
  rows: MetaAdPlatformDayRow[];
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
  accounts: Record<string, MetaAccountSyncInfo>;
};

export type MetaAccountSyncInfo = Pick<MetaAccountInfo, "name" | "currency" | "account_status"> & {
  error?: string;
  /** Last time this account's ad setups (links, URL parameters, status) were read successfully. */
  setup_read_at?: string;
  /** Why the last ad-setup read failed; cleared on the next success. */
  setup_error?: string;
  /** Set when a full 90-day load finished for this account; missing means the next refresh backfills. */
  history_loaded_at?: string;
  /** Why this account was skipped in the last sync (other accounts still saved); cleared on success. */
  sync_error?: string;
  /** Set when a 90-day per-placement load finished; missing means the next sync reads 90 days of placements. */
  platform_history_loaded_at?: string;
  /** Earliest date with per-placement rows for this account. */
  platform_history_since?: string;
  /** Why the last per-placement read failed (main rows still saved); cleared on success. */
  platform_error?: string;
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

function platformDir(site: string): string {
  return path.join(CACHE_DIR, site, "meta-ads-platform-days");
}

function platformDayPath(site: string, date: string): string {
  return path.join(platformDir(site), `${date}.json`);
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
  return listDates(dir(site));
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

function listDates(d: string): string[] {
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function listMetaPlatformDayDates(site: string): string[] {
  return listDates(platformDir(site));
}

export function loadMetaPlatformDay(site: string, date: string): MetaAdsPlatformDayFile | null {
  const f = readJson<MetaAdsPlatformDayFile>(platformDayPath(site, date));
  return f && f.date === date && Array.isArray(f.rows) ? f : null;
}

/** Per-placement rows for configured accounts only, inclusive window. */
export function loadMetaPlatformRows(site: string, since: string, until: string, accountIds?: string[]): MetaAdPlatformDayRow[] {
  const allow = accountIds && accountIds.length > 0 ? new Set(accountIds) : null;
  const out: MetaAdPlatformDayRow[] = [];
  for (const date of listMetaPlatformDayDates(site)) {
    if (date < since || date > until) continue;
    const file = loadMetaPlatformDay(site, date);
    if (!file) continue;
    for (const r of file.rows) if (!allow || allow.has(r.account_id)) out.push(r);
  }
  return out;
}

export function pruneMetaDays(site: string, now = new Date()): number {
  const cutoff = addDays(utcDate(now), -META_RETENTION_DAYS);
  let removed = 0;
  for (const [dates, file] of [
    [listMetaDayDates(site), (d: string) => dayPath(site, d)],
    [listMetaPlatformDayDates(site), (d: string) => platformDayPath(site, d)],
  ] as const) {
    for (const d of dates) {
      if (d >= cutoff) break;
      try {
        fs.unlinkSync(file(d));
        removed++;
      } catch {
        /* ignore */
      }
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

/** Called as each sync step starts, with a plain-English label for staff. */
export type SyncStepCallback = (label: string) => void;

function fetchChunkCount(window: { since: string; until: string }): number {
  return Math.ceil(dateRange(window.since, window.until).length / FETCH_CHUNK_DAYS);
}

/** Inclusive [start, end] pairs of up to FETCH_CHUNK_DAYS days. */
function chunks(window: { since: string; until: string }): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let start = window.since; start <= window.until; start = addDays(start, FETCH_CHUNK_DAYS)) {
    const endCandidate = addDays(start, FETCH_CHUNK_DAYS - 1);
    out.push([start, endCandidate > window.until ? window.until : endCandidate]);
  }
  return out;
}

/**
 * Rewrite placement day files touched by this sync. Accounts not re-read for a date
 * (placement read failed, account skipped, date outside its window) keep their saved rows.
 */
function savePlatformDays(
  site: string,
  read: Map<string, { window: { since: string; until: string }; rows: MetaAdPlatformDayRow[] }>,
  accountIds: string[],
  fetchedAt: string,
): void {
  const byDate = new Map<string, MetaAdPlatformDayRow[]>();
  for (const { window: w, rows } of Array.from(read.values())) {
    for (const d of dateRange(w.since, w.until)) if (!byDate.has(d)) byDate.set(d, []);
    for (const r of rows) byDate.get(r.date)?.push(r);
  }
  const configured = new Set(accountIds);
  for (const [date, fresh] of Array.from(byDate.entries())) {
    const kept = (loadMetaPlatformDay(site, date)?.rows ?? []).filter((r) => {
      if (!configured.has(r.account_id)) return false;
      const w = read.get(r.account_id)?.window;
      return !w || date < w.since || date > w.until;
    });
    writeJson(platformDayPath(site, date), { date, fetched_at: fetchedAt, rows: [...kept, ...fresh] });
  }
}

type DateWindow = { since: string; until: string };

/**
 * Steps `syncMetaAds` will report: per account (lookup + insight chunks + placement chunks + creatives),
 * then one save. `platformWindows` defaults to the main window for every account.
 */
export function metaSyncStepCount(accountCount: number, window: DateWindow | null, platformWindows?: DateWindow[]): number {
  if (!window || accountCount <= 0) return 0;
  const platformChunks = (platformWindows ?? Array.from({ length: accountCount }, () => window)).reduce((n, w) => n + fetchChunkCount(w), 0);
  return accountCount * (fetchChunkCount(window) + 2) + platformChunks + 1;
}

/** Placement read window: the main window, widened to 90 days until the account has a full placement history. */
export function platformWindowFor(
  mode: MetaSyncMode,
  window: DateWindow,
  account: MetaAccountSyncInfo | undefined,
  now = new Date(),
): DateWindow {
  if (mode === "older" || account?.platform_history_loaded_at) return window;
  const since = addDays(utcDate(now), -(META_BACKFILL_DAYS - 1));
  return { since: since < window.since ? since : window.since, until: window.until };
}

/** A refresh becomes a 90-day backfill while any configured account has never finished one. */
export function effectiveMetaSyncMode(mode: MetaSyncMode, accountIds: string[], state: MetaAdsSyncState): MetaSyncMode {
  if (mode !== "refresh") return mode;
  return accountIds.some((id) => !state.accounts[id]?.history_loaded_at) ? "backfill" : mode;
}

/** Step total for a sync that would start now; 0 when it would skip or has nothing to fetch. */
export function planMetaSyncSteps(site: string, contentRoot: string | undefined, mode: MetaSyncMode = "refresh", now?: Date): number {
  const settings = getAdsSettings(contentRoot).meta;
  if (!settings.enabled || settings.ad_account_ids.length === 0 || !isMetaTokenConfigured()) return 0;
  const state = loadMetaState(site);
  const effective = effectiveMetaSyncMode(mode, settings.ad_account_ids, state);
  const window = datesForMode(effective, listMetaDayDates(site), now);
  if (!window) return 0;
  const platformWindows = settings.ad_account_ids.map((id) => platformWindowFor(effective, window, state.accounts[id], now));
  return metaSyncStepCount(settings.ad_account_ids.length, window, platformWindows);
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_ONLY = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });

/** "Jun 1–15", or "May 28 – Jun 11" across months. */
export function shortDateRange(since: string, until: string): string {
  const a = new Date(`${since}T00:00:00.000Z`);
  const b = new Date(`${until}T00:00:00.000Z`);
  if (since === until) return MONTH_DAY.format(a);
  if (since.slice(0, 7) === until.slice(0, 7)) return `${MONTH_DAY.format(a)}–${DAY_ONLY.format(b)}`;
  return `${MONTH_DAY.format(a)} – ${MONTH_DAY.format(b)}`;
}

export async function syncMetaAds(opts: {
  site: string;
  contentRoot?: string;
  mode?: MetaSyncMode;
  now?: Date;
  onStep?: SyncStepCallback;
}): Promise<MetaSyncResult> {
  const requestedMode = opts.mode ?? "refresh";
  const settings = getAdsSettings(opts.contentRoot).meta;
  const base = { mode: requestedMode, dates: [] as string[], rows: 0 };
  if (!settings.enabled) return { ...base, ok: false, skipped: "not_enabled" };
  if (settings.ad_account_ids.length === 0) return { ...base, ok: false, skipped: "no_accounts" };
  if (!isMetaTokenConfigured()) return { ...base, ok: false, skipped: "no_token" };
  if (inFlight.has(opts.site)) return { ...base, ok: false, skipped: "in_progress" };

  inFlight.add(opts.site);
  const state = loadMetaState(opts.site);
  state.last_attempt_at = new Date().toISOString();
  for (const id of Object.keys(state.accounts)) {
    if (!settings.ad_account_ids.includes(id)) delete state.accounts[id];
  }
  const mode = effectiveMetaSyncMode(requestedMode, settings.ad_account_ids, state);
  base.mode = mode;
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
    const loadsFullHistory = mode !== "older" && byDate.size >= META_BACKFILL_DAYS;

    const creatives = loadMetaCreatives(opts.site);
    const accountCount = settings.ad_account_ids.length;
    const failed = new Map<string, unknown>();
    const platformRead = new Map<string, { window: DateWindow; rows: MetaAdPlatformDayRow[] }>();
    for (let i = 0; i < accountCount; i++) {
      const accountId = settings.ad_account_ids[i];
      const account = `account ${i + 1} of ${accountCount}`;
      const prev = state.accounts[accountId];
      opts.onStep?.(`Meta: looking up ${account}`);
      const fetched: MetaAdDayRow[] = [];
      let currency = "";
      try {
        const info = await fetchAccountInfo(accountId);
        currency = info.currency;
        state.accounts[accountId] = {
          name: info.name,
          currency: info.currency,
          account_status: info.account_status,
          setup_read_at: prev?.setup_read_at,
          setup_error: prev?.setup_error,
          history_loaded_at: prev?.history_loaded_at,
          platform_history_loaded_at: prev?.platform_history_loaded_at,
          platform_history_since: prev?.platform_history_since,
          platform_error: prev?.platform_error,
        };
        for (const [start, end] of chunks(window)) {
          opts.onStep?.(`Meta: ${account}, ${shortDateRange(start, end)}`);
          fetched.push(...(await fetchAdInsights(accountId, start, end, info.currency)));
        }
      } catch (err) {
        failed.set(accountId, err);
        state.accounts[accountId] = {
          ...(prev ?? { name: "", currency: "", account_status: 0 }),
          sync_error: err instanceof Error ? err.message : String(err),
        };
        log.warn({ err, accountId }, "[meta] account skipped; other accounts still sync");
        continue;
      }
      for (const r of fetched) byDate.get(r.date)?.push(r);
      const pWindow = platformWindowFor(mode, window, prev, opts.now);
      try {
        const rows: MetaAdPlatformDayRow[] = [];
        for (const [start, end] of chunks(pWindow)) {
          opts.onStep?.(`Meta: ${account}, platforms ${shortDateRange(start, end)}`);
          rows.push(...(await fetchAdPlatformInsights(accountId, start, end, currency)));
        }
        platformRead.set(accountId, { window: pWindow, rows });
        state.accounts[accountId].platform_error = undefined;
      } catch (err) {
        state.accounts[accountId].platform_error = err instanceof Error ? err.message : String(err);
        log.warn({ err, accountId }, "[meta] per-placement read failed (non-fatal)");
      }
      opts.onStep?.(`Meta: ${account}, ad creatives`);
      try {
        for (const c of await fetchAdCreatives(accountId)) creatives.ads[c.ad_id] = { ...c, account_id: accountId };
        state.accounts[accountId].setup_read_at = new Date().toISOString();
        state.accounts[accountId].setup_error = undefined;
      } catch (err) {
        state.accounts[accountId].setup_error = err instanceof Error ? err.message : String(err);
        log.warn({ err, accountId }, "[meta] creatives fetch failed (non-fatal)");
      }
    }

    if (failed.size === accountCount) throw failed.values().next().value;

    opts.onStep?.("Meta: saving synced days");
    const fetchedAt = new Date().toISOString();
    let total = 0;
    for (const [date, rows] of Array.from(byDate.entries())) {
      // Day files are rewritten whole, so keep what skipped accounts had saved before.
      if (failed.size > 0) {
        for (const r of loadMetaDay(opts.site, date)?.rows ?? []) if (failed.has(r.account_id)) rows.push(r);
      }
      saveMetaDay(opts.site, { date, fetched_at: fetchedAt, rows });
      total += rows.length;
    }
    savePlatformDays(opts.site, platformRead, settings.ad_account_ids, fetchedAt);
    for (const [id, { window: w }] of Array.from(platformRead.entries())) {
      const acct = state.accounts[id];
      if (!acct.platform_history_since || w.since < acct.platform_history_since) acct.platform_history_since = w.since;
      if (mode !== "older" && dateRange(w.since, w.until).length >= META_BACKFILL_DAYS) acct.platform_history_loaded_at = fetchedAt;
    }
    if (settings.ad_account_ids.every((id) => !state.accounts[id]?.setup_error && !state.accounts[id]?.sync_error)) {
      creatives.fetched_at = fetchedAt;
    }
    writeJson(creativesPath(opts.site), creatives);
    pruneMetaDays(opts.site, opts.now);

    for (const id of settings.ad_account_ids) {
      if (failed.has(id)) continue;
      state.accounts[id].sync_error = undefined;
      if (loadsFullHistory) state.accounts[id].history_loaded_at = fetchedAt;
    }
    const dates = listMetaDayDates(opts.site);
    state.history_since = dates[0];
    state.last_success_at = fetchedAt;
    if (failed.size > 0) {
      const first = failed.values().next().value;
      state.last_error = `Skipped ${failed.size} of ${accountCount} account(s): ${Array.from(failed.keys()).join(", ")} (${first instanceof Error ? first.message : String(first)})`;
      state.last_error_kind = first instanceof MetaApiError ? first.kind : "other";
    } else {
      state.last_error = undefined;
      state.last_error_kind = undefined;
    }
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
