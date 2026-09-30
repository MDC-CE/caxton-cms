/**
 * One background refresh for Ads data: Meta insights (when connected) + GA4
 * paid-landing days (when BigQuery is configured). Stale reads (> ~24h) enqueue
 * it and return cached data immediately with `refreshing: true`.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { getAdsSettings } from "../settings";
import { child } from "../logger";
import { isMetaTokenConfigured } from "./meta-client";
import {
  isMetaStale,
  isMetaSyncInFlight,
  loadMetaState,
  META_STALE_MS,
  syncMetaAds,
  type MetaSyncMode,
  type MetaSyncResult,
} from "./meta-ads-days";
import { isGa4Configured, loadPaidLandingState, syncPaidLandingDays, type PaidLandingSyncResult } from "./paid-detection";

const log = child({ module: "ads/ads-refresh" });

const REFRESH_WINDOW_MS = 15 * 60 * 1000;

type RefreshState = { requested_at?: string; started_at?: string; finished_at?: string };

function statePath(site: string): string {
  return path.join(CACHE_DIR, site, "ads-refresh-state.json");
}

function loadState(site: string): RefreshState {
  try {
    const f = statePath(site);
    return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf-8")) as RefreshState) : {};
  } catch {
    return {};
  }
}

function patchState(site: string, patch: RefreshState): void {
  const next = { ...loadState(site), ...patch };
  fs.mkdirSync(path.dirname(statePath(site)), { recursive: true });
  fs.writeFileSync(statePath(site), JSON.stringify(next), "utf-8");
}

const inFlight = new Set<string>();

export function isMetaConnected(contentRoot?: string): boolean {
  const meta = getAdsSettings(contentRoot).meta;
  return meta.enabled && meta.ad_account_ids.length > 0 && isMetaTokenConfigured();
}

/** True while a refresh runs here, or was requested/started (possibly in the worker) in the last 15 minutes without finishing. */
export function isAdsRefreshing(site: string, now = Date.now()): boolean {
  if (inFlight.has(site) || isMetaSyncInFlight(site)) return true;
  const s = loadState(site);
  const started = Math.max(s.requested_at ? Date.parse(s.requested_at) : 0, s.started_at ? Date.parse(s.started_at) : 0);
  if (!started || now - started > REFRESH_WINDOW_MS) return false;
  const finished = s.finished_at ? Date.parse(s.finished_at) : 0;
  return started > finished;
}

export function isAdsDataStale(site: string, contentRoot?: string, now = Date.now()): boolean {
  if (isMetaConnected(contentRoot) && isMetaStale(loadMetaState(site), now)) return true;
  if (isGa4Configured(contentRoot)) {
    const last = loadPaidLandingState(site).last_success_at;
    const t = last ? Date.parse(last) : NaN;
    if (!Number.isFinite(t) || now - t > META_STALE_MS) return true;
  }
  return false;
}

export type AdsRefreshResult = { meta: MetaSyncResult | null; ga4: PaidLandingSyncResult | null };

export async function runAdsRefresh(opts: { site: string; contentRoot?: string; mode?: MetaSyncMode }): Promise<AdsRefreshResult> {
  if (inFlight.has(opts.site)) return { meta: null, ga4: null };
  inFlight.add(opts.site);
  patchState(opts.site, { started_at: new Date().toISOString() });
  try {
    const meta = isMetaConnected(opts.contentRoot)
      ? await syncMetaAds({ site: opts.site, contentRoot: opts.contentRoot, mode: opts.mode })
      : null;
    const ga4 = opts.mode === "older" ? null : await syncPaidLandingDays(opts.site, opts.contentRoot);
    return { meta, ga4 };
  } finally {
    patchState(opts.site, { finished_at: new Date().toISOString() });
    inFlight.delete(opts.site);
  }
}

export async function requestAdsRefresh(site: string, contentRoot: string | undefined, mode: MetaSyncMode = "refresh"): Promise<boolean> {
  if (isAdsRefreshing(site)) return true;
  patchState(site, { requested_at: new Date().toISOString() });
  try {
    const { enqueueJob } = await import("../jobs/queue");
    const res = await enqueueJob(
      "meta_ads_sync",
      { site, contentRoot, mode },
      { uniqueKey: `meta_ads_sync:${site}:${mode}`, uniqueWithArgs: true },
    );
    if (res.queued || res.deduped) return true;
  } catch (err) {
    log.warn({ err, site }, "[ads-refresh] enqueue failed; running in-process");
  }
  void runAdsRefresh({ site, contentRoot, mode }).catch((err) => log.warn({ err, site }, "[ads-refresh] in-process refresh failed"));
  return true;
}

/** Enqueue when stale; returns true when a refresh is running or was just requested. */
export async function triggerAdsRefreshIfStale(site: string, contentRoot?: string): Promise<boolean> {
  if (isAdsRefreshing(site)) return true;
  if (!isAdsDataStale(site, contentRoot)) return false;
  return requestAdsRefresh(site, contentRoot, "refresh");
}
