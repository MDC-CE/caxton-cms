/**
 * Google Ads day cache, filled from the BigQuery Data Transfer (read-only).
 *
 * Cache: `.cache/{site}/google-ads-days/{date}.json` (spend rows per customer),
 * `google-ads-network-days/{date}.json` (campaign × network), `google-ads-setups.json`
 * (campaigns, ad groups, ads, customers, conversion actions) and `google-ads-state.json`.
 *
 * Re-read rules: spend/clicks for the last 10 loaded days, conversions for the last 30,
 * plus any day whose BigQuery partition was reloaded after we cached it (backfills, repairs).
 * The transfer runs daily with a lag, so the newest 1–2 days aren't treated as gaps until overdue.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { getAdsSettings } from "../settings";
import { child } from "../logger";
import type { GoogleAdsSettings } from "@shared/ads-settings";
import { addDays, dateRange, utcDate, type SyncStepCallback } from "./meta-ads-days";
import {
  allocateLeads,
  buildGoogleDayRows,
  campaignStatsTable,
  clickStatsRef,
  googleBigQueryClient,
  makeLeadActionMatcher,
  missingTablesFor,
  probeTransferLayout,
  queryCustomerMeta,
  queryCustomerStats,
  queryPartitionLoads,
  type GoogleAdDayRow,
  type GoogleAdGroupInfo,
  type GoogleAdInfo,
  type GoogleCampaignInfo,
  type GoogleLogicalTable,
  type GoogleNetworkDayRow,
  type RawConversion,
} from "./google-ads-bq";

const log = child({ module: "ads/google-ads-days" });

export const GOOGLE_REFRESH_DAYS = 10;
export const GOOGLE_CONVERSION_REFRESH_DAYS = 30;
export const GOOGLE_BACKFILL_DAYS = 90;
export const GOOGLE_RETENTION_DAYS = 395;
export const GOOGLE_STALE_MS = 24 * 60 * 60 * 1000;
/** The transfer loads yesterday's data during the next day; days newer than this aren't gaps yet. */
export const GOOGLE_TRANSFER_LAG_DAYS = 2;

export const GOOGLE_DAYS_DIR = "google-ads-days";
export const GOOGLE_NETWORK_DAYS_DIR = "google-ads-network-days";
export const GOOGLE_STATE_FILE = "google-ads-state.json";
export const GOOGLE_SETUPS_FILE = "google-ads-setups.json";

export type GoogleCustomerDay<R> = { fetched_at: string; rows: R[] };
export type GoogleAdsDayFile = { date: string; customers: Record<string, GoogleCustomerDay<GoogleAdDayRow>> };
export type GoogleNetworkDayFile = { date: string; customers: Record<string, GoogleCustomerDay<GoogleNetworkDayRow>> };

export type GoogleConversionActionInfo = {
  customer_id: string;
  id: string | null;
  name: string;
  category: string | null;
  /** Conversions in the last 30 loaded days. */
  conversions_30d: number;
  counted_as_lead: boolean;
};

export type GoogleAdsSetups = {
  fetched_at: string;
  customers: Record<string, { name: string | null; currency: string | null; auto_tagging: boolean | null }>;
  campaigns: Record<string, GoogleCampaignInfo>;
  ad_groups: Record<string, GoogleAdGroupInfo>;
  ads: Record<string, GoogleAdInfo>;
  conversion_actions: GoogleConversionActionInfo[];
};

export type GoogleCustomerSyncInfo = {
  name?: string | null;
  currency?: string | null;
  auto_tagging?: boolean | null;
  /** Newest day the transfer has loaded for this customer. */
  data_through?: string | null;
  /** Oldest day the transfer has (≤ 400 days back). */
  first_date?: string | null;
  history_loaded_at?: string;
  history_since?: string;
  missing_tables?: GoogleLogicalTable[];
  sync_error?: string;
  /** ClickStats table for the GA4 gclid join (`project.dataset.table` + the join columns it has). */
  click_stats?: { table: string; columns: string[] } | null;
};

export type GoogleAdsSyncState = {
  last_attempt_at?: string;
  last_success_at?: string;
  last_error?: string;
  consecutive_failures: number;
  /** Newest day loaded across synced customers (min across customers = safe "data through"). */
  data_through?: string | null;
  customers: Record<string, GoogleCustomerSyncInfo>;
  /** Customers with transfer tables in the dataset (ticked or not). */
  available_customers?: string[];
  probed_at?: string;
  /** Downloaded from production (dev only). */
  pulled_from_production_at?: string;
};

