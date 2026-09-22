/** Shared page/slice helpers for Content Type manage list endpoints. */

export const MANAGE_LIST_DEFAULT_PAGE_SIZE = 50;
export const MANAGE_LIST_MAX_PAGE_SIZE = 100;

const RESERVED_LIST_QUERY_KEYS = new Set([
  "locale",
  "sort",
  "limit",
  "include_content",
  "page",
  "pageSize",
  "q",
  "sortDir",
  "errorsOnly",
  "pub",
  "pubFrom",
  "pubTo",
  "status",
  "market",
  /** Dev site override injected on every /api fetch — never a row filter. */
  "__site",
]);

export type ManageListPublishDatePreset = "today" | "7d" | "28d" | "custom";
export type ManageListStatusFilter =
  | "published"
  | "pending_drafts"
  | "only_draft";

export type ManagePublishDateRange = { startMs: number; endMs: number };

const PUB_PRESETS = new Set<ManageListPublishDatePreset>([
  "today",
  "7d",
  "28d",
  "custom",
]);

const STATUS_FILTERS = new Set<ManageListStatusFilter>([
  "published",
  "pending_drafts",
  "only_draft",
]);

function parseIsoDateOnly(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** UTC start of day for YYYY-MM-DD. */
export function utcDayStartMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

/** UTC end of day (inclusive) for YYYY-MM-DD. */
export function utcDayEndMs(isoDate: string): number {
  return Date.parse(`${isoDate}T23:59:59.999Z`);
}

function utcYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Parse manage-list publish date filter from query.
 * Rolling windows (today / 7d / 28d) end at `now` and start at UTC midnight
 * of the window start day. Custom uses inclusive UTC calendar days.
 */
export function parseManagePublishDateRange(
  query: Record<string, unknown>,
  nowMs: number = Date.now(),
): ManagePublishDateRange | null {
  const raw = query.pub;
  if (typeof raw !== "string" || !PUB_PRESETS.has(raw as ManageListPublishDatePreset)) {
    return null;
  }
  const preset = raw as ManageListPublishDatePreset;
  const now = new Date(nowMs);
  const todayYmd = utcYmd(now);

  if (preset === "today") {
    return { startMs: utcDayStartMs(todayYmd), endMs: nowMs };
  }
  if (preset === "7d" || preset === "28d") {
    const days = preset === "7d" ? 7 : 28;
    const start = new Date(nowMs);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return { startMs: utcDayStartMs(utcYmd(start)), endMs: nowMs };
  }
  // custom
  let from = parseIsoDateOnly(query.pubFrom);
  let to = parseIsoDateOnly(query.pubTo);
  if (!from && !to) return null;
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return {
    startMs: from ? utcDayStartMs(from) : Number.NEGATIVE_INFINITY,
    endMs: to ? utcDayEndMs(to) : Number.POSITIVE_INFINITY,
  };
}

export function parseManageStatusFilter(
  raw: unknown,
): ManageListStatusFilter | null {
  if (typeof raw !== "string") return null;
  return STATUS_FILTERS.has(raw as ManageListStatusFilter)
    ? (raw as ManageListStatusFilter)
    : null;
}

/** False when publishedAt is missing/invalid (date filter active ⇒ exclude). */
export function matchesPublishedAtRange(
  publishedAt: unknown,
  range: ManagePublishDateRange | null,
): boolean {
  if (!range) return true;
  if (publishedAt == null || publishedAt === "") return false;
  const ms = Date.parse(String(publishedAt));
  if (Number.isNaN(ms)) return false;
  return ms >= range.startMs && ms <= range.endMs;
}

/** Any registered variant with allocation === 0 (incl. draft). */
export function versioningHasUnallocatedVariant(
  config: Record<string, { variants?: Array<{ slug?: string; allocation?: number }> }> | null | undefined,
): boolean {
  if (!config) return false;
  for (const localeData of Object.values(config)) {
    for (const v of localeData?.variants ?? []) {
      if ((v.allocation ?? 0) === 0) return true;
    }
  }
  return false;
}

export type ManageEntryStatusKind = "draft" | "published";

/**
 * Status filter for manage lists.
 * - only_draft: draft-only folders (no live)
 * - pending_drafts: live + ≥1 variant at 0% allocation
 * - published: live with no 0%-allocation variants
 */
export function matchesManageStatusFilter(
  entryStatus: ManageEntryStatusKind | undefined,
  statusFilter: ManageListStatusFilter | null,
  hasUnallocatedVariant: boolean,
): boolean {
  if (!statusFilter) return true;
  const isDraftOnly = entryStatus === "draft";
  if (statusFilter === "only_draft") return isDraftOnly;
  if (isDraftOnly) return false;
  if (statusFilter === "pending_drafts") return hasUnallocatedVariant;
  // published
  return !hasUnallocatedVariant;
}

export type ListPagination =
  | { paginate: false }
  | { paginate: true; page: number; pageSize: number };

export function parseListPagination(
  query: Record<string, unknown>,
): ListPagination {
  if (query.page === undefined || query.page === "") {
    return { paginate: false };
  }
  const page = Math.max(1, parseInt(String(query.page), 10) || 1);
  const rawSize =
    query.pageSize !== undefined && query.pageSize !== ""
      ? parseInt(String(query.pageSize), 10)
      : MANAGE_LIST_DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(
    MANAGE_LIST_MAX_PAGE_SIZE,
    Math.max(
      1,
      Number.isNaN(rawSize) ? MANAGE_LIST_DEFAULT_PAGE_SIZE : rawSize,
    ),
  );
  return { paginate: true, page, pageSize };
}

export function parseSortDir(
  raw: unknown,
): "asc" | "desc" | null {
  if (raw === "asc" || raw === "desc") return raw;
  return null;
}

/** Date columns supported by manage list sort (`sort` + `sortDir`). */
export type ManageListDateSortField = "updated_at" | "published_at";

export function parseManageDateSortField(
  raw: unknown,
): ManageListDateSortField {
  if (raw === "published_at") return "published_at";
  return "updated_at";
}

export function paginateList<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  pageItems: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(offset, offset + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

function updatedAtSortMs(value: unknown): number {
  if (value == null || value === "") return Number.NaN;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? Number.NaN : ms;
}

export function sortByUpdatedAtField<T>(
  list: T[],
  sortDir: "asc" | "desc" | null,
  getValue: (item: T) => unknown,
): T[] {
  if (!sortDir) return list;
  const factor = sortDir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const am = updatedAtSortMs(getValue(a));
    const bm = updatedAtSortMs(getValue(b));
    const aMissing = Number.isNaN(am);
    const bMissing = Number.isNaN(bm);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return (am - bm) * factor;
  });
}

