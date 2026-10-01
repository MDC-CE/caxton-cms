/**
 * Google provider: wraps the BigQuery-transfer day cache (`google-ads-days`) as generic spend rows.
 */

import { googleSuffixHasIds } from "@shared/paid-traffic";
import type { GoogleAdDayRow } from "../google-ads-bq";
import { hasGoogleData, listGoogleDayDates, loadGoogleRows, loadGoogleSetups, type GoogleAdsSetups } from "../google-ads-days";
import { knownIdsFromRows, type AdSpendDayRow, type AdsProvider, type KnownAdIds } from "./types";

/**
 * Visits from a Google click can be matched when the account auto-tags (gclid → GA4 link
 * or ClickStats join) or the campaign carries the id suffix template. Unknown = tagged.
 */
export function googleRowTagged(row: Pick<GoogleAdDayRow, "customer_id" | "campaign_id">, setups: GoogleAdsSetups): boolean {
  const autoTagging = setups.customers[row.customer_id]?.auto_tagging;
  if (autoTagging !== false) return true;
  return googleSuffixHasIds(setups.campaigns[row.campaign_id]?.final_url_suffix);
}

export function googleRowToSpend(g: GoogleAdDayRow, setups: GoogleAdsSetups): AdSpendDayRow {
  return {
    platform: "google",
    date: g.date,
    account_id: g.customer_id,
    currency: g.currency,
    campaign_id: g.campaign_id,
    campaign_name: g.campaign_name,
    adset_id: g.ad_group_id,
    adset_name: g.ad_group_name,
    ad_id: "",
    ad_name: "",
    spend: g.spend,
    impressions: g.impressions,
    clicks: g.clicks,
    landing_page_views: 0,
    platform_leads: g.lead_conversions,
    form_leads: 0,
    landing_url: g.landing_url,
    destination_hint: g.destination && g.destination !== "unknown" ? g.destination : null,
    tagged: googleRowTagged(g, setups),
  };
}

export function googleKnownIds(site: string, until: string, customerIds: string[]): KnownAdIds {
  const known = knownIdsFromRows(loadGoogleRows(site, "0000-01-01", until, customerIds).map((r) => ({ campaign_id: r.campaign_id, adset_id: r.ad_group_id, ad_id: "" })));
  const setups = loadGoogleSetups(site);
  const allow = new Set(customerIds);
  for (const [id, c] of Object.entries(setups.campaigns)) if (allow.size === 0 || allow.has(c.customer_id)) known.campaigns.add(id);
  for (const [id, g] of Object.entries(setups.ad_groups)) if (known.campaigns.has(g.campaign_id)) known.adsets.add(id);
  for (const [id, a] of Object.entries(setups.ads)) if (allow.size === 0 || allow.has(a.customer_id)) known.ads.add(id);
  return known;
}

export const googleProvider: AdsProvider = {
  platform: "google",
  label: "Google Ads",
  hasData: hasGoogleData,
  accountIds: (settings) => settings.google.customer_ids,
  loadSpendRows: (site, since, until, accountIds) => {
    const setups = loadGoogleSetups(site);
    return loadGoogleRows(site, since, until, accountIds).map((r) => googleRowToSpend(r, setups));
  },
  knownIds: googleKnownIds,
  listDayDates: listGoogleDayDates,
};
