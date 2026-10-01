/**
 * Google Ads → BigQuery Data Transfer reader. The transfer writes one set of tables
 * per customer (`ads_<Table>_<customer_id>` views over `p_ads_<Table>_<customer_id>`;
 * older transfers use `p_<Table>_<customer_id>`). Table and column names are probed
 * from INFORMATION_SCHEMA each run, so a missing column reads as NULL instead of failing.
 *
 * Credentials: the same service account as GA4 BigQuery (GCS_CREDENTIALS_JSON /
 * GCS_KEY_FILENAME / ADC). The SA needs BigQuery Data Viewer + Job User on the dataset.
 */

import type { BigQuery } from "@google-cloud/bigquery";
import { createBigQueryClientForProject } from "../ecommerce/bigquery-client";
import { googleNetworkOf, type GoogleAdNetwork } from "@shared/paid-traffic";
import type { SpendDestinationHint } from "./providers/types";

const MAX_BYTES_BILLED = "2000000000";

export const GOOGLE_LOGICAL_TABLES = [
  "CampaignBasicStats",
  "CampaignStats",
  "CampaignConversionStats",
  "LandingPageStats",
  "Campaign",
  "AdGroup",
  "Ad",
  "Customer",
  "ClickStats",
] as const;
export type GoogleLogicalTable = (typeof GOOGLE_LOGICAL_TABLES)[number];

/** Per customer: logical table → physical table name + its columns. */
export type GoogleCustomerTables = Partial<Record<GoogleLogicalTable, { name: string; columns: string[]; partitioned_name?: string }>>;

export type GoogleTransferLayout = {
  project: string;
  dataset: string;
  customers: Record<string, GoogleCustomerTables>;
};

const TABLE_RE = new RegExp(`^(p_)?(ads_)?(${GOOGLE_LOGICAL_TABLES.join("|")})_(\\d{10})$`);

/** Views (`ads_X_cid`) first, then partitioned tables. */
function tableRank(name: string): number {
  if (name.startsWith("ads_")) return 0;
  if (name.startsWith("p_ads_")) return 1;
  if (name.startsWith("p_")) return 2;
  return 3;
}

/** Pure: INFORMATION_SCHEMA.COLUMNS rows → layout. */
export function parseTransferLayout(project: string, dataset: string, rows: Array<{ table_name: string; column_name: string }>): GoogleTransferLayout {
  const byTable = new Map<string, string[]>();
  for (const r of rows) {
    const cols = byTable.get(r.table_name) ?? [];
    cols.push(String(r.column_name));
    byTable.set(r.table_name, cols);
  }
  const customers: GoogleTransferLayout["customers"] = {};
  for (const [name, columns] of Array.from(byTable.entries())) {
    const m = TABLE_RE.exec(name);
    if (!m) continue;
    const logical = m[3] as GoogleLogicalTable;
    const cid = m[4]!;
    const tables = (customers[cid] ??= {});
    const prev = tables[logical];
    const partitioned = name.startsWith("p_") ? name : prev?.partitioned_name;
    if (!prev || tableRank(name) < tableRank(prev.name)) {
      tables[logical] = { name, columns, ...(partitioned ? { partitioned_name: partitioned } : {}) };
    } else if (partitioned && !prev.partitioned_name) {
      prev.partitioned_name = partitioned;
    }
  }
  return { project, dataset, customers };
}

export function campaignStatsTable(t: GoogleCustomerTables) {
  return t.CampaignBasicStats ?? t.CampaignStats;
}

const CLICK_JOIN_COLUMNS = ["click_view_gclid", "campaign_id", "ad_group_id", "segments_ad_network_type", "segments_date"];

