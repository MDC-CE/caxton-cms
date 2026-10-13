/**
 * IPC message shapes between Express parent and diagnostics worker child.
 */

import type { ValidatorResult } from "./shared/types";

export type DiagnosticsFreshness = "hard" | "max_age";

/** What the forked child should run. Omitted means a normal diagnostics job. */
export type DiagnosticsJobKind =
  | "diagnostics"
  | "run-page"
  | "images"
  | "redirects"
  | "entry-complete"
  | "seo-duplicates"
  | "traffic"
  | "save-report"
  | "section-variants";

export type DiagnosticsLane = "site" | "shared";

/** Why a job was opened, so a later poll can ask for the cheap verdict. */
export interface DiagnosticsJobPurpose {
  type: "complete_issue" | "traffic" | "save_report";
  issueId?: string;
  contentType?: string;
  slug?: string;
  locale?: string;
  variant?: string;
}

/** Enough of a content file for applyValidatorResults to map issues to entries. */
export interface SlimContentFile {
  slug: string;
  title: string;
  type: string;
  locale: string;
  filePath: string;
  url?: string;
  variant?: string;
  isDraft?: boolean;
}

export interface DeferredCacheBatch {
  validators: ValidatorResult[];
  entryKeys?: string[];
  markSiteWide?: boolean;
  skippedContentTypes?: string[];
  contentFiles: SlimContentFile[];
}

/**
 * Cache writes the child must not perform. The web process applies this
 * after `completed`, unless `hold` is set (traffic: apply only on the save).
 */
export interface DeferredCacheApply {
  batches: DeferredCacheBatch[];
  markFullRunAt?: string;
  markSiteWideRunAt?: boolean;
  /** database-health / database-singles rows for setByDatabase. No flush here. */
  databaseValidators?: ValidatorResult[];
  hold?: boolean;
}

export interface DiagnosticsWorkerStartMessage {
  type: "start";
  jobId: string;
  contentRoot: string;
  contentRootName: string;
  slugs?: string[];
  urls?: string[];
  /** YAML path when the re-check was scoped by file. The child resolves it. */
  file?: string;
  freshness: DiagnosticsFreshness;
  max_age_seconds: number;
  validators?: string[];
  include_artifacts: boolean;
  categories?: string[];
  /**
   * Run entry-local validators once without per-URL iteration (shared-template
   * re-check: single.*.yml files are not YAML-backed page entries).
   */
  validator_only?: boolean;
  kind?: DiagnosticsJobKind;
  /** Shared lane stays up for the next start. Site lane exits after one job. */
  reusable?: boolean;
  /** Entry for complete / traffic. The child loads the YAML; the registry is not sent. */
  entry?: {
    contentType: string;
    slug: string;
    locale: string;
    variant?: string;
  };
  /** Absolute path for validator results / issuesBySlug payload */
  resultsPath: string;
}

export interface DiagnosticsWorkerStopMessage {
  type: "stop";
}

export interface DiagnosticsWorkerProgressMessage {
  type: "progress";
  jobId: string;
  processed: number;
  total: number;
  staleUrlCount?: number;
  urlCount?: number;
  message?: string;
  status?: "running";
}

export interface DiagnosticsWorkerCompletedMessage {
  type: "completed";
  jobId: string;
  processed: number;
  total: number;
  summary: { errorCount: number; warningCount: number };
  resultsPath: string;
}

export interface DiagnosticsWorkerFailedMessage {
  type: "failed";
  jobId: string;
  error: string;
}

export type DiagnosticsWorkerOutboundMessage =
  | DiagnosticsWorkerProgressMessage
  | DiagnosticsWorkerCompletedMessage
  | DiagnosticsWorkerFailedMessage;

export type DiagnosticsWorkerInboundMessage =
  | DiagnosticsWorkerStartMessage
  | DiagnosticsWorkerStopMessage;

export interface DiagnosticsResultTarget {
  url: string;
  slug: string;
  filePath: string;
  locale: string;
  type: string;
}

export interface DiagnosticsJobResultsFile {
  summary: { errorCount: number; warningCount: number };
  outcome?: "ran" | "cached" | "not_found";
  code?: string;
  message?: string;
  targets?: DiagnosticsResultTarget[];
  /** Present when the child deferred cache writes. Web applies this. */
  cacheApply?: DeferredCacheApply;
  /** save-report writes this file in the child. */
  reportPath?: string;
  validatorResults?: unknown[];
  issuesBySlug?: Record<
    string,
    Array<{
      code: string;
      message: string;
      severity: "error" | "warning";
      category: string;
      validator?: string;
      file?: string;
      suggestion?: string;
      url?: string;
    }>
  >;
}
