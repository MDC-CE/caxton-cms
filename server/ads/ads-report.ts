/**
 * Paid-traffic report: joins ad platform days (Meta Graph API, Google Ads via the
 * BigQuery transfer — spend/clicks/platform leads), GA4 paid-landing days
 * (visits/engagement/GA4 leads) and credited ledger leads (unique leads/submissions)
 * per landing page. Totals are per currency — never summed across currencies.
 * Platform-reported leads (Meta, Google) and site leads are never added together.
 */

import { getSiteConfigs } from "../site-config";
import { getAdsSettings } from "../settings";
import { contentIndex as defaultContentIndex, type ContentIndex } from "../content-index";
import { getSiteContextMap } from "../site-manager";
import { createPublicUrlResolver } from "../redirects";
import { parseRoute } from "../ssr-route";
import { child } from "../logger";
import {
  adSourceTagState,
  classifyTraffic,
  metaPlatformFromSource,
  normalizeLandingPath,
  type AdPlatform,
  type GoogleNetworkRow,
  type MetaPlacementRow,
} from "@shared/paid-traffic";
import {
  creditLead,
  coveredDays,
  isLowSample,
  landingKey,
  leadPlatform,
  totalsByLanding,
  type AttributionModel,
} from "@shared/paid-attribution";
import { adsThresholds, effectiveMetaLeadKeys, META_STANDARD_LEAD_KEY, type AdsAlertThresholds } from "@shared/ads-settings";
import {
  missingTemplateParams,
  parseTrackingParams,
  unrecognizedCampaignKey,
  type AdsGa4SeenRow,
  type AdsUnrecognizedCampaign,
  type AdsUnrecognizedCampaignPage,
  type LeadGapCompare,
} from "@shared/ads-diagnostics-rules";
import {
  addDays,
  dateRange,
  listMetaDayDates,
  loadMetaCreatives,
  loadMetaPlatformRows,
  loadMetaRows,
  loadMetaState,
  META_RETENTION_DAYS,
  metaConversionNames,
  shortDateRange,
  utcDate,
} from "./meta-ads-days";
import type { MetaAdCreativeInfo, MetaAdDayRow } from "./meta-client";
import {
  lastCompleteGa4Date,
  loadPaidLandingDays,
  loadPaidLandingState,
  type PaidLandingCandidateRow,
} from "./paid-detection";
import { ledgerCollectingSince, listLedgerRows, type LedgerRow } from "./lead-ledger";
import { listConsentDaily, summarizeConsentRates } from "./consent-store";
import {
  getAdsRefreshStatus,
  hasGa4Data,
  hasMetaData,
  isMetaConnected,
  isProductionSnapshot,
  triggerAdsRefreshIfStale,
} from "./ads-refresh";
import { isRefreshActive, type AdsRefreshStatus } from "@shared/ads-refresh-status";
import { knownIdsFromRows, type AdSpendDayRow, type KnownAdIds, type SpendDestinationHint } from "./providers/types";
import { metaLeadsFor, metaRowToSpend } from "./providers/meta";
import { googleProvider } from "./providers/google";
import {
  googleDataThrough,
  googleExpectedThrough,
  loadGoogleNetworkRows,
  loadGoogleSetups,
  loadGoogleState,
} from "./google-ads-days";

const log = child({ module: "ads/ads-report" });

export const ADS_REPORT_MAX_DAYS = 90;

/** Campaign / ad set / ad id filters: OR within a level, AND across levels. */
export type AdsIdFilters = { campaign_ids?: string[]; adset_ids?: string[]; ad_ids?: string[] };

export type AdsReportOpts = AdsIdFilters & {
  site: string;
  contentRoot?: string;
  days?: number;
  /** Inclusive UTC window (YYYY-MM-DD); overrides `days` when set. */
  since?: string | null;
  until?: string | null;
  platform?: AdPlatform | "all";
  currency?: string | null;
  account?: string | null;
  content_type?: string | null;
  model?: AttributionModel;
  split_by_version?: boolean;
  /** Defaults to the content index of the site whose folder is `site`. */
  contentIndex?: ContentIndex;
  /** Skip the stale-read refresh trigger (tests / diagnostics fan-out). */
  noRefresh?: boolean;
  /** Keep the top GA4 campaign/ad-set/ad tags per row (`ga4_ads`) — diagnostics only. */
  includeGa4Ads?: boolean;
  /** Build the Facebook vs Instagram breakdown (`meta_platforms`); default true. */
  includeMetaPlatforms?: boolean;
  now?: Date;
};

/** GA4 paid visits on a row grouped by their tags (utm_id / utm_term / utm_content). */
export type AdsGa4AdRef = AdsGa4SeenRow;

const MAX_GA4_ADS_PER_ROW = 10;

export type DestinationKind =
  | "entry"
  | "instant_form"
  | "off_site"
  | "other_site"
  | "missing_page"
  | "unknown_destination"
  | SpendDestinationHint;

/** Spend that never reaches a website page (Google lead forms, calls, video views, app installs). */
const NO_SITE_DESTINATIONS = new Set<DestinationKind>(["google_lead_form", "calls", "video_views", "app"]);

export type MoneyByCurrency = Record<string, number>;

export type AdsVersionRow = {
  variant: string;
  paid_visits: number;
  unique_leads: number;
  submissions: number;
  conversion_rate: number | null;
  low_sample: boolean;
};

export type AdsCampaignRef = {
  platform: AdPlatform | null;
  campaign_id: string | null;
  campaign_name: string;
  paid_visits: number;
  spend: MoneyByCurrency;
};

export type AdsPageRow = {
  key: string;
  kind: DestinationKind;
  kind_label: string;
  host: string;
  path: string;
  url: string;
  content_type: string | null;
  slug: string | null;
  locale: string | null;
  title: string;
  redirected_from: string[];
  paid_visits: number;
  /** Paid visits whose UTM ids match a synced Meta campaign / ad set / ad (numerator of `clicks_to_visits`). */
  matched_visits: number;
  unclear_visits: number;
  /** Only under an account/currency filter: paid Meta visits with no ad tags, so not counted in `paid_visits`. */
  unassigned_visits: number;
  engaged_sessions: number;
  bounce_rate: number | null;
  avg_engaged_seconds: number | null;
  ga4_leads: number;
  spend: MoneyByCurrency;
  clicks: number;
  /** Link clicks from ads without the URL parameters template (left out of `clicks_to_visits`). */
  untagged_clicks: number;
  landing_page_views: number;
  meta_leads: number;
  instant_form_leads: number;
  /** Google-reported lead conversions (never summed with Meta or site leads). */
  google_leads: number;
  unique_leads: number;
  submissions: number;
  repeat_submissions: number;
  last_visit_organic: number;
  started_here: number;
  closed_here: number;
  conversion_rate: number | null;
  cost_per_visit: MoneyByCurrency;
  cost_per_lead: MoneyByCurrency;
  /** matched_visits / link clicks from tagged ads on days GA4 exported; can exceed 1 on a measurement mismatch. */
  clicks_to_visits: number | null;
  organic: { sessions: number; bounce_rate: number | null; lead_rate: number | null } | null;
  low_sample: boolean;
  platforms: AdPlatform[];
  campaigns: AdsCampaignRef[];
  versions?: AdsVersionRow[];
  /** Only with `includeGa4Ads`: top GA4 paid-visit tags on this row, by visits. */
  ga4_ads?: AdsGa4AdRef[];
  /** Only with `includeGa4Ads`: paid visits with no ad id (utm_content) tag. */
  ga4_untagged_visits?: number;
};

export type AdsCampaignGroup = {
  key: string;
  platform: AdPlatform | null;
  campaign_id: string | null;
  campaign_name: string;
  spend: MoneyByCurrency;
  clicks: number;
  meta_leads: number;
  google_leads: number;
  paid_visits: number;
  pages: Array<{ key: string; title: string; path: string; paid_visits: number }>;
};

export type AdsWarning = { code: string; message: string };

export type AdsLeadConversions = {
  /** Conversions picked in Settings → Ads → Meta (`fb_pixel_lead` or custom conversion ids); empty = standard Lead fallback. */
  meta_picked: string[];
  /** When the picks last changed (all windows recalculate from the cache). */
  meta_changed_at: string | null;
  /** Counted Meta keys (picked, or `fb_pixel_lead` when none) with window counts; sum = `totals.meta_leads`. */
  meta: Array<{ key: string; name: string; count: number }>;
  /** Site conversion names behind `totals.unique_leads` (credited, non-test, non-repeat), highest first. */
  site: Array<{ name: string; count: number }>;
  /** Window days whose cached Meta rows predate per-conversion counts, so picked custom conversions read 0 there. */
  meta_incomplete_days: number;
  /** Dev production copy downloaded before production cached per-conversion counts. */
  snapshot_lacks_conversions: boolean;
};

export const SITE_CONVERSION_UNNAMED = "(no conversion name)";
export const META_STANDARD_LEAD_LABEL = "Standard Lead event";

/** One placement in the Facebook vs Instagram breakdown (site ads only). */
export type AdsMetaPlatformRow = {
  platform: MetaPlacementRow;
  spend: MoneyByCurrency;
  clicks: number;
  meta_leads: number;
  paid_visits: number;
  unique_leads: number;
  cost_per_lead: MoneyByCurrency | null;
  conversion_rate: number | null;
  low_sample: boolean;
};

export type AdsMetaPlatforms = {
  /** Placements with any activity, Facebook first, `not_split` last. */
  rows: AdsMetaPlatformRow[];
  /** Spend on ads that don't land on this site, kept out of the rows. */
  excluded_spend: { instant_form: MoneyByCurrency; off_site: MoneyByCurrency; unknown: MoneyByCurrency };
  /** Earliest date every account in scope has placement spend; null until each finished its 90-day placement load. */
  spend_since: string | null;
  /** Placement spend is missing for part of the window (history still loading, or last placement read failed). */
  spend_partial: boolean;
  /** Share of paid Meta visits without per-platform tags (0–1). */
  not_split_share: number | null;
};

/** One Google network row (all Google spend, whatever its destination). */
export type AdsGoogleNetworkRow = {
  network: GoogleNetworkRow;
  spend: MoneyByCurrency;
  clicks: number;
  impressions: number;
  paid_visits: number;
};

export type AdsGoogleNetworks = {
  /** Networks with any activity; `not_split` = paid Google visits we couldn't tie to a network. */
  rows: AdsGoogleNetworkRow[];
  /** Share of paid Google visits without a network (0–1). */
  not_split_share: number | null;
};