/** ClickStats reference for the GA4 gclid join; null when the table or its gclid/date columns are missing. */
export function clickStatsRef(project: string, dataset: string, t: GoogleCustomerTables): { table: string; columns: string[] } | null {
  const cs = t.ClickStats;
  if (!cs || !cs.columns.includes("click_view_gclid") || !cs.columns.includes("segments_date")) return null;
  return { table: `${project}.${dataset}.${cs.name}`, columns: CLICK_JOIN_COLUMNS.filter((c) => cs.columns.includes(c)) };
}

function fq(layout: Pick<GoogleTransferLayout, "project" | "dataset">, table: string): string {
  return `\`${layout.project}.${layout.dataset}.${table}\``;
}

/** Column or a typed NULL when this transfer version doesn't have it. */
function col(table: { columns: string[] }, name: string, type = "STRING"): string {
  return table.columns.includes(name) ? name : `CAST(NULL AS ${type})`;
}

function latestFilter(table: { columns: string[] }): string {
  return table.columns.includes("_DATA_DATE") && table.columns.includes("_LATEST_DATE") ? "WHERE _DATA_DATE = _LATEST_DATE" : "";
}

export type GoogleSqlSet = {
  bounds?: string;
  campaign_stats?: string;
  landing_stats?: string;
  conversions?: string;
  campaigns?: string;
  ad_groups?: string;
  ads?: string;
  customer?: string;
};

/** Pure: SQL for one customer. Date params: @since / @until (YYYY-MM-DD strings). */
export function buildCustomerSql(layout: Pick<GoogleTransferLayout, "project" | "dataset">, t: GoogleCustomerTables): GoogleSqlSet {
  const out: GoogleSqlSet = {};
  const cs = campaignStatsTable(t);
  if (cs) {
    out.bounds = `SELECT CAST(MIN(segments_date) AS STRING) AS min_date, CAST(MAX(segments_date) AS STRING) AS max_date
      FROM ${fq(layout, cs.name)} WHERE segments_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 400 DAY)`;
    out.campaign_stats = `SELECT CAST(segments_date AS STRING) AS date, CAST(campaign_id AS STRING) AS campaign_id,
        ${col(cs, "segments_ad_network_type")} AS network,
        SUM(${col(cs, "metrics_cost_micros", "INT64")}) AS cost_micros,
        SUM(${col(cs, "metrics_clicks", "INT64")}) AS clicks,
        SUM(${col(cs, "metrics_impressions", "INT64")}) AS impressions
      FROM ${fq(layout, cs.name)}
      WHERE segments_date BETWEEN DATE(@since) AND DATE(@until)
      GROUP BY 1, 2, 3`;
  }
  const lp = t.LandingPageStats;
  if (lp) {
    out.landing_stats = `SELECT CAST(segments_date AS STRING) AS date, CAST(campaign_id AS STRING) AS campaign_id,
        CAST(${col(lp, "ad_group_id", "INT64")} AS STRING) AS ad_group_id,
        ${col(lp, "landing_page_view_unexpanded_final_url")} AS url,
        SUM(${col(lp, "metrics_cost_micros", "INT64")}) AS cost_micros,
        SUM(${col(lp, "metrics_clicks", "INT64")}) AS clicks,
        SUM(${col(lp, "metrics_impressions", "INT64")}) AS impressions
      FROM ${fq(layout, lp.name)}
      WHERE segments_date BETWEEN DATE(@since) AND DATE(@until)
      GROUP BY 1, 2, 3, 4`;
  }
  const cv = t.CampaignConversionStats;
  if (cv) {
    out.conversions = `SELECT CAST(segments_date AS STRING) AS date, CAST(campaign_id AS STRING) AS campaign_id,
        ${col(cv, "segments_conversion_action_category")} AS category,
        ${col(cv, "segments_conversion_action_name")} AS action_name,
        REGEXP_EXTRACT(${col(cv, "segments_conversion_action")}, r'(\\d+)$') AS action_id,
        SUM(${col(cv, "metrics_conversions", "FLOAT64")}) AS conversions
      FROM ${fq(layout, cv.name)}
      WHERE segments_date BETWEEN DATE(@since) AND DATE(@until)
      GROUP BY 1, 2, 3, 4, 5`;
  }
  const c = t.Campaign;
  if (c) {
    out.campaigns = `SELECT CAST(campaign_id AS STRING) AS campaign_id,
        ANY_VALUE(${col(c, "campaign_name")}) AS name,
        ANY_VALUE(${col(c, "campaign_advertising_channel_type")}) AS channel_type,
        ANY_VALUE(${col(c, "campaign_status")}) AS status,
        ANY_VALUE(${col(c, "campaign_final_url_suffix")}) AS final_url_suffix
      FROM ${fq(layout, c.name)} ${latestFilter(c)}
      GROUP BY 1`;
  }
  const g = t.AdGroup;
  if (g) {
    out.ad_groups = `SELECT CAST(ad_group_id AS STRING) AS ad_group_id,
        ANY_VALUE(CAST(${col(g, "campaign_id", "INT64")} AS STRING)) AS campaign_id,
        ANY_VALUE(${col(g, "ad_group_name")}) AS name
      FROM ${fq(layout, g.name)} ${latestFilter(g)}
      GROUP BY 1`;
  }
  const a = t.Ad;
  if (a) {
    out.ads = `SELECT CAST(${col(a, "ad_group_ad_ad_id", "INT64")} AS STRING) AS ad_id,
        ANY_VALUE(CAST(${col(a, "ad_group_id", "INT64")} AS STRING)) AS ad_group_id,
        ANY_VALUE(CAST(${col(a, "campaign_id", "INT64")} AS STRING)) AS campaign_id,
        ANY_VALUE(TO_JSON_STRING(${col(a, "ad_group_ad_ad_final_urls")})) AS final_urls,
        ANY_VALUE(${col(a, "ad_group_ad_policy_summary_approval_status")}) AS approval_status,
        ANY_VALUE(${col(a, "ad_group_ad_status")}) AS status
      FROM ${fq(layout, a.name)} ${latestFilter(a)}
      GROUP BY 1
      LIMIT 5000`;
  }
  const cu = t.Customer;
  if (cu) {
    out.customer = `SELECT CAST(customer_id AS STRING) AS customer_id,
        ANY_VALUE(${col(cu, "customer_descriptive_name")}) AS name,
        ANY_VALUE(${col(cu, "customer_currency_code")}) AS currency,
        ANY_VALUE(${col(cu, "customer_auto_tagging_enabled", "BOOL")}) AS auto_tagging
      FROM ${fq(layout, cu.name)} ${latestFilter(cu)}
      GROUP BY 1`;
  }
  return out;
}

