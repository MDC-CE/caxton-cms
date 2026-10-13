/**
 * The only diagnostics path that writes the issues cache from a forked child.
 * The child leaves batches on the results file. This applies them in the web process.
 */

import type { ContentFile } from "../../scripts/validation/shared/types";
import type { DeferredCacheApply } from "../../scripts/validation/diagnosticsIpc";
import type { ValidationCacheService } from "./validationCacheService";
import { indexDatabaseHealthResults } from "./validationCachePostProcess";

const chains = new Map<string, Promise<void>>();

/** One apply at a time per site so two children cannot interleave a flush. */
export function enqueueCacheApply(contentRoot: string, fn: () => Promise<void>): Promise<void> {
  const prev = chains.get(contentRoot) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(contentRoot, next);
  return next;
}

export async function applyDeferredDiagnosticsCache(
  cache: ValidationCacheService,
  payload: DeferredCacheApply,
): Promise<void> {
  if (payload.hold) return;
  for (const batch of payload.batches) {
    cache.applyValidatorResults(batch.validators, {
      contentFiles: batch.contentFiles as ContentFile[],
      entryKeys: batch.entryKeys,
      markSiteWide: batch.markSiteWide,
      skippedContentTypes: batch.skippedContentTypes,
    });
  }
  if (payload.databaseValidators?.length) {
    indexDatabaseHealthResults(cache, payload.databaseValidators);
  }
  if (payload.markFullRunAt) cache.markFullRunAt(payload.markFullRunAt);
  if (payload.markSiteWideRunAt && payload.markFullRunAt) {
    cache.markSiteWideRunAt(payload.markFullRunAt);
  }
  await cache.flush();
}
