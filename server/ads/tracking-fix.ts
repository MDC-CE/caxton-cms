/**
 * Plan and apply the staff "Fix via Meta" for `missing_tracking_params` issues:
 * add only the template parameters an ad lacks, reusing its page post.
 */

import { META_UTM_TEMPLATE } from "@shared/ads-settings";
import { parseTrackingParams, type AdsIssue } from "@shared/ads-diagnostics-rules";
import {
  TRACKING_FIX_MAX_ADS,
  type TrackingFixAdPlan,
  type TrackingFixAdResult,
  type TrackingFixApplyResponse,
  type TrackingFixPreview,
} from "@shared/ads-tracking-fix";
import { child } from "../logger";
import { MetaApiError } from "./meta-client";
import type { MetaAdForFix } from "./meta-write";

const log = child({ module: "ads/tracking-fix" });

export type TrackingFixDeps = {
  writeConfigured: () => boolean;
  fetchAds: (adIds: string[]) => Promise<Map<string, MetaAdForFix>>;
  replace: (opts: { accountId: string; adId: string; storyId: string; urlTags: string; name: string }) => Promise<{ creative_id: string }>;
  /** Re-read ad setups so the issue clears; resolves true when a refresh was queued. */
  requestRefresh: () => Promise<boolean>;
  now?: () => Date;
};

/** `key=value` pairs from the template, values kept raw (`{{ad.id}}` must not be encoded). */
export function templatePairs(template = META_UTM_TEMPLATE): Array<[string, string]> {
  return template
    .split("&")
    .map((part) => {
      const i = part.indexOf("=");
      return i > 0 ? ([part.slice(0, i).trim().toLowerCase(), part.slice(i + 1)] as [string, string]) : null;
    })
    .filter((p): p is [string, string] => !!p && !!p[0]);
}

/**
 * Append the template params the ad lacks (in its link or URL parameters). Existing
 * params are kept as-is; empty ones being filled are dropped so keys don't repeat.
 */
export function mergeMissingTags(
  urlTags: string | null | undefined,
  link: string | undefined,
  template = META_UTM_TEMPLATE,
): { tags: string; added: string[] } {
  const present = { ...parseTrackingParams(link), ...parseTrackingParams(urlTags) };
  const missing = templatePairs(template).filter(([k]) => !present[k]);
  const added = missing.map(([k]) => k);
  const addedSet = new Set(added);
  const kept = (urlTags ?? "")
    .split("&")
    .map((p) => p.trim())
    .filter((p) => p && !addedSet.has(p.split("=")[0].trim().toLowerCase()));
  return { tags: [...kept, ...missing.map(([k, v]) => `${k}=${v}`)].join("&"), added };
}

type IssueAdRef = { ad_id: string; ad_name: string; account_id: string };

export function planAdFix(
  ref: IssueAdRef,
  live: MetaAdForFix | undefined,
  scope: { campaign_id?: string | null; account_id?: string | null },
): TrackingFixAdPlan {
  const before = live?.url_tags ?? null;
  const base = { ad_id: ref.ad_id, ad_name: live?.ad_name || ref.ad_name, account_id: live?.account_id || ref.account_id, before };
  const skip = (reason: TrackingFixAdPlan["reason"]): TrackingFixAdPlan => ({ ...base, status: "skipped", reason, after: null, added: [] });

  if (!live) return skip("not_found");
  const status = (live.effective_status ?? "").toUpperCase();
  if (status === "DELETED" || status === "ARCHIVED") return skip("archived");
  if ((scope.campaign_id && live.campaign_id && live.campaign_id !== scope.campaign_id) || (scope.account_id && live.account_id && live.account_id !== scope.account_id)) {
    return skip("outside_issue");
  }
  if (live.instant_form) return skip("instant_form");
  const { tags, added } = mergeMissingTags(live.url_tags, live.links[0]);
  if (added.length === 0) return skip("already_tagged");
  if (live.dynamic_creative) return skip("dynamic_creative");
  if (live.catalog) return skip("catalog");
  if (!live.story_id) return skip("no_post");
  return { ...base, status: "fixable", after: tags, added };
}

function issueRefs(issue: AdsIssue): IssueAdRef[] {
  const seen = new Set<string>();
  const out: IssueAdRef[] = [];
  for (const a of issue.details?.ads ?? []) {
    if (seen.has(a.ad_id)) continue;
    seen.add(a.ad_id);
    out.push({ ad_id: a.ad_id, ad_name: a.ad_name, account_id: a.account_id });
  }
  return out;
}