// ── Raw result types ───────────────────────────────────────────────────────

export type RawCampaignStat = { date: string; campaign_id: string; network: string | null; cost_micros: number; clicks: number; impressions: number };
export type RawLandingStat = { date: string; campaign_id: string; ad_group_id: string | null; url: string | null; cost_micros: number; clicks: number; impressions: number };
export type RawConversion = { date: string; campaign_id: string; category: string | null; action_name: string | null; action_id: string | null; conversions: number };
export type GoogleCampaignInfo = { customer_id: string; name: string; channel_type: string | null; status: string | null; final_url_suffix: string | null };
export type GoogleAdGroupInfo = { campaign_id: string; name: string };
export type GoogleAdInfo = { customer_id: string; ad_group_id: string; campaign_id: string; final_urls: string[]; approval_status: string | null; status: string | null };
export type GoogleCustomerInfo = { name: string | null; currency: string | null; auto_tagging: boolean | null };

function n(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  if (v && typeof v === "object" && "value" in (v as object)) return n((v as { value: unknown }).value);
  return 0;
}

function s(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object" && "value" in (v as object)) return s((v as { value: unknown }).value);
  const t = String(v).trim();
  return t ? t : null;
}

export function parseFinalUrls(raw: unknown): string[] {
  const t = s(raw);
  if (!t) return [];
  try {
    const parsed = JSON.parse(t) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === "string" && !!u.trim());
    if (typeof parsed === "string") return parsed ? [parsed] : [];
  } catch {
    /* plain string */
  }
  return /^https?:\/\//i.test(t) ? [t] : [];
}

