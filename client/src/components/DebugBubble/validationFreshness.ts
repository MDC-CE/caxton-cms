/**
 * Client-side validation freshness for DebugBubble auto run-page.
 * Mirrors server `CACHE_FRESHNESS_MAX_AGE_SECONDS` / `isUrlStaleForFullRun`
 * (server/services/validationCacheMerge.ts) plus the entry `dirty` flag.
 */

import type { CachedValidationEntry } from "./types";

/** Same value as CACHE_FRESHNESS_MAX_AGE_SECONDS in validationCacheMerge.ts */
export const PAGE_VALIDATION_MAX_AGE_SECONDS = 86400;

export type PageValidationStaleReason = "missing" | "dirty" | "expired";

export type PageValidationFreshnessInput = {
  cached?: CachedValidationEntry | null;
  dirty?: boolean;
  nowMs?: number;
  maxAgeSeconds?: number;
};

export function cacheValidationStamp(
  cached: CachedValidationEntry | null | undefined,
): string | null {
  if (!cached) return null;
  const stamp = cached.lastFullRunAt ?? cached.lastRunAt;
  return stamp && stamp.length > 0 ? stamp : null;
}

export function staleReason(
  input: PageValidationFreshnessInput,
): PageValidationStaleReason | null {
  const { cached, dirty, nowMs = Date.now(), maxAgeSeconds = PAGE_VALIDATION_MAX_AGE_SECONDS } =
    input;

  if (!cached) return "missing";
  if (dirty === true) return "dirty";

  const stamp = cacheValidationStamp(cached);
  if (!stamp) return "missing";

  const ageSec = (nowMs - Date.parse(stamp)) / 1000;
  if (Number.isNaN(ageSec) || ageSec > maxAgeSeconds) return "expired";

  return null;
}

export function isPageValidationStale(input: PageValidationFreshnessInput): boolean {
  return staleReason(input) !== null;
}

/** Session key for auto run-page loop guard (url + optional variant + stamp). */
export function autoRunLoopGuardKey(
  url: string,
  variant: string | null,
  stamp: string | null,
): string {
  const base = url + (variant ? `@${variant}` : "");
  return `${base}::${stamp ?? "none"}`;
}
