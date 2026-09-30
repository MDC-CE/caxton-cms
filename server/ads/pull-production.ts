/**
 * Dev-only: replace the local Ads cache (Meta days, placement days, ad setups, GA4 paid-landing
 * days + state files) with a snapshot from production. Never uploads. Leads/consent live in
 * `leads-pull-production.ts` so other screens can pull them on their own.
 */

import path from "path";
import { CACHE_DIR } from "../db-cache";
import {
  fetchProductionAdmin,
  resolveProductionOrigin,
  type ProductionStaffTokenRequiredPayload,
} from "../dev-production-fetch";
import {
  addDays,
  exportMetaSnapshot,
  isMetaSyncInFlight,
  META_CREATIVES_FILE,
  META_DAYS_DIR,
  META_PLATFORM_DAYS_DIR,
  META_RETENTION_DAYS,
  META_STATE_FILE,
  stageMetaSnapshot,
  utcDate,
  type MetaAdsCreatives,
  type MetaAdsDayFile,
  type MetaAdsPlatformDayFile,
  type MetaAdsSyncState,
  type MetaSnapshot,
} from "./meta-ads-days";
import {
  exportPaidLandingSnapshot,
  PAID_LANDING_DAYS_DIR,
  PAID_LANDING_STATE_FILE,
  stagePaidLandingSnapshot,
  type PaidLandingDayFile,
  type PaidLandingSnapshot,
  type PaidLandingState,
} from "./paid-detection";
import { clearAdsSnapshots } from "./ads-diagnostics-snapshots";
import { cleanupPullArtifacts, makeStagingDir, swapStagedEntries } from "./cache-swap";

export const ADS_PULL_DEFAULT_DAYS = 90;

/** State files go last so a crash mid-swap never leaves "downloaded" stamps over old day files. */
const SWAP_ENTRIES = [
  META_DAYS_DIR,
  META_PLATFORM_DAYS_DIR,
  PAID_LANDING_DAYS_DIR,
  META_CREATIVES_FILE,
  PAID_LANDING_STATE_FILE,
  META_STATE_FILE,
];

export type AdsExportPayload = MetaSnapshot &
  PaidLandingSnapshot & {
    window: { since: string; until: string; days: number };
  };

export function clampExportDays(raw: unknown): number {
  const n = typeof raw === "string" || typeof raw === "number" ? Math.floor(Number(raw)) : NaN;
  if (!Number.isFinite(n) || n < 1) return ADS_PULL_DEFAULT_DAYS;
  return Math.min(n, META_RETENTION_DAYS);
}

/** Production side of the download: every cached Ads file in the last `days` days. */
export function buildAdsExport(site: string, days: number, now = new Date()): AdsExportPayload {
  const until = utcDate(now);
  const since = addDays(until, -(days - 1));
  return {
    ...exportMetaSnapshot(site, since),
    ...exportPaidLandingSnapshot(site, since),
    window: { since, until, days },
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayFiles<T extends { date: string }>(v: unknown, rowsKey: string): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (f): f is T =>
      !!f && typeof f === "object" && typeof (f as T).date === "string" && DAY_RE.test((f as T).date) && Array.isArray((f as Record<string, unknown>)[rowsKey]),
  );
}

export function parseAdsExport(body: unknown): AdsExportPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const state = b.meta_state;
  if (!state || typeof state !== "object") return null;
  const window = (b.window ?? {}) as AdsExportPayload["window"];
  return {
    meta_days: dayFiles<MetaAdsDayFile>(b.meta_days, "rows"),
    platform_days: dayFiles<MetaAdsPlatformDayFile>(b.platform_days, "rows"),
    meta_state: { consecutive_failures: 0, accounts: {}, ...(state as Partial<MetaAdsSyncState>) },
    creatives: (b.creatives && typeof b.creatives === "object" ? b.creatives : { fetched_at: "", ads: {} }) as MetaAdsCreatives,
    paid_landing_days: dayFiles<PaidLandingDayFile>(b.paid_landing_days, "candidates"),
    paid_landing_state: (b.paid_landing_state && typeof b.paid_landing_state === "object"
      ? b.paid_landing_state
      : { consecutive_failures: 0 }) as PaidLandingState,
    window,
  };
}

export type AppliedAdsSnapshot = {
  meta_days: number;
  platform_days: number;
  ga4_days: number;
  last_date: string | null;
};

/**
 * Stage the snapshot, then swap it in all at once. On any failure live data is left as it was.
 * Stamps the Meta state as a production download and clears saved Diagnostics Ads builds.
 */