// ── Normalized rows ────────────────────────────────────────────────────────

/** One cached Google spend row: campaign × ad group × landing URL × day, or a campaign-day remainder. */
export type GoogleAdDayRow = {
  date: string;
  customer_id: string;
  currency: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string;
  ad_group_name: string;
  /** Landing page (null on remainder rows). */
  landing_url: string | null;
  /** Remainder rows only: where spend went when no landing page was reported. `unknown` = could not tell. */
  destination: SpendDestinationHint | "unknown" | null;
  channel_type: string | null;
  spend: number;
  clicks: number;
  impressions: number;
  /** Google-reported lead conversions (allocated from the campaign-day by clicks). Never summed with site leads. */
  lead_conversions: number;
};

export type GoogleNetworkDayRow = {
  date: string;
  customer_id: string;
  currency: string;
  campaign_id: string;
  network: GoogleAdNetwork;
  spend: number;
  clicks: number;
  impressions: number;
};

export type LeadActionMatcher = (c: Pick<RawConversion, "category" | "action_name" | "action_id">) => boolean;

/** "Submit lead form" category plus staff-picked action names / ids. */
export function makeLeadActionMatcher(extra: string[]): LeadActionMatcher {
  const wanted = new Set(extra.map((x) => x.trim().toLowerCase()).filter(Boolean));
  return (c) =>
    (c.category ?? "").toUpperCase() === "SUBMIT_LEAD_FORM" ||
    (!!c.action_name && wanted.has(c.action_name.trim().toLowerCase())) ||
    (!!c.action_id && wanted.has(c.action_id));
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

function remainderDestination(channel: string | null, hasLandingClicks: boolean, leads: number, calls: number): GoogleAdDayRow["destination"] {
  const ch = (channel ?? "").toUpperCase();
  if (ch === "VIDEO") return "video_views";
  if (ch === "MULTI_CHANNEL") return "app";
  if (!hasLandingClicks && leads > 0) return "google_lead_form";
  if (!hasLandingClicks && calls > 0) return "calls";
  return "unknown";
}

/**
 * Pure: raw transfer rows for one customer → normalized spend + network rows.
 * Landing-page spend keeps its URL; campaign spend the landing report doesn't cover
 * becomes one remainder row per campaign-day (destination from channel type / conversions),
 * so Google totals always reconcile with campaign stats.
 */
export function buildGoogleDayRows(input: {
  customer_id: string;
  currency: string;
  campaignStats: RawCampaignStat[];
  landingStats: RawLandingStat[];
  conversions: RawConversion[];
  campaigns: Record<string, GoogleCampaignInfo>;
  adGroups: Record<string, GoogleAdGroupInfo>;
  isLead: LeadActionMatcher;
  dates?: Set<string>;
}): { rows: GoogleAdDayRow[]; networkRows: GoogleNetworkDayRow[] } {
  const inDates = (d: string) => !input.dates || input.dates.has(d);
  type CampDay = { cost: number; clicks: number; impressions: number; leads: number; calls: number; landing: RawLandingStat[] };
  const byCampDay = new Map<string, CampDay>();
  const campDay = (date: string, campaign: string): CampDay => {
    const k = `${date}|${campaign}`;
    let v = byCampDay.get(k);
    if (!v) {
      v = { cost: 0, clicks: 0, impressions: 0, leads: 0, calls: 0, landing: [] };
      byCampDay.set(k, v);
    }
    return v;
  };
  const networkRows: GoogleNetworkDayRow[] = [];
  const netAgg = new Map<string, GoogleNetworkDayRow>();
  for (const r of input.campaignStats) {
    if (!inDates(r.date) || !r.campaign_id) continue;
    const cd = campDay(r.date, r.campaign_id);
    cd.cost += r.cost_micros / 1e6;
    cd.clicks += r.clicks;
    cd.impressions += r.impressions;
    const network = googleNetworkOf(r.network);
    const nk = `${r.date}|${r.campaign_id}|${network}`;
    const nr = netAgg.get(nk) ?? { date: r.date, customer_id: input.customer_id, currency: input.currency, campaign_id: r.campaign_id, network, spend: 0, clicks: 0, impressions: 0 };
    nr.spend += r.cost_micros / 1e6;
    nr.clicks += r.clicks;
    nr.impressions += r.impressions;
    netAgg.set(nk, nr);
  }
  for (const nr of Array.from(netAgg.values())) {
    if (nr.spend <= 0 && nr.clicks <= 0 && nr.impressions <= 0) continue;
    networkRows.push({ ...nr, spend: round2(nr.spend) });
  }
  for (const r of input.landingStats) {
    if (!inDates(r.date) || !r.campaign_id) continue;
    campDay(r.date, r.campaign_id).landing.push(r);
  }
  for (const c of input.conversions) {
    if (!inDates(c.date) || !c.campaign_id) continue;
    const cd = campDay(c.date, c.campaign_id);
    if (input.isLead(c)) cd.leads += c.conversions;
    else if ((c.category ?? "").toUpperCase() === "PHONE_CALL_LEAD") cd.calls += c.conversions;
  }

  const rows: GoogleAdDayRow[] = [];
  for (const [k, cd] of Array.from(byCampDay.entries())) {
    const [date, campaignId] = k.split("|") as [string, string];
    const info = input.campaigns[campaignId];
    const base = {
      date,
      customer_id: input.customer_id,
      currency: input.currency,
      campaign_id: campaignId,
      campaign_name: info?.name ?? campaignId,
      channel_type: info?.channel_type ?? null,
    };
    const landingAgg = new Map<string, { ad_group_id: string; url: string; cost: number; clicks: number; impressions: number }>();
    for (const l of cd.landing) {
      const url = (l.url ?? "").trim();
      if (!url) continue;
      const lk = `${l.ad_group_id ?? ""}|${url}`;
      const a = landingAgg.get(lk) ?? { ad_group_id: l.ad_group_id ?? "", url, cost: 0, clicks: 0, impressions: 0 };
      a.cost += l.cost_micros / 1e6;
      a.clicks += l.clicks;
      a.impressions += l.impressions;
      landingAgg.set(lk, a);
    }
    const landing = Array.from(landingAgg.values());
    const lCost = landing.reduce((x, l) => x + l.cost, 0);
    const lClicks = landing.reduce((x, l) => x + l.clicks, 0);
    const lImpr = landing.reduce((x, l) => x + l.impressions, 0);
    const remCost = Math.max(0, cd.cost - lCost);
    const remClicks = Math.max(0, cd.clicks - lClicks);
    const remImpr = Math.max(0, cd.impressions - lImpr);
    const totalClicks = lClicks + remClicks;
    const out: GoogleAdDayRow[] = landing.map((l) => ({
      ...base,
      ad_group_id: l.ad_group_id,
      ad_group_name: input.adGroups[l.ad_group_id]?.name ?? l.ad_group_id,
      landing_url: l.url,
      destination: null,
      spend: round2(l.cost),
      clicks: l.clicks,
      impressions: l.impressions,
      lead_conversions: 0,
    }));
    const needRemainder = remCost >= 0.005 || remClicks > 0 || (cd.leads > 0 && totalClicks === 0) || out.length === 0;
    if (needRemainder && (remCost >= 0.005 || remClicks > 0 || remImpr > 0 || cd.leads > 0)) {
      out.push({
        ...base,
        ad_group_id: "",
        ad_group_name: "",
        landing_url: null,
        destination: remainderDestination(info?.channel_type ?? null, lClicks > 0, cd.leads, cd.calls),
        spend: round2(remCost),
        clicks: remClicks,
        impressions: remImpr,
        lead_conversions: 0,
      });
    }
    allocateLeads(out, cd.leads);
    rows.push(...out);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.campaign_id.localeCompare(b.campaign_id) || a.ad_group_id.localeCompare(b.ad_group_id));
  return { rows, networkRows };
}

/** Spread a campaign-day's lead conversions over its rows by clicks (all to the remainder row when nothing was clicked). */
export function allocateLeads(rows: GoogleAdDayRow[], leads: number): void {
  for (const r of rows) r.lead_conversions = 0;
  if (!(leads > 0) || rows.length === 0) return;
  const clicks = rows.reduce((x, r) => x + r.clicks, 0);
  if (clicks > 0) {
    for (const r of rows) r.lead_conversions = round3((leads * r.clicks) / clicks);
    return;
  }
  const target = rows.find((r) => r.landing_url == null) ?? rows[0]!;
  target.lead_conversions = round3(leads);
}

// ── Queries ────────────────────────────────────────────────────────────────

export class GoogleTransferError extends Error {
  constructor(
    message: string,
    readonly kind: "permission" | "not_found" | "other",
  ) {
    super(message);
  }
}

function classifyBqError(err: unknown): GoogleTransferError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission|access denied|403/i.test(msg)) {
    return new GoogleTransferError(`BigQuery denied access: ${msg}. Give the service account BigQuery Data Viewer + Job User on the transfer dataset.`, "permission");
  }
  if (/not found|404/i.test(msg)) return new GoogleTransferError(`Not found: ${msg}`, "not_found");
  return new GoogleTransferError(msg, "other");
}

