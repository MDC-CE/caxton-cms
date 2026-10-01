import { Job } from "sidequest";
import { runAdsRefresh, type AdsRefreshResult } from "../../ads/ads-refresh";
import type { MetaSyncMode } from "../../ads/meta-ads-days";
import { child } from "../../logger";
import { markJobFinished, markJobStarted } from "../heartbeat";

const log = child({ module: "job:ads-sync" });

export type AdsSyncPayload = {
  site: string;
  contentRoot?: string;
  mode?: MetaSyncMode;
};

export async function runAdsSyncJob(jobType: string, payload: AdsSyncPayload): Promise<AdsRefreshResult> {
  markJobStarted(jobType);
  try {
    const result = await runAdsRefresh({ site: payload.site, contentRoot: payload.contentRoot, mode: payload.mode });
    log.info(
      {
        site: payload.site,
        mode: payload.mode ?? "refresh",
        meta_ok: result.meta?.ok ?? null,
        meta_rows: result.meta?.rows ?? 0,
        google_ok: result.google?.ok ?? null,
        google_customers: result.google ? Object.keys(result.google.customers).length : 0,
        ga4_ok: result.ga4?.ok ?? null,
        ga4_days: result.ga4?.fetched.length ?? 0,
      },
      `[${jobType}] done`,
    );
    return result;
  } finally {
    markJobFinished(jobType);
  }
}

/** Refresh Ads caches: Meta insights, Google Ads (BigQuery transfer) and GA4 paid-landing days. Read-only against every platform. */
export class AdsSyncJob extends Job {
  async run(payload: AdsSyncPayload): Promise<AdsRefreshResult> {
    return runAdsSyncJob("ads_sync", payload);
  }
}
