/**
 * Pure helpers for get_validation_issues MCP tool (metrics_view).
 */

export const RESOLVED_WINDOW_DAYS = 60;

export {
  OPEN_ISSUE_SORT_FIELDS,
  RESOLVED_ISSUE_SORT_FIELDS,
  parseIssuesSort,
  sortIssueRows,
  type OpenIssueSortField,
  type ResolvedIssueSortField,
  type IssuesSortDir,
  type IssuesSortField,
} from "@shared/validation-issue-sort";

export type ValidationIssuesArgs = {
  slug?: string;
  locale?: string;
  contentType?: string;
  url?: string;
  code?: string;
  validator?: string;
  category?: string;
  search?: string;
  set?: "open" | "resolved";
  limit?: number;
  offset?: number;
  sort?: string;
  sort_dir?: string;
};

export function isValidationIssuesScoped(args: ValidationIssuesArgs): boolean {
  return Boolean(
    args.slug?.trim() ||
      args.url?.trim() ||
      args.code?.trim() ||
      args.validator?.trim() ||
      args.category?.trim() ||
      args.search?.trim(),
  );
}

export function clampIssuesLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return 20;
  return Math.min(200, Math.max(1, Math.floor(limit)));
}

export function clampIssuesOffset(offset?: number): number {
  if (offset == null || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

export function issuesNextOffset(
  offset: number,
  _limit: number,
  total: number,
  pageLen: number,
): number | null {
  const next = offset + pageLen;
  return next < total ? next : null;
}

export function paginateRows<T>(rows: T[], offset: number, limit: number): T[] {
  return rows.slice(offset, offset + limit);
}

export type OpenStats = {
  errors: number;
  warnings: number;
  total: number;
};

export type ResolvedStats = {
  window_days: number;
  resolvedCount: number;
  reopened: number;
  total: number;
  errors: number;
  warnings: number;
};

export function openStatsFromCacheTotals(totals: {
  openErrors?: number;
  openWarnings?: number;
  open?: number;
}): OpenStats {
  const errors = Number(totals.openErrors) || 0;
  const warnings = Number(totals.openWarnings) || 0;
  const total = Number(totals.open) || errors + warnings;
  return { errors, warnings, total };
}

export function resolvedStatsFromArchiveSummary(summary: {
  resolvedCount?: number;
  reopened?: number;
  total?: number;
  errors?: number;
  warnings?: number;
}): ResolvedStats {
  return {
    window_days: RESOLVED_WINDOW_DAYS,
    resolvedCount: Number(summary.resolvedCount) || 0,
    reopened: Number(summary.reopened) || 0,
    total: Number(summary.total) || 0,
    errors: Number(summary.errors) || 0,
    warnings: Number(summary.warnings) || 0,
  };
}

type IssueNextAction = {
  tool: string;
  priority: "required" | "recommended" | "optional";
  reason: string;
  args_hint?: Record<string, unknown>;
};

type RedirectSuggestionRow = {
  content_type: string;
  slug: string;
  locale: string;
  from: string;
  to: string;
  reason: string;
  inbound?: { from: string; source: string; all_languages: boolean }[];
};

/**
 * Source-only facts on issue rows become warnings / next_actions (same row shape
 * for every entry): `stale_source_data` for pages checked against an old
 * database copy, and the redirect for SOURCE_ITEM_REMOVED.
 */
export function issueSourceGuidance(
  rows: Record<string, unknown>[],
  siteHint: Record<string, string> = {},
): { warnings: Array<{ code: string; message: string }>; next_actions: IssueNextAction[] } {
  const warnings: Array<{ code: string; message: string }> = [];
  const next_actions: IssueNextAction[] = [];

  const staleDbs = new Map<string, number>();
  let staleWithoutDb = 0;
  for (const row of rows) {
    const age = row.stale_source_age_ms;
    if (typeof age !== "number") continue;
    const db = typeof row.stale_source_database === "string" ? row.stale_source_database : "";
    if (db) staleDbs.set(db, Math.max(staleDbs.get(db) ?? 0, age));
    else staleWithoutDb++;
  }
  if (staleDbs.size > 0 || staleWithoutDb > 0) {
    const dbList = [...staleDbs.keys()];
    warnings.push({
      code: "stale_source_data",
      message:
        "Some issues were checked against an old database copy (stale_source_age_ms on the row); the source may already be fixed. " +
        `Refresh the database${dbList.length ? ` (${dbList.join(", ")})` : ""} and re-check before adding an override.`,
    });
    for (const database of dbList) {
      next_actions.push({
        tool: "list_database_items",
        priority: "recommended",
        reason: `Refresh "${database}" before overriding: issues on its pages came from an old copy.`,
        args_hint: { database, refresh: true, ...siteHint },
      });
    }
  }

  for (const row of rows) {
    const s = row.redirect_suggestion as RedirectSuggestionRow | undefined;
    if (!s || typeof s.from !== "string" || typeof s.to !== "string") continue;
    const inbound = s.inbound ?? [];
    next_actions.push({
      tool: "update_redirect",
      priority: "recommended",
      reason:
        `SOURCE_ITEM_REMOVED: redirect ${s.from} to ${s.to} (${s.reason.replace(/_/g, " ")}, same language ${s.locale}).` +
        (inbound.length
          ? ` Moves ${inbound.length} old address(es) saved on the removed page too: ${inbound.map((r) => r.from).join(", ")}. Show this list to staff before applying.`
          : ""),
      args_hint: {
        action: "add",
        from: s.from,
        to: s.to,
        locale: s.locale,
        removed_entry: { content_type: s.content_type, slug: s.slug, locale: s.locale },
        ...siteHint,
      },
    });
  }

  return { warnings, next_actions };
}
