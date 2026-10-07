/**
 * Small lookups shared by the Ads check engine (workers), the save step and reads (web).
 */

import type { StoredValidationIssue } from "../../../scripts/validation/shared/types";
import { loadAdsSetup, type AdsSetupCatalog } from "../ads-setup";
import { loadMetaState } from "../meta-ads-days";
import { loadGoogleState } from "../google-ads-days";
import type { VerifyContext } from "./verify";

export function catalogPlatform(issue: Pick<StoredValidationIssue, "ads">): "meta" | "google" {
  return issue.ads?.platform === "google" ? "google" : "meta";
}

export function verifyContextFor(site: string, now = new Date()): VerifyContext {
  const catalogs: Partial<Record<"meta" | "google", AdsSetupCatalog>> = {};
  const catalog = (p: "meta" | "google") => (catalogs[p] ??= loadAdsSetup(site, p));
  return {
    site,
    now,
    lastSyncAt: { meta: loadMetaState(site).last_success_at ?? null, google: loadGoogleState(site).last_success_at ?? null },
    timeZoneFor: (issue) => {
      const accountId = issue.ads?.account_id;
      const accounts = catalog(catalogPlatform(issue)).accounts;
      if (accountId && accounts[accountId]?.timezone) return accounts[accountId]!.timezone;
      const first = Object.values(accounts).find((a) => a.timezone);
      return first?.timezone ?? null;
    },
  };
}

/** Every affected ad (or the ad itself) was deleted in the platform → "no longer applies". */
export function makeResourceGoneCheck(site: string): (issue: StoredValidationIssue) => boolean {
  const catalogs: Partial<Record<"meta" | "google", AdsSetupCatalog>> = {};
  return (issue) => {
    const a = issue.ads;
    if (!a) return false;
    const ids = a.affected_ads.length > 0 ? a.affected_ads : a.level === "ad" && a.resource_id ? [a.resource_id] : [];
    if (ids.length === 0) return false;
    const p = catalogPlatform(issue);
    const catalog = (catalogs[p] ??= loadAdsSetup(site, p));
    return ids.every((id) => !!catalog.ads[id]?.gone_at);
  };
}
