/** Staff "Fix via Meta" for missing tracking parameters (Diagnostics → Ads). */

/** Most ads changed in one confirm; larger campaigns take several passes. */
export const TRACKING_FIX_MAX_ADS = 50;

export type TrackingFixSkipReason =
  | "not_found"
  | "archived"
  | "outside_issue"
  | "instant_form"
  | "already_tagged"
  | "dynamic_creative"
  | "catalog"
  | "no_post"
  | "not_attempted";

export const TRACKING_FIX_SKIP_LABELS: Record<TrackingFixSkipReason, string> = {
  not_found: "Meta didn't return this ad (deleted, or the token can't see it)",
  archived: "Ad is deleted or archived",
  outside_issue: "Ad is no longer in this campaign",
  instant_form: "Sends people to an Instant Form, not the website",
  already_tagged: "Already has every tracking parameter",
  dynamic_creative: "Dynamic or Advantage+ creative — edit it in Meta Ads Manager",
  catalog: "Catalog ad — edit it in Meta Ads Manager",
  no_post: "No page post to reuse, so likes and comments would be lost — edit it in Meta Ads Manager",
  not_attempted: "Not attempted: stopped after a connection or permission error",
};

export type TrackingFixAdPlan = {
  ad_id: string;
  ad_name: string;
  account_id: string;
  status: "fixable" | "skipped";
  reason?: TrackingFixSkipReason;
  /** URL parameters on the ad today (null when none). */
  before: string | null;
  /** URL parameters after the fix (fixable only). */
  after: string | null;
  /** Parameter names the fix adds. */
  added: string[];
};

export type TrackingFixPreview = {
  write_configured: boolean;
  issue_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  account_id: string | null;
  max_ads: number;
  ads: TrackingFixAdPlan[];
};

export type TrackingFixAdResult = {
  ad_id: string;
  ad_name: string;
  account_id: string;
  before: string | null;
  after: string | null;
  reason?: TrackingFixSkipReason;
  error?: string;
};

export type TrackingFixApplyResponse = {
  fixed: TrackingFixAdResult[];
  skipped: TrackingFixAdResult[];
  failed: TrackingFixAdResult[];
  /** Set when a token/permission/rate-limit error stopped the run early. */
  stopped?: { error: string; kind: string };
  refresh_requested: boolean;
};
