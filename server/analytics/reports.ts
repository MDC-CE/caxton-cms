/**
 * Named GA4 analytics reports from BigQuery export (events_*).
 * Short in-memory TTL only — same window semantics as journey-analytics.
 */

import {
  fqEventsWildcard,
  getBigQueryClient,
  getBigQueryConfigStatus,
  getBigQuerySettings,
} from "../ecommerce/bigquery-client";
import { normalizeAnalyticsPath } from "../ecommerce/journey-analytics";
import { contentIndex } from "../content-index";
import { child } from "../logger";

const log = child({ module: "analytics-reports" });

const TTL_MS = 10 * 60 * 1000;
const DEFAULT_DAYS = 28;
const MAX_DAYS = 90;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const MAX_BYTES_BILLED = "5000000000";

export const ANALYTICS_REPORTS = [
  "site_summary",
  "top_pages",
  "page_detail",
  "events_by_name",
  "traffic_sources",
] as const;

export type AnalyticsReportName = (typeof ANALYTICS_REPORTS)[number];

export type AnalyticsWarning = { code: string; message: string };

export type AnalyticsReportResult = {
  report: AnalyticsReportName;
  status: "ok" | "not_configured";
  window_days: number;
  as_of: string;
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  warnings: AnalyticsWarning[];
  resolved_paths?: string[];
};

type CacheEntry = { expires: number; payload: AnalyticsReportResult };
const cache = new Map<string, CacheEntry>();

export type GetAnalyticsReportOpts = {
  report: AnalyticsReportName;
  days?: number;
  limit?: number;
  path?: string;
  content_type?: string;
  slug?: string;
  locale?: string;
  contentRoot?: string;
  /** Optional event name filter for events_by_name */
  event_names?: string[];
};

function windowBounds(days: number): { start: string; end: string; asOf: string } {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end), asOf: fmt(end) };
}

