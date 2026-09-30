/**
 * GA4 BigQuery paid-landing detector. One query per export day:
 * landing = first page_view of each session; paid candidates keep their
 * campaign signals (classified at report time with shared/paid-traffic),
 * everything else rolls into an organic baseline per path. Consent-denied
 * cookieless page views are counted separately.
 *
 * Cache: `.cache/{site}/paid-landing-days/{date}.json` + `paid-landing-state.json`.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { fqEventsWildcard, getBigQueryClient, getBigQueryConfigStatus, getBigQuerySettings } from "../ecommerce/bigquery-client";
import { bqNormalizedPagePathSql, bqSessionLastClickChannelSql } from "../analytics/reports";
import { getLeadConversionEventNames } from "../settings";
import { normalizeLandingPath, PAID_MEDIUMS, CLICK_ID_PARAMS, type ClickIdParam } from "@shared/paid-traffic";
import { child } from "../logger";
import { addDays, dateRange, utcDate } from "./meta-ads-days";

const log = child({ module: "ads/paid-detection" });

export const PAID_LANDING_BACKFILL_DAYS = 90;
export const PAID_LANDING_RETENTION_DAYS = 395;
/** GA4 daily export is treated as final this many days after the date. */
export const GA4_COMPLETE_LAG_DAYS = 2;
const MAX_DAYS_PER_RUN = 30;
const MAX_BYTES_BILLED = "5000000000";

export type PaidLandingCandidateRow = {
  host: string;
  path: string;
  source: string;
  medium: string;
  campaign: string;
  click_id_type: ClickIdParam | null;
  utm_id: string | null;
  utm_term: string | null;
  utm_content: string | null;
  experiment_id: string | null;
  variant: string | null;
  sessions: number;
  engaged_sessions: number;
  engagement_ms: number;
  lead_events: number;
  sessions_with_lead: number;
};

export type OrganicBaselineRow = {
  host: string;
  path: string;
  sessions: number;
  engaged_sessions: number;
  engagement_ms: number;
  sessions_with_lead: number;
};

export type CookielessRow = { host: string; path: string; page_views: number };

export type PaidLandingDayFile = {
  date: string;
  fetched_at: string;
  complete: boolean;
  candidates: PaidLandingCandidateRow[];
  organic: OrganicBaselineRow[];
  cookieless: CookielessRow[];
};

export type PaidLandingState = {
  last_success_at?: string;
  last_error?: string;
  consecutive_failures: number;
  /** Latest date that had a GA4 export table. */
  last_export_date?: string;
};

function dir(site: string): string {
  return path.join(CACHE_DIR, site, "paid-landing-days");
}

function statePath(site: string): string {
  return path.join(CACHE_DIR, site, "paid-landing-state.json");
}

function readJson<T>(file: string): T | null {
  try {
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), "utf-8");
  fs.renameSync(tmp, file);
}

