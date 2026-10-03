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
 *
 * Each ad keeps `versions[]`: one entry per landing URL (host + path of the first link) it pointed
 * to, so reports can put each day's spend on the page the ad used that day. URL-parameter-only
 * edits are noted on the current version (`tag_changes`) and never start a new one.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { child } from "../logger";
import type { MetaAdCreativeInfo, MetaAdsetInfo, MetaCampaignInfo } from "./meta-client";
import type { GoogleAdGroupInfo, GoogleAdInfo, GoogleCampaignInfo, GoogleCustomerInfo } from "./google-ads-bq";
import type { GoogleConversionActionInfo } from "./google-ads-days";
import {
  appendChanges,
  metaDeliveryIssue,
  targetingField,
  targetingHash,
  targetingSummary,
  trackHistory,
  type AdsChange,
  type AdsChangeSource,
  type AdsSetupHistory,
} from "./ads-change-log";

export type { AdsSetupHistory };

/** Where a setup read's changes go (omit to skip the change log). */
export type AdsChangeSink = { changes: AdsChange[]; source: AdsChangeSource };

const log = child({ module: "ads/ads-setup" });

export const ADS_SETUP_DIR = "ads-setup";
/** 2: ads carry `versions[]` (URL history). Older files seed versions lazily on read. */
export const ADS_SETUP_VERSION = 2;
const MAX_TAG_CHANGES = 20;

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

/** One name a campaign had; days are YYYY-MM-DD in the ad account's time zone (from day rows / reads). */
export type AdsSetupCampaignName = { name: string; first_seen: string; last_seen: string };

export type AdsSetupCampaign = {
  id: string;
  account_id: string;
  name: string;
  status: string | null;
  extras?: {
    channel_type?: string | null;
    final_url_suffix?: string | null;
    /** Meta delivery settings (history only). */
    effective_status?: string | null;
    objective?: string | null;
    daily_budget?: string | null;
    lifetime_budget?: string | null;
    bid_strategy?: string | null;
    spend_cap?: string | null;
    /** Google delivery settings (optional transfer columns). */
    bidding_strategy_type?: string | null;
    budget_amount?: string | null;
    networks?: string | null;
  };
  last_seen_at: string;
  /** Every name this campaign had, oldest first (renaming back reuses the entry). */
  names?: AdsSetupCampaignName[];
  history?: AdsSetupHistory;
};

/** Meta ad set / Google ad group. */
export type AdsSetupAdset = {
  id: string;
  account_id: string;
  campaign_id: string;
  name: string;
  last_seen_at: string;
  /** Meta delivery settings (history only; set by the ad set read). */
  delivery?: {
    status: string | null;
    effective_status: string | null;
    daily_budget: string | null;
    lifetime_budget: string | null;
    bid_strategy: string | null;
    bid_amount: string | null;
    optimization_goal: string | null;
    optimization_event: string | null;
    targeting_summary: string | null;
    targeting_hash: string | null;
    start_time: string | null;
    end_time: string | null;
  };
  history?: AdsSetupHistory;
};

/** One landing URL an ad pointed to (host + path of its first link). */
export type AdsSetupAdVersion = {
  v: number;
  landing_urls: string[];
  url_tags: string | null;
  destination: "website" | "instant_form";
  /** First setup read that saw this URL; null = already live when URL history started (`seeded_at`). */
  first_seen_at: string | null;
  last_seen_at: string;
  /** v1 only: when URL history started for this ad. Days before it are filled from GA4 landings. */
  seeded_at?: string;
  /** URL-parameter / query-only edits while this URL was live (newest last). */
  tag_changes?: Array<{ at: string; url_tags: string | null; landing_url: string | null }>;
};

