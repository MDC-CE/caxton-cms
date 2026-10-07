/**
 * GA4-observed tagging for Meta ads: compare Meta link clicks on complete GA4 days
 * with sessions whose landing URL carried utm_content = ad id.
 */

import type { AdsAlertThresholds } from "@shared/ads-settings";
import { parseTrackingParams } from "@shared/ads-diagnostics-rules";
import type { MetaAdDayRow } from "./meta-client";
import { addDays } from "./meta-ads-days";
import { lastCompleteGa4Date, loadPaidLandingDays } from "./paid-detection";

export type AdTaggingState = "meta_auto" | "none" | "unverified";

export type TrackingThresholds = Pick<
  AdsAlertThresholds,
  "tracking_tagged_min_sessions" | "tracking_missing_min_clicks" | "tracking_missing_max_visit_pct" | "tracking_check_days"
>;

/** True when utm_content is present but is neither `{{ad.id}}` nor this ad's own id. */
export function isDubiousUtmContent(adId: string, params: Record<string, string>): boolean {
  const v = params.utm_content?.trim();
  if (!v) return false;
  return v !== "{{ad.id}}" && v !== adId;
}

/** Setup lacks the template and/or has a wrong/fixed utm_content — needs GA4 confirmation. */
export function setupNeedsGa4Check(adId: string, link: string | null | undefined, urlTags: string | null | undefined, missing: string[]): boolean {
  if (missing.length > 0) return true;
  const params = { ...parseTrackingParams(link), ...parseTrackingParams(urlTags) };
  return isDubiousUtmContent(adId, params);
}

export function shortTrackingWindow(now: Date, checkDays: number): { since: string; until: string } {
  const until = lastCompleteGa4Date(now);
  return { since: addDays(until, -(Math.max(1, checkDays) - 1)), until };
}

/** Sessions by utm_content on complete cached GA4 days only. Optionally restrict to known Meta ad ids. */
export function ga4TaggedSessionsByAd(
  site: string,
  since: string,
  until: string,
  knownAdIds?: Set<string>,
): { sessions: Map<string, number>; completeDates: Set<string> } {
  const sessions = new Map<string, number>();
  const completeDates = new Set<string>();
  for (const day of loadPaidLandingDays(site, since, until)) {
    if (!day.complete) continue;
    completeDates.add(day.date);
    for (const c of day.candidates) {
      const id = c.utm_content;
      if (!id) continue;
      if (knownAdIds && !knownAdIds.has(id)) continue;
      sessions.set(id, (sessions.get(id) ?? 0) + c.sessions);
    }
  }
  return { sessions, completeDates };
}

/** Meta link clicks summed only on the given dates. */
export function clicksByAd(rows: MetaAdDayRow[], dates: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!dates.has(r.date)) continue;
    out.set(r.ad_id, (out.get(r.ad_id) ?? 0) + (r.link_clicks ?? 0));
  }
  return out;
}

const MIN_COMPLETE_DAYS = 4;

/** Classify one ad on a single window (report path, or one half of the diagnostics fallback). */
export function resolveAdTaggingOnWindow(input: {
  clicks: number;
  sessions: number;
  completeDayCount: number;
  thresholds: TrackingThresholds;
}): AdTaggingState {
  const t = input.thresholds;
  if (input.completeDayCount < MIN_COMPLETE_DAYS) return "unverified";
  if (input.clicks < t.tracking_missing_min_clicks) return "unverified";
  const ratioPct = input.clicks > 0 ? (input.sessions / input.clicks) * 100 : 0;
  if (input.sessions >= t.tracking_tagged_min_sessions && ratioPct >= t.tracking_missing_max_visit_pct) return "meta_auto";
  return "none";
}

/**
 * Diagnostics path: try the short window when it has enough clicks; otherwise the issue window.
 * Returns the state plus the numbers used for evidence.
 */
export function resolveAdTagging(input: {
  shortClicks: number;
  shortSessions: number;
  shortCompleteDays: number;
  fallbackClicks: number;
  fallbackSessions: number;
  fallbackCompleteDays: number;
  thresholds: TrackingThresholds;
}): { state: AdTaggingState; checked_clicks: number; ga4_tagged_sessions: number } {
  const t = input.thresholds;
  const useShort = input.shortClicks >= t.tracking_missing_min_clicks;
  const clicks = useShort ? input.shortClicks : input.fallbackClicks;
  const sessions = useShort ? input.shortSessions : input.fallbackSessions;
  const completeDayCount = useShort ? input.shortCompleteDays : input.fallbackCompleteDays;
  return {
    state: resolveAdTaggingOnWindow({ clicks, sessions, completeDayCount, thresholds: t }),
    checked_clicks: clicks,
    ga4_tagged_sessions: sessions,
  };
}

/** Build the set of Meta ad ids that GA4 confirms as tagged over a report/diagnostics window. */
export function metaAutoTaggedAdIds(input: {
  site: string;
  since: string;
  until: string;
  rows: MetaAdDayRow[];
  knownAdIds: Set<string>;
  thresholds: TrackingThresholds;
  /** When set, only these ads (setup needs GA4) are evaluated; others are skipped. */
  candidateAdIds?: Set<string>;
}): Set<string> {
  const { sessions, completeDates } = ga4TaggedSessionsByAd(input.site, input.since, input.until, input.knownAdIds);
  const clicks = clicksByAd(input.rows, completeDates);
  const completeDayCount = completeDates.size;
  const out = new Set<string>();
  const ids = input.candidateAdIds ?? new Set([...Array.from(clicks.keys()), ...Array.from(sessions.keys())]);
  for (const adId of Array.from(ids)) {
    if (!input.knownAdIds.has(adId)) continue;
    const state = resolveAdTaggingOnWindow({
      clicks: clicks.get(adId) ?? 0,
      sessions: sessions.get(adId) ?? 0,
      completeDayCount,
      thresholds: input.thresholds,
    });
    if (state === "meta_auto") out.add(adId);
  }
  return out;
}
