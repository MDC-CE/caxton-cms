/**
 * Read-only Meta Marketing API client (Graph insights + creatives + account info).
 * Token: META_ADS_ACCESS_TOKEN (System User, `ads_read`). Never writes to Meta
 * (staff-confirmed live-ad edits live in ./meta-write.ts and reuse this token).
 */

import { child } from "../logger";
import { metaPlacementFromPublisher, type MetaPlacement } from "@shared/paid-traffic";

const log = child({ module: "ads/meta-client" });

export const META_GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 200;

export const META_INSIGHT_FIELDS = [
  "date_start",
  "account_id",
  "account_currency",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "inline_link_clicks",
  "actions",
] as const;

export type MetaAdDayRow = {
  date: string;
  account_id: string;
  currency: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  link_clicks: number;
  landing_page_views: number;
  /** Website leads reported by the pixel (`offsite_conversion.fb_pixel_lead`). */
  pixel_leads: number;
  /** Instant Form leads (`lead` / `onsite_conversion.lead_grouped`). */
  instant_form_leads: number;
  /** `fb_pixel_lead` in the 7-day click window. Absent on days cached before the attribution split. */
  pixel_leads_click?: number;
  /** `fb_pixel_lead` in the 1-day view window (raw Meta; UI derives saw-the-ad-only from total − click). */
  pixel_leads_view?: number;
  /** `fb_pixel_lead` + custom conversion ids → count. Absent on days cached before per-conversion counts. */
  conversions?: Record<string, number>;
};

/** One ad's day on one placement (`breakdowns=publisher_platform`); kept apart from `MetaAdDayRow`. */
export type MetaAdPlatformDayRow = {
  date: string;
  account_id: string;
  currency: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  platform: MetaPlacement;
  spend: number;
  impressions: number;
  link_clicks: number;
  pixel_leads: number;
  conversions?: Record<string, number>;
};

export type MetaCustomConversion = {
  id: string;
  name: string;
  pixel_id: string | null;
  pixel_name: string | null;
  custom_event_type: string | null;
  last_fired_time: string | null;
  archived: boolean;
};

export type MetaPixel = {
  id: string;
  name: string;
  last_fired_time: string | null;
};

/** One pixel event's hits: total over the window + per-hour counts (hour ISO → count). */
export type MetaPixelEventStats = {
  event: string;
  total: number;
  hourly: Record<string, number>;
};

export type MetaAccountInfo = {
  id: string;
  name: string;
  currency: string;
  account_status: number;
  timezone_name?: string;
};

export type MetaAdCreativeInfo = {
  ad_id: string;
  campaign_id: string;
  adset_id: string;
  /** Ad account the setup was read from (set by the sync). */
  account_id?: string;
  effective_status?: string;
  /** Destination URLs found on the creative (link_data.link, asset_feed_spec.link_urls, …). */
  links: string[];
  url_tags?: string;
  /** True when the creative sends people to an Instant Form instead of a website. */
  instant_form: boolean;
  /** Conversion the ad set optimizes for, as a lead key (`fb_pixel_lead` or a custom conversion id). */
  optimization_event?: string;
  /** Meta creative id (a new id = the ad's creative was replaced). */
  creative_id?: string;
  /** Status staff set on the ad (ACTIVE / PAUSED / ARCHIVED…), unlike `effective_status`. */
  status?: string;
};

/** Delivery settings of a Meta campaign (budgets in the account's minor units, as Meta returns them). */
export type MetaCampaignInfo = {
  id: string;
  account_id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  bid_strategy: string | null;
  spend_cap: string | null;
};

/** Delivery settings of a Meta ad set. `targeting` is the raw spec (normalized before hashing). */
export type MetaAdsetInfo = {
  id: string;
  account_id: string;
  campaign_id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  bid_strategy: string | null;
  bid_amount: string | null;
  optimization_goal: string | null;
  optimization_event?: string;
  targeting: Record<string, unknown> | null;
  start_time: string | null;
  end_time: string | null;
};

