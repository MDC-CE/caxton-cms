/**
 * Read-only Meta Marketing API client (Graph insights + creatives + account info).
 * Token: META_ADS_ACCESS_TOKEN (System User, `ads_read`). Never writes to Meta.
 */

import { child } from "../logger";

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
  effective_status?: string;
  /** Destination URLs found on the creative (link_data.link, asset_feed_spec.link_urls, …). */
  links: string[];
  url_tags?: string;
  /** True when the creative sends people to an Instant Form instead of a website. */
  instant_form: boolean;
};

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

function classifyError(status: number, code?: number): MetaApiError["kind"] {
  if (code === 190 || status === 401) return "auth";
  if (code === 10 || code === 200 || code === 270 || status === 403) return "permission";
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80004 || status === 429) return "rate_limit";
  return "other";
}

async function graphGet(pathOrUrl: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const token = getMetaAccessToken();
  if (!token) throw new MetaApiError("META_ADS_ACCESS_TOKEN is not set", 0, undefined, "auth");
  const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(`${GRAPH_BASE}/${pathOrUrl.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

function actionValue(actions: unknown, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions as Array<{ action_type?: string; value?: unknown }>) {
    if (a && typeof a.action_type === "string" && types.includes(a.action_type)) total += toNum(a.value);
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
  };
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

export async function fetchAdCreatives(accountId: string): Promise<MetaAdCreativeInfo[]> {
  const raw = await graphGetAll(`act_${accountId}/ads`, {
    fields:
      "id,campaign_id,adset_id,effective_status,creative{link_url,url_tags,object_story_spec,asset_feed_spec{link_urls}}",
    limit: "200",
  });
  return raw.map(parseCreative).filter((c): c is MetaAdCreativeInfo => !!c);
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
