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
  ad_id?: string | null;
};

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
