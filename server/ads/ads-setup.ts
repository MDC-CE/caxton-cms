/**
 * Unified ad setup catalog: one JSON per platform at `.cache/{site}/ads-setup/{platform}.json`.
 *
 * Holds what each ad / ad set / campaign / account looks like (names, landing URLs, URL
 * parameters, status) as of the last successful setup read. Metrics never live here — day
 * files and rollups hold numbers by id, and names / URLs are joined from this catalog at display.
 *
 * Platform-only details go in typed `extras` (Meta optimization event, Google approval status,
 * channel type, final URL suffix, auto-tagging, conversion actions). Ads a later successful read
 * no longer returns get `gone_at` (deleted or archived in the platform) but stay for history.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { child } from "../logger";
import type { MetaAdCreativeInfo } from "./meta-client";
import type { GoogleAdGroupInfo, GoogleAdInfo, GoogleCampaignInfo, GoogleCustomerInfo } from "./google-ads-bq";
import type { GoogleConversionActionInfo } from "./google-ads-days";

const log = child({ module: "ads/ads-setup" });

export const ADS_SETUP_DIR = "ads-setup";
export const ADS_SETUP_VERSION = 1;

export type AdsSetupPlatform = "meta" | "google";

export type AdsSetupAccount = {
  id: string;
  name: string | null;
  currency: string | null;
  /** IANA time zone of the ad account (Meta `timezone_name`); null when unknown. */
  timezone: string | null;
  extras?: { auto_tagging?: boolean | null; account_status?: number };
  last_seen_at: string;
};

export type AdsSetupCampaign = {
  id: string;
  account_id: string;
  name: string;
  status: string | null;
  extras?: { channel_type?: string | null; final_url_suffix?: string | null };
  last_seen_at: string;
};

/** Meta ad set / Google ad group. */
export type AdsSetupAdset = {
  id: string;
  account_id: string;
  campaign_id: string;
  name: string;
  last_seen_at: string;
};

export type AdsSetupAd = {
  id: string;
  account_id: string;
  campaign_id: string;
  adset_id: string;
  name: string;
  /** Meta effective_status / Google ad status. */
  status: string | null;
  landing_urls: string[];
  /** Meta URL parameters field (Google keeps tracking on the campaign `final_url_suffix`). */
  url_tags: string | null;
  destination: "website" | "instant_form";
  extras?: { optimization_event?: string; approval_status?: string | null };
  last_seen_at: string;
  /** Set when a successful setup read of its account no longer returned this ad. */
  gone_at?: string;
};

export type AdsSetupCatalog = {
  version: typeof ADS_SETUP_VERSION;
  platform: AdsSetupPlatform;
  /** Last setup read that covered every connected account; "" until one succeeds. */
  fetched_at: string;
  accounts: Record<string, AdsSetupAccount>;
  campaigns: Record<string, AdsSetupCampaign>;
  adsets: Record<string, AdsSetupAdset>;
  ads: Record<string, AdsSetupAd>;
  extras: { conversion_actions?: GoogleConversionActionInfo[] };
};

export function emptyAdsSetup(platform: AdsSetupPlatform): AdsSetupCatalog {
  return { version: ADS_SETUP_VERSION, platform, fetched_at: "", accounts: {}, campaigns: {}, adsets: {}, ads: {}, extras: {} };
}

export function adsSetupRelPath(platform: AdsSetupPlatform): string {
  return path.join(ADS_SETUP_DIR, `${platform}.json`);
}

function catalogPath(site: string, platform: AdsSetupPlatform): string {
  return path.join(CACHE_DIR, site, adsSetupRelPath(platform));
}

function isCatalog(v: unknown, platform: AdsSetupPlatform): v is AdsSetupCatalog {
  const c = v as AdsSetupCatalog | null;
  return !!c && typeof c === "object" && c.platform === platform && !!c.ads && typeof c.ads === "object";
}

