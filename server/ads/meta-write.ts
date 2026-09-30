/**
 * Meta Marketing API writes for staff-confirmed live-ad fixes (Diagnostics → Ads).
 * Token: META_ADS_ACCESS_TOKEN (same System User token as syncs); writes need `ads_management`
 * on top of `ads_read`, otherwise Meta answers with a permission error.
 */

import { classifyError, getMetaAccessToken, META_GRAPH_VERSION, MetaApiError, parseCreative } from "./meta-client";

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const REQUEST_TIMEOUT_MS = 30_000;
/** Graph rejects the multi-id `?ids=` read on v26+, so ads are read one GET each. */
const READ_CONCURRENCY = 5;

async function graphRequest(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const token = getMetaAccessToken();
  if (!token) throw new MetaApiError("META_ADS_ACCESS_TOKEN is not set", 0, undefined, "auth");
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  let init: RequestInit;
  if (method === "GET") {
    body.forEach((v, k) => url.searchParams.set(k, v));
    init = { method };
  } else {
    init = { method, body, headers: { "Content-Type": "application/x-www-form-urlencoded" } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.error) {
      const err = (json.error ?? {}) as { message?: string; code?: number; error_user_msg?: string };
      const message = err.error_user_msg || err.message || `Meta API HTTP ${res.status}`;
      throw new MetaApiError(message, res.status, err.code, classifyError(res.status, err.code));
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export type MetaAdForFix = {
  ad_id: string;
  ad_name: string;
  account_id: string;
  campaign_id: string;
  effective_status: string | undefined;
  creative_id: string | null;
  url_tags: string | undefined;
  links: string[];
  instant_form: boolean;
  /** Page post the ad runs as; reusing it keeps likes/comments. */
  story_id: string | null;
  dynamic_creative: boolean;
  catalog: boolean;
};

const FIX_FIELDS =
  "id,name,account_id,campaign_id,adset_id,effective_status,creative{id,url_tags,link_url,effective_object_story_id,object_story_id,object_story_spec,asset_feed_spec,product_set_id,template_url_spec}";

export function parseAdForFix(raw: Record<string, unknown>): MetaAdForFix | null {
  const base = parseCreative(raw);
  if (!base) return null;
  const creative = (raw.creative ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    ad_id: base.ad_id,
    ad_name: String(raw.name ?? ""),
    account_id: String(raw.account_id ?? "").replace(/^act_/, ""),
    campaign_id: base.campaign_id,
    effective_status: base.effective_status,
    creative_id: str(creative.id),
    url_tags: base.url_tags,
    links: base.links,
    instant_form: base.instant_form,
    story_id: str(creative.effective_object_story_id) ?? str(creative.object_story_id),
    dynamic_creative: creative.asset_feed_spec != null,
    catalog: creative.product_set_id != null || creative.template_url_spec != null,
  };
}

/**
 * Current creative setup for each ad id. Deleted / unknown ads are omitted;
 * token, permission and rate-limit errors abort the whole read.
 */
export async function fetchAdsForFix(adIds: string[]): Promise<Map<string, MetaAdForFix>> {
  const out = new Map<string, MetaAdForFix>();
  const ids = Array.from(new Set(adIds));
  for (let i = 0; i < ids.length; i += READ_CONCURRENCY) {
    const chunk = ids.slice(i, i + READ_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          return parseAdForFix(await graphRequest("GET", id, { fields: FIX_FIELDS }));
        } catch (err) {
          if (err instanceof MetaApiError && err.kind === "other") return null;
          throw err;
        }
      }),
    );
    for (const parsed of results) if (parsed) out.set(parsed.ad_id, parsed);
  }
  return out;
}

/**
 * Point the ad at a new creative built from the same page post plus `urlTags`.
 * Creatives are immutable, so this is the only way to change URL parameters.
 */
export async function replaceAdUrlTags(opts: {
  accountId: string;
  adId: string;
  storyId: string;
  urlTags: string;
  name: string;
}): Promise<{ creative_id: string }> {
  const created = await graphRequest("POST", `act_${opts.accountId}/adcreatives`, {
    name: opts.name.slice(0, 100),
    object_story_id: opts.storyId,
    url_tags: opts.urlTags,
  });
  const creativeId = created.id != null ? String(created.id) : "";
  if (!creativeId) throw new MetaApiError("Meta did not return a creative id", 0);
  await graphRequest("POST", opts.adId, { creative: JSON.stringify({ creative_id: creativeId }) });
  return { creative_id: creativeId };
}
