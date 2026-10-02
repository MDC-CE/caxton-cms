/**
 * Dev-only: replace the local Ads cache (Meta days, placement days, ad setups, GA4 paid-landing
 * days + state files) with a snapshot from production. Never uploads. Leads/consent live in
 * `leads-pull-production.ts` so other screens can pull them on their own.
 */

import fs from "fs";
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
  META_CUSTOM_CONVERSIONS_FILE,
  META_DAYS_DIR,
  META_PIXEL_EVENTS_FILE,
  META_PLATFORM_DAYS_DIR,
  META_RETENTION_DAYS,
  META_STATE_FILE,
  stageMetaSnapshot,
  utcDate,
  type MetaCustomConversionsFile,
  type MetaPixelEventsFile,
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
import type { MetaAdCreativeInfo } from "./meta-client";
import { ADS_SETUP_DIR, adsSetupRelPath, emptyAdsSetup, mergeMetaAccountAds, type AdsSetupCatalog } from "./ads-setup";
import { clearAdsDerivedData } from "./ads-rollups";
import { cleanupPullArtifacts, makeStagingDir, swapStagedEntries } from "./cache-swap";

export const ADS_PULL_DEFAULT_DAYS = 90;

/** State files go last so a crash mid-swap never leaves "downloaded" stamps over old day files. */
const SWAP_ENTRIES = [
  META_DAYS_DIR,
  META_PLATFORM_DAYS_DIR,
  PAID_LANDING_DAYS_DIR,
  adsSetupRelPath("meta"),
  META_CUSTOM_CONVERSIONS_FILE,
  META_PIXEL_EVENTS_FILE,
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

/**
 * Meta setup catalog from an export. Production still on the old layout sends `creatives`
 * (id → creative); those are converted in memory — only the catalog is ever written.
 */
function parseMetaSetup(b: Record<string, unknown>): AdsSetupCatalog {
  const setup = b.meta_setup as AdsSetupCatalog | undefined;
  if (setup && typeof setup === "object" && setup.platform === "meta" && setup.ads && typeof setup.ads === "object") {
    return { ...emptyAdsSetup("meta"), ...setup };
  }
  const catalog = emptyAdsSetup("meta");
  const legacy = b.creatives as { fetched_at?: string; ads?: Record<string, MetaAdCreativeInfo> } | undefined;
  if (!legacy?.ads || typeof legacy.ads !== "object") return catalog;
  const byAccount = new Map<string, MetaAdCreativeInfo[]>();
  for (const c of Object.values(legacy.ads)) {
    if (!c || typeof c !== "object" || !c.ad_id) continue;
    const acct = c.account_id ?? "";
    byAccount.set(acct, [...(byAccount.get(acct) ?? []), { ...c, links: Array.isArray(c.links) ? c.links : [] }]);
  }
  const at = legacy.fetched_at || new Date().toISOString();
  for (const [acct, list] of Array.from(byAccount.entries())) mergeMetaAccountAds(catalog, acct, list, at);
  catalog.fetched_at = legacy.fetched_at ?? "";
  return catalog;
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
    meta_setup: parseMetaSetup(b),
    custom_conversions:
      b.custom_conversions && typeof b.custom_conversions === "object" ? (b.custom_conversions as MetaCustomConversionsFile) : undefined,
    pixel_events: b.pixel_events && typeof b.pixel_events === "object" ? (b.pixel_events as MetaPixelEventsFile) : undefined,
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
 * Stamps the Meta state as a production download and clears derived rollups / report windows
 * (rebuilt from the new day files on next read or Sync).
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
  fs.mkdirSync(path.join(liveRoot, ADS_SETUP_DIR), { recursive: true });
  swapStagedEntries(liveRoot, staging, SWAP_ENTRIES, opts.rename);
  clearAdsDerivedData(site);
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
  const { isAdsRunActive } = await import("./diagnostics/run-lock");
  if (isAdsRunActive(site)) return true;
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
  if (busy) return fail("A local Ads Sync or Ads Run is in progress. Wait for it to finish, then download again.");

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