export function listPaidLandingDates(site: string): string[] {
  const d = dir(site);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function loadPaidLandingDay(site: string, date: string): PaidLandingDayFile | null {
  const f = readJson<PaidLandingDayFile>(path.join(dir(site), `${date}.json`));
  return f && f.date === date && Array.isArray(f.candidates) ? f : null;
}

export function loadPaidLandingState(site: string): PaidLandingState {
  return readJson<PaidLandingState>(statePath(site)) ?? { consecutive_failures: 0 };
}

export function loadPaidLandingDays(site: string, since: string, until: string): PaidLandingDayFile[] {
  return listPaidLandingDates(site)
    .filter((d) => d >= since && d <= until)
    .map((d) => loadPaidLandingDay(site, d))
    .filter((f): f is PaidLandingDayFile => !!f);
}

export function isGa4Configured(contentRoot?: string): boolean {
  return getBigQueryConfigStatus(contentRoot).configured;
}

export function lastCompleteGa4Date(now = new Date()): string {
  return addDays(utcDate(now), -GA4_COMPLETE_LAG_DAYS);
}

/** Days to (re)query: missing in the backfill window, plus days cached before they were complete. */
export function paidLandingDatesToFetch(site: string, now = new Date()): string[] {
  const until = addDays(utcDate(now), -1);
  const since = addDays(until, -(PAID_LANDING_BACKFILL_DAYS - 1));
  const completeCutoff = lastCompleteGa4Date(now);
  const out: string[] = [];
  for (const d of dateRange(since, until).reverse()) {
    const f = loadPaidLandingDay(site, d);
    if (!f || (!f.complete && d <= completeCutoff) || d > completeCutoff) out.push(d);
  }
  return out;
}

export function buildPaidLandingSql(eventsTable: string, includeSessionLastClick: boolean): string {
  const channel = bqSessionLastClickChannelSql({ includeSessionLastClick });
  const clickIdAlternation = [...CLICK_ID_PARAMS, "utm_id"].join("|");
  const param = (key: string) =>
    `REGEXP_EXTRACT(landing.page_location, r'[?&]${key}=([^&#]+)')`;
  const firstClickId = `CASE
      ${CLICK_ID_PARAMS.map((c) => `WHEN ${param(c)} IS NOT NULL THEN '${c}'`).join("\n      ")}
      ELSE NULL END`;
  return `
    WITH base AS (
      SELECT
        user_pseudo_id,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS sid,
        event_name,
        event_timestamp,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
        ${bqNormalizedPagePathSql()} AS page_path,
        (SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING)) FROM UNNEST(event_params) WHERE key = 'session_engaged') AS session_engaged,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time_msec,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'experiment_id') AS experiment_id,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'variant') AS variant,
        ${channel.source} AS source,
        ${channel.medium} AS medium,
        ${channel.campaign} AS campaign
      FROM ${eventsTable}
      WHERE _TABLE_SUFFIX = @suffix
    ),
    sessions AS (
      SELECT
        ARRAY_AGG(IF(event_name = 'page_view', STRUCT(page_location, page_path, source, medium, campaign), NULL)
          IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS landing,
        ARRAY_AGG(IF(event_name = 'experiment_exposure', STRUCT(experiment_id, variant), NULL)
          IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS exposure,
        MAX(IF(session_engaged = '1', 1, 0)) AS engaged,
        SUM(COALESCE(engagement_time_msec, 0)) AS engagement_ms,
        COUNTIF(event_name IN UNNEST(@lead_events)) AS leads
      FROM base
      WHERE user_pseudo_id IS NOT NULL AND sid IS NOT NULL
      GROUP BY user_pseudo_id, sid
    ),
    landed AS (
      SELECT
        *,
        REGEXP_EXTRACT(landing.page_location, r'^https?://([^/?#:]+)') AS host,
        (REGEXP_CONTAINS(COALESCE(landing.page_location, ''), r'[?&](${clickIdAlternation})=')
          OR LOWER(landing.medium) IN UNNEST(@paid_mediums)) AS is_candidate
      FROM sessions
      WHERE landing IS NOT NULL
    )
    SELECT
      'candidate' AS kind,
      host,
      landing.page_path AS path,
      landing.source AS source,
      landing.medium AS medium,
      landing.campaign AS campaign,
      ${firstClickId} AS click_id_type,
      ${param("utm_id")} AS utm_id,
      ${param("utm_term")} AS utm_term,
      ${param("utm_content")} AS utm_content,
      exposure.experiment_id AS experiment_id,
      exposure.variant AS variant,
      COUNT(*) AS sessions,
      SUM(engaged) AS engaged_sessions,
      SUM(engagement_ms) AS engagement_ms,
      SUM(leads) AS lead_events,
      COUNTIF(leads > 0) AS sessions_with_lead,
      0 AS page_views
    FROM landed
    WHERE is_candidate
    GROUP BY host, path, source, medium, campaign, click_id_type, utm_id, utm_term, utm_content, experiment_id, variant
    UNION ALL
    SELECT
      'organic', host, landing.page_path, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      COUNT(*), SUM(engaged), SUM(engagement_ms), SUM(leads), COUNTIF(leads > 0), 0
    FROM landed
    WHERE NOT is_candidate
    GROUP BY host, landing.page_path
    UNION ALL
    SELECT
      'cookieless', REGEXP_EXTRACT(page_location, r'^https?://([^/?#:]+)'), page_path,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, COUNT(*)
    FROM base
    WHERE user_pseudo_id IS NULL AND event_name = 'page_view'
    GROUP BY 2, 3
  `;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  if (v && typeof v === "object" && "value" in (v as object)) return num((v as { value: unknown }).value);
  return 0;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

export function parsePaidLandingRows(raw: Record<string, unknown>[]): Pick<PaidLandingDayFile, "candidates" | "organic" | "cookieless"> {
  const candidates: PaidLandingCandidateRow[] = [];
  const organic: OrganicBaselineRow[] = [];
  const cookieless: CookielessRow[] = [];
  for (const r of raw) {
    const host = (str(r.host) ?? "").toLowerCase().replace(/^www\./, "");
    const p = normalizeLandingPath(str(r.path) ?? "/");
    if (r.kind === "cookieless") {
      cookieless.push({ host, path: p, page_views: num(r.page_views) });
    } else if (r.kind === "organic") {
      organic.push({
        host,
        path: p,
        sessions: num(r.sessions),
        engaged_sessions: num(r.engaged_sessions),
        engagement_ms: num(r.engagement_ms),
        sessions_with_lead: num(r.sessions_with_lead),
      });
    } else {
      const clickId = str(r.click_id_type) as ClickIdParam | null;
      candidates.push({
        host,
        path: p,
        source: str(r.source) ?? "(direct)",
        medium: str(r.medium) ?? "(none)",
        campaign: str(r.campaign) ?? "(not set)",
        click_id_type: clickId && (CLICK_ID_PARAMS as string[]).includes(clickId) ? clickId : null,
        utm_id: str(r.utm_id),
        utm_term: str(r.utm_term),
        utm_content: str(r.utm_content),
        experiment_id: str(r.experiment_id),
        variant: str(r.variant),
        sessions: num(r.sessions),
        engaged_sessions: num(r.engaged_sessions),
        engagement_ms: num(r.engagement_ms),
        lead_events: num(r.lead_events),
        sessions_with_lead: num(r.sessions_with_lead),
      });
    }
  }
  return { candidates, organic, cookieless };
}

async function queryDay(date: string, contentRoot?: string): Promise<Pick<PaidLandingDayFile, "candidates" | "organic" | "cookieless">> {
  const client = getBigQueryClient(contentRoot);
  if (!client) throw new Error("bigquery_client_unavailable");
  const settings = getBigQuerySettings(contentRoot);
  const leadEvents = getLeadConversionEventNames(contentRoot);
  const params = {
    suffix: date.replace(/-/g, ""),
    lead_events: leadEvents.length > 0 ? leadEvents : ["__no_lead_events__"],
    paid_mediums: [...PAID_MEDIUMS],
  };
  const run = async (includeSessionLastClick: boolean) => {
    const [rows] = await client.query({
      query: buildPaidLandingSql(fqEventsWildcard(settings), includeSessionLastClick),
      params,
      location: settings.location || undefined,
      maximumBytesBilled: MAX_BYTES_BILLED,
    });
    return (rows || []) as Record<string, unknown>[];
  };
  let raw: Record<string, unknown>[];
  try {
    raw = await run(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/session_traffic_source_last_click/i.test(msg)) throw err;
    raw = await run(false);
  }
  return parsePaidLandingRows(raw);
}

export type PaidLandingSyncResult = { ok: boolean; fetched: string[]; error?: string; skipped?: "ga4_not_configured" };

export async function syncPaidLandingDays(site: string, contentRoot?: string, now = new Date()): Promise<PaidLandingSyncResult> {
  if (!isGa4Configured(contentRoot)) return { ok: false, fetched: [], skipped: "ga4_not_configured" };
  const state = loadPaidLandingState(site);
  const completeCutoff = lastCompleteGa4Date(now);
  const fetched: string[] = [];
  try {
    for (const date of paidLandingDatesToFetch(site, now).slice(0, MAX_DAYS_PER_RUN)) {
      const rows = await queryDay(date, contentRoot);
      const hasData = rows.candidates.length + rows.organic.length + rows.cookieless.length > 0;
      writeJson(path.join(dir(site), `${date}.json`), {
        date,
        fetched_at: new Date().toISOString(),
        complete: date <= completeCutoff,
        ...rows,
      } satisfies PaidLandingDayFile);
      if (hasData && (!state.last_export_date || date > state.last_export_date)) state.last_export_date = date;
      fetched.push(date);
    }
    const floor = addDays(utcDate(now), -PAID_LANDING_RETENTION_DAYS);
    for (const d of listPaidLandingDates(site)) {
      if (d >= floor) break;
      try {
        fs.unlinkSync(path.join(dir(site), `${d}.json`));
      } catch {
        /* ignore */
      }
    }
    state.last_success_at = new Date().toISOString();
    state.last_error = undefined;
    state.consecutive_failures = 0;
    writeJson(statePath(site), state);
    return { ok: true, fetched };
  } catch (err) {
    state.last_error = err instanceof Error ? err.message : String(err);
    state.consecutive_failures = (state.consecutive_failures || 0) + 1;
    writeJson(statePath(site), state);
    log.warn({ err, site }, "[paid-detection] GA4 paid-landing sync failed");
    return { ok: false, fetched, error: state.last_error };
  }
}
