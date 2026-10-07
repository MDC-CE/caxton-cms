import { Job } from "sidequest";
import type { AdsRefreshResult } from "../../ads/ads-refresh";
import { runAdsSyncJob, type AdsSyncPayload } from "./ads-sync";

export type MetaAdsSyncPayload = AdsSyncPayload;

/** Legacy name of `ads_sync`, kept so rows queued before the rename still run. Same refresh (Meta + Google + GA4). */
export class MetaAdsSyncJob extends Job {
  async run(payload: MetaAdsSyncPayload): Promise<AdsRefreshResult> {
    return runAdsSyncJob("meta_ads_sync", payload);
  }
}
