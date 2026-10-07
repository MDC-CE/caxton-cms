/**
 * Forked diagnostics worker — runs validators off the Express event loop.
 * Started via child_process.fork with tsx. Communicates progress over IPC.
 */

import * as fs from "fs";
import * as path from "path";
import { ContentIndex } from "../../server/content-index";
import { MediaGallery } from "../../server/media-gallery";
import { DatabaseManager } from "../../server/database";
import { ValidationCacheService } from "../../server/services/validationCacheService";
import { randomUUID } from "node:crypto";
import { flushTick, startTick } from "../../server/process-stats";
import { runDiagnosticsJob } from "./runDiagnosticsJob";
import type {
  DiagnosticsWorkerInboundMessage,
  DiagnosticsWorkerOutboundMessage,
  DiagnosticsWorkerStartMessage,
} from "./diagnosticsIpc";

function send(msg: DiagnosticsWorkerOutboundMessage): void {
  if (typeof process.send === "function") {
    process.send(msg);
  } else {
    console.error("[diagnostics-worker] no IPC channel", msg);
  }
}

async function bootstrapSite(contentRoot: string, contentRootName: string): Promise<{
  ci: ContentIndex;
  cache: ValidationCacheService;
}> {
  const contentFolder = contentRootName || path.relative(process.cwd(), contentRoot);
  const mg = new MediaGallery(contentFolder);
  const database = new DatabaseManager(contentRoot, mg);
  const ci = new ContentIndex(contentFolder, database);
  // Touch index so YAML + DB-backed URLs load (avoid full refresh side effects)
  ci.getStats();

  const cache = new ValidationCacheService(contentRoot);
  cache.setSkipGcsUpload(true);
  return { ci, cache };
}

async function handleStart(msg: DiagnosticsWorkerStartMessage): Promise<void> {
  const { jobId, contentRoot, contentRootName, resultsPath } = msg;
  let lastProcessed = 0;
  let lastTotal = 1;
  try {
    send({
      type: "progress",
      jobId,
      processed: 0,
      total: 1,
      status: "running",
      message: "Bootstrapping site context",
    });

    const { ci, cache } = await bootstrapSite(contentRoot, contentRootName);

    const output = await runDiagnosticsJob({
      contentRoot,
      ci,
      cache,
      slugs: msg.slugs,
      urls: msg.urls,
      freshness: msg.freshness,
      max_age_seconds: msg.max_age_seconds,
      validators: msg.validators,
      include_artifacts: msg.include_artifacts,
      categories: msg.categories,
      validator_only: msg.validator_only,
      onProgress: (p) => {
        lastProcessed = p.processed;
        lastTotal = p.total;
        send({
          type: "progress",
          jobId,
          processed: p.processed,
          total: p.total,
          staleUrlCount: p.staleUrlCount,
          urlCount: p.urlCount,
          message: p.message,
          status: "running",
        });
      },
    });

    fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
    fs.writeFileSync(resultsPath, JSON.stringify(output.resultsPayload, null, 2) + "\n", "utf-8");

    send({
      type: "completed",
      jobId,
      processed: Math.max(lastProcessed, lastTotal),
      total: lastTotal,
      summary: output.summary,
      resultsPath,
    });
    process.exitCode = 0;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    send({ type: "failed", jobId, error });
    process.exitCode = 1;
  }
}

function flushStats(): void {
  try {
    flushTick();
  } catch (err) {
    console.error("[diagnostics-worker] process stats flush failed", err);
  }
}

process.on("SIGTERM", () => {
  flushStats();
  process.exit(0);
});
process.on("SIGINT", () => {
  flushStats();
  process.exit(0);
});

process.on("message", (raw: DiagnosticsWorkerInboundMessage) => {
  if (!raw || typeof raw !== "object" || raw.type !== "start") return;
  void handleStart(raw).finally(() => {
    flushStats();
    setTimeout(() => process.exit(process.exitCode ?? 0), 50);
  });
});

startTick({ processName: "diagnostics-worker", processStartId: randomUUID() });