export function loadAdsSetup(site: string, platform: AdsSetupPlatform): AdsSetupCatalog {
  try {
    const f = catalogPath(site, platform);
    if (!fs.existsSync(f)) return emptyAdsSetup(platform);
    const parsed = JSON.parse(fs.readFileSync(f, "utf-8")) as unknown;
    if (!isCatalog(parsed, platform)) return emptyAdsSetup(platform);
    return { ...emptyAdsSetup(platform), ...parsed };
  } catch (err) {
    log.warn({ err, site, platform }, "[ads-setup] unreadable catalog; treating as empty");
    return emptyAdsSetup(platform);
  }
}

export function saveAdsSetup(site: string, catalog: AdsSetupCatalog): void {
  writeAdsSetupFile(catalogPath(site, catalog.platform), catalog);
}

/** Atomic write (tmp + rename) — also used to stage production downloads. */
export function writeAdsSetupFile(file: string, catalog: AdsSetupCatalog): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(catalog), "utf-8");
  fs.renameSync(tmp, file);
}

export function getAdSetup(site: string, platform: AdsSetupPlatform, adId: string): AdsSetupAd | null {
  return loadAdsSetup(site, platform).ads[adId] ?? null;
}

// ── Meta ────────────────────────────────────────────────────────────────────

export type MetaSetupAdInput = MetaAdCreativeInfo & { ad_name?: string };

export function metaAdFromCreative(c: MetaSetupAdInput, accountId: string, nowIso: string, prev?: AdsSetupAd): AdsSetupAd {
  return {
    id: c.ad_id,
    account_id: accountId,
    campaign_id: c.campaign_id,
    adset_id: c.adset_id,
    name: c.ad_name || prev?.name || "",
    status: c.effective_status ?? null,
    landing_urls: [...c.links],
    url_tags: c.url_tags ?? null,
    destination: c.instant_form ? "instant_form" : "website",
    ...(c.optimization_event ? { extras: { optimization_event: c.optimization_event } } : {}),
    last_seen_at: nowIso,
  };
}

/** Catalog ad → the creative shape older readers use (links / url_tags / instant_form). */
export function metaCreativeFromAd(a: AdsSetupAd): MetaAdCreativeInfo {
  return {
    ad_id: a.id,
    campaign_id: a.campaign_id,
    adset_id: a.adset_id,
    account_id: a.account_id,
    ...(a.status ? { effective_status: a.status } : {}),
    links: [...a.landing_urls],
    ...(a.url_tags ? { url_tags: a.url_tags } : {}),
    instant_form: a.destination === "instant_form",
    ...(a.extras?.optimization_event ? { optimization_event: a.extras.optimization_event } : {}),
  };
}

/**
 * Replace one Meta account's ads with a fresh full read. Ads the read no longer returns get
 * `gone_at` (first time only); ads it returns lose any `gone_at`.
 */
export function mergeMetaAccountAds(catalog: AdsSetupCatalog, accountId: string, creatives: MetaAdCreativeInfo[], nowIso: string): void {
  const seen = new Set<string>();
  for (const c of creatives) {
    seen.add(c.ad_id);
    catalog.ads[c.ad_id] = metaAdFromCreative(c, accountId, nowIso, catalog.ads[c.ad_id]);
  }
  for (const [id, a] of Object.entries(catalog.ads)) {
    if (a.account_id !== accountId || seen.has(id) || a.gone_at) continue;
    catalog.ads[id] = { ...a, gone_at: nowIso };
  }
}

export type MetaInsightNames = {
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  date: string;
};