export function googleBigQueryClient(project: string): BigQuery {
  const client = createBigQueryClientForProject(project);
  if (!client) throw new GoogleTransferError("BigQuery client unavailable (check GCS_CREDENTIALS_JSON / GCS_KEY_FILENAME).", "other");
  return client;
}

async function run(client: BigQuery, query: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  try {
    const [rows] = await client.query({ query, params, maximumBytesBilled: MAX_BYTES_BILLED });
    return (rows || []) as Record<string, unknown>[];
  } catch (err) {
    throw classifyBqError(err);
  }
}

export async function probeTransferLayout(client: BigQuery, project: string, dataset: string): Promise<GoogleTransferLayout> {
  const rows = await run(
    client,
    `SELECT table_name, column_name FROM \`${project}.${dataset}\`.INFORMATION_SCHEMA.COLUMNS
     WHERE REGEXP_CONTAINS(table_name, @re)`,
    { re: TABLE_RE.source },
  );
  return parseTransferLayout(
    project,
    dataset,
    rows.map((r) => ({ table_name: String(r.table_name), column_name: String(r.column_name) })),
  );
}

/** Partition id (YYYYMMDD) → last modified ISO, for the campaign stats + conversion tables. */
export async function queryPartitionLoads(client: BigQuery, layout: GoogleTransferLayout, cid: string, sinceDate: string): Promise<Map<string, string>> {
  const t = layout.customers[cid] ?? {};
  const names = [campaignStatsTable(t)?.partitioned_name, t.CampaignConversionStats?.partitioned_name].filter((x): x is string => !!x);
  const out = new Map<string, string>();
  if (names.length === 0) return out;
  try {
    const rows = await run(
      client,
      `SELECT partition_id, CAST(MAX(last_modified_time) AS STRING) AS modified
       FROM \`${layout.project}.${layout.dataset}\`.INFORMATION_SCHEMA.PARTITIONS
       WHERE table_name IN UNNEST(@tables) AND partition_id >= @since AND partition_id != '__NULL__'
       GROUP BY 1`,
      { tables: names, since: sinceDate.replace(/-/g, "") },
    );
    for (const r of rows) {
      const pid = s(r.partition_id);
      const mod = s(r.modified);
      if (!pid || !mod || !/^\d{8}$/.test(pid)) continue;
      const iso = new Date(mod.replace(" ", "T").replace(/ UTC$/, "Z")).toISOString();
      out.set(`${pid.slice(0, 4)}-${pid.slice(4, 6)}-${pid.slice(6)}`, iso);
    }
  } catch {
    /* PARTITIONS needs extra permission on some projects; re-read window still applies */
  }
  return out;
}

