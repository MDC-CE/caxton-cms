/**
 * Which page an ad sent people to on a given day, from its URL history (`ads-setup` `versions[]`)
 * plus that day's GA4 landings for the ad (`utm_content = ad id`).
 *
 * - Inside one version: that version's link.
 * - Changeover days (between the last read that saw the old URL and the first that saw the new
 *   one, in the ad account's time zone) whose two URLs reach different pages: split by that day's
 *   GA4 landings on the old vs new page, or all to the new page when GA4 saw none. Tagged.
 * - Days before URL history started: the GA4 landings decide when there are enough of them;
 *   otherwise the first known URL, marked `unconfirmed`.
 */

import { normalizeLandingPath } from "@shared/paid-traffic";
import { adVersions, type AdsSetupAd, type AdsSetupAdVersion } from "./ads-setup";
import type { PaidLandingDayFile } from "./paid-detection";

/** Days before URL history need at least this many tagged GA4 sessions to override the first known URL. */
export const MIN_INFER_SESSIONS = 3;
/** Before URL history, a page needs this share of the ad's GA4 landings that day to get spend. */
export const MIN_INFER_SHARE = 0.2;

export type HostPath = { host: string; path: string };

export type AdTarget = ({ kind: "link"; url: string } & HostPath) | { kind: "instant_form" };

export type AdUrlChangeBasis = "ga4" | "whole_day_new";

export type AdDayChange = {
  from: AdTarget;
  to: AdTarget;
  basis: AdUrlChangeBasis;
  /** True for changes read from GA4 landings before URL history started. */
  inferred: boolean;
};

export type AdDayPage = {
  /** `target: null` = no known link (caller falls back to window GA4 landings / unknown). Shares sum to 1. */
  splits: Array<{ target: AdTarget | null; share: number }>;
  change?: AdDayChange;
  /** Day before URL history with no GA4 evidence: the first known URL was assumed. */
  unconfirmed?: boolean;
};

/** ad id → date → "host|path" → GA4 sessions. */
export type AdLandingByDay = Map<string, Map<string, Map<string, number>>>;

export function landingKey(host: string, path: string): string {
  return `${host}|${path}`;
}

function parseLandingKey(k: string): HostPath {
  const i = k.indexOf("|");
  return i < 0 ? { host: "", path: k } : { host: k.slice(0, i), path: k.slice(i + 1) };
}

export function parseAdLink(raw: string | null | undefined): (HostPath & { url: string }) | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { url: raw, host: u.hostname.toLowerCase().replace(/^www\./, ""), path: normalizeLandingPath(u.pathname) };
  } catch {
    return null;
  }
}

/** Per ad, per day: where its tagged GA4 visits landed (complete or not — any evidence counts). */
export function buildAdLandingByDay(paidDays: Pick<PaidLandingDayFile, "date" | "candidates">[], knownAds: Set<string>): AdLandingByDay {
  const out: AdLandingByDay = new Map();
  for (const day of paidDays) {
    for (const c of day.candidates) {
      if (!c.utm_content || !knownAds.has(c.utm_content) || c.sessions <= 0) continue;
      let byDate = out.get(c.utm_content);
      if (!byDate) out.set(c.utm_content, (byDate = new Map()));
      let votes = byDate.get(day.date);
      if (!votes) byDate.set(day.date, (votes = new Map()));
      const k = landingKey(c.host, c.path);
      votes.set(k, (votes.get(k) ?? 0) + c.sessions);
    }
  }
  return out;
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** Calendar day (YYYY-MM-DD) of an ISO timestamp in an IANA time zone (UTC when unknown / invalid). */
export function dayInTimeZone(iso: string, timeZone: string | null | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  if (!timeZone) return d.toISOString().slice(0, 10);
  let f = formatters.get(timeZone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      f = null;
    }
    formatters.set(timeZone, f);
  }
  return f ? f.format(d) : d.toISOString().slice(0, 10);
}

export function targetOfVersion(v: AdsSetupAdVersion): AdTarget | null {
  if (v.destination === "instant_form") return { kind: "instant_form" };
  const link = parseAdLink(v.landing_urls[0]);
  return link ? { kind: "link", ...link } : null;
}

export function targetUrl(t: AdTarget): string {
  return t.kind === "link" ? t.url : "instant_form";
}

type SamePage = (a: HostPath, b: HostPath) => boolean;

/** True when both targets are known and land on different pages (instant form vs link counts as different). */
export function isRealChange(a: AdTarget | null, b: AdTarget | null, samePage: SamePage): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return true;
  if (a.kind === "instant_form" || b.kind === "instant_form") return false;
  return !samePage(a, b);
}

function single(target: AdTarget | null): AdDayPage {
  return { splits: [{ target, share: 1 }] };
}

function splitChange(from: AdTarget, to: AdTarget, votes: Map<string, number> | undefined, samePage: SamePage): AdDayPage {
  let fromSessions = 0;
  let toSessions = 0;
  if (votes && from.kind === "link" && to.kind === "link") {
    for (const [k, n] of Array.from(votes.entries())) {
      const hp = parseLandingKey(k);
      if (samePage(hp, to)) toSessions += n;
      else if (samePage(hp, from)) fromSessions += n;
    }
  }
  const total = fromSessions + toSessions;
  if (total <= 0) return { splits: [{ target: to, share: 1 }], change: { from, to, basis: "whole_day_new", inferred: false } };
  const splits = [
    { target: from, share: fromSessions / total },
    { target: to, share: toSessions / total },
  ].filter((s) => s.share > 0);
  return { splits, change: { from, to, basis: "ga4", inferred: false } };
}