export type AdsGoogleBlock = {
  /** Google rows are readable (connected, or a downloaded copy). */
  connected: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  /** Newest day the BigQuery transfer loaded for every connected account ("Google data through"). */
  data_through: string | null;
  /** Days after this are still expected from the transfer and aren't counted as gaps. */
  expected_through: string;
  accounts: Array<{
    id: string;
    name?: string;
    currency?: string;
    history_loaded: boolean;
    data_through?: string | null;
    auto_tagging?: boolean | null;
    sync_error?: string;
  }>;
  /** Paid Google visits carrying a customer id that isn't ticked in Settings → Ads → Google. */
  unconnected_accounts: Array<{ customer_id: string; paid_visits: number }>;
  /** Accounts found in the transfer dataset but not ticked. */
  available_accounts: string[];
  /** Paid Google visits by how we tied them to a campaign (GA4 link, gclid join, URL suffix tags, or not at all). */
  visit_match: { ga4_link: number; gclid: number; tags: number; none: number };
};

export type AdsReport = {
  window: { start: string; end: string; days: number };
  platform: AdPlatform | "all";
  attribution: { model: AttributionModel; lookback_days: 30; basis: "browser_observed" };
  meta: {
    /** Meta rows are readable: connected, or a production download without a local token. */
    connected: boolean;
    /** `production_snapshot`: a dev copy downloaded from production that this server cannot re-sync. */
    source: "sync" | "production_snapshot";
    /** Set with `production_snapshot`: when it was downloaded, its newest day and origin. */
    pulled_at?: string;
    last_date?: string;
    production_origin?: string;
    last_synced_at: string | null;
    last_error: string | null;
    consecutive_failures: number;
    accounts: Array<{
      id: string;
      name?: string;
      currency?: string;
      /** False until a full 90-day load finished for this account. */
      history_loaded: boolean;
      /** Why the last sync skipped this account (other accounts still saved). */
      sync_error?: string;
    }>;
  };
  google: AdsGoogleBlock;
  ga4: { configured: boolean; last_synced_at: string | null; last_export_date: string | null; last_error: string | null };
  /** Derived from `refresh` (queued or running); kept for older clients. */
  refreshing: boolean;
  refresh: AdsRefreshStatus;
  collecting_since: string | null;
  covered_days: { covered: number; total: number };
  /** Window days with no cached day file (Meta when connected; GA4 through its last complete day when configured). */
  data_gaps: { meta_missing_days: number; ga4_missing_days: number; google_missing_days: number };
  /** Id filters applied (empty arrays when none). */
  filters: { campaign_ids: string[]; adset_ids: string[]; ad_ids: string[] };
  /** GA4 paid leads vs ledger submissions over days both cover (for the lead-gap diagnostic). */
  lead_gap_compare: LeadGapCompare;
  consent: { mode: "advanced"; ask_region_reject_pct: number | null; ask_region_shown: number };
  totals: {
    spend: MoneyByCurrency;
    tracked_spend: MoneyByCurrency;
    clicks: number;
    landing_page_views: number;
    paid_visits: number;
    unclear_visits: number;
    /** Paid Meta visits whose UTM ids match a synced campaign / ad set / ad. */
    matched_visits: number;
    /** Paid Meta visits with no matching synced id (other accounts, shared links, untagged ads). */
    unmatched_meta_visits: number;
    /** Only under an account/currency filter: paid Meta visits with no ad tags, excluded from `paid_visits`. */
    unassigned_visits: number;
    /** Only under an account/currency filter: paid Meta visits tagged with ids from accounts that are not synced. */
    unsynced_account_visits: number;
    /** Link clicks from tagged ads landing on this site, on days with a GA4 export (denominator of clicks → visits). */
    ratio_clicks: number;
    /** Link clicks from ads missing the URL parameters template, landing on this site. */
    untagged_clicks: number;
    meta_leads: number;
    instant_form_leads: number;
    google_leads: number;
    ga4_leads: number;
    unique_leads: number;
    submissions: number;
    repeat_submissions: number;
    test_submissions: number;
  };
  /** What sits behind `totals.meta_leads` and `totals.unique_leads`, per conversion name (Leads card badges). */
  lead_conversions: AdsLeadConversions;
  pages: AdsPageRow[];
  destinations: AdsPageRow[];
  campaigns: AdsCampaignGroup[];
  /** Facebook vs Instagram (Meta placements); omitted when Meta is out of scope or `includeMetaPlatforms` is false. */
  meta_platforms?: AdsMetaPlatforms;
  /** Google Search / Display / YouTube / Performance Max; omitted when Google is out of scope or not connected. */
  google_networks?: AdsGoogleNetworks;
  /** Only with `includeGa4Ads` and Meta connected: campaigns sending paid Meta visits that no connected account knows. */
  unrecognized_campaigns?: AdsUnrecognizedCampaigns;
  thresholds: AdsAlertThresholds;
  warnings: AdsWarning[];
};

type Agg = {
  row: AdsPageRow;
  engagementMs: number;
  organicSessions: number;
  organicEngaged: number;
  organicWithLead: number;
  campaigns: Map<string, AdsCampaignRef>;
  platforms: Set<AdPlatform>;
  versions: Map<string, { paid_visits: number; unique_leads: number; submissions: number }>;
  ga4Ads?: Map<string, AdsGa4AdRef>;
  ga4Untagged?: number;
  ratioClicks: number;
};

function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 28;
  return Math.min(ADS_REPORT_MAX_DAYS, Math.max(1, Math.floor(n)));
}

/** A `since` / `until` window the report cannot serve (bad date, reversed, longer than 90 days). */
export class AdsReportRangeError extends Error {}

/** Id filters with both platforms connected: campaign / ad set ids aren't unique across Meta and Google. */
export class AdsPlatformRequiredError extends AdsReportRangeError {
  readonly code = "platform_required_for_ids";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(raw: string, label: string): string {
  if (!DATE_RE.test(raw) || addDays(raw, 0) !== raw) throw new AdsReportRangeError(`${label} must be a real date as YYYY-MM-DD (got "${raw}").`);
  return raw;
}

function spanDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export type ReportWindow = { start: string; end: string; days: number; clamped: Array<"since" | "until"> };

/**
 * Inclusive UTC window ending at most yesterday and starting no earlier than the
 * cache retention floor. `since` / `until` override `days`; spans over 90 days throw.
 */
export function resolveReportWindow(opts: { days?: unknown; since?: string | null; until?: string | null; now?: Date }): ReportWindow {
  const today = utcDate(opts.now ?? new Date());
  const yesterday = addDays(today, -1);
  const floor = addDays(today, -META_RETENTION_DAYS);
  if (!opts.since && !opts.until) {
    const days = clampDays(opts.days);
    return { start: addDays(yesterday, -(days - 1)), end: yesterday, days, clamped: [] };
  }
  let start: string;
  let end: string;
  if (opts.since && opts.until) {
    start = parseDay(opts.since, "since");
    end = parseDay(opts.until, "until");
    if (start > end) throw new AdsReportRangeError(`since (${start}) is after until (${end}).`);
  } else if (opts.since) {
    start = parseDay(opts.since, "since");
    const len = opts.days == null ? ADS_REPORT_MAX_DAYS : clampDays(opts.days);
    const candidate = addDays(start, len - 1);
    end = candidate > yesterday ? yesterday : candidate;
  } else {
    end = parseDay(opts.until!, "until");
    start = addDays(end, -(clampDays(opts.days) - 1));
  }
  const clamped: ReportWindow["clamped"] = [];
  if (end > yesterday) {
    end = yesterday;
    clamped.push("until");
  }
  if (start < floor) {
    start = floor;
    clamped.push("since");
  }
  if (start > end) throw new AdsReportRangeError(`No days left in ${start}..${end}: data is kept from ${floor} through yesterday (${yesterday}).`);
  const days = spanDays(start, end);
  if (days > ADS_REPORT_MAX_DAYS) {
    throw new AdsReportRangeError(`Range ${start}..${end} is ${days} days; the maximum is ${ADS_REPORT_MAX_DAYS}. Split it into smaller ranges.`);
  }
  return { start, end, days, clamped };
}

/** Compress sorted YYYY-MM-DD dates into `a..b` ranges (single days stay bare). */
export function compressDateRanges(dates: string[], max = 5): string {
  const ranges: string[] = [];
  let from: string | null = null;
  let prev: string | null = null;
  const flush = () => {
    if (from && prev) ranges.push(from === prev ? from : `${from}..${prev}`);
  };
  for (const d of dates) {
    if (prev && addDays(prev, 1) === d) {
      prev = d;
      continue;
    }
    flush();
    from = d;
    prev = d;
  }
  flush();
  return ranges.length > max ? `${ranges.slice(0, max).join(", ")} and ${ranges.length - max} more` : ranges.join(", ");
}

type IdSets = { campaign: Set<string> | null; adset: Set<string> | null; ad: Set<string> | null };
type DerivedIds = { campaign: string | null; adset: string | null; ad: string | null };

function idSets(f: AdsIdFilters): IdSets | null {
  const set = (xs?: string[]) => (xs && xs.length > 0 ? new Set(xs) : null);
  const s = { campaign: set(f.campaign_ids), adset: set(f.adset_ids), ad: set(f.ad_ids) };
  return s.campaign || s.adset || s.ad ? s : null;
}

/** Fill missing parent ids (ad → ad set → campaign) from synced platform rows. */
function makeIdDeriver(rows: Array<Pick<AdSpendDayRow, "campaign_id" | "adset_id" | "ad_id">>) {
  const adParents = new Map<string, { adset: string; campaign: string }>();
  const adsetParent = new Map<string, string>();
  for (const r of rows) {
    if (r.ad_id && !adParents.has(r.ad_id)) adParents.set(r.ad_id, { adset: r.adset_id, campaign: r.campaign_id });
    if (r.adset_id && !adsetParent.has(r.adset_id)) adsetParent.set(r.adset_id, r.campaign_id);
  }
  return (campaign: string | null, adset: string | null, ad: string | null): DerivedIds => {
    const p = ad ? adParents.get(ad) : undefined;
    const adsetId = adset || p?.adset || null;
    return { ad: ad || null, adset: adsetId, campaign: campaign || p?.campaign || (adsetId ? adsetParent.get(adsetId) : undefined) || null };
  };
}

function idsMatch(d: DerivedIds, s: IdSets): boolean {
  if (s.ad && !(d.ad && s.ad.has(d.ad))) return false;
  if (s.adset && !(d.adset && s.adset.has(d.adset))) return false;
  if (s.campaign && !(d.campaign && s.campaign.has(d.campaign))) return false;
  return true;
}

function finestLevel(s: IdSets): keyof DerivedIds {
  return s.ad ? "ad" : s.adset ? "adset" : "campaign";
}

const LEVEL_LABEL: Record<keyof DerivedIds, string> = { ad: "ad", adset: "ad set", campaign: "campaign" };

function addMoney(target: MoneyByCurrency, currency: string, amount: number): void {
  if (!currency || !amount) return;
  target[currency] = Math.round(((target[currency] ?? 0) + amount) * 100) / 100;
}

function divMoney(money: MoneyByCurrency, denom: number): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  if (denom <= 0) return out;
  for (const [c, v] of Object.entries(money)) out[c] = Math.round((v / denom) * 100) / 100;
  return out;
}

function humanizeSlug(slug: string): string {
  const s = slug.replace(/[-_]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : slug;
}

function parseUrl(raw: string): { host: string; path: string } | null {
  try {
    const u = new URL(raw);
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: normalizeLandingPath(u.pathname) };
  } catch {
    return null;
  }
}

