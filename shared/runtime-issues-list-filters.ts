/**
 * Shared list filters for runtime 404 issues (diagnostics UI + get_runtime_issues MCP).
 */

import {
  isAssetPath,
  SOURCE_LABELS,
  windowHitCount,
  hasQueryAttribution,
  type ByHour,
  type RuntimeQueryAttribution,
  type RuntimeSourceTag,
} from "./runtime-issues.js";

export { isAssetPath, SOURCE_LABELS, hasQueryAttribution };

export const FILTER_ALL = "__all__";

export const DEVICE_ORDER = ["desktop", "mobile", "unknown"] as const;

export const SOURCE_FILTER_TAGS: RuntimeSourceTag[] = [
  "search_crawler",
  "llm_crawler",
  "social_preview",
  "search_referrer",
  "llm_referrer",
  "internal",
  "human",
];

const BADGE_TAGS: RuntimeSourceTag[] = [
  "search_crawler",
  "llm_crawler",
  "social_preview",
  "search_referrer",
  "llm_referrer",
  "internal",
];

export interface RuntimeIssueFilterRow {
  path: string;
  locale: string;
  sampleReferrer?: string;
  uaBucket?: string;
  sources?: string[];
  byHour?: ByHour;
  count: number;
  lastSeen: number;
  count30?: number;
  queryAttribution?: RuntimeQueryAttribution;
}

export interface RuntimeIssueFilters {
  pathQuery: string;
  referrerQuery: string;
  locale: string;
  device: string;
  pagesOnly: boolean;
  queryParamsOnly: boolean;
  windowDays: 7 | 30;
  tz: string;
  source: string;
  now?: number;
}

export type RuntimeIssueSortKey = "count" | "lastSeen";
export type RuntimeIssueSortDir = "asc" | "desc";

export function defaultRuntimeTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function windowedSourceTags(
  issue: Pick<RuntimeIssueFilterRow, "byHour" | "count" | "lastSeen" | "sources">,
  filters: Pick<RuntimeIssueFilters, "windowDays" | "tz" | "now">,
): string[] {
  const now = filters.now ?? Date.now();
  const tags = issue.sources?.length ? issue.sources : BADGE_TAGS;
  return tags.filter((tag) => {
    if (!BADGE_TAGS.includes(tag as RuntimeSourceTag)) return false;
    return windowHitCount(issue, filters.windowDays, filters.tz, now, tag) > 0;
  });
}

export function filterRuntimeIssues<T extends RuntimeIssueFilterRow>(
  issues: T[],
  filters: RuntimeIssueFilters,
): T[] {
  const pathNeedle = filters.pathQuery.trim().toLowerCase();
  const referrerNeedle = filters.referrerQuery.trim().toLowerCase();
  const now = filters.now ?? Date.now();
  const tz = filters.tz || "UTC";
  const windowDays = filters.windowDays || 30;
  return issues.filter((issue) => {
    const windowTotal = windowHitCount(issue, windowDays, tz, now);
    if (windowTotal <= 0) return false;
    if (filters.pagesOnly && isAssetPath(issue.path)) {
      return false;
    }
    if (pathNeedle && !issue.path.toLowerCase().includes(pathNeedle)) return false;
    if (referrerNeedle && !(issue.sampleReferrer ?? "").toLowerCase().includes(referrerNeedle)) {
      return false;
    }
    if (filters.locale !== FILTER_ALL && issue.locale !== filters.locale) return false;
    if (filters.device !== FILTER_ALL && (issue.uaBucket || "unknown") !== filters.device) {
      return false;
    }
    if (filters.source !== FILTER_ALL && filters.source) {
      if (windowHitCount(issue, windowDays, tz, now, filters.source) <= 0) return false;
    }
    if (filters.queryParamsOnly && !hasQueryAttribution(issue.queryAttribution)) return false;
    return true;
  });
}

export function sortRuntimeIssues<T extends { count: number; lastSeen: number }>(
  issues: T[],
  sortKey: RuntimeIssueSortKey,
  sortDir: RuntimeIssueSortDir,
): T[] {
  return [...issues].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av - bv;
    if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
    if (b.count !== a.count) return b.count - a.count;
    return b.lastSeen - a.lastSeen;
  });
}

/** Filter then sort — table, CSV, and MCP list use this so they stay on the same set. */
export function applyRuntimeIssueView<T extends RuntimeIssueFilterRow>(
  issues: T[],
  filters: RuntimeIssueFilters,
  sortKey: RuntimeIssueSortKey,
  sortDir: RuntimeIssueSortDir,
): Array<T & { count: number; count30: number }> {
  const now = filters.now ?? Date.now();
  const tz = filters.tz || "UTC";
  const windowDays = filters.windowDays || 30;
  const mapped = issues.map((issue) => ({
    ...issue,
    count: windowHitCount(issue, windowDays, tz, now),
    count30: windowHitCount(issue, 30, tz, now),
  }));
  return sortRuntimeIssues(filterRuntimeIssues(mapped, filters), sortKey, sortDir);
}