// ── File helpers ───────────────────────────────────────────────────────────

function siteDir(site: string, sub: string): string {
  return path.join(CACHE_DIR, site, sub);
}

function readJson<T>(file: string): T | null {
  try {
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as T) : null;
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

function listDates(d: string): string[] {
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function listGoogleDayDates(site: string): string[] {
  return listDates(siteDir(site, GOOGLE_DAYS_DIR));
}

export function loadGoogleDay(site: string, date: string): GoogleAdsDayFile | null {
  const f = readJson<GoogleAdsDayFile>(path.join(siteDir(site, GOOGLE_DAYS_DIR), `${date}.json`));
  return f && f.date === date && f.customers && typeof f.customers === "object" ? f : null;
}

function loadNetworkDay(site: string, date: string): GoogleNetworkDayFile | null {
  const f = readJson<GoogleNetworkDayFile>(path.join(siteDir(site, GOOGLE_NETWORK_DAYS_DIR), `${date}.json`));
  return f && f.date === date && f.customers && typeof f.customers === "object" ? f : null;
}

export function loadGoogleState(site: string): GoogleAdsSyncState {
  return readJson<GoogleAdsSyncState>(path.join(CACHE_DIR, site, GOOGLE_STATE_FILE)) ?? { consecutive_failures: 0, customers: {} };
}

function saveGoogleState(site: string, state: GoogleAdsSyncState): void {
  writeJson(path.join(CACHE_DIR, site, GOOGLE_STATE_FILE), state);
}

export function loadGoogleSetups(site: string): GoogleAdsSetups {
  return (
    readJson<GoogleAdsSetups>(path.join(CACHE_DIR, site, GOOGLE_SETUPS_FILE)) ?? {
      fetched_at: "",
      customers: {},
      campaigns: {},
      ad_groups: {},
      ads: {},
      conversion_actions: [],
    }
  );
}

function pick<R>(file: { customers: Record<string, GoogleCustomerDay<R>> } | null, allow: Set<string> | null): R[] {
  if (!file) return [];
  const out: R[] = [];
  for (const [cid, day] of Object.entries(file.customers)) {
    if (allow && !allow.has(cid)) continue;
    out.push(...(day.rows ?? []));
  }
  return out;
}

export function loadGoogleRows(site: string, since: string, until: string, customerIds?: string[]): GoogleAdDayRow[] {
  const allow = customerIds && customerIds.length > 0 ? new Set(customerIds) : null;
  const out: GoogleAdDayRow[] = [];
  for (const d of listGoogleDayDates(site)) {
    if (d < since || d > until) continue;
    out.push(...pick(loadGoogleDay(site, d), allow));
  }
  return out;
}

export function loadGoogleNetworkRows(site: string, since: string, until: string, customerIds?: string[]): GoogleNetworkDayRow[] {
  const allow = customerIds && customerIds.length > 0 ? new Set(customerIds) : null;
  const out: GoogleNetworkDayRow[] = [];
  for (const d of listDates(siteDir(site, GOOGLE_NETWORK_DAYS_DIR))) {
    if (d < since || d > until) continue;
    out.push(...pick(loadNetworkDay(site, d), allow));
  }
  return out;
}

// ── Connection helpers ─────────────────────────────────────────────────────

export function isGoogleConfiguredSettings(g: GoogleAdsSettings | undefined): boolean {
  return !!g && g.enabled && g.customer_ids.length > 0 && !!g.bigquery?.project && !!g.bigquery?.dataset;
}

/** A sync can run: enabled, accounts ticked, transfer dataset set. */
export function isGoogleConnected(contentRoot?: string): boolean {
  return isGoogleConfiguredSettings(getAdsSettings(contentRoot).google);
}

/** Reports may read Google rows: connected, or a production download with day files. */
export function hasGoogleData(site: string, contentRoot?: string): boolean {
  const g = getAdsSettings(contentRoot).google;
  if (!g?.enabled || g.customer_ids.length === 0) return false;
  if (isGoogleConfiguredSettings(g)) return true;
  return !!loadGoogleState(site).pulled_from_production_at && listGoogleDayDates(site).length > 0;
}

export function isGoogleStale(state: GoogleAdsSyncState, now = Date.now()): boolean {
  const last = state.last_success_at ? Date.parse(state.last_success_at) : NaN;
  return !Number.isFinite(last) || now - last > GOOGLE_STALE_MS;
}

/** Latest date whose data is overdue: anything after it (up to yesterday) is still expected from the transfer. */
export function googleExpectedThrough(now = new Date()): string {
  return addDays(utcDate(now), -(GOOGLE_TRANSFER_LAG_DAYS + 1));
}

/** Oldest `data_through` across the given customers (null when any has none yet). */
export function googleDataThrough(state: GoogleAdsSyncState, customerIds: string[]): string | null {
  let min: string | null = null;
  for (const id of customerIds) {
    const d = state.customers[id]?.data_through;
    if (!d) return null;
    if (!min || d < min) min = d;
  }
  return min;
}

// ── Sync planning (pure) ──────────────────────────────────────────────────

export type GooglePlan = { full: string[]; conversionsOnly: string[] };

/**
 * Days to read for one customer. `cachedAt(date)` = when we cached that day (null = missing);
 * `loads` = BigQuery partition last-modified per day.
 */
export function planGoogleDates(opts: {
  dataThrough: string | null;
  firstDate: string | null;
  historyLoaded: boolean;
  cachedAt: (date: string) => string | null;
  loads: Map<string, string>;
  now?: Date;
}): GooglePlan {
  if (!opts.dataThrough) return { full: [], conversionsOnly: [] };
  const through = opts.dataThrough;
  const floor = addDays(utcDate(opts.now ?? new Date()), -GOOGLE_RETENTION_DAYS);
  let since = addDays(through, -(GOOGLE_BACKFILL_DAYS - 1));
  if (opts.firstDate && opts.firstDate > since) since = opts.firstDate;
  if (since < floor) since = floor;
  const window = since <= through ? dateRange(since, through) : [];
  const full = new Set<string>();
  const refreshFrom = addDays(through, -(GOOGLE_REFRESH_DAYS - 1));
  const convFrom = addDays(through, -(GOOGLE_CONVERSION_REFRESH_DAYS - 1));
  for (const d of window) {
    const cached = opts.cachedAt(d);
    if (!opts.historyLoaded || !cached || d >= refreshFrom) {
      full.add(d);
      continue;
    }
    const load = opts.loads.get(d);
    if (load && load > cached) full.add(d);
  }
  const conversionsOnly = window.filter((d) => d >= convFrom && !full.has(d) && !!opts.cachedAt(d));
  return { full: Array.from(full).sort(), conversionsOnly };
}

/** Steps a sync would report (one per ticked customer, plus the probe). */
export function planGoogleSyncSteps(contentRoot?: string): number {
  const g = getAdsSettings(contentRoot).google;
  return g && isGoogleConfiguredSettings(g) ? g.customer_ids.length + 1 : 0;
}

// ── Sync ──────────────────────────────────────────────────────────────────

export type GoogleSyncResult = {
  ok: boolean;
  skipped?: "google_not_connected";
  error?: string;
  customers: Record<string, { full_days: number; conversion_days: number; error?: string }>;
};

const inFlight = new Set<string>();

export function isGoogleSyncInFlight(site: string): boolean {
  return inFlight.has(site);
}

function writeCustomerDay<R>(dirPath: string, date: string, cid: string, rows: R[], fetchedAt: string): void {
  const file = path.join(dirPath, `${date}.json`);
  const existing = readJson<{ date: string; customers: Record<string, GoogleCustomerDay<R>> }>(file);
  const customers = existing?.date === date && existing.customers ? existing.customers : {};
  customers[cid] = { fetched_at: fetchedAt, rows };
  writeJson(file, { date, customers });
}

function pruneOld(site: string, now: Date): void {
  const floor = addDays(utcDate(now), -GOOGLE_RETENTION_DAYS);
  for (const sub of [GOOGLE_DAYS_DIR, GOOGLE_NETWORK_DAYS_DIR]) {
    const d = siteDir(site, sub);
    for (const date of listDates(d)) {
      if (date >= floor) break;
      try {
        fs.unlinkSync(path.join(d, `${date}.json`));
      } catch {
        /* ignore */
      }
    }
  }
}

function summarizeActions(cid: string, conversions: RawConversion[], isLead: (c: RawConversion) => boolean): GoogleConversionActionInfo[] {
  const by = new Map<string, GoogleConversionActionInfo>();
  for (const c of conversions) {
    const name = c.action_name ?? c.action_id ?? "(unnamed)";
    const k = `${c.action_id ?? ""}|${name}`;
    const cur = by.get(k) ?? { customer_id: cid, id: c.action_id, name, category: c.category, conversions_30d: 0, counted_as_lead: isLead(c) };
    cur.conversions_30d = Math.round((cur.conversions_30d + c.conversions) * 1000) / 1000;
    by.set(k, cur);
  }
  return Array.from(by.values()).sort((a, b) => b.conversions_30d - a.conversions_30d);
}

export async function syncGoogleAds(opts: { site: string; contentRoot?: string; now?: Date; onStep?: SyncStepCallback }): Promise<GoogleSyncResult> {
  const settings = getAdsSettings(opts.contentRoot).google;
  if (!settings || !isGoogleConfiguredSettings(settings)) return { ok: false, skipped: "google_not_connected", customers: {} };
  if (inFlight.has(opts.site)) return { ok: true, customers: {} };
  inFlight.add(opts.site);
  const now = opts.now ?? new Date();
  const state = loadGoogleState(opts.site);
  state.last_attempt_at = now.toISOString();
  const result: GoogleSyncResult = { ok: true, customers: {} };
  const project = settings.bigquery.project!;
  const dataset = settings.bigquery.dataset!;
  const setups = loadGoogleSetups(opts.site);
  const isLead = makeLeadActionMatcher(settings.lead_conversion_actions);
  try {
    opts.onStep?.("Google Ads: reading the BigQuery transfer");
    const client = googleBigQueryClient(project);
    const layout = await probeTransferLayout(client, project, dataset);
    state.available_customers = Object.keys(layout.customers).sort();
    state.probed_at = new Date().toISOString();
    const actions: GoogleConversionActionInfo[] = setups.conversion_actions.filter((a) => !settings.customer_ids.includes(a.customer_id));

    for (let i = 0; i < settings.customer_ids.length; i++) {
      const cid = settings.customer_ids[i]!;
      opts.onStep?.(`Google Ads: account ${i + 1} of ${settings.customer_ids.length}`);
      const info: GoogleCustomerSyncInfo = { ...(state.customers[cid] ?? {}) };
      const tables = layout.customers[cid];
      if (!tables || !campaignStatsTable(tables)) {
        info.sync_error = "The BigQuery transfer has no tables for this account yet. Add it to the transfer in Google Cloud, or wait for the first load.";
        info.missing_tables = tables ? missingTablesFor(tables) : ["CampaignBasicStats"];
        state.customers[cid] = info;
        result.customers[cid] = { full_days: 0, conversion_days: 0, error: info.sync_error };
        continue;
      }
      try {
        const meta = await queryCustomerMeta(client, layout, cid);
        info.name = meta.customer.name;
        info.currency = meta.customer.currency;
        info.auto_tagging = meta.customer.auto_tagging;
        info.data_through = meta.bounds.max_date;
        info.first_date = meta.bounds.min_date;
        info.missing_tables = missingTablesFor(tables);
        info.click_stats = clickStatsRef(project, dataset, tables);
        const currency = meta.customer.currency ?? "USD";

        const daysDir = siteDir(opts.site, GOOGLE_DAYS_DIR);
        const netDir = siteDir(opts.site, GOOGLE_NETWORK_DAYS_DIR);
        const through = meta.bounds.max_date;
        const loads = through ? await queryPartitionLoads(client, layout, cid, addDays(through, -(GOOGLE_BACKFILL_DAYS - 1))) : new Map<string, string>();
        const plan = planGoogleDates({
          dataThrough: through,
          firstDate: meta.bounds.min_date,
          historyLoaded: !!info.history_loaded_at,
          cachedAt: (d) => loadGoogleDay(opts.site, d)?.customers[cid]?.fetched_at ?? null,
          loads,
          now,
        });
        const statDates = plan.full;
        const convDates = [...plan.full, ...plan.conversionsOnly].sort();
        const fetchedAt = new Date().toISOString();
        let convForCatalog: RawConversion[] = [];
        if (statDates.length > 0 || convDates.length > 0) {
          const range = statDates.length > 0 ? { since: statDates[0]!, until: statDates.at(-1)! } : { since: convDates[0]!, until: convDates[0]! };
          const convRange = convDates.length > 0 ? { since: convDates[0]!, until: convDates.at(-1)! } : null;
          const raw = await queryCustomerStats(client, layout, cid, range, convRange);
          convForCatalog = raw.conversions;
          const { rows, networkRows } = buildGoogleDayRows({
            customer_id: cid,
            currency,
            campaignStats: raw.campaignStats,
            landingStats: raw.landingStats,
            conversions: raw.conversions,
            campaigns: meta.campaigns,
            adGroups: meta.adGroups,
            isLead,
            dates: new Set(statDates),
          });
          const rowsByDate = new Map<string, GoogleAdDayRow[]>();
          for (const r of rows) (rowsByDate.get(r.date) ?? rowsByDate.set(r.date, []).get(r.date)!).push(r);
          const netByDate = new Map<string, GoogleNetworkDayRow[]>();
          for (const r of networkRows) (netByDate.get(r.date) ?? netByDate.set(r.date, []).get(r.date)!).push(r);
          for (const d of statDates) {
            writeCustomerDay(daysDir, d, cid, rowsByDate.get(d) ?? [], fetchedAt);
            writeCustomerDay(netDir, d, cid, netByDate.get(d) ?? [], fetchedAt);
          }
          // Conversions-only days: re-spread the new lead totals over the cached rows.
          const leadsByCampDay = new Map<string, number>();
          for (const c of raw.conversions) {
            if (!isLead(c)) continue;
            const k = `${c.date}|${c.campaign_id}`;
            leadsByCampDay.set(k, (leadsByCampDay.get(k) ?? 0) + c.conversions);
          }
          for (const d of plan.conversionsOnly) {
            const cached = loadGoogleDay(opts.site, d)?.customers[cid];
            if (!cached) continue;
            const byCamp = new Map<string, GoogleAdDayRow[]>();
            for (const r of cached.rows) (byCamp.get(r.campaign_id) ?? byCamp.set(r.campaign_id, []).get(r.campaign_id)!).push(r);
            for (const [camp, campRows] of Array.from(byCamp.entries())) allocateLeads(campRows, leadsByCampDay.get(`${d}|${camp}`) ?? 0);
            writeCustomerDay(daysDir, d, cid, cached.rows, cached.fetched_at);
          }
        }
        if (!info.history_loaded_at && through) {
          info.history_loaded_at = fetchedAt;
          info.history_since = statDates[0] ?? through;
        }
        info.sync_error = undefined;
        state.customers[cid] = info;
        for (const [id, c] of Object.entries(meta.campaigns)) setups.campaigns[id] = c;
        for (const [id, g] of Object.entries(meta.adGroups)) setups.ad_groups[id] = g;
        for (const [id, a] of Object.entries(setups.ads)) if (a.customer_id === cid) delete setups.ads[id];
        for (const [id, a] of Object.entries(meta.ads)) setups.ads[id] = a;
        setups.customers[cid] = meta.customer;
        const recentFrom = through ? addDays(through, -(GOOGLE_CONVERSION_REFRESH_DAYS - 1)) : "";
        actions.push(...summarizeActions(cid, convForCatalog.filter((c) => c.date >= recentFrom), isLead));
        result.customers[cid] = { full_days: plan.full.length, conversion_days: plan.conversionsOnly.length };
      } catch (err) {
        info.sync_error = err instanceof Error ? err.message : String(err);
        state.customers[cid] = info;
        result.customers[cid] = { full_days: 0, conversion_days: 0, error: info.sync_error };
        log.warn({ err, site: opts.site, customer: cid }, "[google-ads] customer sync failed");
      }
    }
    setups.fetched_at = new Date().toISOString();
    setups.conversion_actions = actions;
    writeJson(path.join(CACHE_DIR, opts.site, GOOGLE_SETUPS_FILE), setups);
    pruneOld(opts.site, now);

    const synced = settings.customer_ids.filter((id) => !state.customers[id]?.sync_error);
    state.data_through = googleDataThrough(state, synced);
    const allFailed = synced.length === 0;
    if (allFailed) {
      const first = settings.customer_ids.map((id) => state.customers[id]?.sync_error).find(Boolean);
      state.last_error = first ?? "No Google Ads account could be read.";
      state.consecutive_failures = (state.consecutive_failures || 0) + 1;
      result.ok = false;
      result.error = state.last_error;
    } else {
      state.last_success_at = new Date().toISOString();
      state.last_error = undefined;
      state.consecutive_failures = 0;
    }
    saveGoogleState(opts.site, state);
    return result;
  } catch (err) {
    state.last_error = err instanceof Error ? err.message : String(err);
    state.consecutive_failures = (state.consecutive_failures || 0) + 1;
    saveGoogleState(opts.site, state);
    log.warn({ err, site: opts.site }, "[google-ads] sync failed");
    return { ok: false, error: state.last_error, customers: result.customers };
  } finally {
    inFlight.delete(opts.site);
  }
}