type HostSets = { own: Set<string>; primary: string; sister: Set<string> };

function hostSets(site: string): HostSets {
  const own = new Set<string>();
  const sister = new Set<string>();
  let primary = "";
  for (const cfg of getSiteConfigs()) {
    const hosts = [cfg.domain, ...(cfg.aliases ?? [])].map((h) => h.toLowerCase().replace(/^www\./, ""));
    if (cfg.contentFolder === site) {
      primary = hosts[0] ?? "";
      hosts.forEach((h) => own.add(h));
    } else {
      hosts.forEach((h) => sister.add(h));
    }
  }
  const siteUrl = process.env.SITE_URL ? parseUrl(process.env.SITE_URL) : null;
  if (siteUrl?.host) own.add(siteUrl.host);
  return { own, primary, sister };
}

export type Resolved = {
  kind: DestinationKind;
  key: string;
  host: string;
  path: string;
  content_type: string | null;
  slug: string | null;
  locale: string | null;
  redirected_from?: string;
  /** Paths that redirected before reaching `path` (first = the URL the ad used). */
  redirect_chain: string[];
};

const MAX_REDIRECT_HOPS = 3;

export const DESTINATION_LABELS: Record<DestinationKind, string> = {
  entry: "Page",
  instant_form: "Instant form",
  off_site: "Off-site",
  other_site: "Another of our sites",
  missing_page: "Page no longer exists or isn't managed here",
  unknown_destination: "Destination unknown",
  google_lead_form: "Google lead form",
  calls: "Calls",
  video_views: "Video views",
  app: "App",
};

function fixedDestination(kind: DestinationKind): Resolved {
  return { kind, key: `dest:${kind}`, host: "", path: "", content_type: null, slug: null, locale: null, redirect_chain: [] };
}

function siteContentIndex(site: string): ContentIndex {
  try {
    for (const ctx of Array.from(getSiteContextMap().values())) {
      if (ctx.contentRootName === site || ctx.config.contentFolder === site) return ctx.contentIndex;
    }
  } catch (err) {
    log.warn({ err, site }, "[ads-report] site map unavailable; using default content index");
  }
  return defaultContentIndex;
}

