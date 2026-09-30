import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AttributionModel } from "@shared/paid-attribution";
import type { AdPlatform, MetaPlacementRow } from "@shared/paid-traffic";
import type { AdsRefreshStatus } from "@shared/ads-refresh-status";

export type MoneyByCurrency = Record<string, number>;

export type AdsWarning = { code: string; message: string };

export type AdsVersionRow = {
  variant: string;
  paid_visits: number;
  unique_leads: number;
  submissions: number;
  conversion_rate: number | null;
  low_sample: boolean;
};

export type AdsCampaignRef = {
  platform: AdPlatform | null;
  campaign_id: string | null;
  campaign_name: string;
  paid_visits: number;
  spend: MoneyByCurrency;
};

export type AdsPageRow = {
  key: string;
  kind: "entry" | "instant_form" | "off_site" | "other_site" | "missing_page" | "unknown_destination";
  kind_label: string;
  host: string;
  path: string;
  url: string;
  content_type: string | null;
  slug: string | null;
  locale: string | null;
  title: string;
  redirected_from: string[];
  paid_visits: number;
  matched_visits: number;
  unclear_visits: number;
  /** Only under an account/currency filter: paid Meta visits with no ad tags (not in `paid_visits`). */
  unassigned_visits: number;
  engaged_sessions: number;
  bounce_rate: number | null;
  avg_engaged_seconds: number | null;
  ga4_leads: number;
  spend: MoneyByCurrency;
  clicks: number;
  untagged_clicks: number;
  landing_page_views: number;
  meta_leads: number;
  instant_form_leads: number;
  unique_leads: number;
  submissions: number;
  repeat_submissions: number;
  last_visit_organic: number;
  started_here: number;
  closed_here: number;
  conversion_rate: number | null;
  cost_per_visit: MoneyByCurrency;
  cost_per_lead: MoneyByCurrency;
  clicks_to_visits: number | null;
  organic: { sessions: number; bounce_rate: number | null; lead_rate: number | null } | null;
  low_sample: boolean;
  platforms: AdPlatform[];
  campaigns: AdsCampaignRef[];
  versions?: AdsVersionRow[];
};

export type AdsCampaignGroup = {
  key: string;
  platform: AdPlatform | null;
  campaign_id: string | null;
  campaign_name: string;
  spend: MoneyByCurrency;
  clicks: number;
  meta_leads: number;
  paid_visits: number;
  pages: Array<{ key: string; title: string; path: string; paid_visits: number }>;
};

export type AdsMetaStatus = {
  connected: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  accounts: Array<{ id: string; name?: string; currency?: string; history_loaded?: boolean; sync_error?: string }>;
};

export type AdsGa4Status = { configured: boolean; last_synced_at: string | null; last_export_date: string | null; last_error: string | null };

export type AdsReport = {
  window: { start: string; end: string; days: number };
  platform: AdPlatform | "all";
  attribution: { model: AttributionModel; lookback_days: 30; basis: "browser_observed" };
  meta: AdsMetaStatus;
  ga4: AdsGa4Status;
  refreshing: boolean;
  refresh: AdsRefreshStatus;
  collecting_since: string | null;
  covered_days: { covered: number; total: number };
  consent: { mode: "advanced"; ask_region_reject_pct: number | null; ask_region_shown: number };
  totals: {
    spend: MoneyByCurrency;
    tracked_spend: MoneyByCurrency;
    clicks: number;
    landing_page_views: number;
    paid_visits: number;
    unclear_visits: number;
    matched_visits: number;
    unmatched_meta_visits: number;
    unassigned_visits: number;
    unsynced_account_visits: number;
    ratio_clicks: number;
    untagged_clicks: number;
    meta_leads: number;
    instant_form_leads: number;
    ga4_leads: number;
    unique_leads: number;
    submissions: number;
    repeat_submissions: number;
    test_submissions: number;
  };
  pages: AdsPageRow[];
  destinations: AdsPageRow[];
  campaigns: AdsCampaignGroup[];
  thresholds: { min_paid_visits_for_rates: number };
  warnings: AdsWarning[];
};

export type AdsEntriesResponse = Pick<
  AdsReport,
  "window" | "platform" | "attribution" | "meta" | "ga4" | "refreshing" | "refresh" | "covered_days" | "consent" | "thresholds" | "warnings"
> & { entries: AdsPageRow[] };

export type AdsMetaPlatformRow = {
  platform: MetaPlacementRow;
  spend: MoneyByCurrency;
  clicks: number;
  meta_leads: number;
  paid_visits: number;
  unique_leads: number;
  cost_per_lead: MoneyByCurrency | null;
  conversion_rate: number | null;
  low_sample: boolean;
};

export type AdsMetaPlatforms = {
  rows: AdsMetaPlatformRow[];
  excluded_spend: { instant_form: MoneyByCurrency; off_site: MoneyByCurrency; unknown: MoneyByCurrency };
  spend_since: string | null;
  spend_partial: boolean;
  not_split_share: number | null;
};

export type AdsDiagnostics = {
  generated_at: string;
  window_days: number;
  issue_window_days: number;
  status: "not_connected" | "ok" | "warnings" | "errors";
  meta: AdsMetaStatus;
  ga4: AdsGa4Status;
  refreshing: boolean;
  refresh: AdsRefreshStatus;
  collecting_since: string | null;
  kpis: {
    tracked_spend: MoneyByCurrency;
    spend: MoneyByCurrency;
    open_errors: number;
    open_warnings: number;
    meta_leads: number;
    site_leads: number;
    repeat_submissions: number;
    clicks_to_visits_pct: number | null;
    clicks_to_visits_mismatch: boolean;
    unmatched_meta_visits: number;
    untagged_clicks: number;
    meta_unclear_pct: number | null;
    consent_accept_pct: number | null;
  };
  missing_floor_currencies: string[];
  /** Missing on snapshots built before the placement split shipped. */
  meta_platforms?: AdsMetaPlatforms | null;
  issues: AdsIssue[];
  resolved: Array<{ id: string; title: string; severity: AdsIssue["severity"]; resolved_at: string }>;
  utm_template: string;
  warnings: AdsWarning[];
  /** Issues read with this id keep the same ads list for 30 minutes. */
  snapshot_id: string;
  snapshot_expires_at: string;
  snapshot_expired?: boolean;
  newer_data_available?: boolean;
};

/** GET /api/diagnostics/ads?issue_ids=… — full ads lists for a few issues. */
export type AdsIssueDetailResponse = {
  generated_at: string;
  issue_window_days: number;
  issues: AdsIssue[];
  missing_issue_ids: string[];
  snapshot_id: string;
  snapshot_expires_at: string;
  snapshot_expired?: boolean;
  newer_data_available?: boolean;
};
