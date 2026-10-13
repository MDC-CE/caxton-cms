/**
 * Leads per page for the SEO Cluster Map, next to Search Console clicks.
 * Same date window and market as the clicks; test and repeat leads excluded.
 */

import { getSiteSqlite } from "./db";
import { ensurePipelineDb } from "./pipeline-db/runner";
import { PAID_SQL, UNCLEAR_SQL, trackingSince } from "./ads/leads-query";
import { pathKeyFromUrlOrPath } from "./gsc-organic-path-traffic";
import { normalizeGscCountryCode, rowMatchesMarket, type OrganicMarket } from "./gsc-organic-markets";

const DAY_MS = 86_400_000;

export type PathLeadStats = {
  /** Tracked leads whose search visit landed on this page. */
  organic_search: number;
  /** organic_search plus untracked, non-paid leads that first landed on this page (upper bound). */
  not_paid: number;
  /** Tracked leads (any channel) credited to this page. */
  tracked: number;
};

export type OrganicLeadsByPath = {
  byPath: Record<string, PathLeadStats>;
  /** First non-test lead with a channel; null = no tracked leads yet. */
  tracking_since: number | null;
  /** True when untracked non-paid leads fall in the window, or (market set) some leads have no country. */
  estimated: boolean;
};

export const ORGANIC_LEADS_BASIS = "channel_landing_path, unique non-test, same window and market as clicks";

type GroupRow = { path: string | null; country: string | null; kind: string; n: number };

/** Inclusive YYYY-MM-DD window to UTC epoch bounds [start, end). */
export function windowBoundsMs(window: { start: string; end: string }): { startMs: number; endMs: number } | null {
  const startMs = Date.parse(`${window.start}T00:00:00.000Z`);
  const endMs = Date.parse(`${window.end}T00:00:00.000Z`) + DAY_MS;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

export function buildOrganicLeadsByPath(opts: {
  site: string;
  window: { start: string; end: string } | null;
  market: OrganicMarket;
}): OrganicLeadsByPath {
  const empty: OrganicLeadsByPath = { byPath: {}, tracking_since: null, estimated: false };
  if (!opts.window) return empty;
  const bounds = windowBoundsMs(opts.window);
  if (!bounds) return empty;

  ensurePipelineDb(opts.site);
  const rows = getSiteSqlite(opts.site)
    .prepare(
      `SELECT
         CASE WHEN channel IS NOT NULL THEN channel_landing_path ELSE landing_path END AS path,
         country,
         CASE
           WHEN channel = 'organic_search' THEN 'organic_search'
           WHEN channel IS NOT NULL THEN 'tracked_other'
           ELSE 'untracked_not_paid'
         END AS kind,
         COUNT(*) AS n
       FROM lead_submissions
       WHERE is_test = 0 AND is_repeat = 0 AND created_at >= ? AND created_at < ?
         AND (channel IS NOT NULL OR NOT (${PAID_SQL} OR ${UNCLEAR_SQL}))
       GROUP BY path, country, kind`,
    )
    .all(bounds.startMs, bounds.endMs) as GroupRow[];

  const marketScoped = opts.market.id !== "worldwide" && opts.market.countries.length > 0;
  const byPath: Record<string, PathLeadStats> = {};
  let estimated = false;
  for (const r of rows) {
    if (r.kind === "untracked_not_paid") estimated = true;
    if (marketScoped) {
      const country = normalizeGscCountryCode(r.country);
      if (!country) {
        estimated = true;
        continue;
      }
      if (!rowMatchesMarket(country, opts.market)) continue;
    }
    const key = r.path ? pathKeyFromUrlOrPath(r.path) : null;
    if (!key) continue;
    const cur = byPath[key] ?? { organic_search: 0, not_paid: 0, tracked: 0 };
    if (r.kind === "organic_search") {
      cur.organic_search += r.n;
      cur.not_paid += r.n;
      cur.tracked += r.n;
    } else if (r.kind === "tracked_other") {
      cur.tracked += r.n;
    } else {
      cur.not_paid += r.n;
    }
    byPath[key] = cur;
  }

  return { byPath, tracking_since: trackingSince(opts.site), estimated };
}

export function lookupPathLeads(
  byPath: Record<string, PathLeadStats>,
  urlOrPath: string | null | undefined,
): PathLeadStats | undefined {
  if (!urlOrPath) return undefined;
  const key = pathKeyFromUrlOrPath(urlOrPath);
  return key ? byPath[key] : undefined;
}

export function sumPathLeads(parts: Array<PathLeadStats | undefined | null>): PathLeadStats | undefined {
  let any = false;
  const out: PathLeadStats = { organic_search: 0, not_paid: 0, tracked: 0 };
  for (const p of parts) {
    if (!p) continue;
    any = true;
    out.organic_search += p.organic_search;
    out.not_paid += p.not_paid;
    out.tracked += p.tracked;
  }
  return any ? out : undefined;
}