export async function previewTrackingFix(issue: AdsIssue, deps: TrackingFixDeps): Promise<TrackingFixPreview> {
  const header = {
    issue_id: issue.id,
    campaign_id: issue.scope.campaign_id ?? null,
    campaign_name: issue.scope.campaign_name ?? null,
    account_id: issue.scope.account_id ?? null,
    max_ads: TRACKING_FIX_MAX_ADS,
  };
  if (!deps.writeConfigured()) return { write_configured: false, ...header, ads: [] };
  const refs = issueRefs(issue);
  const live = await deps.fetchAds(refs.map((r) => r.ad_id));
  const ads = refs.map((r) => planAdFix(r, live.get(r.ad_id), issue.scope));
  ads.sort((a, b) => (a.status === b.status ? 0 : a.status === "fixable" ? -1 : 1));
  return { write_configured: true, ...header, ads };
}

const STOP_KINDS = new Set<MetaApiError["kind"]>(["auth", "permission", "rate_limit"]);

/**
 * Re-plan from a fresh Meta read (client before/after is never trusted) and change
 * only fixable ads among `adIds`. Stops on token/permission/rate-limit errors.
 */
export async function applyTrackingFix(
  input: { issue: AdsIssue; adIds: string[]; actor: string | null; site: string },
  deps: TrackingFixDeps,
): Promise<TrackingFixApplyResponse> {
  const out: TrackingFixApplyResponse = { fixed: [], skipped: [], failed: [], refresh_requested: false };
  const refsById = new Map(issueRefs(input.issue).map((r) => [r.ad_id, r]));
  const wanted = Array.from(new Set(input.adIds)).slice(0, TRACKING_FIX_MAX_ADS);
  const result = (p: TrackingFixAdPlan, extra: Partial<TrackingFixAdResult> = {}): TrackingFixAdResult => ({
    ad_id: p.ad_id,
    ad_name: p.ad_name,
    account_id: p.account_id,
    before: p.before,
    after: p.after,
    ...(p.reason ? { reason: p.reason } : {}),
    ...extra,
  });

  const inIssue = wanted.filter((id) => refsById.has(id));
  for (const id of wanted) {
    if (!refsById.has(id)) out.skipped.push({ ad_id: id, ad_name: "", account_id: "", before: null, after: null, reason: "outside_issue" });
  }
  const live = inIssue.length > 0 ? await deps.fetchAds(inIssue) : new Map<string, MetaAdForFix>();
  const stamp = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);

  for (let i = 0; i < inIssue.length; i++) {
    const plan = planAdFix(refsById.get(inIssue[i])!, live.get(inIssue[i]), input.issue.scope);
    if (out.stopped) {
      out.skipped.push(result({ ...plan, after: null }, { reason: "not_attempted" }));
      continue;
    }
    if (plan.status !== "fixable" || !plan.after) {
      out.skipped.push(result(plan));
      continue;
    }
    const storyId = live.get(plan.ad_id)!.story_id!;
    try {
      const { creative_id } = await deps.replace({
        accountId: plan.account_id,
        adId: plan.ad_id,
        storyId,
        urlTags: plan.after,
        name: `${plan.ad_name || plan.ad_id} · tracking params ${stamp}`,
      });
      out.fixed.push(result(plan));
      log.info(
        {
          actor: input.actor,
          site: input.site,
          account_id: plan.account_id,
          campaign_id: input.issue.scope.campaign_id,
          ad_id: plan.ad_id,
          creative_id,
          before: plan.before,
          after: plan.after,
        },
        "[ads] tracking params fixed via Meta",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.failed.push(result(plan, { error: message }));
      log.warn({ err, actor: input.actor, site: input.site, ad_id: plan.ad_id }, "[ads] tracking params fix failed");
      if (err instanceof MetaApiError && STOP_KINDS.has(err.kind)) out.stopped = { error: message, kind: err.kind };
    }
  }

  if (out.fixed.length > 0) {
    try {
      out.refresh_requested = await deps.requestRefresh();
    } catch (err) {
      log.warn({ err }, "[ads] refresh after tracking fix failed");
    }
  }
  return out;
}
