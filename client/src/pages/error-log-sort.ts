export type ErrorLogSortKey = "count" | "lastSeen";
export type ErrorLogSortDir = "asc" | "desc";

/** `null` key = server order (errors first, then count). */
export interface ErrorLogSort {
  key: ErrorLogSortKey | null;
  dir: ErrorLogSortDir;
}

export const ERROR_LOG_SORT_SEARCH_KEYS = {
  sort: "sort",
  dir: "dir",
} as const;

export const ERROR_LOG_SORT_DEFAULT: ErrorLogSort = { key: null, dir: "desc" };

interface SortableIssue {
  count: number;
  lastTs: number;
}

export function parseErrorLogSort(search: string): ErrorLogSort {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawKey = params.get(ERROR_LOG_SORT_SEARCH_KEYS.sort);
  const key: ErrorLogSortKey | null = rawKey === "count" || rawKey === "lastSeen" ? rawKey : null;
  if (!key) return ERROR_LOG_SORT_DEFAULT;
  const rawDir = params.get(ERROR_LOG_SORT_SEARCH_KEYS.dir);
  return { key, dir: rawDir === "asc" ? "asc" : "desc" };
}

/** Writes sort keys onto `existingSearch`; default order removes them. Unknown params are kept. */
export function serializeErrorLogSort(sort: ErrorLogSort, existingSearch = ""): string {
  const params = new URLSearchParams(
    existingSearch.startsWith("?") ? existingSearch.slice(1) : existingSearch,
  );
  if (!sort.key) {
    params.delete(ERROR_LOG_SORT_SEARCH_KEYS.sort);
    params.delete(ERROR_LOG_SORT_SEARCH_KEYS.dir);
  } else {
    params.set(ERROR_LOG_SORT_SEARCH_KEYS.sort, sort.key);
    if (sort.dir === "desc") params.delete(ERROR_LOG_SORT_SEARCH_KEYS.dir);
    else params.set(ERROR_LOG_SORT_SEARCH_KEYS.dir, sort.dir);
  }
  return params.toString();
}

/** Header click cycle: descending → ascending → back to default order. */
export function nextErrorLogSort(current: ErrorLogSort, col: ErrorLogSortKey): ErrorLogSort {
  if (current.key !== col) return { key: col, dir: "desc" };
  if (current.dir === "desc") return { key: col, dir: "asc" };
  return ERROR_LOG_SORT_DEFAULT;
}

export function sortErrorLogIssues<T extends SortableIssue>(issues: T[], sort: ErrorLogSort): T[] {
  if (!sort.key) return issues;
  const sign = sort.dir === "asc" ? 1 : -1;
  const primary = sort.key === "count" ? (i: T) => i.count : (i: T) => i.lastTs;
  const secondary = sort.key === "count" ? (i: T) => i.lastTs : (i: T) => i.count;
  return [...issues].sort(
    (a, b) => sign * (primary(a) - primary(b)) || sign * (secondary(a) - secondary(b)),
  );
}