export type CustomerPull = {
  bounds: { min_date: string | null; max_date: string | null };
  customer: GoogleCustomerInfo;
  campaigns: Record<string, GoogleCampaignInfo>;
  adGroups: Record<string, GoogleAdGroupInfo>;
  ads: Record<string, GoogleAdInfo>;
};

export async function queryCustomerMeta(client: BigQuery, layout: GoogleTransferLayout, cid: string): Promise<CustomerPull> {
  const sql = buildCustomerSql(layout, layout.customers[cid] ?? {});
  const [bounds, customer, campaigns, adGroups, ads] = await Promise.all([
    sql.bounds ? run(client, sql.bounds) : Promise.resolve([]),
    sql.customer ? run(client, sql.customer) : Promise.resolve([]),
    sql.campaigns ? run(client, sql.campaigns) : Promise.resolve([]),
    sql.ad_groups ? run(client, sql.ad_groups) : Promise.resolve([]),
    sql.ads ? run(client, sql.ads) : Promise.resolve([]),
  ]);
  const cu = customer[0] ?? {};
  const autoTagging = cu.auto_tagging == null ? null : cu.auto_tagging === true || String(cu.auto_tagging).toLowerCase() === "true";
  return {
    bounds: { min_date: s(bounds[0]?.min_date), max_date: s(bounds[0]?.max_date) },
    customer: { name: s(cu.name), currency: s(cu.currency), auto_tagging: autoTagging },
    campaigns: Object.fromEntries(
      campaigns
        .filter((r) => s(r.campaign_id))
        .map((r) => [
          s(r.campaign_id)!,
          { customer_id: cid, name: s(r.name) ?? s(r.campaign_id)!, channel_type: s(r.channel_type), status: s(r.status), final_url_suffix: s(r.final_url_suffix) },
        ]),
    ),
    adGroups: Object.fromEntries(
      adGroups.filter((r) => s(r.ad_group_id)).map((r) => [s(r.ad_group_id)!, { campaign_id: s(r.campaign_id) ?? "", name: s(r.name) ?? s(r.ad_group_id)! }]),
    ),
    ads: Object.fromEntries(
      ads
        .filter((r) => s(r.ad_id))
        .map((r) => [
          s(r.ad_id)!,
          {
            customer_id: cid,
            ad_group_id: s(r.ad_group_id) ?? "",
            campaign_id: s(r.campaign_id) ?? "",
            final_urls: parseFinalUrls(r.final_urls),
            approval_status: s(r.approval_status),
            status: s(r.status),
          },
        ]),
    ),
  };
}

