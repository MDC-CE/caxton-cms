/**
 * Paid-traffic rules shared by the session worker, POST /api/ad-context, the
 * lead ledger and the GA4 paid-landing detector. Pure — no I/O.
 *
 * - Meta counts as paid only with a paid medium (or a known Meta campaign/ad id);
 *   `fbclid` alone is "unclear" because Meta also appends it to organic links.
 * - `gclid` (and other ad-only click ids) alone count as paid.
 */

export type AdPlatform = "meta" | "google" | "microsoft" | "tiktok" | "linkedin" | "x" | "snapchat" | "pinterest" | "other";
export type PaidStatus = "paid" | "unclear" | "organic";

/** URL click-id parameter → platform. `fbclid` is special-cased (unclear on its own). */
export const CLICK_ID_PLATFORM: Record<string, AdPlatform> = {
  gclid: "google",
  gbraid: "google",
  wbraid: "google",
  dclid: "google",
  fbclid: "meta",
  msclkid: "microsoft",
  ttclid: "tiktok",
  li_fat_id: "linkedin",
  twclid: "x",
  sclid: "snapchat",
  epik: "pinterest",
};

export const CLICK_ID_PARAMS = Object.keys(CLICK_ID_PLATFORM) as ClickIdParam[];
export type ClickIdParam =
  | "gclid"
  | "gbraid"
  | "wbraid"
  | "dclid"
  | "fbclid"
  | "msclkid"
  | "ttclid"
  | "li_fat_id"
  | "twclid"
  | "sclid"
  | "epik";

/** Click ids that only ever appear on paid clicks. */
const PAID_ONLY_CLICK_IDS = new Set<ClickIdParam>(CLICK_ID_PARAMS.filter((c) => c !== "fbclid"));

/** Campaign parameters that, when any is present, replace the previous campaign set. */
export const CAMPAIGN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
] as const;

export const PAID_MEDIUMS: readonly string[] = [
  "cpc",
  "ppc",
  "cpm",
  "cpv",
  "cpa",
  "paid",
  "paid_social",
  "paidsocial",
  "paid-social",
  "social_paid",
  "paid_search",
  "paidsearch",
  "paid-search",
  "sem",
  "display",
  "banner",
  "ads",
  "ad",
  "retargeting",
  "remarketing",
];

const SOURCE_PLATFORM: Record<string, AdPlatform> = {
  facebook: "meta",
  fb: "meta",
  instagram: "meta",
  ig: "meta",
  meta: "meta",
  messenger: "meta",
  msg: "meta",
  an: "meta",
  audience_network: "meta",
  threads: "meta",
  google: "google",
  adwords: "google",
  youtube: "google",
  bing: "microsoft",
  microsoft: "microsoft",
  tiktok: "tiktok",
  linkedin: "linkedin",
  twitter: "x",
  x: "x",
  snapchat: "snapchat",
  pinterest: "pinterest",
};

export function isPaidMedium(medium: string | null | undefined): boolean {
  if (!medium) return false;
  return PAID_MEDIUMS.includes(medium.trim().toLowerCase());
}

export function platformFromSource(source: string | null | undefined): AdPlatform | null {
  if (!source) return null;
  const s = source.trim().toLowerCase();
  if (SOURCE_PLATFORM[s]) return SOURCE_PLATFORM[s];
  if (s.includes("facebook") || s.includes("instagram")) return "meta";
  if (s.includes("google")) return "google";
  if (s.includes("bing")) return "microsoft";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("linkedin")) return "linkedin";
  return null;
}

/** Where a Meta ad ran (`publisher_platform`); `other` covers placements we don't break out (e.g. Threads). */
export type MetaPlacement = "facebook" | "instagram" | "messenger" | "audience_network" | "other";
/** Placement row in the Facebook vs Instagram breakdown; `not_split` = ads / visits without per-platform tags. */
export type MetaPlacementRow = MetaPlacement | "not_split";

export const META_PLACEMENT_LABELS: Record<MetaPlacementRow, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  other: "Other placements",
  not_split: "Not split (older tag)",
};

/** Values Meta writes for `{{site_source_name}}`. */
const SITE_SOURCE_PLACEMENT: Record<string, MetaPlacement> = {
  fb: "facebook",
  ig: "instagram",
  msg: "messenger",
  an: "audience_network",
};

/** Placement from a visit's / lead's utm_source; anything but fb/ig/msg/an (legacy `facebook`, hand tags) is not split. */
export function metaPlatformFromSource(source: string | null | undefined): MetaPlacementRow {
  return SITE_SOURCE_PLACEMENT[(source ?? "").trim().toLowerCase()] ?? "not_split";
}

/** Meta `publisher_platform` → placement. */
export function metaPlacementFromPublisher(platform: string | null | undefined): MetaPlacement {
  const p = (platform ?? "").trim().toLowerCase();
  return p === "facebook" || p === "instagram" || p === "messenger" || p === "audience_network" ? p : "other";
}

/**
 * Whether an ad's URL parameters tag visits per platform (`utm_source={{site_source_name}}`
 * or a literal fb/ig/msg/an). Missing / unread setups count as not split.
 */
