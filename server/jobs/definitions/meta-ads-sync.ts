import { Job } from "sidequest";
import { runAdsRefresh, type AdsRefreshResult } from "../../ads/ads-refresh";
import type { MetaSyncMode } from "../../ads/meta-ads-days";
import { child } from "../../logger";
import { markJobFinished, markJobStarted } from "../heartbeat";

const log = child({ module: "job:meta-ads-sync" });

export type MetaAdsSyncPayload = {
  site: string;
  contentRoot?: string;
  mode?: MetaSyncMode;
};

/** Refresh Ads caches: Meta insights (read-only against Meta) + GA4 paid-landing days. */
export class MetaAdsSyncJob extends Job {
  async run(payload: MetaAdsSyncPayload): Promise<AdsRefreshResult> {
    markJobStarted("meta_ads_sync");
    try {
      const result = await runAdsRefresh({ site: payload.site, contentRoot: payload.contentRoot, mode: payload.mode });
      log.info(
        {
          site: payload.site,
          mode: payload.mode ?? "refresh",
          meta_ok: result.meta?.ok ?? null,
          meta_rows: result.meta?.rows ?? 0,
          ga4_ok: result.ga4?.ok ?? null,
          ga4_days: result.ga4?.fetched.length ?? 0,
        },
        "[MetaAdsSyncJob] done",
      );
      return result;
    } finally {
      markJobFinished("meta_ads_sync");
    }
  }
}
