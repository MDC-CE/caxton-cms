/**
 * Queue a redirects check when redirect config changes.
 * Entry-local checks after save/publish run on Sidequest (entry_locale_saved / promoted),
 * not on the web process.
 */

import type { ContentIndex } from "../content-index";
import type { ValidationCacheService } from "./validationCacheService";
import { startDiagnosticsJob } from "./diagnosticsJobService";
import { child } from "../logger";

const log = child({ module: "onSaveValidation" });

export type OnSaveValidationArgs = {
  contentRoot: string;
  contentRootName: string;
  ci: ContentIndex;
  cache: ValidationCacheService;
  /** Absolute or site-relative path that was written */
  filePath?: string;
  contentType?: string;
  slug?: string;
  locale?: string;
  /** When true, also queue redirects full-graph job */
  redirectsChanged?: boolean;
};

async function queueRedirectsJob(args: OnSaveValidationArgs): Promise<void> {
  args.cache.markScopeDirty("redirects");
  try {
    const result = await startDiagnosticsJob({
      contentRoot: args.contentRoot,
      contentRootName: args.contentRootName,
      ci: args.ci,
      cache: args.cache,
      validators: ["redirects"],
      freshness: "hard",
      include_artifacts: false,
      confirm: true,
      kind: "redirects",
    });
    if (result.status === "busy") {
      log.info(
        { job_id: "job_id" in result ? result.job_id : undefined },
        "[OnSaveValidation] Redirects job deferred — diagnostics busy (scope left dirty)",
      );
      return;
    }
    log.info("[OnSaveValidation] Queued redirects diagnostics job");
  } catch (err) {
    log.warn({ err }, "[OnSaveValidation] Failed to queue redirects job");
  }
}

/** Immediate redirects-only (e.g. custom-redirects.yml editor). */
export function scheduleRedirectsValidation(args: OnSaveValidationArgs): void {
  void queueRedirectsJob(args);
}
