/** Staff "Fix via Meta" for missing or wrong tracking parameters (Diagnostics → Ads). */

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
  | "not_attempted"
  | "already_correct"
  | "value_in_link";

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
  already_correct: "Already uses the UTM convention's values",
  value_in_link: "The wrong value is in the ad's website link, not its URL parameters — edit the link in Meta Ads Manager",
};

/** `add` fills missing parameters; `replace` swaps flagged utm values for the convention's. */
export type TrackingFixMode = "add" | "replace";

/** UTM issue codes Fix via Meta can repair by replacing utm_source / utm_medium. */
export const TRACKING_FIX_REPLACE_CODES: ReadonlySet<string> = new Set([
  "utm_case_mixed",
  "utm_bad_chars",
  "utm_medium_nonstandard",
  "utm_source_alias",
  "utm_medium_off_convention",
]);

/** Parameters a replace may change (the id slots and campaign name are never rewritten). */
export const TRACKING_FIX_REPLACEABLE_PARAMS: readonly string[] = ["utm_source", "utm_medium"];

export function trackingFixModeFor(code: string): TrackingFixMode | null {
  if (code === "missing_tracking_params") return "add";
  return TRACKING_FIX_REPLACE_CODES.has(code) ? "replace" : null;
}

export const TRACKING_FIX_RE_REVIEW_WARNING =
  "Meta may send edited ads back to review. While in review they can pause delivery for a short time.";

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
  /** Parameter names the fix replaces (replace mode). */
  replaced?: string[];
};

export type TrackingFixPreview = {
  write_configured: boolean;
  issue_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  account_id: string | null;
  max_ads: number;
  mode: TrackingFixMode;
  /** Shown before confirm (replace mode: Meta may re-review edited ads). */
  warning?: string;
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