/** Before URL history: GA4 landings decide; otherwise the first known URL (unconfirmed when it's a link). */
function inferBeforeHistory(first: AdTarget | null, votes: Map<string, number> | undefined, samePage: SamePage): AdDayPage {
  if (first?.kind === "instant_form") return single(first);
  const total = votes ? Array.from(votes.values()).reduce((s, n) => s + n, 0) : 0;
  if (!votes || total < MIN_INFER_SESSIONS) return first ? { ...single(first), unconfirmed: true } : single(null);
  const groups: Array<{ target: AdTarget & { kind: "link" }; sessions: number }> = [];
  for (const [k, n] of Array.from(votes.entries())) {
    const hp = parseLandingKey(k);
    const g = groups.find((x) => samePage(x.target, hp));
    if (g) g.sessions += n;
    else groups.push({ target: { kind: "link", url: `https://${hp.host}${hp.path}`, ...hp }, sessions: n });
  }
  groups.sort((a, b) => b.sessions - a.sessions);
  const kept = groups.filter((g) => g.sessions / total >= MIN_INFER_SHARE);
  if (kept.length === 0) return first ? { ...single(first), unconfirmed: true } : single(null);
  const keptTotal = kept.reduce((s, g) => s + g.sessions, 0);
  const splits = kept.map((g) => ({ target: g.target as AdTarget, share: g.sessions / keptTotal }));
  if (kept.length === 1) return { splits };
  const to = (first?.kind === "link" && kept.find((g) => samePage(g.target, first))) || kept[0]!;
  const from = kept.find((g) => g !== to)!;
  return { splits, change: { from: from.target, to: to.target, basis: "ga4", inferred: true } };
}

/**
 * Page(s) for one ad on one day. `date` is the spend day (Meta days are in the ad account's time
 * zone); version timestamps are converted with `timeZone`.
 */
export function adPageForDay(input: {
  ad: AdsSetupAd | undefined;
  date: string;
  timeZone: string | null | undefined;
  /** This ad's GA4 landings on `date` ("host|path" → sessions). */
  votes: Map<string, number> | undefined;
  samePage: SamePage;
}): AdDayPage {
  const { ad, date, timeZone, votes, samePage } = input;
  if (!ad) return single(null);
  const day = (iso: string) => dayInTimeZone(iso, timeZone);
  const spans = adVersions(ad).map((v) => ({
    v,
    target: targetOfVersion(v),
    from: v.first_seen_at ? day(v.first_seen_at) : null,
    to: day(v.last_seen_at),
  }));

  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1]!;
    const cur = spans[i]!;
    if (!cur.from || prev.to > cur.from || date < prev.to || date > cur.from) continue;
    if (!isRealChange(prev.target, cur.target, samePage)) return single(cur.target ?? prev.target);
    return splitChange(prev.target!, cur.target!, votes, samePage);
  }

  const first = spans[0]!;
  const historyStart = first.from ?? (first.v.seeded_at ? day(first.v.seeded_at) : null);
  if (historyStart && date < historyStart) return inferBeforeHistory(first.target, votes, samePage);

  let pick = first;
  for (const s of spans) if (!s.from || s.from <= date) pick = s;
  return single(pick.target);
}

/** Last `n` URL versions of an ad, newest first, as plain evidence for issues / UI. */
export type AdPreviousUrl = { v: number; url: string; from: string | null; to: string };

export function previousUrls(ad: AdsSetupAd | undefined, n = 3): AdPreviousUrl[] {
  if (!ad) return [];
  const versions = adVersions(ad);
  if (versions.length < 2) return [];
  return versions
    .slice(-n)
    .reverse()
    .map((v) => ({
      v: v.v,
      url: v.destination === "instant_form" ? "instant_form" : (v.landing_urls[0] ?? ""),
      from: v.first_seen_at ? v.first_seen_at.slice(0, 10) : null,
      to: v.last_seen_at.slice(0, 10),
    }));
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Every changeover day of an ad (any URL version boundary, same final page or not), in the account's time zone. */
export function adChangeoverDays(ad: AdsSetupAd | undefined, timeZone?: string | null): Set<string> {
  const out = new Set<string>();
  if (!ad?.versions || ad.versions.length < 2) return out;
  const versions = ad.versions;
  for (let i = 1; i < versions.length; i++) {
    const cur = versions[i]!;
    if (!cur.first_seen_at) continue;
    const from = dayInTimeZone(versions[i - 1]!.last_seen_at, timeZone);
    const to = dayInTimeZone(cur.first_seen_at, timeZone);
    for (let d = from <= to ? from : to, n = 0; d <= to && n < 400; d = nextDay(d), n++) out.add(d);
  }
  return out;
}

/** Page keys an ad pointed to over the inclusive window (current URL plus any version live in it). */
export function adTargetsInWindow(ad: AdsSetupAd | undefined, since: string, until: string, timeZone?: string | null): AdTarget[] {
  if (!ad) return [];
  const out: AdTarget[] = [];
  const versions = adVersions(ad);
  for (const v of versions) {
    const from = v.first_seen_at ? dayInTimeZone(v.first_seen_at, timeZone) : null;
    const to = dayInTimeZone(v.last_seen_at, timeZone);
    if ((from && from > until) || (v !== versions.at(-1) && to < since)) continue;
    const t = targetOfVersion(v);
    if (t) out.push(t);
  }
  return out;
}