export async function queryCustomerStats(
  client: BigQuery,
  layout: GoogleTransferLayout,
  cid: string,
  range: { since: string; until: string },
  convRange: { since: string; until: string } | null,
): Promise<{ campaignStats: RawCampaignStat[]; landingStats: RawLandingStat[]; conversions: RawConversion[] }> {
  const sql = buildCustomerSql(layout, layout.customers[cid] ?? {});
  const [cs, lp, cv] = await Promise.all([
    sql.campaign_stats ? run(client, sql.campaign_stats, range) : Promise.resolve([]),
    sql.landing_stats ? run(client, sql.landing_stats, range) : Promise.resolve([]),
    sql.conversions && convRange ? run(client, sql.conversions, convRange) : Promise.resolve([]),
  ]);
  return {
    campaignStats: cs.map((r) => ({
      date: s(r.date) ?? "",
      campaign_id: s(r.campaign_id) ?? "",
      network: s(r.network),
      cost_micros: n(r.cost_micros),
      clicks: n(r.clicks),
      impressions: n(r.impressions),
    })),
    landingStats: lp.map((r) => ({
      date: s(r.date) ?? "",
      campaign_id: s(r.campaign_id) ?? "",
      ad_group_id: s(r.ad_group_id),
      url: s(r.url),
      cost_micros: n(r.cost_micros),
      clicks: n(r.clicks),
      impressions: n(r.impressions),
    })),
    conversions: cv.map((r) => ({
      date: s(r.date) ?? "",
      campaign_id: s(r.campaign_id) ?? "",
      category: s(r.category),
      action_name: s(r.action_name),
      action_id: s(r.action_id),
      conversions: n(r.conversions),
    })),
  };
}