export function applyAdsSnapshot(
  site: string,
  snap: AdsExportPayload,
  origin: string,
  opts: { now?: Date; rename?: (from: string, to: string) => void } = {},
): AppliedAdsSnapshot {
  const liveRoot = path.join(CACHE_DIR, site);
  cleanupPullArtifacts(liveRoot);
  const metaDates = snap.meta_days.map((f) => f.date).sort();
  const lastDate = metaDates[metaDates.length - 1] ?? snap.paid_landing_days.map((f) => f.date).sort().pop() ?? null;
  const {
    pulled_from_production_at: _p,
    production_origin: _o,
    snapshot_last_date: _l,
    ...prodState
  } = snap.meta_state;
  const meta_state: MetaAdsSyncState = {
    ...prodState,
    history_since: metaDates[0],
    pulled_from_production_at: (opts.now ?? new Date()).toISOString(),
    production_origin: origin,
    ...(lastDate ? { snapshot_last_date: lastDate } : {}),
  };

  const staging = makeStagingDir(liveRoot);
  try {
    stageMetaSnapshot(staging, { ...snap, meta_state });
    stagePaidLandingSnapshot(staging, snap);
  } catch (err) {
    cleanupPullArtifacts(liveRoot);
    throw err;
  }
  swapStagedEntries(liveRoot, staging, SWAP_ENTRIES, opts.rename);
  clearAdsSnapshots(site);
  return {
    meta_days: snap.meta_days.length,
    platform_days: snap.platform_days.length,
    ga4_days: snap.paid_landing_days.length,
    last_date: lastDate,
  };
}

export type PullProductionAdsResult = {
  success: boolean;
  pulled: boolean;
  productionOrigin: string;
  imported: AppliedAdsSnapshot | null;
  reason?: string;
  /** Production answered 404: the export endpoint is not deployed there yet. */
  not_supported?: boolean;
} & Partial<ProductionStaffTokenRequiredPayload>;

export type PullProductionAdsDeps = {
  /** True while a local sync would write the same files. */
  isBusy?: (site: string) => boolean;
  fetchAdmin?: typeof fetchProductionAdmin;
  now?: Date;
};

async function defaultIsBusy(site: string): Promise<boolean> {
  if (isMetaSyncInFlight(site)) return true;
  const { isAdsRefreshing } = await import("./ads-refresh");
  return isAdsRefreshing(site);
}

export async function pullProductionAds(
  site: string,
  opts: { productionOrigin?: string; days?: number } = {},
  deps: PullProductionAdsDeps = {},
): Promise<PullProductionAdsResult> {
  const productionOrigin = opts.productionOrigin?.replace(/\/$/, "") || resolveProductionOrigin(site);
  const fail = (reason: string, extra: Partial<PullProductionAdsResult> = {}): PullProductionAdsResult => ({
    success: false,
    pulled: false,
    productionOrigin: productionOrigin ?? "",
    imported: null,
    reason,
    ...extra,
  });

  if (!productionOrigin) {
    return fail("Could not resolve production URL for this site. Set PRODUCTION_SITE_URL or configure the site domain in sites.yml.");
  }
  const busy = deps.isBusy ? deps.isBusy(site) : await defaultIsBusy(site);
  if (busy) return fail("A local Ads sync is running. Wait for it to finish, then download again.");

  const url = new URL("/api/ads/export", productionOrigin);
  url.searchParams.set("days", String(clampExportDays(opts.days)));
  const result = await (deps.fetchAdmin ?? fetchProductionAdmin)(url, { method: "GET" }, productionOrigin);
  if (!result.ok) {
    if (result.kind === "token_required") return fail(result.payload.error, { ...result.payload });
    if (result.kind === "network") return fail(result.error);
    if (result.status === 404) {
      return fail("Production doesn't support ad downloads yet. Deploy this change to production first.", { not_supported: true });
    }
    return fail(`Production returned HTTP ${result.status}${result.body ? `: ${result.body.slice(0, 200)}` : ""}`);
  }

  const snap = parseAdsExport(await result.response.json().catch(() => null));
  if (!snap) return fail("Production sent an ad export this server could not read.");
  if (snap.meta_days.length === 0 && snap.paid_landing_days.length === 0) {
    return fail("Production has no ad data for that window. Local data was left as it was.");
  }

  try {
    const imported = applyAdsSnapshot(site, snap, productionOrigin, { now: deps.now });
    return { success: true, pulled: true, productionOrigin, imported };
  } catch (err) {
    return fail(`Could not save the download; local data was left as it was (${err instanceof Error ? err.message : String(err)}).`);
  }
}
