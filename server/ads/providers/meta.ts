/**
 * Meta provider: wraps the Graph API day cache (`meta-ads-days`) as generic spend rows.
 */

import type { MetaAdDayRow } from "../meta-client";
import { listMetaDayDates, loadMetaCreatives, loadMetaRows } from "../meta-ads-days";
import { hasMetaData } from "../ads-refresh";
import { META_STANDARD_LEAD_KEY } from "@shared/ads-settings";
import { knownIdsFromRows, type AdSpendDayRow, type AdsProvider, type KnownAdIds } from "./types";

/**
 * Meta leads for a row: sum of the picked conversion keys. Rows cached before per-conversion counts
 * only know the standard Lead event (`pixel_leads`).
 */
export function metaLeadsFor(
  m: Pick<MetaAdDayRow, "pixel_leads" | "conversions">,
  leadKeys: readonly string[] = [META_STANDARD_LEAD_KEY],
): number {
  if (!m.conversions) return leadKeys.includes(META_STANDARD_LEAD_KEY) ? m.pixel_leads : 0;
  let n = 0;
  for (const k of leadKeys) n += m.conversions[k] ?? 0;
  return n;
}

export function metaRowToSpend(m: MetaAdDayRow, leadKeys: readonly string[] = [META_STANDARD_LEAD_KEY]): AdSpendDayRow {
  return {
    platform: "meta",
    date: m.date,
    account_id: m.account_id,
    currency: m.currency,
    campaign_id: m.campaign_id,
    campaign_name: m.campaign_name,
    adset_id: m.adset_id,
    adset_name: m.adset_name,
    ad_id: m.ad_id,
    ad_name: m.ad_name,
    spend: m.spend,
    impressions: m.impressions,
    clicks: m.link_clicks,
    landing_page_views: m.landing_page_views,
    platform_leads: metaLeadsFor(m, leadKeys),
    form_leads: m.instant_form_leads,
    conversions: m.conversions,
  };
}

/** Ids in every stored Meta day plus every ad setup. */
export function metaKnownIds(site: string, until: string, accountIds: string[]): KnownAdIds {
  const known = knownIdsFromRows(loadMetaRows(site, "0000-01-01", until, accountIds));
  for (const c of Object.values(loadMetaCreatives(site).ads)) {
    if (c.campaign_id) known.campaigns.add(c.campaign_id);
    if (c.adset_id) known.adsets.add(c.adset_id);
    if (c.ad_id) known.ads.add(c.ad_id);
  }
  return known;
}

export const metaProvider: AdsProvider = {
  platform: "meta",
  label: "Meta",
  hasData: hasMetaData,
  accountIds: (settings) => settings.meta.ad_account_ids,
  loadSpendRows: (site, since, until, accountIds) => loadMetaRows(site, since, until, accountIds).map((m) => metaRowToSpend(m)),
  knownIds: metaKnownIds,
  listDayDates: listMetaDayDates,
};
