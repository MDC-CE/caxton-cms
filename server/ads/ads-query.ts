/**
 * Query helpers for Ads diagnostics reads (issue ids, ad id filters, ads paging).
 */

import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsIdFilters } from "./ads-report";

export const ADS_LIST_ADS_LIMIT = 3;
export const ADS_DETAIL_ADS_LIMIT = 50;
export const ADS_MAX_ADS_LIMIT = 200;
export const ADS_MAX_ISSUE_IDS = 10;
export const ADS_FILTER_MAX_IDS = 20;

/** Cut each issue's `details.ads` to one page; totals stay whole. */
export function trimIssueAds<T extends AdsIssue>(issues: T[], limit: number, offset: number): T[] {
  return issues.map((i) =>
    i.details ? { ...i, details: { ...i.details, ads: i.details.ads.slice(offset, offset + limit), ads_offset: offset } } : i,
  );
}

export function clampAdsLimit(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, ADS_MAX_ADS_LIMIT) : fallback;
}

export function clampAdsOffset(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Comma list (or array) → unique ids, max 10. */
export function parseIssueIds(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean))).slice(0, ADS_MAX_ISSUE_IDS);
}

export class AdsIdFilterError extends Error {}

/** Comma list (or array) of numeric Meta ids → unique ids; throws on non-digits or more than 20. */
export function parseAdIdList(raw: unknown, label: string): string[] | undefined {
  const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  const ids = Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean)));
  if (ids.length === 0) return undefined;
  const bad = ids.filter((id) => !/^\d{1,30}$/.test(id));
  if (bad.length > 0) throw new AdsIdFilterError(`${label} must be numeric Meta ids (got ${bad.slice(0, 3).join(", ")}).`);
  if (ids.length > ADS_FILTER_MAX_IDS) throw new AdsIdFilterError(`${label} accepts at most ${ADS_FILTER_MAX_IDS} ids (got ${ids.length}).`);
  return ids;
}

/** `campaign_ids` / `adset_ids` / `ad_ids` query params (qs arrays or comma strings). */
export function parseAdIdFilters(q: Record<string, unknown>): AdsIdFilters {
  const out: AdsIdFilters = {};
  for (const key of ["campaign_ids", "adset_ids", "ad_ids"] as const) {
    const ids = parseAdIdList(q[key] ?? q[`${key}[]`], key);
    if (ids) out[key] = ids;
  }
  return out;
}

export function hasAdIdFilters(f: AdsIdFilters): boolean {
  return !!(f.campaign_ids?.length || f.adset_ids?.length || f.ad_ids?.length);
}

/**
 * Keep issues touching the filtered ads (or GA4-seen tags) plus issues with no ad
 * scope (sync / setup failures affect every ad); narrow each kept issue's ads to matches.
 */
export function filterIssuesByIds<T extends AdsIssue>(issues: T[], f: AdsIdFilters): T[] {
  if (!hasAdIdFilters(f)) return issues;
  const sets = {
    campaign: f.campaign_ids?.length ? new Set(f.campaign_ids) : null,
    adset: f.adset_ids?.length ? new Set(f.adset_ids) : null,
    ad: f.ad_ids?.length ? new Set(f.ad_ids) : null,
  };
  const matches = (campaign: string | null, adset: string | null, ad: string | null) =>
    (!sets.ad || (!!ad && sets.ad.has(ad))) &&
    (!sets.adset || (!!adset && sets.adset.has(adset))) &&
    (!sets.campaign || (!!campaign && sets.campaign.has(campaign)));
  const out: T[] = [];
  for (const issue of issues) {
    const d = issue.details;
    if (!d || (d.ads.length === 0 && !d.ga4_seen?.length)) {
      out.push(issue);
      continue;
    }
    const ads = d.ads.filter((a) => matches(a.campaign_id, a.adset_id, a.ad_id));
    const ga4 = d.ga4_seen?.filter(
      (g) => matches(g.campaign_id, g.adset_id, g.ad_id) || (/^\d+$/.test(g.campaign) && matches(g.campaign, g.adset_id, g.ad_id)),
    );
    if (ads.length === 0 && !ga4?.length) continue;
    out.push({ ...issue, details: { ...d, ads, ads_total: ads.length, ...(d.ga4_seen ? { ga4_seen: ga4 } : {}) } });
  }
  return out;
}
