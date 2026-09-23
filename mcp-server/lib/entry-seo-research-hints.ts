/**
 * Soft next_actions for get_entry_seo when keyword_metrics are weak and research is on.
 */

import type { NextAction } from "./respond.js";

export type KeywordMetricsHintShape = {
  openrush_configured?: boolean;
  source?: string;
  stale?: boolean | null;
  kw_monthly_volume?: number | null;
  kw_difficulty?: number | null;
};

/** True when main_keyword is set, research is configured, and metrics are weak/stale/missing. */
export function isWeakKeywordMetricsForResearch(
  mainKeyword: string | null | undefined,
  keyword_metrics: KeywordMetricsHintShape,
): boolean {
  const mainKw = typeof mainKeyword === "string" ? mainKeyword.trim() : "";
  if (!mainKw || !keyword_metrics.openrush_configured) return false;
  return (
    keyword_metrics.source === "yaml_fallback" ||
    keyword_metrics.source === "none" ||
    keyword_metrics.stale === true ||
    keyword_metrics.kw_monthly_volume == null ||
    keyword_metrics.kw_difficulty == null
  );
}

export function buildKeywordMetricsResearchNextAction(opts: {
  contentType: string;
  slug: string;
  locale: string;
  site?: string;
}): NextAction {
  return {
    tool: "get_or_refresh_seo_research",
    priority: "recommended",
    reason:
      "Refresh keyword research cache (action keyword_metrics). Cache-first; does not write YAML.",
    args_hint: {
      action: "keyword_metrics",
      contentType: opts.contentType,
      slug: opts.slug,
      locale: opts.locale,
      ...(opts.site ? { site: opts.site } : {}),
    },
  };
}