function priorWindowBounds(
  days: number,
  currentStart: string,
): { start: string; end: string } {
  const end = new Date(`${currentStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

/** Prefer GA4 page_path; else path from page_location. */
function bqNormalizedPagePathSql(): string {
  return `REGEXP_REPLACE(
            COALESCE(
              NULLIF(
                (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_path'),
                ''
              ),
              REGEXP_EXTRACT(
                (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
                r'^https?://[^/?#]+([^?#]*)'
              ),
              REGEXP_REPLACE(
                COALESCE(
                  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
                  ''
                ),
                r'[?#].*$',
                ''
              ),
              ''
            ),
            r'/+$',
            ''
          )`;
}

function clampDays(raw?: number): number {
  const n = Number.isFinite(raw) ? Number(raw) : DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.floor(n)));
}

function clampLimit(raw?: number): number {
  const n = Number.isFinite(raw) ? Number(raw) : DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export type ResolvePagePathsResult =
  | { ok: true; paths: string[]; warnings: AnalyticsWarning[] }
  | { ok: false; error: string };

/**
 * Resolve page_detail identity: raw path XOR content_type+slug (+ optional locale).
 * Bare slug alone is rejected by the caller before this runs.
 */
export function resolvePageDetailPaths(opts: {
  path?: string;
  content_type?: string;
  slug?: string;
  locale?: string;
}): ResolvePagePathsResult {
  const pathRaw = (opts.path || "").trim();
  const ct = (opts.content_type || "").trim();
  const slug = (opts.slug || "").trim();
  const locale = (opts.locale || "").trim();

  if (pathRaw && (ct || slug)) {
    return {
      ok: false,
      error:
        'Pass either path OR content_type+slug (not both). Example: path="/en/blog/foo" or content_type="blog" slug="foo".',
    };
  }

  if (pathRaw) {
    const p = normalizeAnalyticsPath(pathRaw);
    if (!p) {
      return { ok: false, error: "path could not be normalized to a public pathname." };
    }
    return { ok: true, paths: [p], warnings: [] };
  }

  if (!ct || !slug) {
    return {
      ok: false,
      error:
        'page_detail requires path or content_type+slug. Example: path="/en/..." or content_type="program" slug="ai-fluency". Bare slug alone is not allowed.',
    };
  }

  let urls: Record<string, string> = {};
  try {
    urls = contentIndex.getAlternateUrls(slug, ct) ?? {};
  } catch (err) {
    log.warn({ err, content_type: ct, slug }, "[analytics] getAlternateUrls failed");
  }

  const warnings: AnalyticsWarning[] = [];
  const locales = Object.keys(urls).filter((k) => typeof urls[k] === "string" && urls[k]);
  if (locales.length === 0) {
    return {
      ok: false,
      error: `No live public URLs found for ${ct}/${slug}. Confirm the entry exists and is published.`,
    };
  }

  let chosen: string[] = [];
  if (locale) {
    const u = urls[locale];
    if (!u) {
      return {
        ok: false,
        error: `No live URL for locale "${locale}" on ${ct}/${slug}. Available: ${locales.join(", ")}`,
      };
    }
    chosen = [normalizeAnalyticsPath(u)].filter(Boolean);
  } else if (urls.en) {
    chosen = [normalizeAnalyticsPath(urls.en)].filter(Boolean);
    if (locales.length > 1) {
      warnings.push({
        code: "primary_locale_chosen",
        message: `Multiple live locales (${locales.join(", ")}); using en. Pass locale to select another.`,
      });
    }
  } else {
    const first = locales[0]!;
    chosen = [normalizeAnalyticsPath(urls[first]!)].filter(Boolean);
    if (locales.length > 1) {
      warnings.push({
        code: "primary_locale_chosen",
        message: `Multiple live locales (${locales.join(", ")}); using ${first}. Pass locale to select another.`,
      });
    }
  }

  if (chosen.length === 0) {
    return {
      ok: false,
      error: `Resolved URLs for ${ct}/${slug} could not be normalized to paths.`,
    };
  }

  return { ok: true, paths: chosen, warnings };
}

function emptyResult(
  report: AnalyticsReportName,
  days: number,
  status: "ok" | "not_configured",
  warnings: AnalyticsWarning[],
  extra?: Partial<AnalyticsReportResult>,
): AnalyticsReportResult {
  const { asOf } = windowBounds(days);
  return {
    report,
    status,
    window_days: days,
    as_of: asOf,
    rows: [],
    totals: {},
    warnings,
    ...extra,
  };
}

function notConfiguredResult(
  report: AnalyticsReportName,
  days: number,
  extraWarnings: AnalyticsWarning[] = [],
): AnalyticsReportResult {
  const status = getBigQueryConfigStatus();
  return emptyResult(report, days, "not_configured", [
    ...status.warnings.map((m) => ({ code: "bigquery_not_configured", message: m })),
    {
      code: "configure_at",
      message: "Configure project/dataset at /private/tracking/ga4",
    },
    ...extraWarnings,
  ]);
}

function emptyOkWarning(): AnalyticsWarning {
  return {
    code: "no_events_in_window",
    message: "No matching events in this window. BigQuery is configured — this is empty data, not a setup failure.",
  };
}

async function queryRows(
  contentRoot: string | undefined,
  sql: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const client = getBigQueryClient(contentRoot);
  if (!client) {
    throw new Error("bigquery_client_unavailable");
  }
  const settings = getBigQuerySettings(contentRoot);
  const [rows] = await client.query({
    query: sql,
    params,
    location: settings.location || undefined,
    maximumBytesBilled: MAX_BYTES_BILLED,
  });
  return (rows || []) as Record<string, unknown>[];
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  if (v && typeof v === "object" && "value" in (v as object)) {
    return num((v as { value: unknown }).value);
  }
  return 0;
}

async function runSiteSummary(
  days: number,
  contentRoot?: string,
): Promise<AnalyticsReportResult> {
  const settings = getBigQuerySettings(contentRoot);
  const eventsTable = fqEventsWildcard(settings);
  const { start, end, asOf } = windowBounds(days);
  const prior = priorWindowBounds(days, start);

  const sql = `
    WITH params AS (
      SELECT @start_date AS start_date, @end_date AS end_date,
             @prior_start AS prior_start, @prior_end AS prior_end
    ),
    cur AS (
      SELECT
        COUNTIF(event_name = 'page_view') AS views,
        COUNT(DISTINCT IF(event_name = 'page_view',
          CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)),
          NULL)) AS sessions,
        COUNT(DISTINCT user_pseudo_id) AS users
      FROM ${eventsTable}, params
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE(params.start_date))
        AND FORMAT_DATE('%Y%m%d', DATE(params.end_date))
    ),
    prev AS (
      SELECT
        COUNTIF(event_name = 'page_view') AS views,
        COUNT(DISTINCT IF(event_name = 'page_view',
          CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)),
          NULL)) AS sessions,
        COUNT(DISTINCT user_pseudo_id) AS users
      FROM ${eventsTable}, params
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE(params.prior_start))
        AND FORMAT_DATE('%Y%m%d', DATE(params.prior_end))
    )
    SELECT
      cur.views AS views, cur.sessions AS sessions, cur.users AS users,
      prev.views AS prior_views, prev.sessions AS prior_sessions, prev.users AS prior_users
    FROM cur, prev
  `;

  const rows = await queryRows(contentRoot, sql, {
    start_date: start,
    end_date: end,
    prior_start: prior.start,
    prior_end: prior.end,
  });
  const row = rows[0] || {};
  const views = num(row.views);
  const sessions = num(row.sessions);
  const users = num(row.users);
  const totals = {
    views,
    sessions,
    users,
    prior_views: num(row.prior_views),
    prior_sessions: num(row.prior_sessions),
    prior_users: num(row.prior_users),
    delta_views: views - num(row.prior_views),
    delta_sessions: sessions - num(row.prior_sessions),
    delta_users: users - num(row.prior_users),
  };
  const warnings: AnalyticsWarning[] = [];
  if (views === 0 && sessions === 0) warnings.push(emptyOkWarning());

  return {
    report: "site_summary",
    status: "ok",
    window_days: days,
    as_of: asOf,
    rows: [totals],
    totals,
    warnings,
  };
}

async function runTopPages(
  days: number,
  limit: number,
  contentRoot?: string,
): Promise<AnalyticsReportResult> {
  const settings = getBigQuerySettings(contentRoot);
  const eventsTable = fqEventsWildcard(settings);
  const { start, end, asOf } = windowBounds(days);
  const pagePathExpr = bqNormalizedPagePathSql();

  const sql = `
    WITH params AS (
      SELECT @start_date AS start_date, @end_date AS end_date
    ),
    base AS (
      SELECT
        user_pseudo_id,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
        ${pagePathExpr} AS page_path
      FROM ${eventsTable}, params
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE(params.start_date))
        AND FORMAT_DATE('%Y%m%d', DATE(params.end_date))
        AND event_name = 'page_view'
    ),
    cleaned AS (
      SELECT user_pseudo_id, ga_session_id,
        CASE WHEN page_path = '' THEN '/' ELSE page_path END AS page_path
      FROM base
      WHERE page_path IS NOT NULL AND page_path != ''
    )
    SELECT
      page_path AS path,
      COUNT(*) AS views,
      COUNT(DISTINCT CONCAT(user_pseudo_id, '-', CAST(ga_session_id AS STRING))) AS sessions
    FROM cleaned
    GROUP BY path
    ORDER BY views DESC
    LIMIT @limit
  `;

  const raw = await queryRows(contentRoot, sql, {
    start_date: start,
    end_date: end,
    limit,
  });
  const rows = raw.map((r) => ({
    path: String(r.path || ""),
    views: num(r.views),
    sessions: num(r.sessions),
  }));
  const totals = {
    row_count: rows.length,
    views: rows.reduce((s, r) => s + r.views, 0),
    sessions: rows.reduce((s, r) => s + r.sessions, 0),
  };
  const warnings: AnalyticsWarning[] = [];
  if (rows.length === 0) warnings.push(emptyOkWarning());

  return {
    report: "top_pages",
    status: "ok",
    window_days: days,
    as_of: asOf,
    rows,
    totals,
    warnings,
  };
}

async function runPageDetail(
  days: number,
  paths: string[],
  contentRoot?: string,
  resolveWarnings: AnalyticsWarning[] = [],
): Promise<AnalyticsReportResult> {
  const settings = getBigQuerySettings(contentRoot);
  const eventsTable = fqEventsWildcard(settings);
  const { start, end, asOf } = windowBounds(days);
  const pagePathExpr = bqNormalizedPagePathSql();

  const metricsSql = `
    WITH params AS (
      SELECT @start_date AS start_date, @end_date AS end_date
    ),
    base AS (
      SELECT
        user_pseudo_id,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
        event_name,
        ${pagePathExpr} AS page_path
      FROM ${eventsTable}, params
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE(params.start_date))
        AND FORMAT_DATE('%Y%m%d', DATE(params.end_date))
        AND event_name IN UNNEST(@event_names)
    ),
    cleaned AS (
      SELECT user_pseudo_id, ga_session_id, event_name,
        CASE WHEN page_path = '' THEN '/' ELSE page_path END AS page_path
      FROM base
      WHERE page_path IN UNNEST(@paths)
    )
    SELECT
      page_path AS path,
      COUNTIF(event_name = 'page_view') AS views,
      COUNT(DISTINCT IF(event_name = 'page_view',
        CONCAT(user_pseudo_id, '-', CAST(ga_session_id AS STRING)), NULL)) AS sessions
    FROM cleaned
    GROUP BY path
  `;

  const topEventsSql = `
    WITH params AS (
      SELECT @start_date AS start_date, @end_date AS end_date
    ),
    base AS (
      SELECT
        event_name,
        ${pagePathExpr} AS page_path
      FROM ${eventsTable}, params
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE(params.start_date))
        AND FORMAT_DATE('%Y%m%d', DATE(params.end_date))
    ),
    cleaned AS (
      SELECT event_name,
        CASE WHEN page_path = '' THEN '/' ELSE page_path END AS page_path
      FROM base
      WHERE page_path IN UNNEST(@paths)
        AND event_name IS NOT NULL AND event_name != ''
    )
    SELECT event_name, COUNT(*) AS event_count
    FROM cleaned
    GROUP BY event_name
    ORDER BY event_count DESC
    LIMIT 20
  `;

  const metricRows = await queryRows(contentRoot, metricsSql, {
    start_date: start,
    end_date: end,
    paths,
    event_names: ["page_view"],
  });
  const eventRows = await queryRows(contentRoot, topEventsSql, {
    start_date: start,
    end_date: end,
    paths,
  });

  const byPath = new Map(
    metricRows.map((r) => [
      String(r.path || ""),
      { path: String(r.path || ""), views: num(r.views), sessions: num(r.sessions) },
    ]),
  );
  const rows = paths.map((p) => byPath.get(p) || { path: p, views: 0, sessions: 0 });
  const top_events = eventRows.map((r) => ({
    event_name: String(r.event_name || ""),
    event_count: num(r.event_count),
  }));
  const totals = {
    views: rows.reduce((s, r) => s + r.views, 0),
    sessions: rows.reduce((s, r) => s + r.sessions, 0),
    top_events,
  };
  const warnings = [...resolveWarnings];
  if (totals.views === 0 && totals.sessions === 0) warnings.push(emptyOkWarning());

  return {
    report: "page_detail",
    status: "ok",
    window_days: days,
    as_of: asOf,
    rows,
    totals,
    warnings,
    resolved_paths: paths,
  };
}

async function runEventsByName(
  days: number,
  limit: number,
  eventNames: string[] | undefined,
  contentRoot?: string,
): Promise<AnalyticsReportResult> {
  const settings = getBigQuerySettings(contentRoot);
  const eventsTable = fqEventsWildcard(settings);
  const { start, end, asOf } = windowBounds(days);
  const filter = (eventNames || []).map((e) => e.trim()).filter(Boolean);

  const sql = `
    WITH params AS (
      SELECT @start_date AS start_date, @end_date AS end_date
    ),
    base AS (
      SELECT event_name
      FROM ${eventsTable}, params
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE(params.start_date))
        AND FORMAT_DATE('%Y%m%d', DATE(params.end_date))
        AND event_name IS NOT NULL AND event_name != ''
        AND (@filter_empty OR event_name IN UNNEST(@event_names))
    )
    SELECT event_name, COUNT(*) AS event_count
    FROM base
    GROUP BY event_name
    ORDER BY event_count DESC
    LIMIT @limit
  `;

  const raw = await queryRows(contentRoot, sql, {
    start_date: start,
    end_date: end,
    event_names: filter.length ? filter : [""],
    filter_empty: filter.length === 0,
    limit,
  });
  const rows = raw.map((r) => ({
    event_name: String(r.event_name || ""),
    event_count: num(r.event_count),
  }));
  const totals = {
    row_count: rows.length,
    event_count: rows.reduce((s, r) => s + r.event_count, 0),
  };
  const warnings: AnalyticsWarning[] = [];
  if (rows.length === 0) warnings.push(emptyOkWarning());

  return {
    report: "events_by_name",
    status: "ok",
    window_days: days,
    as_of: asOf,
    rows,
    totals,
    warnings,
  };
}

async function runTrafficSources(
  days: number,
  limit: number,
  contentRoot?: string,
): Promise<AnalyticsReportResult> {
  const settings = getBigQuerySettings(contentRoot);
  const eventsTable = fqEventsWildcard(settings);
  const { start, end, asOf } = windowBounds(days);

  const sql = `
    WITH params AS (
      SELECT @start_date AS start_date, @end_date AS end_date
    ),
    base AS (
      SELECT
        user_pseudo_id,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
        COALESCE(NULLIF(traffic_source.source, ''), '(direct)') AS source,
        COALESCE(NULLIF(traffic_source.medium, ''), '(none)') AS medium
      FROM ${eventsTable}, params
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE(params.start_date))
        AND FORMAT_DATE('%Y%m%d', DATE(params.end_date))
        AND event_name = 'page_view'
    )
    SELECT
      source,
      medium,
      COUNT(DISTINCT CONCAT(user_pseudo_id, '-', CAST(ga_session_id AS STRING))) AS sessions,
      COUNT(*) AS views
    FROM base
    GROUP BY source, medium
    ORDER BY sessions DESC
    LIMIT @limit
  `;

  const raw = await queryRows(contentRoot, sql, {
    start_date: start,
    end_date: end,
    limit,
  });
  const rows = raw.map((r) => ({
    source: String(r.source || "(direct)"),
    medium: String(r.medium || "(none)"),
    sessions: num(r.sessions),
    views: num(r.views),
  }));
  const totals = {
    row_count: rows.length,
    sessions: rows.reduce((s, r) => s + r.sessions, 0),
    views: rows.reduce((s, r) => s + r.views, 0),
  };
  const warnings: AnalyticsWarning[] = [];
  if (rows.length === 0) warnings.push(emptyOkWarning());

  return {
    report: "traffic_sources",
    status: "ok",
    window_days: days,
    as_of: asOf,
    rows,
    totals,
    warnings,
  };
}

/**
 * Validate opts and run one named report. Throws only for unexpected BQ errors;
 * bad args return via thrown ValidationError message for the route to map to 400.
 */
export class AnalyticsReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsReportValidationError";
  }
}

export async function getAnalyticsReport(
  opts: GetAnalyticsReportOpts,
): Promise<AnalyticsReportResult> {
  const report = opts.report;
  if (!ANALYTICS_REPORTS.includes(report)) {
    throw new AnalyticsReportValidationError(
      `Unknown report "${report}". Valid: ${ANALYTICS_REPORTS.join(", ")}`,
    );
  }

  const days = clampDays(opts.days);
  const limit = clampLimit(opts.limit);
  const contentRoot = opts.contentRoot;

  let resolvedPaths: string[] | undefined;
  let resolveWarnings: AnalyticsWarning[] = [];

  if (report === "page_detail") {
    const slugOnly = Boolean((opts.slug || "").trim()) && !(opts.content_type || "").trim() && !(opts.path || "").trim();
    if (slugOnly) {
      throw new AnalyticsReportValidationError(
        'Bare slug is not allowed. Pass content_type with slug, or a public path. Example: content_type="program" slug="ai-fluency".',
      );
    }
    const resolved = resolvePageDetailPaths({
      path: opts.path,
      content_type: opts.content_type,
      slug: opts.slug,
      locale: opts.locale,
    });
    if (!resolved.ok) {
      throw new AnalyticsReportValidationError(resolved.error);
    }
    resolvedPaths = resolved.paths;
    resolveWarnings = resolved.warnings;
  }

  const cacheKey = [
    contentRoot || "",
    report,
    days,
    limit,
    resolvedPaths?.join(",") || opts.path || "",
    opts.content_type || "",
    opts.slug || "",
    opts.locale || "",
    (opts.event_names || []).join(","),
  ].join("|");

  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.payload;

  const bqStatus = getBigQueryConfigStatus(contentRoot);
  if (!bqStatus.configured) {
    const payload = notConfiguredResult(report, days, resolveWarnings);
    if (resolvedPaths) payload.resolved_paths = resolvedPaths;
    return payload;
  }

  if (!getBigQueryClient(contentRoot)) {
    return emptyResult(report, days, "not_configured", [
      {
        code: "bigquery_client_unavailable",
        message: "Could not create BigQuery client — check GCS_CREDENTIALS_JSON / ADC",
      },
      {
        code: "configure_at",
        message: "Configure project/dataset at /private/tracking/ga4",
      },
      ...resolveWarnings,
    ], resolvedPaths ? { resolved_paths: resolvedPaths } : undefined);
  }

  let payload: AnalyticsReportResult;
  try {
    switch (report) {
      case "site_summary":
        payload = await runSiteSummary(days, contentRoot);
        break;
      case "top_pages":
        payload = await runTopPages(days, limit, contentRoot);
        break;
      case "page_detail":
        payload = await runPageDetail(days, resolvedPaths!, contentRoot, resolveWarnings);
        break;
      case "events_by_name":
        payload = await runEventsByName(days, limit, opts.event_names, contentRoot);
        break;
      case "traffic_sources":
        payload = await runTrafficSources(days, limit, contentRoot);
        break;
      default: {
        const _exhaustive: never = report;
        throw new AnalyticsReportValidationError(`Unhandled report: ${_exhaustive}`);
      }
    }
  } catch (err) {
    if (err instanceof AnalyticsReportValidationError) throw err;
    log.error({ err, report }, "[analytics] report query failed");
    throw err;
  }

  cache.set(cacheKey, { expires: Date.now() + TTL_MS, payload });
  return payload;
}

export function clearAnalyticsReportCache(): void {
  cache.clear();
}
