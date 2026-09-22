/**
 * Runtime-issues list filters — UI helpers + re-exports of shared list logic.
 */

import { SOURCE_LABELS, type RuntimeSourceTag } from "@shared/runtime-issues";
import {
  FILTER_ALL,
  DEVICE_ORDER,
  SOURCE_FILTER_TAGS,
  defaultRuntimeTz,
  windowedSourceTags,
  filterRuntimeIssues,
  sortRuntimeIssues,
  applyRuntimeIssueView,
  type RuntimeIssueFilterRow,
  type RuntimeIssueFilters,
  type RuntimeIssueSortKey,
  type RuntimeIssueSortDir,
} from "@shared/runtime-issues-list-filters";

export {
  FILTER_ALL,
  DEVICE_ORDER,
  SOURCE_FILTER_TAGS,
  SOURCE_LABELS,
  defaultRuntimeTz,
  windowedSourceTags,
  filterRuntimeIssues,
  sortRuntimeIssues,
  applyRuntimeIssueView,
  type RuntimeIssueFilterRow,
  type RuntimeIssueFilters,
  type RuntimeIssueSortKey,
  type RuntimeIssueSortDir,
};

export { isAssetPath, hasQueryAttribution } from "@shared/runtime-issues-list-filters";

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  unknown: "Unknown",
  likely_bot: "Likely bot",
  scraper: "Scraper",
  search_crawler: "Search crawler",
  llm_crawler: "LLM crawler",
  social_preview: "Social preview",
  bot: "Bot",
};

export function isRuntimeIssueFiltersActive(filters: RuntimeIssueFilters): boolean {
  return countActiveListFilters(filters) > 0;
}

export function countActiveListFilters(filters: RuntimeIssueFilters): number {
  let n = 0;
  if (!filters.pagesOnly) n += 1;
  if (filters.pathQuery.trim() !== "") n += 1;
  if (filters.referrerQuery.trim() !== "") n += 1;
  if (filters.locale !== FILTER_ALL) n += 1;
  if (filters.device !== FILTER_ALL) n += 1;
  if (filters.source !== FILTER_ALL) n += 1;
  if (filters.queryParamsOnly) n += 1;
  if (filters.windowDays !== 30) n += 1;
  return n;
}

export function countIngestionFilters(dropScrapers: boolean): number {
  return dropScrapers === false ? 1 : 0;
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function sortDevices(values: string[]): string[] {
  const present = new Set(values);
  return DEVICE_ORDER.filter((d) => present.has(d));
}

export function deviceLabel(bucket: string): string {
  return DEVICE_LABELS[bucket] ?? bucket;
}

export function sourceLabel(tag: string): string {
  return SOURCE_LABELS[tag as RuntimeSourceTag] ?? tag;
}

export const RUNTIME_ISSUES_PAGE_SIZE = 50;

export function paginateRuntimeIssues<T>(
  items: T[],
  page: number,
  pageSize = RUNTIME_ISSUES_PAGE_SIZE,
): { page: number; totalPages: number; totalItems: number; pageItems: T[] } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  return { page: safePage, totalPages, totalItems, pageItems: items.slice(offset, offset + pageSize) };
}
