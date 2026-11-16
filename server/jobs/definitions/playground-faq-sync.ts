import { Job } from "sidequest";
import { child } from "../../logger";
import { enqueueJob } from "../queue";
import { msUntilFaqSync, playgroundFaqsUrl } from "@shared/playground-faqs";

const log = child({ module: "job:playground-faq-sync" });

export const PLAYGROUND_FAQ_SYNC_JOB = "playground_faq_sync";

async function reschedule(): Promise<void> {
  const delayMs = msUntilFaqSync();
  try {
    await enqueueJob(PLAYGROUND_FAQ_SYNC_JOB, {}, {
      delayMs,
      uniqueKey: PLAYGROUND_FAQ_SYNC_JOB,
      uniqueWithArgs: false,
    });
    log.info({ delayMs }, "[playground-faq-sync] next sync queued");
  } catch (err) {
    log.warn({ err }, "[playground-faq-sync] reschedule failed");
  }
}

/**
 * Daily pull at 01:00 America/New_York (after catalog poll at 00:30).
 * Requires PLAYGROUND_FAQS_URL — does not fall back to a default host.
 */
export class PlaygroundFaqSyncJob extends Job {
  async run(): Promise<{ ok: boolean; skipped?: boolean }> {
    try {
      if (!playgroundFaqsUrl()) {
        log.warn("[PlaygroundFaqSyncJob] PLAYGROUND_FAQS_URL is not set — skipping sync");
        return { ok: true, skipped: true };
      }
      const { syncPlaygroundFaqs } = await import("../../playground-faq-sync");
      const report = await syncPlaygroundFaqs({ reindex: true, requireEnvUrl: true });
      log.info(report, "[PlaygroundFaqSyncJob] done");
    } catch (err) {
      log.error({ err }, "[PlaygroundFaqSyncJob] failed");
    } finally {
      await reschedule();
    }
    return { ok: true };
  }
}

/** Pull FAQs immediately. The daily schedule stays in place. */
export async function syncFaqsNow(): Promise<{
  fetched: number;
  upserted: number;
  deactivated: number;
  total: number;
  reindexed: boolean;
  aborted?: boolean;
}> {
  if (!playgroundFaqsUrl()) {
    log.warn("[playground-faq-sync] PLAYGROUND_FAQS_URL is not set — sync now skipped");
    return { fetched: 0, upserted: 0, deactivated: 0, total: 0, reindexed: false, aborted: true };
  }
  const { syncPlaygroundFaqs } = await import("../../playground-faq-sync");
  const report = await syncPlaygroundFaqs({ reindex: true, requireEnvUrl: true });
  log.info(report, "[playground-faq-sync] synced now");
  return {
    fetched: report.fetched,
    upserted: report.upserted,
    deactivated: report.deactivated,
    total: report.total,
    reindexed: report.reindexed,
    aborted: report.aborted,
  };
}

export async function schedulePlaygroundFaqSync(): Promise<void> {
  await reschedule();
}
