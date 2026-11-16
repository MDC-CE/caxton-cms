import { Job } from "sidequest";
import { child } from "../../logger";
import { enqueueJob } from "../queue";
import { msUntilFaqSync } from "@shared/playground-faqs";

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
 * Same idea as Edwin's Luma calendar sync: fetch remote list, upsert by id,
 * deactivate rows that disappeared, then reindex the FAQ bank.
 */
export class PlaygroundFaqSyncJob extends Job {
  async run(): Promise<{ ok: boolean }> {
    try {
      const { syncPlaygroundFaqs } = await import("../../playground-faq-sync");
      const report = await syncPlaygroundFaqs({ reindex: true });
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
}> {
  const { syncPlaygroundFaqs } = await import("../../playground-faq-sync");
  const report = await syncPlaygroundFaqs({ reindex: true });
  log.info(report, "[playground-faq-sync] synced now");
  return {
    fetched: report.fetched,
    upserted: report.upserted,
    deactivated: report.deactivated,
    total: report.total,
    reindexed: report.reindexed,
  };
}

export async function schedulePlaygroundFaqSync(): Promise<void> {
  await reschedule();
}