/** Names come from insight rows (newest day wins) — the creatives read has ids only. */
export function applyMetaNames(catalog: AdsSetupCatalog, rows: MetaInsightNames[], nowIso: string): void {
  const newest = new Map<string, MetaInsightNames>();
  for (const r of rows) {
    const prev = newest.get(r.ad_id);
    if (!prev || r.date >= prev.date) newest.set(r.ad_id, r);
  }
  for (const r of Array.from(newest.values())) {
    if (r.campaign_id) {
      const prev = catalog.campaigns[r.campaign_id];
      catalog.campaigns[r.campaign_id] = {
        id: r.campaign_id,
        account_id: r.account_id,
        name: r.campaign_name || prev?.name || "",
        status: prev?.status ?? null,
        last_seen_at: nowIso,
      };
    }
    if (r.adset_id) {
      const prev = catalog.adsets[r.adset_id];
      catalog.adsets[r.adset_id] = {
        id: r.adset_id,
        account_id: r.account_id,
        campaign_id: r.campaign_id,
        name: r.adset_name || prev?.name || "",
        last_seen_at: nowIso,
      };
    }
    const ad = catalog.ads[r.ad_id];
    if (ad && r.ad_name) ad.name = r.ad_name;
  }
}

export function setMetaAccount(
  catalog: AdsSetupCatalog,
  info: { id: string; name: string; currency: string; timezone_name?: string; account_status?: number },
  nowIso: string,
): void {
  catalog.accounts[info.id] = {
    id: info.id,
    name: info.name || null,
    currency: info.currency || null,
    timezone: info.timezone_name ?? catalog.accounts[info.id]?.timezone ?? null,
    ...(info.account_status != null ? { extras: { account_status: info.account_status } } : {}),
    last_seen_at: nowIso,
  };
}

export type RefreshAdSetupResult =
  | { ok: true; refreshed: string[]; gone: string[]; checked_at: string }
  | { ok: false; error: string; unreachable: boolean };

export type RefreshAdSetupDeps = {
  fetchMetaAdsByIds?: (ids: string[], timeoutMs: number) => Promise<{ found: MetaAdCreativeInfo[]; missing: string[] }>;
  now?: Date;
};

export const REFRESH_AD_SETUP_TIMEOUT_MS = 10_000;

/**
 * Re-read just these ads from the platform (instant Re-check). Meta only — Google setups come
 * from the daily BigQuery transfer, so Google codes verify `after_sync`.
 */
export async function refreshAdSetup(
  site: string,
  platform: AdsSetupPlatform,
  adIds: string[],
  deps: RefreshAdSetupDeps = {},
): Promise<RefreshAdSetupResult> {
  if (platform !== "meta") return { ok: false, error: "Only Meta ad setups can be re-read on demand; Google updates with the next Sync.", unreachable: false };
  const ids = Array.from(new Set(adIds.filter(Boolean)));
  const nowIso = (deps.now ?? new Date()).toISOString();
  if (ids.length === 0) return { ok: true, refreshed: [], gone: [], checked_at: nowIso };
  const fetcher = deps.fetchMetaAdsByIds ?? (await import("./meta-client")).fetchAdCreativesByIds;
  let result: { found: MetaAdCreativeInfo[]; missing: string[] };
  try {
    result = await fetcher(ids, REFRESH_AD_SETUP_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), unreachable: true };
  }
  const catalog = loadAdsSetup(site, "meta");
  for (const c of result.found) {
    const prev = catalog.ads[c.ad_id];
    catalog.ads[c.ad_id] = metaAdFromCreative(c, c.account_id ?? prev?.account_id ?? "", nowIso, prev);
  }
  for (const id of result.missing) {
    const prev = catalog.ads[id];
    if (prev && !prev.gone_at) catalog.ads[id] = { ...prev, gone_at: nowIso };
  }
  saveAdsSetup(site, catalog);
  return { ok: true, refreshed: result.found.map((c) => c.ad_id), gone: result.missing, checked_at: nowIso };
}

// ── Google ──────────────────────────────────────────────────────────────────