export type AdsSetupAd = {
  id: string;
  account_id: string;
  campaign_id: string;
  adset_id: string;
  name: string;
  /** Meta effective_status / Google ad status. */
  status: string | null;
  /** Current version's links (same as the last `versions[]` entry). */
  landing_urls: string[];
  /** Meta URL parameters field (Google keeps tracking on the campaign `final_url_suffix`). */
  url_tags: string | null;
  destination: "website" | "instant_form";
  extras?: { optimization_event?: string; approval_status?: string | null; creative_id?: string | null; configured_status?: string | null };
  last_seen_at: string;
  /** Set when a successful setup read of its account no longer returned this ad. */
  gone_at?: string;
  /** URL history, oldest first. Missing on catalogs written before versioning (see `adVersions`). */
  versions?: AdsSetupAdVersion[];
  history?: AdsSetupHistory;
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
  extras: {
    conversion_actions?: GoogleConversionActionInfo[];
    /** Set once campaign `names[]` were seeded from every stored day row. */
    names_seeded_at?: string;
  };
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
    return { ...emptyAdsSetup(platform), ...parsed, version: ADS_SETUP_VERSION };
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

// ── URL versions ────────────────────────────────────────────────────────────

/** Host (lowercased) + path (no trailing slash, no query / hash) — what makes a new URL version. */
export function bareUrlKey(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return url.split(/[?#]/)[0]!.trim().replace(/\/+$/, "");
  }
}

type VersionInput = Pick<AdsSetupAdVersion, "landing_urls" | "url_tags" | "destination">;

function versionKey(v: VersionInput): string {
  return v.destination === "instant_form" ? "instant_form" : bareUrlKey(v.landing_urls[0]);
}

/** URL history of an ad; catalogs written before versioning get one seeded version. */
export function adVersions(ad: AdsSetupAd): AdsSetupAdVersion[] {
  if (ad.versions && ad.versions.length > 0) return ad.versions;
  return [
    {
      v: 1,
      landing_urls: [...ad.landing_urls],
      url_tags: ad.url_tags,
      destination: ad.destination,
      first_seen_at: null,
      last_seen_at: ad.last_seen_at,
      seeded_at: ad.last_seen_at,
    },
  ];
}

/**
 * Apply one setup read to an ad's URL history. Same host + path → bump `last_seen_at` (and note a
 * parameter-only change); different → append a version. A read with no website link keeps the
 * current version (a missing link is not a new destination).
 */
export function nextVersions(prev: AdsSetupAdVersion[], incoming: VersionInput, nowIso: string): AdsSetupAdVersion[] {
  const list = prev.map((v) => ({ ...v }));
  const last = list.at(-1);
  if (!last) {
    return [{ v: 1, ...cloneInput(incoming), first_seen_at: null, last_seen_at: nowIso, seeded_at: nowIso }];
  }
  const noLink = incoming.destination === "website" && incoming.landing_urls.length === 0;
  if (noLink || versionKey(incoming) === versionKey(last)) {
    if (!noLink) {
      const link = incoming.landing_urls[0] ?? null;
      if ((incoming.url_tags ?? null) !== (last.url_tags ?? null) || link !== (last.landing_urls[0] ?? null)) {
        last.tag_changes = [...(last.tag_changes ?? []), { at: nowIso, url_tags: incoming.url_tags ?? null, landing_url: link }].slice(-MAX_TAG_CHANGES);
      }
      last.landing_urls = [...incoming.landing_urls];
      last.url_tags = incoming.url_tags ?? null;
    }
    last.last_seen_at = nowIso;
    return list;
  }
  list.push({ v: last.v + 1, ...cloneInput(incoming), first_seen_at: nowIso, last_seen_at: nowIso });
  return list;
}

function cloneInput(i: VersionInput): VersionInput {
  return { landing_urls: [...i.landing_urls], url_tags: i.url_tags ?? null, destination: i.destination };
}

// ── Meta ────────────────────────────────────────────────────────────────────

export type MetaSetupAdInput = MetaAdCreativeInfo & { ad_name?: string };

function metaAccountStatus(catalog: AdsSetupCatalog, accountId: string): number | null {
  const s = catalog.accounts[accountId]?.extras?.account_status;
  return typeof s === "number" ? s : null;
}

export function metaAdFromCreative(
  c: MetaSetupAdInput,
  accountId: string,
  nowIso: string,
  prev?: AdsSetupAd,
  track?: { sink?: AdsChangeSink; accountStatus?: number | null },
): AdsSetupAd {
  const current: VersionInput = { landing_urls: [...c.links], url_tags: c.url_tags ?? null, destination: c.instant_form ? "instant_form" : "website" };
  const extras: AdsSetupAd["extras"] = {
    ...(c.optimization_event ? { optimization_event: c.optimization_event } : {}),
    ...(c.creative_id ? { creative_id: c.creative_id } : {}),
    ...(c.status ? { configured_status: c.status } : {}),
  };
  const history = trackHistory(
    prev?.history,
    {
      status: c.status ?? prev?.extras?.configured_status ?? null,
      delivery_issue: metaDeliveryIssue(c.effective_status, track?.accountStatus),
      creative_id: c.creative_id ?? prev?.extras?.creative_id ?? null,
    },
    { at: nowIso, platform: "meta", level: "ad", id: c.ad_id, campaign_id: c.campaign_id, source: track?.sink?.source ?? "sync" },
    track?.sink?.changes,
  );
  return {
    id: c.ad_id,
    account_id: accountId,
    campaign_id: c.campaign_id,
    adset_id: c.adset_id,
    name: c.ad_name || prev?.name || "",
    status: c.effective_status ?? null,
    ...current,
    ...(Object.keys(extras).length > 0 ? { extras } : {}),
    last_seen_at: nowIso,
    versions: nextVersions(prev ? adVersions(prev) : [], current, nowIso),
    history,
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
export function mergeMetaAccountAds(
  catalog: AdsSetupCatalog,
  accountId: string,
  creatives: MetaAdCreativeInfo[],
  nowIso: string,
  sink?: AdsChangeSink,
): void {
  const seen = new Set<string>();
  const accountStatus = metaAccountStatus(catalog, accountId);
  for (const c of creatives) {
    seen.add(c.ad_id);
    catalog.ads[c.ad_id] = metaAdFromCreative(c, accountId, nowIso, catalog.ads[c.ad_id], { sink, accountStatus });
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

/**
 * Record that a campaign was called `name` on `day` (YYYY-MM-DD, account time zone). Extends the
 * matching entry's range (renaming back reuses it) or appends a new one.
 */
export function noteCampaignName(campaign: AdsSetupCampaign, name: string, day: string): void {
  const clean = name.trim();
  if (!clean || !day) return;
  const names = campaign.names ?? (campaign.names = []);
  const hit = names.find((n) => n.name === clean);
  if (hit) {
    if (day < hit.first_seen) hit.first_seen = day;
    if (day > hit.last_seen) hit.last_seen = day;
    return;
  }
  names.push({ name: clean, first_seen: day, last_seen: day });
  names.sort((a, b) => a.first_seen.localeCompare(b.first_seen));
}

/** Fold day rows' campaign names into `names[]` (used for the one-time seed and every sync). */
export function noteCampaignNamesFromRows(
  catalog: AdsSetupCatalog,
  rows: Array<{ account_id: string; campaign_id: string; campaign_name: string; date: string }>,
  nowIso: string,
): void {
  for (const r of rows) {
    if (!r.campaign_id || !r.campaign_name) continue;
    const c = (catalog.campaigns[r.campaign_id] ??= {
      id: r.campaign_id,
      account_id: r.account_id,
      name: r.campaign_name,
      status: null,
      last_seen_at: nowIso,
    });
    noteCampaignName(c, r.campaign_name, r.date);
  }
}

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
        ...prev,
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
        ...prev,
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
  noteCampaignNamesFromRows(catalog, rows, nowIso);
}

/** Campaign settings from the campaigns read (history + extras). Names keep coming from day rows too. */
export function mergeMetaCampaigns(
  catalog: AdsSetupCatalog,
  accountId: string,
  campaigns: MetaCampaignInfo[],
  nowIso: string,
  sink?: AdsChangeSink,
): void {
  const accountStatus = metaAccountStatus(catalog, accountId);
  for (const c of campaigns) {
    const prev = catalog.campaigns[c.id];
    const extras = {
      ...prev?.extras,
      effective_status: c.effective_status,
      objective: c.objective,
      daily_budget: c.daily_budget,
      lifetime_budget: c.lifetime_budget,
      bid_strategy: c.bid_strategy,
      spend_cap: c.spend_cap,
    };
    const history = trackHistory(
      prev?.history,
      {
        name: c.name || prev?.name || null,
        status: c.status,
        delivery_issue: metaDeliveryIssue(c.effective_status, accountStatus),
        objective: c.objective,
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget,
        bid_strategy: c.bid_strategy,
        spend_cap: c.spend_cap,
      },
      { at: nowIso, platform: "meta", level: "campaign", id: c.id, campaign_id: c.id, source: sink?.source ?? "sync" },
      sink?.changes,
    );
    catalog.campaigns[c.id] = {
      ...prev,
      id: c.id,
      account_id: accountId,
      name: c.name || prev?.name || "",
      status: c.status,
      extras,
      last_seen_at: nowIso,
      history,
    };
  }
}

/** Ad set delivery settings from the ad sets read (history + delivery block). */
export function mergeMetaAdsets(
  catalog: AdsSetupCatalog,
  accountId: string,
  adsets: MetaAdsetInfo[],
  nowIso: string,
  sink?: AdsChangeSink,
): void {
  const accountStatus = metaAccountStatus(catalog, accountId);
  for (const a of adsets) {
    const prev = catalog.adsets[a.id];
    const delivery: NonNullable<AdsSetupAdset["delivery"]> = {
      status: a.status,
      effective_status: a.effective_status,
      daily_budget: a.daily_budget,
      lifetime_budget: a.lifetime_budget,
      bid_strategy: a.bid_strategy,
      bid_amount: a.bid_amount,
      optimization_goal: a.optimization_goal,
      optimization_event: a.optimization_event ?? null,
      targeting_summary: targetingSummary(a.targeting),
      targeting_hash: targetingHash(a.targeting),
      start_time: a.start_time,
      end_time: a.end_time,
    };
    const history = trackHistory(
      prev?.history,
      {
        name: a.name || prev?.name || null,
        status: a.status,
        delivery_issue: metaDeliveryIssue(a.effective_status, accountStatus),
        daily_budget: a.daily_budget,
        lifetime_budget: a.lifetime_budget,
        bid_strategy: a.bid_strategy,
        bid_amount: a.bid_amount,
        optimization_goal: a.optimization_goal,
        optimization_event: a.optimization_event ?? null,
        targeting: targetingField(a.targeting),
        start_time: a.start_time,
        end_time: a.end_time,
      },
      { at: nowIso, platform: "meta", level: "adset", id: a.id, campaign_id: a.campaign_id, source: sink?.source ?? "sync" },
      sink?.changes,
    );
    catalog.adsets[a.id] = {
      ...prev,
      id: a.id,
      account_id: accountId,
      campaign_id: a.campaign_id,
      name: a.name || prev?.name || "",
      last_seen_at: nowIso,
      delivery,
      history,
    };
  }
}

export type CampaignNameRange = { campaign_id: string; from: string; to: string };

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Lowercased campaign name → every campaign that used it, with the days it did. */
export function campaignIdsByName(catalog: AdsSetupCatalog): Map<string, CampaignNameRange[]> {
  const out = new Map<string, CampaignNameRange[]>();
  const add = (name: string, r: CampaignNameRange) => {
    const k = nameKey(name);
    if (!k) return;
    const list = out.get(k) ?? [];
    list.push(r);
    out.set(k, list);
  };
  for (const c of Object.values(catalog.campaigns)) {
    if (c.names && c.names.length > 0) {
      for (const n of c.names) add(n.name, { campaign_id: c.id, from: n.first_seen, to: n.last_seen });
    } else if (c.name) {
      add(c.name, { campaign_id: c.id, from: "0000-01-01", to: "9999-12-31" });
    }
  }
  return out;
}

export type CampaignNameMatch = { kind: "matched"; campaign_id: string } | { kind: "ambiguous" } | { kind: "none" };

/**
 * Which campaign a visit's `utm_campaign` name meant on `day`. One campaign had the name that day →
 * it. Several → ambiguous. None that day → the name's only campaign ever (closest range), else
 * ambiguous when several ever used it.
 */
export function matchCampaignByName(index: Map<string, CampaignNameRange[]>, name: string, day: string): CampaignNameMatch {
  const ranges = index.get(nameKey(name));
  if (!ranges || ranges.length === 0) return { kind: "none" };
  const onDay = new Set(ranges.filter((r) => r.from <= day && day <= r.to).map((r) => r.campaign_id));
  if (onDay.size === 1) return { kind: "matched", campaign_id: Array.from(onDay)[0]! };
  if (onDay.size > 1) return { kind: "ambiguous" };
  const ever = new Set(ranges.map((r) => r.campaign_id));
  if (ever.size === 1) return { kind: "matched", campaign_id: Array.from(ever)[0]! };
  return { kind: "ambiguous" };
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
  const sink: AdsChangeSink = { changes: [], source: "recheck" };
  for (const c of result.found) {
    const prev = catalog.ads[c.ad_id];
    const accountId = c.account_id ?? prev?.account_id ?? "";
    catalog.ads[c.ad_id] = metaAdFromCreative(c, accountId, nowIso, prev, { sink, accountStatus: metaAccountStatus(catalog, accountId) });
  }
  for (const id of result.missing) {
    const prev = catalog.ads[id];
    if (prev && !prev.gone_at) catalog.ads[id] = { ...prev, gone_at: nowIso };
  }
  saveAdsSetup(site, catalog);
  appendChanges(site, sink.changes);
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
  sink?: AdsChangeSink,
): void {
  catalog.accounts[customerId] = {
    id: customerId,
    name: meta.customer.name,
    currency: meta.customer.currency,
    timezone: catalog.accounts[customerId]?.timezone ?? null,
    extras: { auto_tagging: meta.customer.auto_tagging },
    last_seen_at: nowIso,
  };
  const source = sink?.source ?? "sync";
  const today = nowIso.slice(0, 10);
  for (const [id, c] of Object.entries(meta.campaigns)) {
    const prev = catalog.campaigns[id];
    const budget = c.budget_amount_micros ?? null;
    const history = trackHistory(
      prev?.history,
      {
        name: c.name,
        status: c.status,
        bidding_strategy_type: c.bidding_strategy_type ?? null,
        budget_amount: budget,
        final_url_suffix: c.final_url_suffix,
        networks: c.networks ?? null,
      },
      { at: nowIso, platform: "google", level: "campaign", id, campaign_id: id, source },
      sink?.changes,
    );
    const next: AdsSetupCampaign = {
      ...prev,
      id,
      account_id: c.customer_id,
      name: c.name,
      status: c.status,
      extras: {
        channel_type: c.channel_type,
        final_url_suffix: c.final_url_suffix,
        bidding_strategy_type: c.bidding_strategy_type ?? null,
        budget_amount: budget,
        networks: c.networks ?? null,
      },
      last_seen_at: nowIso,
      history,
    };
    noteCampaignName(next, c.name, today);
    catalog.campaigns[id] = next;
  }
  for (const [id, g] of Object.entries(meta.adGroups)) {
    const prev = catalog.adsets[id];
    catalog.adsets[id] = {
      ...prev,
      id,
      account_id: meta.campaigns[g.campaign_id]?.customer_id ?? catalog.campaigns[g.campaign_id]?.account_id ?? customerId,
      campaign_id: g.campaign_id,
      name: g.name,
      last_seen_at: nowIso,
      history: trackHistory(prev?.history, { name: g.name }, { at: nowIso, platform: "google", level: "adset", id, campaign_id: g.campaign_id, source }, sink?.changes),
    };
  }
  const seen = new Set<string>();
  for (const [id, a] of Object.entries(meta.ads)) {
    seen.add(id);
    const prev = catalog.ads[id];
    const current: VersionInput = { landing_urls: [...a.final_urls], url_tags: null, destination: "website" };
    catalog.ads[id] = {
      id,
      account_id: a.customer_id,
      campaign_id: a.campaign_id,
      adset_id: a.ad_group_id,
      name: prev?.name ?? "",
      status: a.status,
      ...current,
      extras: { approval_status: a.approval_status },
      last_seen_at: nowIso,
      versions: nextVersions(prev ? adVersions(prev) : [], current, nowIso),
      history: trackHistory(
        prev?.history,
        { status: a.status, approval_status: a.approval_status },
        { at: nowIso, platform: "google", level: "ad", id, campaign_id: a.campaign_id, source },
        sink?.changes,
      ),
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
