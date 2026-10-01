/**
 * Ad platform provider contract. Each platform (Meta Graph API, Google Ads via
 * BigQuery Data Transfer) turns its own cache into the same spend rows, so the
 * paid-traffic report joins GA4 visits and ledger leads once for every platform.
 */

import type { AdPlatform } from "@shared/paid-traffic";
import type { AdsSettings } from "@shared/ads-settings";

/** Spend that never reaches a website page (kept out of cost per lead). */
export type SpendDestinationHint = "google_lead_form" | "calls" | "video_views" | "app";

export type AdSpendDayRow = {
  platform: AdPlatform;
  date: string;
  account_id: string;
  currency: string;
  campaign_id: string;
  campaign_name: string;
  /** Meta ad set / Google ad group. */
  adset_id: string;
  adset_name: string;
  /** Empty for Google rows (spend is read per ad group × landing page). */
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  /** Meta link clicks / Google clicks. */
  clicks: number;
  /** Meta only (0 for Google). */
  landing_page_views: number;
  /** Platform-reported leads on the website (Meta pixel) or Google lead conversions. Never summed with site leads. */
  platform_leads: number;
  /** Meta instant-form leads (Google lead-form conversions stay in `platform_leads`). */
  form_leads: number;
  /** Meta only: `fb_pixel_lead` + custom conversion ids → count (absent on days cached before per-conversion counts). */
  conversions?: Record<string, number>;
  /** Meta only: standard Lead in the 7-day click window (absent on days cached before the attribution split). */
  pixel_leads_click?: number;
  /** Final URL the platform reported for this spend (Google landing page stats). */
  landing_url?: string | null;
  /** Spend with no website link. */
  destination_hint?: SpendDestinationHint | null;
  /** False when visits from this spend can't be matched (no auto-tagging, no URL template). Undefined = decided by the ad setup. */
  tagged?: boolean;
};

export type KnownAdIds = { campaigns: Set<string>; adsets: Set<string>; ads: Set<string> };

export type ProviderAccountState = {
  id: string;
  name?: string;
  currency?: string;
  /** False until the first full history load finished for this account. */
  history_loaded: boolean;
  sync_error?: string;
};

export interface AdsProvider {
  platform: AdPlatform;
  label: string;
  /** Rows are readable (connected, or a downloaded copy). */
  hasData(site: string, contentRoot?: string): boolean;
  /** Accounts staff connected for this site. */
  accountIds(settings: AdsSettings): string[];
  loadSpendRows(site: string, since: string, until: string, accountIds?: string[]): AdSpendDayRow[];
  /** Every id this platform knows (all cached history + ad setups), for paid-vs-organic and "unrecognized" checks. */
  knownIds(site: string, until: string, accountIds: string[]): KnownAdIds;
  listDayDates(site: string): string[];
}

export function emptyKnownIds(): KnownAdIds {
  return { campaigns: new Set(), adsets: new Set(), ads: new Set() };
}

export function knownIdsFromRows(rows: Array<Pick<AdSpendDayRow, "campaign_id" | "adset_id" | "ad_id">>): KnownAdIds {
  return {
    campaigns: new Set(rows.map((r) => r.campaign_id).filter(Boolean)),
    adsets: new Set(rows.map((r) => r.adset_id).filter(Boolean)),
    ads: new Set(rows.map((r) => r.ad_id).filter(Boolean)),
  };
}