export type TransferTestResult = {
  ok: boolean;
  error?: string;
  error_kind?: GoogleTransferError["kind"];
  /** Customer ids that have transfer tables in the dataset. */
  customers: Array<{
    id: string;
    name: string | null;
    currency: string | null;
    /** Oldest loaded day within the last ~400 days. */
    data_since: string | null;
    data_through: string | null;
    missing_tables: GoogleLogicalTable[];
  }>;
};

const REQUIRED_TABLES: GoogleLogicalTable[] = ["Campaign", "CampaignConversionStats", "LandingPageStats", "Customer"];

export function missingTablesFor(t: GoogleCustomerTables): GoogleLogicalTable[] {
  const missing = REQUIRED_TABLES.filter((x) => !t[x]);
  if (!campaignStatsTable(t)) missing.unshift("CampaignBasicStats");
  return missing;
}

/** Read-only: distinct days with campaign stats in [since, until] across all customers (days without ad activity have no rows). */
export async function countLoadedDays(project: string, dataset: string, since: string, until: string): Promise<number | null> {
  try {
    const client = googleBigQueryClient(project);
    const layout = await probeTransferLayout(client, project, dataset);
    const tables = Object.values(layout.customers)
      .map((t) => campaignStatsTable(t)?.name)
      .filter((x): x is string => !!x);
    if (tables.length === 0) return 0;
    const union = tables.map((name) => `SELECT DISTINCT segments_date AS d FROM ${fq(layout, name)} WHERE segments_date BETWEEN DATE(@since) AND DATE(@until)`).join(" UNION DISTINCT ");
    const rows = await run(client, `SELECT COUNT(DISTINCT d) AS n FROM (${union})`, { since, until });
    return n(rows[0]?.n);
  } catch {
    return null;
  }
}

/** Read-only: list customers in the dataset with their newest loaded day. */
export async function testGoogleTransfer(project: string, dataset: string): Promise<TransferTestResult> {
  try {
    const client = googleBigQueryClient(project);
    const layout = await probeTransferLayout(client, project, dataset);
    const ids = Object.keys(layout.customers).sort();
    const customers: TransferTestResult["customers"] = [];
    for (const id of ids) {
      const t = layout.customers[id]!;
      const sql = buildCustomerSql(layout, t);
      const [bounds, cu] = await Promise.all([
        sql.bounds ? run(client, sql.bounds).catch(() => []) : Promise.resolve([]),
        sql.customer ? run(client, sql.customer).catch(() => []) : Promise.resolve([]),
      ]);
      customers.push({
        id,
        name: s(cu[0]?.name),
        currency: s(cu[0]?.currency),
        data_since: s(bounds[0]?.min_date),
        data_through: s(bounds[0]?.max_date),
        missing_tables: missingTablesFor(t),
      });
    }
    return { ok: true, customers };
  } catch (err) {
    const e = err instanceof GoogleTransferError ? err : classifyBqError(err);
    return { ok: false, error: e.message, error_kind: e.kind, customers: [] };
  }
}
