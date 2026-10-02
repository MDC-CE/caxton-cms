/**
 * Dirty-day Ads rollups + saved report windows.
 *
 * Rollups: `.cache/{site}/ads-daily-rollups/{date}.json` — one file per day, ad-level metrics
 * and ids only (spend, clicks, impressions, landing page views, platform leads, GA4 tagged
 * sessions). Names and landing URLs are never stored here; they come from the setup catalog
 * (`ads-setup/{platform}.json`) at display time. Written after a Sync for the days it rewrote.
 * Diagnostics read them for post-fix verification (`sumRollupsSince`).
 *
 * Report windows: `.cache/{site}/ads-report-windows/` — the Paid pages report for the default
 * 7/28/90-day views (per platform), assembled after each Sync and stamped with the rollup
 * generation. Reads serve the saved window; filtered views are assembled once per generation.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { getAdsSettings } from "../settings";
import { child } from "../logger";
import type { AdPlatform } from "@shared/paid-traffic";
import type { AttributionModel } from "@shared/paid-attribution";
import { addDays, dateRange, utcDate } from "./meta-ads-days";
import { loadPaidLandingDays } from "./paid-detection";
import { metaProvider } from "./providers/meta";
import { googleProvider } from "./providers/google";
import type { AdSpendDayRow, AdsProvider } from "./providers/types";
import { getAdsRefreshStatus, triggerAdsRefreshIfStale } from "./ads-refresh";
import { loadAdsSetup } from "./ads-setup";
import { adChangeoverDays } from "./ad-url-history";

const log = child({ module: "ads/ads-rollups" });

export const ADS_ROLLUPS_DIR = "ads-daily-rollups";
export const ADS_REPORT_WINDOWS_DIR = "ads-report-windows";
/** Rollup days kept: the 90-day report max plus room for post-fix verification windows. */
export const ADS_ROLLUP_RETENTION_DAYS = 150;
export const ADS_ROLLUP_BACKFILL_DAYS = 90;
export const ADS_REPORT_WINDOW_DAYS = [7, 28, 90] as const;
/**
 * Bump when the report's shape or attribution changes: it is part of the saved-window settings hash,
 * so the 7/28/90 windows and in-memory variants rebuild on the next read.
 * 2 = per-campaign metrics on page rows.
 * 3 = Meta spend follows each ad's URL history (page per day, changeover days split).
 */
export const ADS_ATTRIBUTION_VERSION = 3;
const STATE_FILE = "_state.json";

export type RollupPlatform = "meta" | "google";

export type AdsRollupRow = {
  platform: RollupPlatform;
  account_id: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  currency: string;
  spend: number;
  clicks: number;
  impressions: number;
  landing_page_views: number;
  /** Platform-reported leads (pixel / Google conversions + Instant Form leads). */
  leads: number;
  /** GA4 paid sessions tagged with this ad id (complete GA4 days only). */
  sessions: number;
};

export type AdsRollupDay = {
  date: string;
  built_at: string;
  /** Platforms whose day files existed when this day was built. */
  platforms: RollupPlatform[];
  /** GA4 had a complete export for this day. */
  ga4_complete: boolean;
  rows: AdsRollupRow[];
};

export type AdsRollupState = {
  /** Bumped every time any rollup day is rewritten; report windows are stamped with it. */
  generation: number;
  built_at: string | null;
  /** First time report windows were rebuilt with URL history (past numbers recomputed); drives the staff notice. */
  url_history_enabled_at?: string;
};

const PROVIDERS: Record<RollupPlatform, AdsProvider> = { meta: metaProvider, google: googleProvider };

function rollupDir(site: string): string {
  return path.join(CACHE_DIR, site, ADS_ROLLUPS_DIR);
}