/** Ad set `promoted_object` → lead key (custom conversion id, or `fb_pixel_lead` for the standard Lead event). */
export function optimizationEventOf(adset: unknown): string | undefined {
  const po = (adset as { promoted_object?: Record<string, unknown> } | null | undefined)?.promoted_object;
  if (!po) return undefined;
  const cc = po.custom_conversion_id != null ? String(po.custom_conversion_id) : "";
  if (/^\d{6,25}$/.test(cc)) return cc;
  if (po.custom_event_type === "LEAD") return "fb_pixel_lead";
  return undefined;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly kind: "auth" | "permission" | "rate_limit" | "other" = "other",
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export function getMetaAccessToken(): string | null {
  const raw = (process.env.META_ADS_ACCESS_TOKEN || "").trim();
  return raw || null;
}

export function isMetaTokenConfigured(): boolean {
  return !!getMetaAccessToken();
}

export function classifyError(status: number, code?: number): MetaApiError["kind"] {
  if (code === 190 || status === 401) return "auth";
  if (code === 10 || code === 200 || code === 270 || status === 403) return "permission";
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80004 || status === 429) return "rate_limit";
  return "other";
}

async function graphGet(
  pathOrUrl: string,
  params: Record<string, string> = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const token = getMetaAccessToken();
  if (!token) throw new MetaApiError("META_ADS_ACCESS_TOKEN is not set", 0, undefined, "auth");
  const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(`${GRAPH_BASE}/${pathOrUrl.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.error) {
      const err = (body.error ?? {}) as { message?: string; code?: number };
      const message = err.message || `Meta API HTTP ${res.status}`;
      throw new MetaApiError(message, res.status, err.code, classifyError(res.status, err.code));
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function graphGetAll(path: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let page = await graphGet(path, params);
  for (let i = 0; i < MAX_PAGES; i++) {
    const data = Array.isArray(page.data) ? (page.data as Record<string, unknown>[]) : [];
    out.push(...data);
    const next = (page.paging as { next?: string } | undefined)?.next;
    if (!next) break;
    page = await graphGet(next);
  }
  return out;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const CUSTOM_CONVERSION_PREFIX = "offsite_conversion.custom.";

/**
 * Lead-candidate conversions per row: `fb_pixel_lead` (standard Lead) and each custom conversion by id.
 * Other action types (custom events lumped as `fb_pixel_custom`, page views, …) are not kept.
 */
export function conversionCounts(actions: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(actions)) return out;
  for (const a of actions as Array<{ action_type?: string; value?: unknown }>) {
    const t = a?.action_type;
    if (typeof t !== "string") continue;
    let key: string | null = null;
    if (t === "offsite_conversion.fb_pixel_lead") key = "fb_pixel_lead";
    else if (t.startsWith(CUSTOM_CONVERSION_PREFIX)) {
      const id = t.slice(CUSTOM_CONVERSION_PREFIX.length);
      if (/^\d{6,25}$/.test(id)) key = id;
    }
    if (!key) continue;
    const v = Math.round(toNum(a.value));
    if (v > 0) out[key] = (out[key] ?? 0) + v;
  }
  return out;
}

function actionValue(actions: unknown, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions as Array<{ action_type?: string; value?: unknown }>) {
    if (a && typeof a.action_type === "string" && types.includes(a.action_type)) total += toNum(a.value);
  }
  return total;
}

export type MetaActionWindow = "7d_click" | "1d_view";

/**
 * Sum of an action type's per-window count (Meta returns these when
 * `action_attribution_windows` is set). Falls back to 0 when the window field is absent.
 */
export function actionWindowValue(actions: unknown, types: string[], window: MetaActionWindow): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions as Array<Record<string, unknown>>) {
    if (!a || typeof a.action_type !== "string" || !types.includes(a.action_type)) continue;
    total += toNum(a[window]);
  }
  return total;
}

/** Parse one Graph insights row (level=ad, time_increment=1). */
export function parseInsightRow(raw: Record<string, unknown>, fallbackCurrency = ""): MetaAdDayRow | null {
  const date = typeof raw.date_start === "string" ? raw.date_start : "";
  const adId = raw.ad_id != null ? String(raw.ad_id) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !adId) return null;
  return {
    date,
    account_id: String(raw.account_id ?? "").replace(/^act_/, ""),
    currency: String(raw.account_currency || fallbackCurrency || "").toUpperCase(),
    campaign_id: String(raw.campaign_id ?? ""),
    campaign_name: String(raw.campaign_name ?? ""),
    adset_id: String(raw.adset_id ?? ""),
    adset_name: String(raw.adset_name ?? ""),
    ad_id: adId,
    ad_name: String(raw.ad_name ?? ""),
    spend: toNum(raw.spend),
    impressions: Math.round(toNum(raw.impressions)),
    reach: Math.round(toNum(raw.reach)),
    frequency: toNum(raw.frequency),
    link_clicks: Math.round(toNum(raw.inline_link_clicks)),
    landing_page_views: Math.round(actionValue(raw.actions, ["landing_page_view", "omni_landing_page_view"])),
    pixel_leads: Math.round(actionValue(raw.actions, ["offsite_conversion.fb_pixel_lead"])),
    instant_form_leads: Math.round(actionValue(raw.actions, ["lead", "onsite_conversion.lead_grouped"])),
    pixel_leads_click: Math.round(actionWindowValue(raw.actions, ["offsite_conversion.fb_pixel_lead"], "7d_click")),
    pixel_leads_view: Math.round(actionWindowValue(raw.actions, ["offsite_conversion.fb_pixel_lead"], "1d_view")),
    conversions: conversionCounts(raw.actions),
  };
}

/** Parse one ad-level insights row broken down by `publisher_platform`. */
export function parseAdPlatformRow(raw: Record<string, unknown>, fallbackCurrency = ""): MetaAdPlatformDayRow | null {
  const date = typeof raw.date_start === "string" ? raw.date_start : "";
  const adId = raw.ad_id != null ? String(raw.ad_id) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !adId) return null;
  return {
    date,
    account_id: String(raw.account_id ?? "").replace(/^act_/, ""),
    currency: String(raw.account_currency || fallbackCurrency || "").toUpperCase(),
    campaign_id: String(raw.campaign_id ?? ""),
    adset_id: String(raw.adset_id ?? ""),
    ad_id: adId,
    platform: metaPlacementFromPublisher(typeof raw.publisher_platform === "string" ? raw.publisher_platform : ""),
    spend: toNum(raw.spend),
    impressions: Math.round(toNum(raw.impressions)),
    link_clicks: Math.round(toNum(raw.inline_link_clicks)),
    pixel_leads: Math.round(actionValue(raw.actions, ["offsite_conversion.fb_pixel_lead"])),
    conversions: conversionCounts(raw.actions),
  };
}

/** Collect destination URLs + url_tags + Instant Form flag from a creative object. */
export function parseCreative(ad: Record<string, unknown>): MetaAdCreativeInfo | null {
  const adId = ad.id != null ? String(ad.id) : "";
  if (!adId) return null;
  const creative = (ad.creative ?? {}) as Record<string, unknown>;
  const links = new Set<string>();
  let instantForm = false;

  const addLink = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) links.add(v.trim());
  };
  const inspectCta = (cta: unknown) => {
    const value = (cta as { value?: Record<string, unknown> } | undefined)?.value;
    if (!value) return;
    if (value.lead_gen_form_id) instantForm = true;
    addLink(value.link);
  };

  addLink(creative.link_url);
  const story = (creative.object_story_spec ?? {}) as Record<string, unknown>;
  const linkData = (story.link_data ?? {}) as Record<string, unknown>;
  addLink(linkData.link);
  inspectCta(linkData.call_to_action);
  if (Array.isArray(linkData.child_attachments)) {
    for (const c of linkData.child_attachments as Record<string, unknown>[]) {
      addLink(c.link);
      inspectCta(c.call_to_action);
    }
  }
  const videoData = (story.video_data ?? {}) as Record<string, unknown>;
  inspectCta(videoData.call_to_action);
  const feed = (creative.asset_feed_spec ?? {}) as Record<string, unknown>;
  if (Array.isArray(feed.link_urls)) {
    for (const l of feed.link_urls as Record<string, unknown>[]) addLink(l.website_url);
  }

  return {
    ad_id: adId,
    campaign_id: String(ad.campaign_id ?? ""),
    adset_id: String(ad.adset_id ?? ""),
    effective_status: typeof ad.effective_status === "string" ? ad.effective_status : undefined,
    links: Array.from(links),
    url_tags: typeof creative.url_tags === "string" && creative.url_tags.trim() ? creative.url_tags.trim() : undefined,
    instant_form: instantForm,
    ...(optimizationEventOf(ad.adset) ? { optimization_event: optimizationEventOf(ad.adset) } : {}),
    ...(creative.id != null && String(creative.id) ? { creative_id: String(creative.id) } : {}),
    ...(typeof ad.status === "string" && ad.status ? { status: ad.status } : {}),
  };
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function parseCampaign(raw: Record<string, unknown>, accountId: string): MetaCampaignInfo | null {
  const id = strOrNull(raw.id);
  if (!id) return null;
  return {
    id,
    account_id: accountId,
    name: String(raw.name ?? ""),
    status: strOrNull(raw.status),
    effective_status: strOrNull(raw.effective_status),
    objective: strOrNull(raw.objective),
    daily_budget: strOrNull(raw.daily_budget),
    lifetime_budget: strOrNull(raw.lifetime_budget),
    bid_strategy: strOrNull(raw.bid_strategy),
    spend_cap: strOrNull(raw.spend_cap),
  };
}

export function parseAdset(raw: Record<string, unknown>, accountId: string): MetaAdsetInfo | null {
  const id = strOrNull(raw.id);
  if (!id) return null;
  const event = optimizationEventOf(raw);
  return {
    id,
    account_id: accountId,
    campaign_id: String(raw.campaign_id ?? ""),
    name: String(raw.name ?? ""),
    status: strOrNull(raw.status),
    effective_status: strOrNull(raw.effective_status),
    daily_budget: strOrNull(raw.daily_budget),
    lifetime_budget: strOrNull(raw.lifetime_budget),
    bid_strategy: strOrNull(raw.bid_strategy),
    bid_amount: strOrNull(raw.bid_amount),
    optimization_goal: strOrNull(raw.optimization_goal),
    ...(event ? { optimization_event: event } : {}),
    targeting: raw.targeting && typeof raw.targeting === "object" ? (raw.targeting as Record<string, unknown>) : null,
    start_time: strOrNull(raw.start_time),
    end_time: strOrNull(raw.end_time),
  };
}

export const META_CAMPAIGN_FIELDS = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,spend_cap";
export const META_ADSET_FIELDS =
  "id,campaign_id,name,status,effective_status,daily_budget,lifetime_budget,bid_strategy,bid_amount,optimization_goal,promoted_object,targeting,start_time,end_time";

async function graphGetAllShrinking(path: string, fields: string, limits: [string, string]): Promise<Record<string, unknown>[]> {
  try {
    return await graphGetAll(path, { fields, limit: limits[0] });
  } catch (err) {
    if (!isReduceDataError(err)) throw err;
    return graphGetAll(path, { fields, limit: limits[1] });
  }
}

/** Every campaign in the account with its delivery settings (history only — never used for spend). */
export async function fetchCampaigns(accountId: string): Promise<MetaCampaignInfo[]> {
  const raw = await graphGetAllShrinking(`act_${accountId}/campaigns`, META_CAMPAIGN_FIELDS, ["200", "50"]);
  return raw.map((r) => parseCampaign(r, accountId)).filter((c): c is MetaCampaignInfo => !!c);
}

/** Every ad set in the account with budgets, bidding, targeting and schedule (history only). */
export async function fetchAdsets(accountId: string): Promise<MetaAdsetInfo[]> {
  const raw = await graphGetAllShrinking(`act_${accountId}/adsets`, META_ADSET_FIELDS, ["100", "25"]);
  return raw.map((r) => parseAdset(r, accountId)).filter((c): c is MetaAdsetInfo => !!c);
}

export async function fetchAccountInfo(accountId: string): Promise<MetaAccountInfo> {
  const body = await graphGet(`act_${accountId}`, { fields: "name,currency,account_status,timezone_name" });
  return {
    id: accountId,
    name: String(body.name ?? ""),
    currency: String(body.currency ?? "").toUpperCase(),
    account_status: toNum(body.account_status),
    timezone_name: typeof body.timezone_name === "string" ? body.timezone_name : undefined,
  };
}

/** Daily ad-level insights for an inclusive date range (YYYY-MM-DD). */
export async function fetchAdInsights(
  accountId: string,
  since: string,
  until: string,
  currency = "",
): Promise<MetaAdDayRow[]> {
  const raw = await graphGetAll(`act_${accountId}/insights`, {
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: META_INSIGHT_FIELDS.join(","),
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    limit: "500",
  });
  const rows: MetaAdDayRow[] = [];
  for (const r of raw) {
    const parsed = parseInsightRow(r, currency);
    if (parsed) rows.push({ ...parsed, account_id: parsed.account_id || accountId });
  }
  return rows;
}

/** Daily ad-level spend per placement (Facebook, Instagram, …) for an inclusive date range. */
export async function fetchAdPlatformInsights(
  accountId: string,
  since: string,
  until: string,
  currency = "",
): Promise<MetaAdPlatformDayRow[]> {
  const raw = await graphGetAll(`act_${accountId}/insights`, {
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    breakdowns: "publisher_platform",
    fields: "date_start,account_id,account_currency,campaign_id,adset_id,ad_id,spend,impressions,inline_link_clicks,actions",
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    limit: "500",
  });
  const rows: MetaAdPlatformDayRow[] = [];
  for (const r of raw) {
    const parsed = parseAdPlatformRow(r, currency);
    if (parsed) rows.push({ ...parsed, account_id: parsed.account_id || accountId });
  }
  return rows;
}

/** Fields `parseCreative` actually reads — keep nested specs narrow so large accounts fit one Graph page. */
export const META_AD_CREATIVE_FIELDS =
  "id,campaign_id,adset_id,status,effective_status,adset{promoted_object},creative{id,link_url,url_tags,object_story_spec{link_data{link,call_to_action,child_attachments{link,call_to_action}},video_data{call_to_action}},asset_feed_spec{link_urls}}";

function isReduceDataError(err: unknown): boolean {
  return err instanceof MetaApiError && /reduce the amount of data/i.test(err.message);
}

export async function fetchAdCreatives(accountId: string): Promise<MetaAdCreativeInfo[]> {
  const run = (limit: string) => graphGetAll(`act_${accountId}/ads`, { fields: META_AD_CREATIVE_FIELDS, limit });
  let raw: Record<string, unknown>[];
  try {
    raw = await run("50");
  } catch (err) {
    if (!isReduceDataError(err)) throw err;
    raw = await run("25");
  }
  return raw.map(parseCreative).filter((c): c is MetaAdCreativeInfo => !!c);
}

const META_IDS_BATCH = 50;

/**
 * Setups for specific ads (instant Re-check). Ads Meta no longer returns, or returns as
 * DELETED / ARCHIVED, are listed in `missing`. Throws on network / auth failure.
 */
export async function fetchAdCreativesByIds(
  adIds: string[],
  timeoutMs: number,
): Promise<{ found: MetaAdCreativeInfo[]; missing: string[] }> {
  const found: MetaAdCreativeInfo[] = [];
  const missing: string[] = [];
  for (let i = 0; i < adIds.length; i += META_IDS_BATCH) {
    const batch = adIds.slice(i, i + META_IDS_BATCH);
    const body = await graphGet("", { ids: batch.join(","), fields: `${META_AD_CREATIVE_FIELDS},account_id` }, timeoutMs);
    for (const id of batch) {
      const raw = body[id] as Record<string, unknown> | undefined;
      const status = typeof raw?.effective_status === "string" ? raw.effective_status : "";
      const parsed = raw ? parseCreative(raw) : null;
      if (!parsed || status === "DELETED" || status === "ARCHIVED") {
        missing.push(id);
        continue;
      }
      const accountId = raw?.account_id != null ? String(raw.account_id).replace(/^act_/, "") : undefined;
      found.push(accountId ? { ...parsed, account_id: accountId } : parsed);
    }
  }
  return { found, missing };
}

export function parseCustomConversion(raw: Record<string, unknown>): MetaCustomConversion | null {
  const id = raw.id != null ? String(raw.id) : "";
  if (!/^\d{6,25}$/.test(id)) return null;
  const pixel = (raw.pixel ?? null) as { id?: unknown; name?: unknown } | null;
  return {
    id,
    name: String(raw.name ?? "").trim() || id,
    pixel_id: pixel?.id != null ? String(pixel.id) : null,
    pixel_name: typeof pixel?.name === "string" ? pixel.name : null,
    custom_event_type: typeof raw.custom_event_type === "string" ? raw.custom_event_type : null,
    last_fired_time: typeof raw.last_fired_time === "string" ? raw.last_fired_time : null,
    archived: raw.is_archived === true,
  };
}

/** Custom conversions shared with an ad account (archived ones included, flagged). */
export async function fetchCustomConversions(accountId: string): Promise<MetaCustomConversion[]> {
  const raw = await graphGetAll(`act_${accountId}/customconversions`, {
    fields: "id,name,custom_event_type,last_fired_time,is_archived,pixel{id,name}",
    limit: "200",
  });
  return raw.map(parseCustomConversion).filter((c): c is MetaCustomConversion => !!c);
}

export async function fetchAccountPixels(accountId: string): Promise<MetaPixel[]> {
  const raw = await graphGetAll(`act_${accountId}/adspixels`, { fields: "id,name,last_fired_time", limit: "100" });
  const out: MetaPixel[] = [];
  for (const r of raw) {
    const id = r.id != null ? String(r.id) : "";
    if (!/^\d{5,25}$/.test(id)) continue;
    out.push({ id, name: String(r.name ?? ""), last_fired_time: typeof r.last_fired_time === "string" ? r.last_fired_time : null });
  }
  return out;
}

/** Parse `/{pixel}/stats?aggregation=event` buckets (one per hour) into per-event totals + hourly counts. */
export function parsePixelEventStats(data: unknown): MetaPixelEventStats[] {
  const byEvent = new Map<string, MetaPixelEventStats>();
  if (!Array.isArray(data)) return [];
  for (const bucket of data as Array<{ timestamp?: unknown; data?: unknown }>) {
    const hour = typeof bucket?.timestamp === "string" ? bucket.timestamp : "";
    if (!hour || !Array.isArray(bucket.data)) continue;
    for (const d of bucket.data as Array<{ value?: unknown; count?: unknown }>) {
      const event = typeof d?.value === "string" ? d.value : "";
      const count = Math.round(toNum(d?.count));
      if (!event || count <= 0) continue;
      const s = byEvent.get(event) ?? { event, total: 0, hourly: {} };
      s.total += count;
      s.hourly[hour] = (s.hourly[hour] ?? 0) + count;
      byEvent.set(event, s);
    }
  }
  return Array.from(byEvent.values()).sort((a, b) => b.total - a.total || a.event.localeCompare(b.event));
}

/** Pixel event hits since `sinceSec` (unix seconds), per event with hourly buckets. */
export async function fetchPixelEventStats(pixelId: string, sinceSec: number): Promise<MetaPixelEventStats[]> {
  const raw = await graphGetAll(`${pixelId}/stats`, { aggregation: "event", start_time: String(Math.floor(sinceSec)) });
  return parsePixelEventStats(raw);
}

export type MetaAdAccountSummary = {
  id: string;
  name: string;
  currency: string;
  /** 1 = active; anything else is disabled, closed, unsettled, etc. */
  account_status: number;
};

const ACCOUNT_LIST_TTL_MS = 5 * 60 * 1000;
let accountListCache: { token: string; at: number; accounts: MetaAdAccountSummary[] } | null = null;

export function parseAdAccount(raw: Record<string, unknown>): MetaAdAccountSummary | null {
  const id = String(raw.account_id ?? raw.id ?? "").replace(/^act_/i, "").trim();
  if (!/^\d+$/.test(id)) return null;
  return {
    id,
    name: String(raw.name ?? ""),
    currency: String(raw.currency ?? "").toUpperCase(),
    account_status: toNum(raw.account_status),
  };
}

/** Every ad account the token can read (`me/adaccounts`), sorted by name. Cached briefly per token. */
export async function listMetaAdAccounts(opts: { now?: number } = {}): Promise<MetaAdAccountSummary[]> {
  const token = getMetaAccessToken();
  if (!token) throw new MetaApiError("META_ADS_ACCESS_TOKEN is not set", 0, undefined, "auth");
  const now = opts.now ?? Date.now();
  if (accountListCache && accountListCache.token === token && now - accountListCache.at < ACCOUNT_LIST_TTL_MS) {
    return accountListCache.accounts;
  }
  const raw = await graphGetAll("me/adaccounts", { fields: "account_id,name,currency,account_status", limit: "200" });
  const seen = new Set<string>();
  const accounts: MetaAdAccountSummary[] = [];
  for (const r of raw) {
    const a = parseAdAccount(r);
    if (a && !seen.has(a.id)) {
      seen.add(a.id);
      accounts.push(a);
    }
  }
  accounts.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  accountListCache = { token, at: now, accounts };
  return accounts;
}

export function resetMetaAdAccountCache(): void {
  accountListCache = null;
}

export type MetaConnectionTest = {
  ok: boolean;
  token_configured: boolean;
  accounts: Array<{ id: string; ok: boolean; name?: string; currency?: string; error?: string }>;
  error?: string;
  error_kind?: MetaApiError["kind"];
  api_version: string;
};

/** Cheap probe: token owner + each configured account's name/currency. */
export async function testMetaConnection(accountIds: string[]): Promise<MetaConnectionTest> {
  const base = { token_configured: isMetaTokenConfigured(), api_version: META_GRAPH_VERSION };
  if (!base.token_configured) {
    return { ...base, ok: false, accounts: [], error: "META_ADS_ACCESS_TOKEN is not set on the server", error_kind: "auth" };
  }
  try {
    await graphGet("me", { fields: "id,name" });
  } catch (err) {
    const e = err as MetaApiError;
    return { ...base, ok: false, accounts: [], error: e.message, error_kind: e.kind ?? "other" };
  }
  const accounts: MetaConnectionTest["accounts"] = [];
  for (const id of accountIds) {
    try {
      const info = await fetchAccountInfo(id);
      accounts.push({ id, ok: true, name: info.name, currency: info.currency });
    } catch (err) {
      log.warn({ err, accountId: id }, "[meta] account probe failed");
      accounts.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ...base, ok: accounts.every((a) => a.ok), accounts };
}
