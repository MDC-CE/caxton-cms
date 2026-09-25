export type ProposalBulkDeleteResult = {
  id: string;
  status: "deleted" | "not_found" | "blocked_dependents" | "error";
  reason?: string;
  dependents?: Array<{ id: string; title: string }>;
  drafts_removed: string[];
  drafts_unlinked: string[];
  drafts_kept: string[];
};

export type ProposalBulkDeleteSummary = {
  deleted: number;
  blocked: number;
  failed: number;
  draftsKept: number;
  /** One-line headline, e.g. "Deleted 3 · 1 blocked · 2 drafts kept because others edited them". */
  headline: string;
  /** Plain lines naming blocked ideas (with their open proposals) and failures. */
  details: string[];
};

export function summarizeProposalBulkDelete(
  results: ProposalBulkDeleteResult[],
  titleFor: (id: string) => string | undefined = () => undefined,
): ProposalBulkDeleteSummary {
  const deleted = results.filter((r) => r.status === "deleted").length;
  const blockedRows = results.filter((r) => r.status === "blocked_dependents");
  const failedRows = results.filter((r) => r.status === "error" || r.status === "not_found");
  const draftsKept = results.reduce((n, r) => n + (r.drafts_kept?.length ?? 0), 0);

  const parts = [`Deleted ${deleted}`];
  if (blockedRows.length) parts.push(`${blockedRows.length} blocked`);
  if (failedRows.length) parts.push(`${failedRows.length} failed`);
  if (draftsKept) {
    parts.push(`${draftsKept} draft${draftsKept === 1 ? "" : "s"} kept because others edited them`);
  }

  const label = (id: string) => titleFor(id) ?? id.slice(0, 8);
  const details: string[] = [];
  for (const r of blockedRows) {
    const deps = (r.dependents ?? []).map((d) => `"${d.title || d.id.slice(0, 8)}"`).join(", ");
    details.push(
      `"${label(r.id)}" still has open proposals building on it: ${deps}. Select those too and delete again.`,
    );
  }
  for (const r of failedRows) {
    details.push(
      r.status === "not_found"
        ? `"${label(r.id)}" was already gone.`
        : `"${label(r.id)}" was not deleted: ${r.reason ?? "unknown error"}`,
    );
  }

  return {
    deleted,
    blocked: blockedRows.length,
    failed: failedRows.length,
    draftsKept,
    headline: parts.join(" · "),
    details,
  };
}