export function adSourceTagState(params: Record<string, string> | null | undefined): "split" | "not_split" {
  const source = (params?.utm_source ?? "").trim().toLowerCase();
  if (source.replace(/\s+/g, "") === "{{site_source_name}}") return "split";
  return SITE_SOURCE_PLACEMENT[source] ? "split" : "not_split";
}

/** Google Ads network (`segments.ad_network_type`); `cross_network` = Performance Max (MIXED). */
export type GoogleAdNetwork = "search" | "search_partners" | "display" | "youtube" | "cross_network" | "other";
/** Network row in the Google breakdown; `not_split` = paid Google visits we couldn't tie to a network. */
export type GoogleNetworkRow = GoogleAdNetwork | "not_split";

export const GOOGLE_NETWORK_LABELS: Record<GoogleNetworkRow, string> = {
  search: "Google Search",
  search_partners: "Search partners",
  display: "Display",
  youtube: "YouTube",
  cross_network: "Performance Max (cross-network)",
  other: "Other networks",
  not_split: "Network unknown",
};

export function googleNetworkOf(adNetworkType: string | null | undefined): GoogleAdNetwork {
  const t = (adNetworkType ?? "").trim().toUpperCase();
  if (t === "SEARCH") return "search";
  if (t === "SEARCH_PARTNERS") return "search_partners";
  if (t === "CONTENT") return "display";
  if (t.startsWith("YOUTUBE")) return "youtube";
  if (t === "MIXED") return "cross_network";
  return "other";
}

/** Parameters the Google suffix must carry for id matching. */
export const GOOGLE_SUFFIX_REQUIRED_PARAMS = ["utm_id", "utm_term"] as const;

/** True when a final URL suffix carries the campaign + ad group ValueTrack ids. */
export function googleSuffixHasIds(suffix: string | null | undefined): boolean {
  if (!suffix) return false;
  const s = suffix.replace(/\s+/g, "").toLowerCase();
  return s.includes("utm_id={campaignid}") && s.includes("utm_term={adgroupid}");
}

export type TrafficSignals = {
  utm_source?: string | null;
  utm_medium?: string | null;
  /** Click ids present on the landing URL (param → value). */
  click_ids?: Partial<Record<ClickIdParam, string | null | undefined>>;
  /** True when a Meta campaign/adset/ad id in the UTMs matches the synced Meta account. */
  matches_known_meta_id?: boolean;
};

export type TrafficClassification = {
  status: PaidStatus;
  platform: AdPlatform | null;
  click_id_type: ClickIdParam | null;
};

function firstClickId(click_ids: TrafficSignals["click_ids"]): ClickIdParam | null {
  if (!click_ids) return null;
  for (const key of CLICK_ID_PARAMS) {
    if (click_ids[key]) return key;
  }
  return null;
}

export function classifyTraffic(signals: TrafficSignals): TrafficClassification {
  const clickId = firstClickId(signals.click_ids);
  const paidMedium = isPaidMedium(signals.utm_medium);
  const sourcePlatform = platformFromSource(signals.utm_source);

  if (paidMedium) {
    return {
      status: "paid",
      platform: sourcePlatform ?? (clickId ? CLICK_ID_PLATFORM[clickId] : "other"),
      click_id_type: clickId,
    };
  }
  if (signals.matches_known_meta_id) {
    return { status: "paid", platform: "meta", click_id_type: clickId };
  }
  const paidOnly = CLICK_ID_PARAMS.find((c) => PAID_ONLY_CLICK_IDS.has(c) && signals.click_ids?.[c]);
  if (paidOnly) {
    return { status: "paid", platform: CLICK_ID_PLATFORM[paidOnly], click_id_type: paidOnly };
  }
  if (clickId === "fbclid" || (sourcePlatform === "meta" && signals.utm_medium == null && clickId)) {
    return { status: "unclear", platform: "meta", click_id_type: clickId };
  }
  return { status: "organic", platform: sourcePlatform, click_id_type: clickId };
}

export type PaidLanding = {
  host: string;
  path: string;
  /** Epoch milliseconds. */
  at: number;
  platform?: AdPlatform | null;
  campaign_id?: string | null;
  adset_id?: string | null;
  ad_id?: string | null;
};

/** Numeric ad ids from the URL templates (Meta: utm_id / utm_term / utm_content; Google suffix: same slots). */
export function adIdFromTag(v: string | null | undefined): string | null {
  return v && /^\d{6,25}$/.test(v.trim()) ? v.trim() : null;
}

/** Strip query/hash and trailing slash (except root) so paths join with CMS entries. */
export function normalizeLandingPath(path: string): string {
  const bare = (path || "/").split(/[?#]/)[0] || "/";
  const withSlash = bare.startsWith("/") ? bare : `/${bare}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

/** Meta `fbc` value derived from a landing `fbclid` (format documented by Meta). */
export function fbcFromFbclid(fbclid: string, atMs: number = Date.now()): string {
  return `fb.1.${atMs}.${fbclid}`;
}

/** True when the landing URL has any campaign param or click id (campaign set should be replaced). */
export function hasCampaignSignals(params: Record<string, string | undefined | null>): boolean {
  return (
    CAMPAIGN_PARAMS.some((k) => !!params[k]) || CLICK_ID_PARAMS.some((k) => !!params[k])
  );
}

/** Lookback for crediting a lead to a paid landing (also the `4g_ads` cookie lifetime). */
export const PAID_LOOKBACK_DAYS = 30;