/** Collect AND filters from non-reserved query keys (string or repeated). */
export function collectQueryFieldFilters(
  query: Record<string, unknown>,
): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = [];
  for (const [key, val] of Object.entries(query)) {
    // `_`-prefixed keys are infra (e.g. `__site`, future `__*`) — never row filters.
    if (key.startsWith("_") || RESERVED_LIST_QUERY_KEYS.has(key)) continue;
    const values = Array.isArray(val) ? val : [val];
    for (const v of values) {
      if (v === undefined || v === null || v === "") continue;
      out.push({ field: key, value: String(v) });
    }
  }
  return out;
}

export function matchesManageItemsSearch(
  item: Record<string, unknown>,
  q: string,
): boolean {
  const needle = q.toLowerCase();
  const author = item.author_name
    ? `${item.author_name} ${item.author_last_name || ""}`
    : "";
  return (
    String(item.title ?? "")
      .toLowerCase()
      .includes(needle) ||
    String(item.slug ?? "")
      .toLowerCase()
      .includes(needle) ||
    String(item.description ?? "")
      .toLowerCase()
      .includes(needle) ||
    author.toLowerCase().includes(needle)
  );
}

export function fieldValueTokens(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => fieldValueTokens(v));
  }
  if (typeof value === "object" && value !== null && "slug" in value) {
    const slug = (value as { slug?: unknown }).slug;
    return slug != null && slug !== "" ? [String(slug)] : [];
  }
  return [String(value)];
}

export function matchesManageTagFilter(
  item: Record<string, unknown>,
  field: string,
  value: string,
): boolean {
  const needle = value.toLowerCase();
  const tokens = fieldValueTokens(item[field]).map((t) => t.toLowerCase());
  if (tokens.length > 1 || Array.isArray(item[field])) {
    return tokens.includes(needle);
  }
  return (tokens[0] || "") === needle;
}
