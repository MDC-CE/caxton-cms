/**
 * Pure helpers for campaign data in the visitor session (session worker + tests).
 *
 * - A landing with any campaign param or click id REPLACES the previous campaign set
 *   (no mixing a new utm_source with an old utm_campaign). Referral/coupon keys merge.
 * - `first_touch` is write-once. Paid landings: `first` write-once, `last` overwritten.
 */

import type { PaidLandingRef, Session, UTMParams } from "./session";
import { MARKETING_UTM_KEYS } from "./session";
import {
  adIdFromTag,
  CLICK_ID_PARAMS,
  classifyTraffic,
  fbcFromFbclid,
  hasCampaignSignals,
  normalizeLandingPath,
  type ClickIdParam,
} from "./paid-traffic";

const QUERY_KEYS: (keyof UTMParams)[] = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_url",
  "utm_placement",
  "utm_plan",
  "ref",
  "referral",
  "referral_key",
  "coupon",
];

export function parseMarketingParams(
  search: string,
  opts: { fbp?: string; fbc?: string; now?: number } = {},
): UTMParams {
  const params = new URLSearchParams(search);
  const utm: UTMParams = {};
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (value) (utm as Record<string, string>)[key] = value;
  }
  for (const clickId of CLICK_ID_PARAMS) {
    const value = params.get(clickId);
    if (!value) continue;
    (utm as Record<string, string>)[clickId] = value;
    if (!utm.ppc_tracking_id) utm.ppc_tracking_id = value;
  }
  if (opts.fbp) utm.fbp = opts.fbp;
  if (opts.fbc) utm.fbc = opts.fbc;
  else if (utm.fbclid) utm.fbc = fbcFromFbclid(utm.fbclid, opts.now);
  return utm;
}

function campaignSubset(utm: UTMParams): UTMParams {
  const out: UTMParams = {};
  for (const key of MARKETING_UTM_KEYS) {
    if (key === "fbp" || key === "fbc") continue;
    const v = utm[key];
    if (v) (out as Record<string, string>)[key] = v;
  }
  return out;
}

export function mergeUtmSets(previous: UTMParams | undefined, incoming: UTMParams): UTMParams {
  const prev = previous ?? {};
  const replace = hasCampaignSignals(incoming as Record<string, string | undefined>);
  const merged: UTMParams = {};
  for (const [k, v] of Object.entries(prev)) {
    const key = k as keyof UTMParams;
    if (replace && MARKETING_UTM_KEYS.includes(key) && key !== "fbp") continue;
    if (v !== undefined) (merged as Record<string, string>)[key] = v as string;
  }
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined && v !== "") (merged as Record<string, string>)[k] = v as string;
  }
  return merged;
}

export function nextFirstTouch(previous: UTMParams | undefined, incoming: UTMParams): UTMParams | undefined {
  if (previous && Object.keys(previous).length > 0) return previous;
  if (!hasCampaignSignals(incoming as Record<string, string | undefined>)) return previous;
  return campaignSubset(incoming);
}

export function paidLandingFor(
  incoming: UTMParams,
  where: { host: string; path: string; now?: number },
): PaidLandingRef | null {
  const click_ids: Partial<Record<ClickIdParam, string>> = {};
  for (const c of CLICK_ID_PARAMS) {
    const v = incoming[c as keyof UTMParams];
    if (v) click_ids[c] = v;
  }
  const cls = classifyTraffic({ utm_source: incoming.utm_source, utm_medium: incoming.utm_medium, click_ids });
  if (cls.status !== "paid") return null;
  const ref: PaidLandingRef = {
    host: where.host.toLowerCase(),
    path: normalizeLandingPath(where.path),
    at: where.now ?? Date.now(),
    platform: cls.platform,
  };
  const campaign = adIdFromTag(incoming.utm_id);
  const adset = adIdFromTag(incoming.utm_term);
  const ad = adIdFromTag(incoming.utm_content);
  if (campaign) ref.campaign_id = campaign;
  if (adset) ref.adset_id = adset;
  if (ad) ref.ad_id = ad;
  return ref;
}

export function nextPaidLanding(
  previous: Session["paid_landing"],
  landing: PaidLandingRef | null,
): Session["paid_landing"] {
  if (!landing) return previous;
  return { first: previous?.first ?? landing, last: landing };
}