function windowsDir(site: string): string {
  return path.join(CACHE_DIR, site, ADS_REPORT_WINDOWS_DIR);
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

export function loadRollupState(site: string): AdsRollupState {
  return readJson<AdsRollupState>(path.join(rollupDir(site), STATE_FILE)) ?? { generation: 0, built_at: null };
}

function saveRollupState(site: string, state: AdsRollupState): void {
  writeJson(path.join(rollupDir(site), STATE_FILE), state);
}

export function listRollupDates(site: string): string[] {
  const d = rollupDir(site);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function loadRollupDay(site: string, date: string): AdsRollupDay | null {
  const f = readJson<AdsRollupDay>(path.join(rollupDir(site), `${date}.json`));
  return f && f.date === date && Array.isArray(f.rows) ? f : null;
}

function rowKey(r: Pick<AdsRollupRow, "platform" | "ad_id" | "adset_id" | "campaign_id" | "account_id" | "currency">): string {
  return `${r.platform}|${r.account_id}|${r.campaign_id}|${r.adset_id}|${r.ad_id}|${r.currency}`;
}

/** Sum one day's spend rows into ad-level rollup rows (ids + metrics only). */
export function rollupRowsFromSpend(
  platform: RollupPlatform,
  rows: AdSpendDayRow[],
  sessionsByAd: Map<string, number>,
): AdsRollupRow[] {
  const out = new Map<string, AdsRollupRow>();
  for (const r of rows) {
    const base = {
      platform,
      account_id: r.account_id,
      campaign_id: r.campaign_id,
      adset_id: r.adset_id ?? "",
      ad_id: r.ad_id ?? "",
      currency: r.currency,
    };
    const k = rowKey(base);
    const cur =
      out.get(k) ??
      ({ ...base, spend: 0, clicks: 0, impressions: 0, landing_page_views: 0, leads: 0, sessions: 0 } satisfies AdsRollupRow);
    cur.spend += r.spend;
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    cur.landing_page_views += r.landing_page_views;
    cur.leads += r.platform_leads + r.form_leads;
    out.set(k, cur);
  }
  // Sessions are per ad id; attach them once (first row for that ad).
  const attached = new Set<string>();
  for (const row of Array.from(out.values())) {
    row.spend = Math.round(row.spend * 100) / 100;
    if (!row.ad_id || attached.has(row.ad_id)) continue;
    const s = sessionsByAd.get(row.ad_id);
    if (s) {
      row.sessions = s;
      attached.add(row.ad_id);
    }
  }
  return Array.from(out.values());
}

export function buildRollupDay(site: string, date: string, contentRoot?: string, now = new Date()): AdsRollupDay {
  const settings = getAdsSettings(contentRoot);
  const ga4Day = loadPaidLandingDays(site, date, date)[0];
  const sessionsByAd = new Map<string, number>();
  if (ga4Day?.complete) {
    for (const c of ga4Day.candidates) {
      if (!c.utm_content) continue;
      sessionsByAd.set(c.utm_content, (sessionsByAd.get(c.utm_content) ?? 0) + c.sessions);
    }
  }
  const platforms: RollupPlatform[] = [];
  const rows: AdsRollupRow[] = [];
  for (const platform of ["meta", "google"] as const) {
    const provider = PROVIDERS[platform];
    if (!provider.listDayDates(site).includes(date)) continue;
    platforms.push(platform);
    const spend = provider.loadSpendRows(site, date, date, provider.accountIds(settings));
    rows.push(...rollupRowsFromSpend(platform, spend, sessionsByAd));
  }
  return { date, built_at: now.toISOString(), platforms, ga4_complete: !!ga4Day?.complete, rows };
}

function pruneRollups(site: string, now: Date): void {
  const cutoff = addDays(utcDate(now), -ADS_ROLLUP_RETENTION_DAYS);
  for (const d of listRollupDates(site)) {
    if (d >= cutoff) break;
    try {
      fs.unlinkSync(path.join(rollupDir(site), `${d}.json`));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Rewrite rollups for the days a Sync touched. The first build (no rollups yet) backfills the
 * last 90 days. Returns the new generation (unchanged when nothing was written).
 */
export function writeRollupsForDates(
  site: string,
  dirtyDates: string[],
  opts: { contentRoot?: string; now?: Date } = {},
): { written: string[]; generation: number } {
  const now = opts.now ?? new Date();
  const state = loadRollupState(site);
  const existing = new Set(listRollupDates(site));
  const dates = new Set(dirtyDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  if (existing.size === 0) {
    const until = utcDate(now);
    for (const d of dateRange(addDays(until, -(ADS_ROLLUP_BACKFILL_DAYS - 1)), until)) dates.add(d);
  }
  const cutoff = addDays(utcDate(now), -ADS_ROLLUP_RETENTION_DAYS);
  const written: string[] = [];
  for (const d of Array.from(dates).sort()) {
    if (d < cutoff) continue;
    const day = buildRollupDay(site, d, opts.contentRoot, now);
    if (day.platforms.length === 0 && !existing.has(d)) continue;
    writeJson(path.join(rollupDir(site), `${d}.json`), day);
    written.push(d);
  }
  pruneRollups(site, now);
  if (written.length === 0) return { written, generation: state.generation };
  const next: AdsRollupState = { ...state, generation: state.generation + 1, built_at: now.toISOString() };
  saveRollupState(site, next);
  return { written, generation: next.generation };
}

/** Days in the inclusive window with no rollup file. */
export function rollupGaps(site: string, since: string, until: string): string[] {
  const have = new Set(listRollupDates(site));
  return dateRange(since, until).filter((d) => !have.has(d));
}

// ── Post-fix verification ───────────────────────────────────────────────────

export type RollupTarget = {
  platform: RollupPlatform;
  /** Ads to sum (the issue's affected ads). Empty with a campaign / ad set / account id = everything under it. */
  ad_ids?: string[];
  campaign_id?: string;
  adset_id?: string;
  account_id?: string;
};

export type RollupSum = {
  /** Days that had a rollup file (missing days never count toward `fresh_days`). */
  days_counted: number;
  missing_days: string[];
  spend: Record<string, number>;
  spend_total: number;
  clicks: number;
  impressions: number;
  sessions: number;
  leads: number;
  /** Days with any spend on the target (paused / no spend → "waiting for spend"). */
  days_with_spend: number;
  /** Days left out because every matched Meta ad was changing its URL that day (the split is approximate). */
  url_change_days?: string[];
};

function rowMatches(r: AdsRollupRow, t: RollupTarget, adSet: Set<string> | null): boolean {
  if (r.platform !== t.platform) return false;
  if (adSet) return adSet.has(r.ad_id);
  if (t.adset_id) return r.adset_id === t.adset_id;
  if (t.campaign_id) return r.campaign_id === t.campaign_id;
  if (t.account_id) return r.account_id === t.account_id;
  return true;
}

/** Sum rollups for a target from `since` (inclusive) to `until` (inclusive, default yesterday). Missing days are skipped. */
export function sumRollupsSince(site: string, target: RollupTarget, since: string, until?: string, now = new Date()): RollupSum {
  const end = until ?? addDays(utcDate(now), -1);
  const out: RollupSum = {
    days_counted: 0,
    missing_days: [],
    spend: {},
    spend_total: 0,
    clicks: 0,
    impressions: 0,
    sessions: 0,
    leads: 0,
    days_with_spend: 0,
  };
  if (since > end) return out;
  const adSet = target.ad_ids && target.ad_ids.length > 0 ? new Set(target.ad_ids) : null;
  const changeover = new Map<string, Set<string>>();
  if (adSet && target.platform === "meta") {
    const catalog = loadAdsSetup(site, "meta");
    for (const id of Array.from(adSet)) {
      const ad = catalog.ads[id];
      const days = adChangeoverDays(ad, ad ? catalog.accounts[ad.account_id]?.timezone : null);
      if (days.size > 0) changeover.set(id, days);
    }
  }
  for (const d of dateRange(since, end)) {
    const day = loadRollupDay(site, d);
    if (!day || !day.platforms.includes(target.platform)) {
      out.missing_days.push(d);
      continue;
    }
    let spentToday = 0;
    let matched = 0;
    let skipped = 0;
    for (const r of day.rows) {
      if (!rowMatches(r, target, adSet)) continue;
      if (changeover.get(r.ad_id)?.has(d)) {
        skipped += 1;
        continue;
      }
      matched += 1;
      out.spend[r.currency] = Math.round(((out.spend[r.currency] ?? 0) + r.spend) * 100) / 100;
      spentToday += r.spend;
      out.clicks += r.clicks;
      out.impressions += r.impressions;
      out.sessions += r.sessions;
      out.leads += r.leads;
    }
    if (skipped > 0 && matched === 0) {
      (out.url_change_days ??= []).push(d);
      continue;
    }
    out.days_counted += 1;
    out.spend_total += spentToday;
    if (spentToday > 0) out.days_with_spend += 1;
  }
  out.spend_total = Math.round(out.spend_total * 100) / 100;
  return out;
}

// ── Report windows ──────────────────────────────────────────────────────────

type ReportModule = typeof import("./ads-report");
type AdsReport = import("./ads-report").AdsReport;
type AdsReportOpts = import("./ads-report").AdsReportOpts;

type SavedWindow = { generation: number; settings_hash: string; built_at: string; report: AdsReport };

const VARIANT_CACHE_MAX = 40;
const variantCache = new Map<string, { generation: number; settings_hash: string; report: AdsReport }>();

export function reportSettingsHash(settings: unknown, attributionVersion: number = ADS_ATTRIBUTION_VERSION): string {
  const payload = { attribution: attributionVersion, settings };
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

function settingsHash(contentRoot?: string): string {
  const { utm_convention: _convention, utm_convention_rejected: _rejected, ...reportSettings } = getAdsSettings(contentRoot);
  return reportSettingsHash(reportSettings);
}

function isDefaultWindow(opts: AdsReportOpts): boolean {
  const days = opts.days ?? 28;
  return (
    !opts.since &&
    !opts.until &&
    (ADS_REPORT_WINDOW_DAYS as readonly number[]).includes(days) &&
    !opts.currency &&
    !opts.account &&
    !opts.content_type &&
    !opts.split_by_version &&
    !opts.includeGa4Ads &&
    opts.includeMetaPlatforms !== false &&
    !(opts.campaign_ids?.length || opts.adset_ids?.length || opts.ad_ids?.length) &&
    (opts.model ?? "last_paid") === "last_paid" &&
    !opts.now
  );
}

function windowFile(site: string, platform: AdPlatform | "all", days: number, model: AttributionModel): string {
  return path.join(windowsDir(site), `${platform}-${days}d-${model}.json`);
}

function variantKey(opts: AdsReportOpts): string {
  const { contentIndex: _ci, now: _now, noRefresh: _nr, ...rest } = opts;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** When past numbers were first recomputed with URL history (stamped on first read / window save). */
export function urlHistoryEnabledAt(site: string, now: Date = new Date()): string {
  const state = loadRollupState(site);
  if (state.url_history_enabled_at) return state.url_history_enabled_at;
  const at = now.toISOString();
  try {
    saveRollupState(site, { ...state, url_history_enabled_at: at });
  } catch (err) {
    log.warn({ err, site }, "[ads-rollups] could not stamp url_history_enabled_at");
  }
  return at;
}

function withLiveStatus(report: AdsReport, mod: ReportModule, site: string, gaps: string[]): AdsReport {
  const refresh = getAdsRefreshStatus(site);
  const urlHistory = report.attribution?.url_history;
  if (urlHistory) report = { ...report, attribution: { ...report.attribution, url_history: { ...urlHistory, recomputed_at: urlHistoryEnabledAt(site) } } };
  const warnings = [...report.warnings.filter((w) => !mod.isRefreshWarning(w) && w.code !== "rollup_days_missing"), ...mod.refreshWarnings(refresh)];
  if (gaps.length > 0) {
    warnings.push({
      code: "rollup_days_missing",
      message: `${gaps.length} day(s) in this window have no saved daily numbers yet (${gaps.slice(0, 3).join(", ")}${gaps.length > 3 ? ", …" : ""}). They fill in after the next successful Sync.`,
    });
  }
  return { ...report, refresh, refreshing: refresh.state === "queued" || refresh.state === "running", warnings };
}

function windowGaps(site: string, report: AdsReport): string[] {
  if (loadRollupState(site).generation === 0) return [];
  const have = new Set(listRollupDates(site));
  return dateRange(report.window.start, report.window.end).filter((d) => !have.has(d) && d < utcDate(new Date()));
}

/**
 * Paid pages report for GET reads. Default 7/28/90 views come from the window saved after the
 * last Sync; other filters are assembled once per rollup generation and kept in memory.
 * Never triggers a Sync itself beyond the existing stale-data check.
 */
export async function assembleAdsReportFromRollups(opts: AdsReportOpts): Promise<AdsReport> {
  const mod = await import("./ads-report");
  if (!opts.noRefresh) {
    try {
      await triggerAdsRefreshIfStale(opts.site, opts.contentRoot);
    } catch (err) {
      log.warn({ err }, "[ads-rollups] refresh trigger failed");
    }
  }
  const generation = loadRollupState(opts.site).generation;
  const hash = settingsHash(opts.contentRoot);
  const platform = opts.platform ?? "all";
  const days = opts.days ?? 28;
  const model = opts.model ?? "last_paid";

  if (isDefaultWindow(opts)) {
    const file = windowFile(opts.site, platform, days, model);
    const saved = readJson<SavedWindow>(file);
    if (saved && saved.generation === generation && saved.settings_hash === hash && saved.report) {
      return withLiveStatus(saved.report, mod, opts.site, windowGaps(opts.site, saved.report));
    }
    const report = mod.buildAdsReport({ ...opts, noRefresh: true });
    try {
      writeJson(file, { generation, settings_hash: hash, built_at: new Date().toISOString(), report } satisfies SavedWindow);
    } catch (err) {
      log.warn({ err, file }, "[ads-rollups] could not save report window");
    }
    return withLiveStatus(report, mod, opts.site, windowGaps(opts.site, report));
  }

  const key = `${opts.site}|${variantKey(opts)}`;
  const hit = variantCache.get(key);
  if (hit && hit.generation === generation && hit.settings_hash === hash && !opts.now) {
    return withLiveStatus(hit.report, mod, opts.site, windowGaps(opts.site, hit.report));
  }
  const report = mod.buildAdsReport({ ...opts, noRefresh: true });
  if (!opts.now) {
    variantCache.delete(key);
    variantCache.set(key, { generation, settings_hash: hash, report });
    while (variantCache.size > VARIANT_CACHE_MAX) variantCache.delete(variantCache.keys().next().value!);
  }
  return withLiveStatus(report, mod, opts.site, windowGaps(opts.site, report));
}

/** Save the default 7/28/90 windows for each platform in scope (runs in the Sync worker). */
export async function saveDefaultReportWindows(site: string, contentRoot?: string): Promise<number> {
  const mod = await import("./ads-report");
  const generation = loadRollupState(site).generation;
  const hash = settingsHash(contentRoot);
  urlHistoryEnabledAt(site);
  const platforms: Array<AdPlatform | "all"> = ["all"];
  if (metaProvider.hasData(site, contentRoot)) platforms.push("meta");
  if (googleProvider.hasData(site, contentRoot)) platforms.push("google");
  let saved = 0;
  for (const platform of platforms) {
    for (const days of ADS_REPORT_WINDOW_DAYS) {
      try {
        const report = mod.buildAdsReport({ site, contentRoot, days, platform, noRefresh: true });
        writeJson(windowFile(site, platform, days, "last_paid"), {
          generation,
          settings_hash: hash,
          built_at: new Date().toISOString(),
          report,
        } satisfies SavedWindow);
        saved += 1;
      } catch (err) {
        log.warn({ err, site, platform, days }, "[ads-rollups] report window build failed");
      }
    }
  }
  return saved;
}

/** After a Sync: rollups for rewritten days, then the default report windows. */
export async function afterAdsSync(
  site: string,
  dirtyDates: string[],
  opts: { contentRoot?: string; now?: Date } = {},
): Promise<{ written: string[]; generation: number; windows: number }> {
  const { written, generation } = writeRollupsForDates(site, dirtyDates, opts);
  const windows = written.length > 0 || !fs.existsSync(windowsDir(site)) ? await saveDefaultReportWindows(site, opts.contentRoot) : 0;
  return { written, generation, windows };
}

/** Drop rollups + saved windows (production download replaced the day files). */
export function clearAdsDerivedData(site: string): void {
  for (const d of [rollupDir(site), windowsDir(site)]) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  for (const k of Array.from(variantCache.keys())) if (k.startsWith(`${site}|`)) variantCache.delete(k);
}

/** Tests only. */
export function clearReportVariantCacheForTests(): void {
  variantCache.clear();
}
