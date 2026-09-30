import * as path from "path";
import type { DatabaseConfig } from "../../../server/database";
import type { DbJobState } from "../../../server/db-job-state";
import type { ValidationIssue } from "./types";
import { resolveStaleErrorAfterDays } from "../../../shared/db-cache-ttl";

export const AUTH_ERROR_RE = /401|403|Authentication credentials/i;

export function isAuthFetchError(message: string): boolean {
  return AUTH_ERROR_RE.test(message);
}

export function databaseConfigFilePath(contentRoot: string, dbName: string): string {
  const rootName = path.relative(process.cwd(), contentRoot);
  return `${rootName}/db/${dbName}/config.yml`;
}

export function countDatabaseCacheErrors(errors: ValidationIssue[]): number {
  let count = 0;
  for (const issue of errors) {
    if (issue.code === "DB_TRANSFORM_ERRORS") {
      const match = issue.message.match(/^(\d+) transform error/);
      count += match ? parseInt(match[1], 10) : 1;
    } else {
      count += 1;
    }
  }
  return count;
}

/** Cache inputs for evaluateDatabaseHealth from the last good copy (expired copies still count). */
export function lastGoodCacheInputs(
  dbm: { getLastGoodItems(name: string): { fetchedAt: string; items: unknown[]; stale: boolean; ageMs: number } | null },
  dbName: string,
): { cacheInfo: { fetched_at: string; item_count: number } | null; staleAgeMs?: number } {
  const lastGood = dbm.getLastGoodItems(dbName);
  if (!lastGood) return { cacheInfo: null };
  return {
    cacheInfo: { fetched_at: lastGood.fetchedAt, item_count: lastGood.items.length },
    ...(lastGood.stale ? { staleAgeMs: lastGood.ageMs } : {}),
  };
}

export function evaluateDatabaseHealth(
  dbName: string,
  config: DatabaseConfig,
  contentRoot: string,
  jobState: DbJobState | undefined,
  cacheInfo: { fetched_at: string; item_count: number } | null,
  transformErrorCount: number,
  /** Age (ms) of the last good copy when it is older than the cache TTL. */
  staleAgeMs?: number,
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const label = config.name;
  const file = databaseConfigFilePath(contentRoot, dbName);
  const fixUrl = `/private/databases/${encodeURIComponent(dbName)}`;

  if (config.source.type === "api" && config.source.api?.auth?.token_env_var) {
    const envVar = config.source.api.auth.token_env_var;
    if (!process.env[envVar]) {
      errors.push({
        type: "error",
        code: "DB_AUTH_ENV_MISSING",
        message: `Environment variable ${envVar} is not set. Data from "${label}" cannot be fetched.`,
        file,
        suggestion: `Set ${envVar} in the server environment`,
        fix: { type: "manual", label: "Open database", url: fixUrl },
        category: "integrity",
      });
    }
  }

  const fetchState = jobState?.fetch;
  if (fetchState?.status === "error") {
    errors.push({
      type: "error",
      code: "DB_FETCH_FAILED",
      message: fetchState.error ?? "Fetch failed",
      file,
      suggestion: "Check source configuration and API connectivity, then retry fetch",
      fix: { type: "manual", label: "Open database", url: fixUrl },
      category: "integrity",
    });
  }

  const indexState = jobState?.index;
  if (indexState?.status === "error") {
    errors.push({
      type: "error",
      code: "DB_INDEX_FAILED",
      message: indexState.error ?? "Index failed",
      file,
      suggestion: "Check semantic search / vector index configuration",
      fix: { type: "manual", label: "Open database", url: fixUrl },
      category: "integrity",
    });
  }

  const sourceType = config.source.type;
  const fetchRunning = fetchState?.status === "running";
  if (
    (sourceType === "api" || sourceType === "remote") &&
    cacheInfo === null &&
    !fetchRunning
  ) {
    errors.push({
      type: "error",
      code: "DB_NO_CACHE",
      message: `No cached data available for "${label}".`,
      file,
      suggestion: "Force refresh the database or wait for warmup to complete",
      fix: { type: "manual", label: "Open database", url: fixUrl },
      category: "integrity",
    });
  }

  if (staleAgeMs !== undefined) {
    const errorAfterDays = resolveStaleErrorAfterDays(config.cache);
    const ageDays = staleAgeMs / (24 * 60 * 60 * 1000);
    const asError = ageDays >= errorAfterDays;
    const ageLabel = ageDays >= 2 ? `${Math.floor(ageDays)} days` : `${Math.max(1, Math.round(staleAgeMs / 3600000))} hours`;
    (asError ? errors : warnings).push({
      type: asError ? "error" : "warning",
      code: "DATABASE_CACHE_STALE",
      message:
        `"${label}" was last refreshed ${ageLabel} ago, longer than its cache time. ` +
        `Pages and listings keep using this copy until a refresh succeeds` +
        (asError ? ` (older than ${errorAfterDays} days).` : "."),
      file,
      suggestion: "Refresh the database. If the refresh fails, check the source connection.",
      fix: { type: "manual", label: "Open database", url: fixUrl },
      category: "integrity",
    });
  }

  if (transformErrorCount > 0) {
    errors.push({
      type: "error",
      code: "DB_TRANSFORM_ERRORS",
      message: `${transformErrorCount} transform error${transformErrorCount !== 1 ? "s" : ""} in cached data`,
      file,
      suggestion: "Review field mapping transforms on the database detail page",
      fix: { type: "manual", label: "Open database", url: fixUrl },
      category: "integrity",
    });
  }

  return { errors, warnings };
}
