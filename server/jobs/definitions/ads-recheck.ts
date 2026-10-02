import { Job } from "sidequest";
import { runAdsChecks } from "../../ads/diagnostics/engine";
import { readAdsJobRecord, updateAdsJobRecord, writeAdsJobResult } from "../../ads/diagnostics/jobs";
import { lightContentIndex } from "../../ads/diagnostics/light-index";
import type { AdsRecheckPayload } from "../../ads/diagnostics/recheck";
import { isAdsRunActive } from "../../ads/diagnostics/run-lock";
import { enqueueJob } from "../queue";
import { child } from "../../logger";
import { markJobFinished, markJobStarted } from "../heartbeat";

const log = child({ module: "job:ads-recheck" });

/** While a full Run holds the lock, re-enqueue after this delay (never two writers). */
export const ADS_RECHECK_DEFER_MS = 15_000;
/** Give up deferring after this many tries (~20 min = the run lock stale limit). */
const MAX_DEFERRALS = 80;

export type AdsRecheckJobDeps = {
  isRunActive: (site: string) => boolean;
  enqueue: typeof enqueueJob;
  run: typeof runAdsChecks;
};

const defaultDeps: AdsRecheckJobDeps = { isRunActive: isAdsRunActive, enqueue: enqueueJob, run: runAdsChecks };

export async function runAdsRecheckJob(payload: AdsRecheckPayload, deps: AdsRecheckJobDeps = defaultDeps): Promise<"deferred" | "done" | "skipped"> {
  const { site, job_id: jobId } = payload;
  const record = readAdsJobRecord(site, jobId);
  if (record && record.status !== "queued" && record.status !== "running") return "skipped";
  if (deps.isRunActive(site)) {
    const deferrals = (payload.deferrals ?? 0) + 1;
    if (deferrals > MAX_DEFERRALS) {
      updateAdsJobRecord(site, jobId, { status: "failed", finished_at: new Date().toISOString(), error: "An Ads Run kept the checks busy for too long. Try Re-check again." });
      return "skipped";
    }
    await deps.enqueue("ads_recheck", { ...payload, deferrals } as unknown as Record<string, unknown>, { delayMs: ADS_RECHECK_DEFER_MS });
    return "deferred";
  }
  updateAdsJobRecord(site, jobId, { status: "running", started_at: new Date().toISOString() });
  try {
    const result = await deps.run({
      site,
      contentRoot: payload.contentRoot,
      jobId,
      kind: "recheck",
      mode: "scope",
      platforms: payload.platforms,
      pending: payload.pending ?? [],
      scopes: payload.scopes,
      refreshMeta: payload.refreshMeta,
      requestedBy: payload.requested_by ?? null,
      ...(payload.contentRoot ? { contentIndex: lightContentIndex(site, payload.contentRoot) } : {}),
    });
    writeAdsJobResult(site, result);
    return "done";
  } catch (err) {
    log.error({ err, site, jobId }, "[ads_recheck] failed");
    updateAdsJobRecord(site, jobId, { status: "failed", finished_at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
    return "done";
  }
}

/** Small Ads Re-checks (one issue or a small campaign / ad set). Results are saved by the web process. */
export class AdsRecheckJob extends Job {
  async run(payload: AdsRecheckPayload): Promise<string> {
    markJobStarted("ads_recheck");
    try {
      return await runAdsRecheckJob(payload);
    } finally {
      markJobFinished("ads_recheck");
    }
  }
}
