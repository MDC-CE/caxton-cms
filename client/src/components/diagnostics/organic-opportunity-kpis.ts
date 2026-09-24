/**
 * Pure KPI summarizers for Diagnostics organic opportunities strip.
 * Counts/sums are over the shown card lists (top-25), not the full GSC universe.
 */

/** Matches server expectedCtrForPosition(8) in gsc-keep-filter.ts */
export const PAGE2_TARGET_CTR = 0.035;

export type OrganicKpiKind = "low_ctr" | "page2" | "decay" | "link_gaps";

export type OrganicKpiSummary = {
  kind: OrganicKpiKind;
  count: number;
  /** Rounded impact for display (missed/extra clicks, or impressions for link gaps). */
  impact: number;
  subline: string;
};

function fmtImpact(n: number): string {
  return Math.round(n).toLocaleString();
}

export function summarizeLowCtr(
  rows: Array<{ impressions: number; gap: number }>,
): OrganicKpiSummary {
  const count = rows.length;
  if (count === 0) {
    return {
      kind: "low_ctr",
      count: 0,
      impact: 0,
      subline: "No listings to fix in this window.",
    };
  }
  const impact = Math.round(rows.reduce((s, r) => s + r.impressions * r.gap, 0));
  return {
    kind: "low_ctr",
    count,
    impact,
    subline: `Rewrite ${count} titles → ~${fmtImpact(impact)} more clicks / 7d`,
  };
}

export function summarizePage2(
  rows: Array<{ impressions: number; ctr: number }>,
): OrganicKpiSummary {
  const count = rows.length;
  if (count === 0) {
    return {
      kind: "page2",
      count: 0,
      impact: 0,
      subline: "No listings to fix in this window.",
    };
  }
  const impact = Math.round(
    rows.reduce((s, r) => s + r.impressions * Math.max(0, PAGE2_TARGET_CTR - r.ctr), 0),
  );
  return {
    kind: "page2",
    count,
    impact,
    subline: `Push ${count} queries to page 1 → ~${fmtImpact(impact)} more clicks / 7d`,
  };
}

export function summarizeDecay(
  rows: Array<{ click_drop: number }>,
): OrganicKpiSummary {
  const count = rows.length;
  if (count === 0) {
    return {
      kind: "decay",
      count: 0,
      impact: 0,
      subline: "No decaying pages in this window.",
    };
  }
  const impact = Math.round(rows.reduce((s, r) => s + r.click_drop, 0));
  return {
    kind: "decay",
    count,
    impact,
    subline: `Refresh ${count} pages → stop losing ~${fmtImpact(impact)} clicks`,
  };
}

export function summarizeLinkGaps(
  rows: Array<{ impressions: number }>,
): OrganicKpiSummary {
  const count = rows.length;
  if (count === 0) {
    return {
      kind: "link_gaps",
      count: 0,
      impact: 0,
      subline: "No link-gap pages in this window.",
    };
  }
  const impact = Math.round(rows.reduce((s, r) => s + r.impressions, 0));
  return {
    kind: "link_gaps",
    count,
    impact,
    subline: `Add links to ${count} pages ranking with ${fmtImpact(impact)} impressions`,
  };
}