/** Same answers as the public site: redirects first ("before" redirects win), then routing. */
function makeResolver(ci: ContentIndex, hosts: HostSets) {
  const cache = new Map<string, Resolved>();
  let publicUrls: ReturnType<typeof createPublicUrlResolver> | null = null;
  const redirectTarget = (p: string): string | null => {
    publicUrls ??= createPublicUrlResolver(ci, { freshRedirects: false });
    const r = publicUrls.test(p);
    return r.match && r.resolvedTo ? r.resolvedTo : null;
  };

  const pageAt = (p: string): { content_type: string; slug: string; locale: string } | null => {
    const route = parseRoute(p, ci);
    if (route) return { content_type: route.contentType, slug: route.slug, locale: route.locale };
    const r = ci.resolveUrl(p);
    if (!r) return null;
    const locale = !r.patternLocale || r.patternLocale === "default" ? "en" : r.patternLocale;
    return { content_type: r.contentType, slug: r.slug, locale };
  };

  const resolveUncached = (startHost: string, startPath: string): Resolved => {
    let host = startHost;
    let p = startPath;
    const chain: string[] = [];
    for (;;) {
      const base = { host, path: p, content_type: null, slug: null, locale: null, redirect_chain: chain };
      if (host && !hosts.own.has(host) && hosts.own.size > 0) {
        return { ...base, kind: hosts.sister.has(host) ? "other_site" : "off_site", key: `dest:${host}|${p}` };
      }
      const to = chain.length < MAX_REDIRECT_HOPS && !chain.includes(p) ? redirectTarget(p) : null;
      const target = to ? (/^https?:\/\//i.test(to) ? parseUrl(to) : { host, path: normalizeLandingPath(to) }) : null;
      if (target && !(target.host === host && target.path === p)) {
        chain.push(p);
        host = target.host;
        p = target.path;
        continue;
      }
      const page = pageAt(p);
      if (!page) return { ...base, kind: "missing_page", key: `dest:${host}|${p}` };
      const canonical = ci.getLocaleUrls(page.slug, page.content_type)[page.locale];
      return {
        ...base,
        ...page,
        kind: "entry",
        key: `entry:${page.content_type}/${page.slug}/${page.locale}`,
        path: normalizeLandingPath(canonical || p),
        redirected_from: chain[0],
      };
    }
  };

  return (hostRaw: string, pathRaw: string): Resolved => {
    const host = (hostRaw || hosts.primary).toLowerCase().replace(/^www\./, "");
    const p = normalizeLandingPath(pathRaw || "/");
    const cacheKey = `${host}|${p}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const out = resolveUncached(host, p);
    cache.set(cacheKey, out);
    return out;
  };
}

export type DestinationResolver = ReturnType<typeof makeResolver>;

/** Resolve ad destinations (host + path) to site pages, following content redirects. */
export function makeDestinationResolver(site: string, contentIndex?: ContentIndex): DestinationResolver {
  return makeResolver(contentIndex ?? siteContentIndex(site), hostSets(site));
}

function emptyRow(r: Resolved, primaryHost: string): AdsPageRow {
  const title =
    r.kind === "entry" && r.slug
      ? humanizeSlug(r.slug)
      : r.kind === "instant_form"
        ? "Instant form"
        : r.kind === "unknown_destination" || NO_SITE_DESTINATIONS.has(r.kind)
          ? DESTINATION_LABELS[r.kind]
          : r.path;
  return {
    key: r.key,
    kind: r.kind,
    kind_label: DESTINATION_LABELS[r.kind],
    host: r.host,
    path: r.path,
    url: r.host ? `https://${r.host}${r.path}` : r.path,
    content_type: r.content_type,
    slug: r.slug,
    locale: r.locale,
    title: title || primaryHost,
    redirected_from: r.redirected_from ? [r.redirected_from] : [],
    paid_visits: 0,
    matched_visits: 0,
    unclear_visits: 0,
    unassigned_visits: 0,
    engaged_sessions: 0,
    bounce_rate: null,
    avg_engaged_seconds: null,
    ga4_leads: 0,
    spend: {},
    clicks: 0,
    untagged_clicks: 0,
    landing_page_views: 0,
    meta_leads: 0,
    instant_form_leads: 0,
    google_leads: 0,
    unique_leads: 0,
    submissions: 0,
    repeat_submissions: 0,
    last_visit_organic: 0,
    started_here: 0,
    closed_here: 0,
    conversion_rate: null,
    cost_per_visit: {},
    cost_per_lead: {},
    clicks_to_visits: null,
    organic: null,
    low_sample: true,
    platforms: [],
    campaigns: [],
  };
}

type KnownMetaIds = KnownAdIds;

function matchesMetaIds(c: PaidLandingCandidateRow, k: KnownMetaIds): boolean {
  return (!!c.utm_id && k.campaigns.has(c.utm_id)) || (!!c.utm_term && k.adsets.has(c.utm_term)) || (!!c.utm_content && k.ads.has(c.utm_content));
}

/** Google ids on a visit: GA4 link / gclid join first, then the URL suffix template slots. */
function googleVisitIds(c: PaidLandingCandidateRow): { campaign: string | null; adset: string | null; ad: string | null } {
  return { campaign: c.gads_campaign_id || c.utm_id || null, adset: c.gads_ad_group_id || c.utm_term || null, ad: c.utm_content || null };
}

function matchesGoogleIds(c: PaidLandingCandidateRow, k: KnownAdIds): boolean {
  const ids = googleVisitIds(c);
  return (!!ids.campaign && k.campaigns.has(ids.campaign)) || (!!ids.adset && k.adsets.has(ids.adset));
}

type ByPlatform<T> = { meta: T; google: T };

const MAX_UNRECOGNIZED_PAGES = 5;
const MAX_UNRECOGNIZED_TAGS = 10;

export type AdsUnrecognizedCampaigns = { paid_meta_visits: number; campaigns: AdsUnrecognizedCampaign[] };

/**
 * Paid Meta visits to our own pages from campaigns no connected account knows.
 * "Known" = any id in every stored Meta day (all connected accounts) or ad setup,
 * or a utm_campaign equal to a connected campaign name.
 */
function makeUnrecognizedTracker(site: string, accountIds: string[], end: string) {
  const rows = loadMetaRows(site, "0000-01-01", end, accountIds);
  const known = knownIdsFromRows(rows);
  const names = new Set(rows.map((r) => (r.campaign_name ?? "").trim().toLowerCase()).filter(Boolean));
  for (const c of Object.values(loadMetaCreatives(site).ads)) {
    if (c.campaign_id) known.campaigns.add(c.campaign_id);
    if (c.adset_id) known.adsets.add(c.adset_id);
    if (c.ad_id) known.ads.add(c.ad_id);
  }
  type Acc = AdsUnrecognizedCampaign & { pageMap: Map<string, AdsUnrecognizedCampaignPage>; tagMap: Map<string, AdsGa4SeenRow> };
  const byKey = new Map<string, Acc>();
  let paidMetaVisits = 0;
  return {
    note(c: PaidLandingCandidateRow, r: Resolved, date: string, primaryHost: string) {
      if (r.kind !== "entry" && r.kind !== "missing_page") return;
      paidMetaVisits += c.sessions;
      if (matchesMetaIds(c, known)) return;
      if (c.campaign && names.has(c.campaign.trim().toLowerCase())) return;
      const id = unrecognizedCampaignKey(c);
      if (!id || (id.campaign_id && known.campaigns.has(id.campaign_id))) return;
      let acc = byKey.get(id.key);
      if (!acc) {
        acc = { ...id, visits: 0, leads: 0, untagged_visits: 0, pages: [], ga4_seen: [], first_seen: date, last_seen: date, pageMap: new Map(), tagMap: new Map() };
        byKey.set(id.key, acc);
      }
      acc.visits += c.sessions;
      acc.leads += c.sessions_with_lead;
      if (!c.utm_content) acc.untagged_visits += c.sessions;
      if (date < acc.first_seen) acc.first_seen = date;
      if (date > acc.last_seen) acc.last_seen = date;
      const page = acc.pageMap.get(r.key) ?? { key: r.key, url: emptyRow(r, primaryHost).url, title: emptyRow(r, primaryHost).title, visits: 0 };
      page.visits += c.sessions;
      acc.pageMap.set(r.key, page);
      const tagKey = [c.source, c.medium, c.campaign, c.utm_id ?? "", c.utm_term ?? "", c.utm_content ?? ""].join("|");
      const tag = acc.tagMap.get(tagKey) ?? {
        platform: "meta",
        source: c.source,
        medium: c.medium,
        campaign: c.campaign,
        campaign_id: c.utm_id,
        adset_id: c.utm_term,
        ad_id: c.utm_content,
        visits: 0,
        leads: 0,
        first_seen: date,
        last_seen: date,
      };
      tag.visits += c.sessions;
      tag.leads += c.sessions_with_lead;
      if (date < tag.first_seen) tag.first_seen = date;
      if (date > tag.last_seen) tag.last_seen = date;
      acc.tagMap.set(tagKey, tag);
    },
    result(): AdsUnrecognizedCampaigns {
      const campaigns = Array.from(byKey.values())
        .map(({ pageMap, tagMap, ...rest }) => ({
          ...rest,
          pages: Array.from(pageMap.values()).sort((a, b) => b.visits - a.visits).slice(0, MAX_UNRECOGNIZED_PAGES),
          ga4_seen: Array.from(tagMap.values()).sort((a, b) => b.visits - a.visits).slice(0, MAX_UNRECOGNIZED_TAGS),
        }))
        .sort((a, b) => b.visits - a.visits || a.key.localeCompare(b.key));
      return { paid_meta_visits: paidMetaVisits, campaigns };
    },
  };
}

/**
 * `known` (every synced row) decides paid vs organic; `matched` uses `connected`
 * (rows after account/currency filters) so both sides of clicks → visits narrow together.
 */
function classifyCandidate(c: PaidLandingCandidateRow, known: KnownMetaIds, connected: ByPlatform<KnownAdIds>) {
  const cls = classifyTraffic({
    utm_source: c.source === "(direct)" ? null : c.source,
    utm_medium: c.medium === "(none)" ? null : c.medium,
    click_ids: c.click_id_type ? { [c.click_id_type]: "1" } : undefined,
    matches_known_meta_id: matchesMetaIds(c, known),
  });
  // GA4's Google Ads link marks the session as a Google Ads click even when source/medium were overwritten.
  if (cls.status !== "paid" && c.gads_campaign_id) {
    return { status: "paid" as const, platform: "google" as const, click_id_type: cls.click_id_type, matched: matchesGoogleIds(c, connected.google) };
  }
  const matched =
    cls.status === "paid" &&
    ((cls.platform === "meta" && matchesMetaIds(c, connected.meta)) || (cls.platform === "google" && matchesGoogleIds(c, connected.google)));
  return { ...cls, matched };
}

/** False only when the ad setup was read and lacks the URL parameters template (unknown setups count as tagged). */
function adIsTagged(creative: { links: string[]; url_tags?: string | null } | undefined): boolean {
  if (!creative || creative.links.length === 0) return true;
  const params = { ...parseTrackingParams(creative.links[0]), ...parseTrackingParams(creative.url_tags) };
  return missingTemplateParams(params).length === 0;
}

export function buildAdsReport(opts: AdsReportOpts): AdsReport {
  const now = opts.now ?? new Date();
  const win = resolveReportWindow({ days: opts.days, since: opts.since, until: opts.until, now });
  const { start, end, days } = win;
  const idFilter = idSets(opts);
  const platform = opts.platform ?? "all";
  const model: AttributionModel = opts.model ?? "last_paid";
  const settings = getAdsSettings(opts.contentRoot);
  const thresholds = adsThresholds(settings);
  const googleSettings = settings.google ?? { enabled: false, customer_ids: [], bigquery: { project: null, dataset: null }, lead_conversion_actions: [], known_external_campaigns: [] };
  const warnings: AdsWarning[] = [];
  const hosts = hostSets(opts.site);
  const resolve = makeResolver(opts.contentIndex ?? siteContentIndex(opts.site), hosts);

  const aggs = new Map<string, Agg>();
  const aggFor = (r: Resolved): Agg => {
    let a = aggs.get(r.key);
    if (!a) {
      a = {
        row: emptyRow(r, hosts.primary),
        engagementMs: 0,
        organicSessions: 0,
        organicEngaged: 0,
        organicWithLead: 0,
        campaigns: new Map(),
        platforms: new Set(),
        versions: new Map(),
        ratioClicks: 0,
      };
      aggs.set(r.key, a);
    } else if (r.redirected_from && !a.row.redirected_from.includes(r.redirected_from)) {
      a.row.redirected_from.push(r.redirected_from);
    }
    return a;
  };
  const campaignRef = (a: Agg, plat: AdPlatform | null, id: string | null, name: string): AdsCampaignRef => {
    const k = `${plat ?? ""}|${id ?? name}`;
    let c = a.campaigns.get(k);
    if (!c) {
      c = { platform: plat, campaign_id: id, campaign_name: name, paid_visits: 0, spend: {} };
      a.campaigns.set(k, c);
    }
    return c;
  };
  const campaignGroups = new Map<string, AdsCampaignGroup>();
  const groupFor = (plat: AdPlatform | null, id: string | null, name: string): AdsCampaignGroup => {
    const k = `${plat ?? ""}|${id ?? name}`;
    let g = campaignGroups.get(k);
    if (!g) {
      g = { key: k, platform: plat, campaign_id: id, campaign_name: name, spend: {}, clicks: 0, meta_leads: 0, google_leads: 0, paid_visits: 0, pages: [] };
      campaignGroups.set(k, g);
    }
    return g;
  };
  const groupPage = (g: AdsCampaignGroup, a: Agg, visits: number) => {
    let p = g.pages.find((x) => x.key === a.row.key);
    if (!p) {
      p = { key: a.row.key, title: a.row.title, path: a.row.path, paid_visits: 0 };
      g.pages.push(p);
    }
    p.paid_visits += visits;
  };

  const totals: AdsReport["totals"] = {
    spend: {},
    tracked_spend: {},
    clicks: 0,
    landing_page_views: 0,
    paid_visits: 0,
    unclear_visits: 0,
    matched_visits: 0,
    unmatched_meta_visits: 0,
    unassigned_visits: 0,
    unsynced_account_visits: 0,
    ratio_clicks: 0,
    untagged_clicks: 0,
    meta_leads: 0,
    instant_form_leads: 0,
    google_leads: 0,
    ga4_leads: 0,
    unique_leads: 0,
    submissions: 0,
    repeat_submissions: 0,
    test_submissions: 0,
  };

  type PlacementAgg = { spend: MoneyByCurrency; clicks: number; meta_leads: number; paid_visits: number; unique_leads: number };
  const placements = new Map<MetaPlacementRow, PlacementAgg>();
  const placement = (p: MetaPlacementRow): PlacementAgg => {
    let agg = placements.get(p);
    if (!agg) {
      agg = { spend: {}, clicks: 0, meta_leads: 0, paid_visits: 0, unique_leads: 0 };
      placements.set(p, agg);
    }
    return agg;
  };

  // ── Meta spend → destination ─────────────────────────────────────────────
  const metaConnected = hasMetaData(opts.site, opts.contentRoot);
  const metaState = loadMetaState(opts.site);
  /** Showing a production download that nothing here can refresh (no local Meta token). */
  const snapshotMode = metaConnected && isProductionSnapshot(opts.site) && !isMetaConnected(opts.contentRoot);
  const includeMeta = platform === "all" || platform === "meta";
  const includeGoogle = platform === "all" || platform === "google";
  const googleConnected = googleProvider.hasData(opts.site, opts.contentRoot);
  if (idFilter && platform === "all" && metaConnected && googleConnected) {
    throw new AdsPlatformRequiredError(
      "Both Meta and Google Ads are connected, so campaign / ad set / ad ids need a platform. Pass platform meta or google with the id filters.",
    );
  }
  /** Platform whose ids the filter means (only one connected → that one). */
  const filterPlatform: AdPlatform = platform !== "all" ? platform : googleConnected && !metaConnected ? "google" : "meta";
  const metaRowsAll: MetaAdDayRow[] = metaConnected ? loadMetaRows(opts.site, start, end, settings.meta.ad_account_ids) : [];
  const metaLeadKeys = effectiveMetaLeadKeys(settings.meta.lead_conversions ?? []);
  const metaSpendAll = metaRowsAll.map((m) => metaRowToSpend(m, metaLeadKeys));
  const metaKeyCounts = new Map<string, number>(metaLeadKeys.map((k) => [k, 0]));
  const googleSpendAll: AdSpendDayRow[] = googleConnected ? googleProvider.loadSpendRows(opts.site, start, end, googleSettings.customer_ids) : [];
  const deriveIds = makeIdDeriver(filterPlatform === "google" ? googleSpendAll : metaSpendAll);
  const seenIds: Record<keyof DerivedIds, Set<string>> = { campaign: new Set(), adset: new Set(), ad: new Set() };
  const noteSeen = (d: DerivedIds) => {
    if (d.campaign) seenIds.campaign.add(d.campaign);
    if (d.adset) seenIds.adset.add(d.adset);
    if (d.ad) seenIds.ad.add(d.ad);
  };
  const inScope = (p: AdPlatform) => platform === "all" || platform === p;
  const keepSpend = (r: AdSpendDayRow) => {
    if (opts.account && r.account_id !== opts.account) return false;
    if (opts.currency && r.currency !== opts.currency) return false;
    if (!idFilter) return true;
    if (r.platform !== filterPlatform) return false;
    const d: DerivedIds = { campaign: r.campaign_id || null, adset: r.adset_id || null, ad: r.ad_id || null };
    if (!idsMatch(d, idFilter)) return false;
    if (inScope(r.platform)) noteSeen(d);
    return true;
  };
  const metaSpend = metaSpendAll.filter(keepSpend);
  const googleSpend = googleSpendAll.filter(keepSpend);
  const known = knownIdsFromRows(metaSpendAll);
  const googleKnown = knownIdsFromRows(googleSpendAll);
  if (googleConnected) {
    const setups = loadGoogleSetups(opts.site);
    const ticked = new Set(googleSettings.customer_ids);
    for (const [id, c] of Object.entries(setups.campaigns)) if (ticked.has(c.customer_id)) googleKnown.campaigns.add(id);
    for (const [id, g] of Object.entries(setups.ad_groups)) if (googleKnown.campaigns.has(g.campaign_id)) googleKnown.adsets.add(id);
  }
  const connected: ByPlatform<KnownAdIds> = {
    meta: metaSpend.length === metaSpendAll.length ? known : knownIdsFromRows(metaSpend),
    google: googleSpend.length === googleSpendAll.length ? googleKnown : knownIdsFromRows(googleSpend),
  };
  /** Account/currency filters narrow spend: visits and leads count only when tied to the filtered ads. */
  const narrowToAccount = !!opts.account || !!opts.currency;

  let collectingSince: number | null = null;
  try {
    collectingSince = ledgerCollectingSince(opts.site);
  } catch {
    /* ignore */
  }
  // The ledger's first day is partial, so the GA4 comparison starts the day after.
  const ledgerFirstFullDay = collectingSince != null ? addDays(utcDate(new Date(collectingSince)), 1) : null;
  const leadGapCompare: LeadGapCompare = { days: 0, ga4_leads: 0, submissions: 0 };
  const leadGapDays = new Set<string>();

  // ── GA4 paid landings ────────────────────────────────────────────────────
  const ga4Configured = hasGa4Data(opts.site, opts.contentRoot);
  const ga4State = loadPaidLandingState(opts.site);
  const paidDays = ga4Configured ? loadPaidLandingDays(opts.site, start, end) : [];
  const adLandingVotes = new Map<string, Map<string, number>>();
  const ga4Dates = new Set(paidDays.map((d) => d.date));
  /** Filtered-out Meta visits whose finest filtered id is unknown (no tag, no parent), by row key. */
  const untaggedByKey = new Map<string, number>();
  const unrecognized = opts.includeGa4Ads && metaConnected && paidDays.length > 0 ? makeUnrecognizedTracker(opts.site, settings.meta.ad_account_ids, end) : null;
  const tickedGoogle = new Set(googleSettings.customer_ids);
  const unconnectedGoogle = new Map<string, number>();
  const googleMatch: AdsGoogleBlock["visit_match"] = { ga4_link: 0, gclid: 0, tags: 0, none: 0 };
  type NetAgg = { spend: MoneyByCurrency; clicks: number; impressions: number; paid_visits: number };
  const googleNets = new Map<GoogleNetworkRow, NetAgg>();
  const googleNet = (n: GoogleNetworkRow): NetAgg => {
    let agg = googleNets.get(n);
    if (!agg) {
      agg = { spend: {}, clicks: 0, impressions: 0, paid_visits: 0 };
      googleNets.set(n, agg);
    }
    return agg;
  };

  for (const day of paidDays) {
    const inLeadGap = ledgerFirstFullDay != null && day.date >= ledgerFirstFullDay;
    if (inLeadGap) leadGapDays.add(day.date);
    for (const c of day.candidates) {
      const cls = classifyCandidate(c, known, connected);
      if (cls.status === "organic") continue;
      if (platform !== "all" && cls.platform !== platform) continue;
      const r = resolve(c.host, c.path);
      if (unrecognized && cls.status === "paid" && cls.platform === "meta") unrecognized.note(c, r, day.date, hosts.primary);
      if (cls.status === "paid" && cls.platform === "google") {
        if (c.gads_customer_id && !tickedGoogle.has(c.gads_customer_id)) {
          unconnectedGoogle.set(c.gads_customer_id, (unconnectedGoogle.get(c.gads_customer_id) ?? 0) + c.sessions);
        }
        const how: keyof typeof googleMatch = c.gads_match ?? (googleVisitIds(c).campaign ? "tags" : "none");
        googleMatch[how] += c.sessions;
      }
      if (opts.content_type && r.content_type !== opts.content_type) continue;
      if (narrowToAccount && !cls.matched) {
        if (cls.status === "paid" && cls.platform === "meta" && !matchesMetaIds(c, known)) {
          if (!c.utm_id && !c.utm_term && !c.utm_content) {
            aggFor(r).row.unassigned_visits += c.sessions;
            totals.unassigned_visits += c.sessions;
          } else {
            totals.unsynced_account_visits += c.sessions;
          }
        }
        continue;
      }
      if (idFilter) {
        if (cls.platform !== filterPlatform) continue;
        const v = cls.platform === "google" ? googleVisitIds(c) : { campaign: c.utm_id, adset: c.utm_term, ad: c.utm_content };
        const d = deriveIds(v.campaign, v.adset, v.ad);
        if (!idsMatch(d, idFilter)) {
          if (cls.status === "paid" && !d[finestLevel(idFilter)]) untaggedByKey.set(r.key, (untaggedByKey.get(r.key) ?? 0) + c.sessions);
          continue;
        }
        noteSeen(d);
      }
      const a = aggFor(r);
      if (cls.platform) a.platforms.add(cls.platform);
      if (cls.status === "unclear") {
        a.row.unclear_visits += c.sessions;
        totals.unclear_visits += c.sessions;
        continue;
      }
      a.row.paid_visits += c.sessions;
      a.row.engaged_sessions += c.engaged_sessions;
      a.engagementMs += c.engagement_ms;
      a.row.ga4_leads += c.sessions_with_lead;
      totals.paid_visits += c.sessions;
      totals.ga4_leads += c.sessions_with_lead;
      if (cls.platform === "meta") placement(metaPlatformFromSource(c.source)).paid_visits += c.sessions;
      if (cls.platform === "google") googleNet(c.gads_network ?? "not_split").paid_visits += c.sessions;
      if (cls.matched) {
        a.row.matched_visits += c.sessions;
        totals.matched_visits += c.sessions;
      } else if (cls.platform === "meta") {
        totals.unmatched_meta_visits += c.sessions;
      }
      if (inLeadGap) leadGapCompare.ga4_leads += c.sessions_with_lead;
      const googleCampaign = cls.platform === "google" ? googleVisitIds(c).campaign : null;
      const campaignId =
        cls.platform === "meta" && c.utm_id && known.campaigns.has(c.utm_id)
          ? c.utm_id
          : googleCampaign && (c.gads_campaign_id || googleKnown.campaigns.has(googleCampaign))
            ? googleCampaign
            : null;
      campaignRef(a, cls.platform, campaignId, c.campaign).paid_visits += c.sessions;
      const g = groupFor(cls.platform, campaignId, c.campaign);
      g.paid_visits += c.sessions;
      groupPage(g, a, c.sessions);
      if (opts.includeGa4Ads) {
        const tagKey = [cls.platform ?? "", c.source, c.medium, c.campaign, c.utm_id ?? "", c.utm_term ?? "", c.utm_content ?? ""].join("|");
        a.ga4Ads ??= new Map();
        const ref = a.ga4Ads.get(tagKey) ?? {
          platform: cls.platform,
          source: c.source,
          medium: c.medium,
          campaign: c.campaign,
          campaign_id: c.utm_id,
          adset_id: c.utm_term,
          ad_id: c.utm_content,
          visits: 0,
          leads: 0,
          first_seen: day.date,
          last_seen: day.date,
        };
        ref.visits += c.sessions;
        ref.leads += c.sessions_with_lead;
        if (day.date < ref.first_seen) ref.first_seen = day.date;
        if (day.date > ref.last_seen) ref.last_seen = day.date;
        a.ga4Ads.set(tagKey, ref);
        if (!c.utm_content) a.ga4Untagged = (a.ga4Untagged ?? 0) + c.sessions;
      }
      if (opts.split_by_version && c.variant) {
        const v = a.versions.get(c.variant) ?? { paid_visits: 0, unique_leads: 0, submissions: 0 };
        v.paid_visits += c.sessions;
        a.versions.set(c.variant, v);
      }
      if (c.utm_content && known.ads.has(c.utm_content)) {
        const votes = adLandingVotes.get(c.utm_content) ?? new Map<string, number>();
        votes.set(`${c.host}|${c.path}`, (votes.get(`${c.host}|${c.path}`) ?? 0) + c.sessions);
        adLandingVotes.set(c.utm_content, votes);
      }
    }
    for (const o of day.organic) {
      const r = resolve(o.host, o.path);
      const a = aggs.get(r.key);
      if (!a) continue;
      a.organicSessions += o.sessions;
      a.organicEngaged += o.engaged_sessions;
      a.organicWithLead += o.sessions_with_lead;
    }
  }

  let creativesCache: Record<string, MetaAdCreativeInfo> | null = null;
  const creatives = (): Record<string, MetaAdCreativeInfo> => (creativesCache ??= loadMetaCreatives(opts.site).ads);
  const destinationCache = new Map<string, Resolved>();
  /** Where an ad sends people: its creative link, else the page most of its GA4 visits landed on. */
  const destinationOf = (adId: string, hasInstantFormLeads: boolean): Resolved => {
    const cacheKey = `${adId}|${hasInstantFormLeads ? 1 : 0}`;
    const hit = destinationCache.get(cacheKey);
    if (hit) return hit;
    const creative = creatives()[adId];
    let r: Resolved;
    if (creative?.instant_form || (hasInstantFormLeads && !creative?.links.length)) {
      r = { kind: "instant_form", key: "dest:instant_form", host: "", path: "", content_type: null, slug: null, locale: null, redirect_chain: [] };
    } else {
      const link = creative?.links[0] ? parseUrl(creative.links[0]) : null;
      const votes = adLandingVotes.get(adId);
      const voted = votes ? Array.from(votes.entries()).sort((x, y) => y[1] - x[1])[0]?.[0] : undefined;
      const target = link ?? (voted ? { host: voted.split("|")[0]!, path: voted.split("|")[1]! } : null);
      r = target
        ? resolve(target.host, target.path)
        : { kind: "unknown_destination", key: "dest:unknown", host: "", path: "", content_type: null, slug: null, locale: null, redirect_chain: [] };
    }
    destinationCache.set(cacheKey, r);
    return r;
  };

  /** Google: fixed kinds for spend with no website link, else the reported landing page. */
  const googleDestination = (m: AdSpendDayRow): Resolved => {
    if (m.destination_hint) return fixedDestination(m.destination_hint);
    const link = m.landing_url ? parseUrl(m.landing_url) : null;
    return link ? resolve(link.host, link.path) : fixedDestination("unknown_destination");
  };

  const spendRows: AdSpendDayRow[] = [...(includeMeta ? metaSpend : []), ...(includeGoogle ? googleSpend : [])];
  for (const m of spendRows) {
    totals.clicks += m.clicks;
    totals.landing_page_views += m.landing_page_views;
    if (m.platform === "meta") {
      totals.meta_leads += m.platform_leads;
      totals.instant_form_leads += m.form_leads;
      for (const k of metaLeadKeys) {
        const n = m.conversions ? (m.conversions[k] ?? 0) : k === META_STANDARD_LEAD_KEY ? m.platform_leads : 0;
        if (n) metaKeyCounts.set(k, (metaKeyCounts.get(k) ?? 0) + n);
      }
    } else {
      totals.google_leads += m.platform_leads;
    }
    addMoney(totals.spend, m.currency, m.spend);

    const r = m.platform === "meta" ? destinationOf(m.ad_id, m.form_leads > 0) : googleDestination(m);
    if (opts.content_type && r.content_type !== opts.content_type) continue;
    const a = aggFor(r);
    a.platforms.add(m.platform);
    addMoney(a.row.spend, m.currency, m.spend);
    a.row.clicks += m.clicks;
    a.row.landing_page_views += m.landing_page_views;
    if (m.platform === "meta") {
      a.row.meta_leads += m.platform_leads;
      a.row.instant_form_leads += m.form_leads;
    } else {
      a.row.google_leads = Math.round((a.row.google_leads + m.platform_leads) * 1000) / 1000;
    }
    if (r.kind === "entry" || r.kind === "missing_page") {
      const tagged = m.tagged ?? (m.platform === "meta" ? adIsTagged(creatives()[m.ad_id]) : true);
      if (!tagged) {
        a.row.untagged_clicks += m.clicks;
        totals.untagged_clicks += m.clicks;
      } else if (ga4Dates.has(m.date)) {
        a.ratioClicks += m.clicks;
        totals.ratio_clicks += m.clicks;
      }
    }
    if (r.kind === "entry") addMoney(totals.tracked_spend, m.currency, m.spend);
    addMoney(campaignRef(a, m.platform, m.campaign_id, m.campaign_name).spend, m.currency, m.spend);
    const g = groupFor(m.platform, m.campaign_id, m.campaign_name);
    addMoney(g.spend, m.currency, m.spend);
    g.clicks += m.clicks;
    if (m.platform === "meta") g.meta_leads += m.platform_leads;
    else g.google_leads = Math.round((g.google_leads + m.platform_leads) * 1000) / 1000;
    groupPage(g, a, 0);
  }
  totals.google_leads = Math.round(totals.google_leads * 1000) / 1000;

  // ── Google spend per network (all destinations) ──────────────────────────
  const buildGoogleNetworks = includeGoogle && googleConnected;
  if (buildGoogleNetworks) {
    const keptCampaigns = idFilter || narrowToAccount ? new Set(googleSpend.map((r) => r.campaign_id)) : null;
    for (const n of loadGoogleNetworkRows(opts.site, start, end, googleSettings.customer_ids)) {
      if (opts.account && n.customer_id !== opts.account) continue;
      if (opts.currency && n.currency !== opts.currency) continue;
      if (keptCampaigns && !keptCampaigns.has(n.campaign_id)) continue;
      const agg = googleNet(n.network);
      addMoney(agg.spend, n.currency, n.spend);
      agg.clicks += n.clicks;
      agg.impressions += n.impressions;
    }
  }

  // ── Meta spend per placement (site ads only) ─────────────────────────────
  const buildPlacements = includeMeta && metaConnected && opts.includeMetaPlatforms !== false;
  const excludedSpend: AdsMetaPlatforms["excluded_spend"] = { instant_form: {}, off_site: {}, unknown: {} };
  if (buildPlacements) {
    const instantFormAds = new Set(metaRowsAll.filter((m) => m.instant_form_leads > 0).map((m) => m.ad_id));
    const tagStateCache = new Map<string, "split" | "not_split">();
    const tagState = (adId: string) => {
      let s = tagStateCache.get(adId);
      if (!s) {
        const creative = creatives()[adId];
        s = adSourceTagState(creative ? { ...parseTrackingParams(creative.links[0]), ...parseTrackingParams(creative.url_tags) } : null);
        tagStateCache.set(adId, s);
      }
      return s;
    };
    for (const m of loadMetaPlatformRows(opts.site, start, end, settings.meta.ad_account_ids)) {
      if (opts.account && m.account_id !== opts.account) continue;
      if (opts.currency && m.currency !== opts.currency) continue;
      if (idFilter && !idsMatch({ campaign: m.campaign_id || null, adset: m.adset_id || null, ad: m.ad_id || null }, idFilter)) continue;
      const r = destinationOf(m.ad_id, instantFormAds.has(m.ad_id));
      if (opts.content_type && r.content_type !== opts.content_type) continue;
      if (r.kind === "entry" || r.kind === "missing_page") {
        const p = placement(tagState(m.ad_id) === "split" ? m.platform : "not_split");
        addMoney(p.spend, m.currency, m.spend);
        p.clicks += m.link_clicks;
        p.meta_leads += metaLeadsFor(m, metaLeadKeys);
      } else if (r.kind === "instant_form") {
        addMoney(excludedSpend.instant_form, m.currency, m.spend);
      } else if (r.kind === "unknown_destination") {
        addMoney(excludedSpend.unknown, m.currency, m.spend);
      } else {
        addMoney(excludedSpend.off_site, m.currency, m.spend);
      }
    }
  }

  // ── Ledger leads (credited to one paid landing) ──────────────────────────
  const sinceMs = Date.parse(`${start}T00:00:00.000Z`);
  const untilMs = Date.parse(`${addDays(end, 1)}T00:00:00.000Z`);
  let ledger: LedgerRow[] = [];
  try {
    ledger = listLedgerRows(opts.site, sinceMs).filter((r) => r.created_at < untilMs);
  } catch (err) {
    log.warn({ err }, "[ads-report] ledger unavailable");
  }
  let legacyLeads = 0;
  let legacyIdLeads = 0;
  const filteredLedger = ledger.filter((r) => {
    const lp = leadPlatform(r, model);
    if (lp.legacy && !r.is_test) legacyLeads++;
    if (platform !== "all" && lp.platform !== platform) return false;
    if (narrowToAccount) {
      const k = lp.platform === "google" ? connected.google : connected.meta;
      if (!((lp.campaign_id && k.campaigns.has(lp.campaign_id)) || (lp.adset_id && k.adsets.has(lp.adset_id)) || (lp.ad_id && k.ads.has(lp.ad_id)))) {
        return false;
      }
    }
    if (idFilter) {
      if (lp.platform && lp.platform !== filterPlatform && (lp.platform === "meta" || lp.platform === "google")) return false;
      const d = deriveIds(lp.campaign_id, lp.adset_id, lp.ad_id);
      if (!idsMatch(d, idFilter)) return false;
      noteSeen(d);
      if (lp.legacy) legacyIdLeads++;
    }
    return true;
  });
  totals.test_submissions = filteredLedger.filter((r) => r.is_test).length;
  const credits = filteredLedger.map((r) => ({ lead: r, credit: creditLead(r, model) }));
  const byLanding = totalsByLanding(credits.map((c) => c.credit));
  for (const t of Array.from(byLanding.values())) {
    const r = resolve(t.host, t.path);
    if (opts.content_type && r.content_type !== opts.content_type) continue;
    const a = aggFor(r);
    a.row.unique_leads += t.unique_leads;
    a.row.submissions += t.submissions;
    a.row.repeat_submissions += t.repeat_submissions;
    a.row.last_visit_organic += t.last_visit_organic;
    totals.unique_leads += t.unique_leads;
    totals.submissions += t.submissions;
    totals.repeat_submissions += t.repeat_submissions;
  }
  const siteConversionCounts = new Map<string, number>();
  for (const { lead, credit } of credits) {
    if (credit.reason !== "credited" || credit.is_repeat || !credit.host || !credit.path) continue;
    if (opts.content_type && resolve(credit.host, credit.path).content_type !== opts.content_type) continue;
    const name = lead.form?.trim() || SITE_CONVERSION_UNNAMED;
    siteConversionCounts.set(name, (siteConversionCounts.get(name) ?? 0) + 1);
  }
  if (buildPlacements) {
    for (const { lead, credit } of credits) {
      if (credit.reason !== "credited" || credit.is_repeat || leadPlatform(lead, model).platform !== "meta" || !credit.host || !credit.path) continue;
      if (opts.content_type && resolve(credit.host, credit.path).content_type !== opts.content_type) continue;
      placement(metaPlatformFromSource(lead.utm_source)).unique_leads += 1;
    }
  }
  leadGapCompare.days = leadGapDays.size;
  for (const { lead, credit } of credits) {
    if (credit.reason !== "credited" || !credit.host || !credit.path) continue;
    if (!leadGapDays.has(utcDate(new Date(lead.created_at)))) continue;
    if (opts.content_type && resolve(credit.host, credit.path).content_type !== opts.content_type) continue;
    leadGapCompare.submissions += 1;
  }
  if (opts.split_by_version) {
    for (const { lead, credit } of credits) {
      if (credit.reason !== "credited" || !credit.host || !credit.path) continue;
      const a = aggs.get(resolve(credit.host, credit.path).key);
      if (!a) continue;
      const variant = lead.variant ?? "version unknown";
      const v = a.versions.get(variant) ?? { paid_visits: 0, unique_leads: 0, submissions: 0 };
      v.submissions += 1;
      if (!credit.is_repeat) v.unique_leads += 1;
      a.versions.set(variant, v);
    }
  }
  const paidLedger = credits.filter((c) => c.credit.reason === "credited" && !c.credit.is_repeat).map((c) => c.lead);
  for (const lead of paidLedger) {
    const host = (lead.host ?? hosts.primary).toLowerCase().replace(/^www\./, "");
    const started = lead.landing_path ? aggs.get(resolve(host, lead.landing_path).key) : undefined;
    if (started) started.row.started_here += 1;
    const closed = lead.conversion_path ? aggs.get(resolve(host, lead.conversion_path).key) : undefined;
    if (closed) closed.row.closed_here += 1;
  }

  // ── Finalize rows ─────────────────────────────────────────────────────────
  const minVisits = thresholds.min_paid_visits_for_rates;
  const pages: AdsPageRow[] = [];
  const destinations: AdsPageRow[] = [];
  for (const a of Array.from(aggs.values())) {
    const row = a.row;
    const visits = row.paid_visits;
    row.low_sample = isLowSample(visits, minVisits);
    row.bounce_rate = visits > 0 ? 1 - row.engaged_sessions / visits : null;
    row.avg_engaged_seconds = visits > 0 ? Math.round(a.engagementMs / visits / 100) / 10 : null;
    row.conversion_rate = visits > 0 ? row.unique_leads / visits : null;
    row.cost_per_visit = divMoney(row.spend, visits);
    row.cost_per_lead = divMoney(row.spend, row.unique_leads);
    row.clicks_to_visits = a.ratioClicks > 0 ? row.matched_visits / a.ratioClicks : null;
    row.organic =
      a.organicSessions > 0
        ? {
            sessions: a.organicSessions,
            bounce_rate: 1 - a.organicEngaged / a.organicSessions,
            lead_rate: a.organicWithLead / a.organicSessions,
          }
        : null;
    row.platforms = Array.from(a.platforms);
    row.campaigns = Array.from(a.campaigns.values()).sort((x, y) => y.paid_visits - x.paid_visits).slice(0, 10);
    if (opts.includeGa4Ads) {
      row.ga4_ads = Array.from(a.ga4Ads?.values() ?? [])
        .sort((x, y) => y.visits - x.visits)
        .slice(0, MAX_GA4_ADS_PER_ROW);
      row.ga4_untagged_visits = a.ga4Untagged ?? 0;
    }
    if (opts.split_by_version && a.versions.size > 0) {
      row.versions = Array.from(a.versions.entries()).map(([variant, v]) => ({
        variant,
        ...v,
        conversion_rate: v.paid_visits > 0 ? v.unique_leads / v.paid_visits : null,
        low_sample: isLowSample(v.paid_visits, minVisits),
      }));
    }
    const hasActivity = visits + row.unclear_visits + row.submissions + row.clicks + Object.keys(row.spend).length > 0;
    if (!hasActivity) continue;
    (row.kind === "entry" ? pages : destinations).push(row);
  }
  const spendSum = (m: MoneyByCurrency) => Object.values(m).reduce((s, v) => s + v, 0);
  pages.sort((x, y) => spendSum(y.spend) - spendSum(x.spend) || y.paid_visits - x.paid_visits);
  destinations.sort((x, y) => spendSum(y.spend) - spendSum(x.spend) || y.paid_visits - x.paid_visits);

  // ── Consent + coverage ──────────────────────────────────────────────────
  let askRejectPct: number | null = null;
  let askShown = 0;
  try {
    const ask = summarizeConsentRates(listConsentDaily(opts.site, start)).find((m) => m.mode === "ask");
    if (ask) {
      askShown = ask.shown;
      const decided = ask.granted + ask.denied;
      askRejectPct = decided > 0 ? Math.round((ask.denied / decided) * 1000) / 10 : null;
    }
  } catch {
    /* consent table optional */
  }
  const covered = coveredDays(start, end, collectingSince);

  // ── Warnings ────────────────────────────────────────────────────────────
  if (!metaConnected && includeMeta && (platform === "meta" || !googleConnected)) {
    warnings.push({ code: "meta_not_connected", message: "Meta Ads is not connected; spend, clicks and Meta-reported leads are missing." });
  }
  const googleState = loadGoogleState(opts.site);
  const googleThrough = googleConnected ? googleDataThrough(googleState, googleSettings.customer_ids) : null;
  const googleExpected = googleExpectedThrough(now);
  if (platform === "google" && !googleConnected) {
    warnings.push({
      code: "google_not_connected",
      message: "Google Ads is not connected; spend, clicks and Google-reported leads are missing. Connect it in Settings → Ads → Google.",
    });
  }
  if (googleConnected && includeGoogle) {
    if (!googleThrough) {
      warnings.push({
        code: "google_data_through",
        message: "No Google Ads data has loaded yet from the BigQuery transfer for every connected account; Google spend is missing, not zero.",
      });
    } else if (googleThrough < end) {
      warnings.push({
        code: "google_data_through",
        message: `Google data through ${shortDateRange(googleThrough, googleThrough)}: the BigQuery transfer loads each day with a delay, so ${
          googleThrough < addDays(end, -1) ? `${shortDateRange(addDays(googleThrough, 1), end)} are` : `${shortDateRange(end, end)} is`
        } missing for Google, not zero.`,
      });
    }
    if (googleThrough && googleThrough < googleExpected) {
      warnings.push({
        code: "google_transfer_stale",
        message: `The Google Ads BigQuery transfer hasn't loaded anything after ${shortDateRange(googleThrough, googleThrough)} (expected through ${shortDateRange(googleExpected, googleExpected)}). Check the transfer's run history in Google Cloud → BigQuery → Data transfers.`,
      });
    }
    const unsynced = googleSettings.customer_ids.filter((id) => googleState.customers[id]?.sync_error);
    if (unsynced.length > 0) {
      warnings.push({
        code: "google_account_not_synced",
        message: `${unsynced.length} Google Ads account(s) couldn't be read on the last sync (${unsynced.join(", ")}): ${googleState.customers[unsynced[0]!]!.sync_error} Their spend is missing, other accounts are unaffected.`,
      });
    }
  }
  if (googleConnected && legacyLeads > 0 && (platform !== "all" || idFilter)) {
    warnings.push({
      code: "lead_platform_legacy",
      message: `${legacyLeads} lead(s) were recorded before the site stored which ad platform each paid visit came from; they use the platform of the visitor's latest campaign tags instead of the ${model === "first_paid" ? "first" : "last"} paid visit.`,
    });
  }
  if (snapshotMode) {
    const pulledDay = metaState.pulled_from_production_at?.slice(0, 10);
    const lastDay = metaState.snapshot_last_date;
    warnings.push({
      code: "meta_production_snapshot",
      message: `Ad data downloaded from ${metaState.production_origin ?? "production"}${pulledDay ? ` on ${shortDateRange(pulledDay, pulledDay)}` : ""}. ${
        lastDay ? `Last day: ${shortDateRange(lastDay, lastDay)}. Newer days are missing.` : "Newer days may be missing."
      } It is a copy: nothing here re-syncs it from Meta without a local Meta token.`,
    });
    if (includeMeta) {
      const configured = new Set(settings.meta.ad_account_ids);
      const hiddenAccounts = new Set<string>();
      const hiddenSpend: Record<string, number> = {};
      for (const r of loadMetaRows(opts.site, start, end)) {
        if (configured.has(r.account_id)) continue;
        hiddenAccounts.add(r.account_id);
        hiddenSpend[r.currency] = (hiddenSpend[r.currency] ?? 0) + r.spend;
      }
      if (hiddenAccounts.size > 0) {
        const spend = Object.entries(hiddenSpend)
          .map(([cur, n]) => `${Math.round(n * 100) / 100} ${cur}`)
          .join(", ");
        warnings.push({
          code: "meta_snapshot_hidden_accounts",
          message: `${hiddenAccounts.size} ad account(s) in the downloaded data aren't in your local Ads settings (${Array.from(hiddenAccounts).join(", ")}); their spend (${spend}) is hidden from these totals.`,
        });
      }
    }
  }
  if (!ga4Configured) {
    warnings.push({ code: "ga4_not_configured", message: "GA4 BigQuery export is not configured; paid visits and engagement are missing." });
  }
  if (Object.keys(totals.spend).length > 1) {
    warnings.push({ code: "mixed_currency", message: `Spend is in ${Object.keys(totals.spend).join(", ")}; totals are shown per currency and never summed.` });
  }
  if (covered.covered < covered.total) {
    warnings.push({
      code: "ledger_collecting",
      message: `Site lead counts are based on ${covered.covered} of ${covered.total} days (collection started ${collectingSince ? new Date(collectingSince).toISOString().slice(0, 10) : "not yet"}).`,
    });
  }
  if (askRejectPct != null && askRejectPct > 0) {
    warnings.push({
      code: "consent_estimates",
      message: `Ask-region numbers include estimates; ${askRejectPct}% of visitors there rejected tracking.`,
    });
  }
  if (win.clamped.length > 0) {
    warnings.push({
      code: "range_clamped",
      message: `Requested range adjusted to ${start}..${end}: ${win.clamped
        .map((c) => (c === "until" ? "the end moved to yesterday (today is incomplete)" : `the start moved to ${start} (data is kept about 13 months)`))
        .join("; ")}.`,
    });
  }

  const windowDates = dateRange(start, end);
  const metaDates = metaConnected && includeMeta ? new Set(listMetaDayDates(opts.site)) : null;
  const metaMissing = metaDates ? windowDates.filter((d) => !metaDates.has(d)) : [];
  const ga4Complete = lastCompleteGa4Date(now);
  const ga4Missing = ga4Configured ? windowDates.filter((d) => d <= ga4Complete && !ga4Dates.has(d)) : [];
  const googleDates = googleConnected && includeGoogle ? new Set(googleProvider.listDayDates(opts.site)) : null;
  // Days the transfer hasn't loaded yet aren't gaps until overdue.
  const googleMissing = googleDates ? windowDates.filter((d) => d <= googleExpected && !googleDates.has(d)) : [];
  if (metaMissing.length > 0 || ga4Missing.length > 0 || googleMissing.length > 0) {
    const parts: string[] = [];
    if (metaMissing.length > 0) parts.push(`Meta (${metaMissing.length} day(s): ${compressDateRanges(metaMissing)})`);
    if (googleMissing.length > 0) parts.push(`Google Ads (${googleMissing.length} day(s): ${compressDateRanges(googleMissing)})`);
    if (ga4Missing.length > 0) parts.push(`GA4 (${ga4Missing.length} day(s): ${compressDateRanges(ga4Missing)})`);
    warnings.push({
      code: "data_gaps",
      message: `No cached data for ${parts.join("; ")}. Numbers for those days are missing, not zero. Syncs read back 90 days and keep about 13 months; older days only exist if they were synced before.`,
    });
  }

  const filters = { campaign_ids: opts.campaign_ids ?? [], adset_ids: opts.adset_ids ?? [], ad_ids: opts.ad_ids ?? [] };
  if (idFilter) {
    const level = finestLevel(idFilter);
    let untagged = 0;
    const untaggedPaths: string[] = [];
    const kept = new Set([...pages, ...destinations]);
    for (const [key, n] of Array.from(untaggedByKey.entries()).sort((x, y) => y[1] - x[1])) {
      const a = aggs.get(key);
      if (!a || !kept.has(a.row)) continue;
      untagged += n;
      if (untaggedPaths.length < 3) untaggedPaths.push(a.row.path || a.row.title);
    }
    if (untagged > 0) {
      warnings.push({
        code: "untagged_visits_excluded",
        message: `${untagged} paid ${filterPlatform === "google" ? "Google" : "Meta"} visit(s) to pages in this result (${untaggedPaths.join(", ")}) had no ${LEVEL_LABEL[level]} id in their link tags, so they could not be matched to the filter and are left out. Visits, conversion rate and cost per visit are a floor.`,
      });
    }
    if (model === "first_paid" && legacyIdLeads > 0) {
      warnings.push({
        code: "leads_matched_by_last_click",
        message: `${legacyIdLeads} lead(s) recorded before paid visits stored their ad ids are matched to the filter by the ad the visitor clicked last, even with model first_paid; page credit still follows first_paid.`,
      });
    }
    const unmatched = (["campaign", "adset", "ad"] as const)
      .map((lvl) => {
        const wanted = idFilter[lvl];
        const miss = wanted ? Array.from(wanted).filter((id) => !seenIds[lvl].has(id)) : [];
        return miss.length > 0 ? `${lvl}_ids [${miss.join(", ")}]` : null;
      })
      .filter((x): x is string => !!x);
    if (unmatched.length > 0) {
      warnings.push({
        code: "filter_no_match",
        message: `No spend, visits or leads matched ${unmatched.join(", ")} in ${start}..${end}. Check the ids with mode campaigns (or entries grouped by campaign), or widen the date range.`,
      });
    }
  }
  if (narrowToAccount && (totals.unassigned_visits > 0 || totals.unsynced_account_visits > 0)) {
    const scope = opts.account ? "this account" : `${opts.currency} accounts`;
    const parts: string[] = [];
    if (totals.unassigned_visits > 0) {
      parts.push(
        `${totals.unassigned_visits} paid Meta visit(s) had no ad tags and could not be tied to ${scope}; visits, conversion rate and cost per visit are a floor.`,
      );
    }
    if (totals.unsynced_account_visits > 0) {
      parts.push(
        `${totals.unsynced_account_visits} more carried ad ids from Meta accounts that aren't synced; add that account in Settings → Ads if it should count.`,
      );
    }
    warnings.push({ code: "visits_not_tied_to_account", message: parts.join(" ") });
  }

  let metaPlatforms: AdsMetaPlatforms | undefined;
  if (buildPlacements) {
    metaPlatforms = finalizePlacements(placements, excludedSpend, minVisits, {
      start,
      accounts: (opts.account ? [opts.account] : settings.meta.ad_account_ids).map((id) => metaState.accounts[id]),
    });
    const metaVisits = metaPlatforms.rows.reduce((n, r) => n + r.paid_visits, 0);
    if (metaPlatforms.not_split_share != null && metaPlatforms.not_split_share >= 0.5) {
      const pct = Math.round(metaPlatforms.not_split_share * 100);
      warnings.push({
        code: "meta_platform_not_split",
        message: `${pct}% of paid Meta visits (${metaVisits}) came from ads without utm_source={{site_source_name}}, so they can't be split into Facebook vs Instagram and show as not_split (with those ads' spend). Update those ads' URL parameters in Meta to split them.`,
      });
    }
    if (metaPlatforms.spend_partial && (metaVisits > 0 || metaPlatforms.rows.some((r) => Object.keys(r.spend).length > 0))) {
      warnings.push({
        code: "meta_platform_spend_partial",
        message: metaPlatforms.spend_since
          ? `Placement spend (Facebook vs Instagram) is only available from ${metaPlatforms.spend_since}, or the last placement read failed for an account; placement spend and cost per lead are a floor for ${start}..${end}. Main spend totals are unaffected.`
          : "Placement spend (Facebook vs Instagram) is still loading or the last placement read failed; placement spend and cost per lead are a floor until the next sync. Main spend totals are unaffected.",
      });
    }
  }

  let googleNetworks: AdsGoogleNetworks | undefined;
  if (buildGoogleNetworks) {
    googleNetworks = finalizeGoogleNetworks(googleNets);
    const googleVisits = googleNetworks.rows.reduce((x, r) => x + r.paid_visits, 0);
    if (googleNetworks.not_split_share != null && googleNetworks.not_split_share >= 0.5 && googleVisits >= thresholds.min_paid_visits_for_rates) {
      warnings.push({
        code: "google_network_not_split",
        message: `${Math.round(googleNetworks.not_split_share * 100)}% of paid Google visits (${googleVisits}) couldn't be tied to a network (Search, Display, YouTube…). Network spend is still exact; only visits per network are incomplete. Linking GA4 to Google Ads, or the gclid join (same BigQuery location as GA4), fixes this.`,
      });
    }
  }

  const refresh = getAdsRefreshStatus(opts.site);
  const refreshing = isRefreshActive(refresh);
  warnings.push(...refreshWarnings(refresh));

  const googleBlock: AdsGoogleBlock = {
    connected: googleConnected,
    last_synced_at: googleState.last_success_at ?? null,
    last_error: googleState.last_error ?? null,
    consecutive_failures: googleState.consecutive_failures ?? 0,
    data_through: googleThrough,
    expected_through: googleExpected,
    accounts: googleSettings.customer_ids.map((id) => {
      const c = googleState.customers?.[id];
      return {
        id,
        name: c?.name || undefined,
        currency: c?.currency || undefined,
        history_loaded: !!c?.history_loaded_at,
        data_through: c?.data_through ?? null,
        auto_tagging: c?.auto_tagging ?? null,
        ...(c?.sync_error ? { sync_error: c.sync_error } : {}),
      };
    }),
    unconnected_accounts: Array.from(unconnectedGoogle.entries())
      .map(([customer_id, paid_visits]) => ({ customer_id, paid_visits }))
      .sort((a, b) => b.paid_visits - a.paid_visits),
    available_accounts: (googleState.available_customers ?? []).filter((id) => !tickedGoogle.has(id)),
    visit_match: googleMatch,
  };

  const pickedCustom = metaLeadKeys.some((k) => k !== META_STANDARD_LEAD_KEY);
  const metaIncompleteDays =
    includeMeta && pickedCustom ? new Set(metaRowsAll.filter((m) => m.conversions === undefined).map((m) => m.date)).size : 0;
  const conversionNames = includeMeta && pickedCustom ? metaConversionNames(opts.site) : new Map<string, string>();
  const leadConversions: AdsLeadConversions = {
    meta_picked: settings.meta.lead_conversions ?? [],
    meta_changed_at: settings.meta.lead_conversions_changed_at ?? null,
    meta: includeMeta
      ? metaLeadKeys
          .map((key) => ({
            key,
            name: key === META_STANDARD_LEAD_KEY ? META_STANDARD_LEAD_LABEL : conversionNames.get(key) ?? key,
            count: metaKeyCounts.get(key) ?? 0,
          }))
          .sort((x, y) => y.count - x.count)
      : [],
    site: Array.from(siteConversionCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
    meta_incomplete_days: metaIncompleteDays,
    snapshot_lacks_conversions: snapshotMode && metaIncompleteDays > 0,
  };

  return {
    window: { start, end, days },
    platform,
    attribution: { model, lookback_days: 30, basis: "browser_observed" },
    meta: {
      connected: metaConnected,
      source: snapshotMode ? "production_snapshot" : "sync",
      ...(snapshotMode
        ? {
            pulled_at: metaState.pulled_from_production_at,
            last_date: metaState.snapshot_last_date,
            production_origin: metaState.production_origin,
          }
        : {}),
      last_synced_at: metaState.last_success_at ?? null,
      last_error: metaState.last_error ?? null,
      consecutive_failures: metaState.consecutive_failures ?? 0,
      accounts: settings.meta.ad_account_ids.map((id) => ({
        id,
        name: metaState.accounts[id]?.name || undefined,
        currency: metaState.accounts[id]?.currency || undefined,
        history_loaded: !!metaState.accounts[id]?.history_loaded_at,
        ...(metaState.accounts[id]?.sync_error ? { sync_error: metaState.accounts[id]!.sync_error } : {}),
      })),
    },
    google: googleBlock,
    ga4: {
      configured: ga4Configured,
      last_synced_at: ga4State.last_success_at ?? null,
      last_export_date: ga4State.last_export_date ?? null,
      last_error: ga4State.last_error ?? null,
    },
    refreshing,
    refresh,
    collecting_since: collectingSince ? new Date(collectingSince).toISOString() : null,
    covered_days: covered,
    data_gaps: { meta_missing_days: metaMissing.length, ga4_missing_days: ga4Missing.length, google_missing_days: googleMissing.length },
    filters,
    lead_gap_compare: leadGapCompare,
    consent: { mode: "advanced", ask_region_reject_pct: askRejectPct, ask_region_shown: askShown },
    totals,
    lead_conversions: leadConversions,
    pages,
    destinations,
    campaigns: Array.from(campaignGroups.values()).sort((x, y) => spendSum(y.spend) - spendSum(x.spend) || y.paid_visits - x.paid_visits),
    ...(metaPlatforms ? { meta_platforms: metaPlatforms } : {}),
    ...(googleNetworks ? { google_networks: googleNetworks } : {}),
    ...(opts.includeGa4Ads ? { unrecognized_campaigns: unrecognized?.result() ?? { paid_meta_visits: 0, campaigns: [] } } : {}),
    thresholds,
    warnings,
  };
}

const PLACEMENT_ORDER: MetaPlacementRow[] = ["facebook", "instagram", "messenger", "audience_network", "other", "not_split"];

function finalizePlacements(
  placements: Map<MetaPlacementRow, { spend: MoneyByCurrency; clicks: number; meta_leads: number; paid_visits: number; unique_leads: number }>,
  excluded: AdsMetaPlatforms["excluded_spend"],
  minVisits: number,
  scope: { start: string; accounts: Array<{ platform_history_loaded_at?: string; platform_history_since?: string; platform_error?: string } | undefined> },
): AdsMetaPlatforms {
  const rows: AdsMetaPlatformRow[] = [];
  let visits = 0;
  for (const platform of PLACEMENT_ORDER) {
    const p = placements.get(platform);
    if (!p || (p.paid_visits + p.unique_leads + p.clicks + p.meta_leads === 0 && Object.keys(p.spend).length === 0)) continue;
    visits += p.paid_visits;
    rows.push({
      platform,
      ...p,
      cost_per_lead: p.unique_leads > 0 && Object.keys(p.spend).length > 0 ? divMoney(p.spend, p.unique_leads) : null,
      conversion_rate: p.paid_visits > 0 ? p.unique_leads / p.paid_visits : null,
      low_sample: isLowSample(p.paid_visits, minVisits),
    });
  }
  const notSplit = placements.get("not_split")?.paid_visits ?? 0;
  const loaded = scope.accounts.length > 0 && scope.accounts.every((a) => a?.platform_history_loaded_at && a.platform_history_since);
  const spendSince = loaded ? scope.accounts.map((a) => a!.platform_history_since!).sort().at(-1)! : null;
  return {
    rows,
    excluded_spend: excluded,
    spend_since: spendSince,
    spend_partial: !loaded || scope.accounts.some((a) => a?.platform_error) || (spendSince != null && spendSince > scope.start),
    not_split_share: visits > 0 ? Math.round((notSplit / visits) * 1000) / 1000 : null,
  };
}

const NETWORK_ORDER: GoogleNetworkRow[] = ["search", "search_partners", "display", "youtube", "cross_network", "other", "not_split"];

function finalizeGoogleNetworks(nets: Map<GoogleNetworkRow, { spend: MoneyByCurrency; clicks: number; impressions: number; paid_visits: number }>): AdsGoogleNetworks {
  const rows: AdsGoogleNetworkRow[] = [];
  let visits = 0;
  for (const network of NETWORK_ORDER) {
    const n = nets.get(network);
    if (!n || (n.paid_visits + n.clicks + n.impressions === 0 && Object.keys(n.spend).length === 0)) continue;
    visits += n.paid_visits;
    rows.push({ network, ...n });
  }
  const notSplit = nets.get("not_split")?.paid_visits ?? 0;
  return { rows, not_split_share: visits > 0 ? Math.round((notSplit / visits) * 1000) / 1000 : null };
}

const REFRESH_WARNING_CODES = new Set(["meta_refresh_in_progress", "meta_refresh_failed", "jobs_worker_down"]);

export function isRefreshWarning(w: AdsWarning): boolean {
  return REFRESH_WARNING_CODES.has(w.code);
}

/** Warnings describing the background refresh. Cached numbers are always still returned. */
export function refreshWarnings(refresh: AdsRefreshStatus): AdsWarning[] {
  if (isRefreshActive(refresh)) {
    return [{ code: "meta_refresh_in_progress", message: "Ads data is refreshing in the background; re-check in a minute." }];
  }
  if (refresh.state === "failed") {
    const retry = refresh.retry_after ? ` Next automatic try after ${refresh.retry_after}.` : "";
    return [
      {
        code: "meta_refresh_failed",
        message: `The Ads background refresh didn't run: ${(refresh.error ?? "unknown error").trim().replace(/\.+$/, "")}. Numbers are the last cached sync; nothing was changed in Meta.${retry} Staff can retry with Sync now in Settings → Ads.`,
      },
    ];
  }
  if (refresh.state === "worker_down") {
    return [
      {
        code: "jobs_worker_down",
        message:
          "The background job worker isn't running, so Ads data can't refresh. Numbers are the last cached sync; nothing was changed in Meta. Staff can run Sync now in Settings → Ads.",
      },
    ];
  }
  return [];
}

/** Build the report and kick a background refresh when data is stale (non-blocking). */
export async function getAdsReport(opts: AdsReportOpts): Promise<AdsReport> {
  if (!opts.noRefresh) {
    try {
      await triggerAdsRefreshIfStale(opts.site, opts.contentRoot);
    } catch (err) {
      log.warn({ err }, "[ads-report] refresh trigger failed");
    }
  }
  return buildAdsReport(opts);
}