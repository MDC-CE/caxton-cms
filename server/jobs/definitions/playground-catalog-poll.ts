import { Job } from "sidequest";
import { child } from "../../logger";
import { enqueueJob } from "../queue";
import { msUntilCatalogPoll } from "@shared/playground-catalog";

const log = child({ module: "job:playground-catalog" });

export const PLAYGROUND_CATALOG_JOB = "playground_catalog_poll";

async function reschedule(): Promise<void> {
  const delayMs = msUntilCatalogPoll();
  try {
    await enqueueJob(PLAYGROUND_CATALOG_JOB, {}, {
      delayMs,
      uniqueKey: PLAYGROUND_CATALOG_JOB,
      uniqueWithArgs: false,
    });
    log.info({ delayMs }, "[playground-catalog] next poll queued");
  } catch (err) {
    log.warn({ err }, "[playground-catalog] reschedule failed");
  }
}

/** Nightly pull at 03:00 America/New_York, after the midnight scrape. */
export class PlaygroundCatalogPollJob extends Job {
  async run(): Promise<{ ok: boolean }> {
    try {
      const { syncPlaygroundCatalog } = await import("../../playground-catalog-sync");
      const report = await syncPlaygroundCatalog();
      log.info(report, "[PlaygroundCatalogPollJob] done");
    } catch (err) {
      log.error({ err }, "[PlaygroundCatalogPollJob] failed");
    } finally {
      await reschedule();
    }
    return { ok: true };
  }
}

/** Pull the catalog immediately. The nightly schedule stays in place. */
export async function syncCatalogNow(): Promise<{
  items: number;
  offerings: number;
  documents: number;
  descriptionDocuments: number;
  contentRoot: string;
}> {
  const { syncPlaygroundCatalog } = await import("../../playground-catalog-sync");
  const report = await syncPlaygroundCatalog();
  log.info(report, "[playground-catalog] synced now");
  return report;
}

export async function schedulePlaygroundCatalogPoll(): Promise<void> {
  await reschedule();
}