/** Replace one Google customer's campaigns / ad groups / ads with a fresh transfer read. */
export function mergeGoogleCustomer(
  catalog: AdsSetupCatalog,
  customerId: string,
  meta: {
    customer: GoogleCustomerInfo;
    campaigns: Record<string, GoogleCampaignInfo>;
    adGroups: Record<string, GoogleAdGroupInfo>;
    ads: Record<string, GoogleAdInfo>;
  },
  nowIso: string,
): void {
  catalog.accounts[customerId] = {
    id: customerId,
    name: meta.customer.name,
    currency: meta.customer.currency,
    timezone: catalog.accounts[customerId]?.timezone ?? null,
    extras: { auto_tagging: meta.customer.auto_tagging },
    last_seen_at: nowIso,
  };
  for (const [id, c] of Object.entries(meta.campaigns)) {
    catalog.campaigns[id] = {
      id,
      account_id: c.customer_id,
      name: c.name,
      status: c.status,
      extras: { channel_type: c.channel_type, final_url_suffix: c.final_url_suffix },
      last_seen_at: nowIso,
    };
  }
  for (const [id, g] of Object.entries(meta.adGroups)) {
    catalog.adsets[id] = {
      id,
      account_id: meta.campaigns[g.campaign_id]?.customer_id ?? catalog.campaigns[g.campaign_id]?.account_id ?? customerId,
      campaign_id: g.campaign_id,
      name: g.name,
      last_seen_at: nowIso,
    };
  }
  const seen = new Set<string>();
  for (const [id, a] of Object.entries(meta.ads)) {
    seen.add(id);
    catalog.ads[id] = {
      id,
      account_id: a.customer_id,
      campaign_id: a.campaign_id,
      adset_id: a.ad_group_id,
      name: catalog.ads[id]?.name ?? "",
      status: a.status,
      landing_urls: [...a.final_urls],
      url_tags: null,
      destination: "website",
      extras: { approval_status: a.approval_status },
      last_seen_at: nowIso,
    };
  }
  for (const [id, a] of Object.entries(catalog.ads)) {
    if (a.account_id !== customerId || seen.has(id) || a.gone_at) continue;
    catalog.ads[id] = { ...a, gone_at: nowIso };
  }
}

export function googleCampaignFromCatalog(c: AdsSetupCampaign): GoogleCampaignInfo {
  return {
    customer_id: c.account_id,
    name: c.name,
    channel_type: c.extras?.channel_type ?? null,
    status: c.status,
    final_url_suffix: c.extras?.final_url_suffix ?? null,
  };
}

export function googleAdFromCatalog(a: AdsSetupAd): GoogleAdInfo {
  return {
    customer_id: a.account_id,
    ad_group_id: a.adset_id,
    campaign_id: a.campaign_id,
    final_urls: [...a.landing_urls],
    approval_status: a.extras?.approval_status ?? null,
    status: a.status,
  };
}

// ── Display joins ───────────────────────────────────────────────────────────

export type AdsSetupNames = { campaign_name: string | null; adset_name: string | null; ad_name: string | null; landing_url: string | null };

/** Names + first landing URL for ids (rollups store ids only). */
export function namesFor(
  catalog: AdsSetupCatalog,
  ids: { campaign_id?: string | null; adset_id?: string | null; ad_id?: string | null },
): AdsSetupNames {
  const ad = ids.ad_id ? catalog.ads[ids.ad_id] : undefined;
  return {
    campaign_name: (ids.campaign_id && catalog.campaigns[ids.campaign_id]?.name) || null,
    adset_name: (ids.adset_id && catalog.adsets[ids.adset_id]?.name) || null,
    ad_name: ad?.name || null,
    landing_url: ad?.landing_urls[0] ?? null,
  };
}

/** Ad ids under a campaign / ad set / account in the catalog (for scope sizing and resource_gone). */
export function adIdsUnder(catalog: AdsSetupCatalog, level: "account" | "campaign" | "adset", id: string): string[] {
  const key = level === "account" ? "account_id" : level === "campaign" ? "campaign_id" : "adset_id";
  return Object.values(catalog.ads)
    .filter((a) => a[key] === id && !a.gone_at)
    .map((a) => a.id);
}
