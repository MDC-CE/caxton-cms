/**
 * Mark as fixed / Undo for Ads issues (POST /api/diagnostics/ads/mark-fixed | /undo).
 * Mark puts a non-instant issue into pending verification (completion.verify); it is not
 * resolved until a Run / Re-check confirms it. Instant checks use Re-check instead.
 */

import type { AdsIssueVerifyView } from "@shared/ads-issues";
import type { ValidationIssueActor } from "../../../scripts/validation/shared/types";
import { verifyContextFor } from "./context";
import { adsValidationCache } from "./save";
import { completionVerifyFor, computeVerifyView } from "./verify";

export type AdsActionResult =
  | { ok: true; issue_id: string; verify: AdsIssueVerifyView }
  | { ok: false; status: 400 | 404 | 409; code: string; message: string };

export async function markAdsIssueFixed(input: {
  site: string;
  issueId: string;
  by: string;
  actor?: ValidationIssueActor;
  report?: string;
  now?: Date;
}): Promise<AdsActionResult> {
  const cache = adsValidationCache(input.site);
  const issue = cache?.getIssueById(input.issueId);
  if (!cache || !issue?.ads) return { ok: false, status: 404, code: "ads_issue_not_found", message: "This issue is no longer open. Reload the page." };
  if (input.actor?.type === "mcp" && !input.report?.trim()) {
    return { ok: false, status: 400, code: "ads_report_required", message: "Agents must send a report: what was changed in the ad platform and where." };
  }
  if (cache.getCompletion(issue.id)?.verify) {
    return { ok: false, status: 409, code: "ads_already_pending", message: "Already marked as fixed and waiting to confirm." };
  }
  const ctx = verifyContextFor(input.site, input.now);
  const markedAt = (input.now ?? new Date()).toISOString();
  const verify = completionVerifyFor(issue, markedAt, ctx.timeZoneFor(issue));
  if (!verify) {
    return { ok: false, status: 409, code: "ads_mark_not_needed", message: "This check confirms right away. Fix it, then press Re-check." };
  }
  const completion = {
    completedBy: input.by,
    completedAt: markedAt,
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.report?.trim() ? { report: input.report.trim() } : {}),
    verify,
  };
  cache.setAdsPending(issue.id, completion);
  await cache.flush();
  return { ok: true, issue_id: issue.id, verify: computeVerifyView(cache.getIssueById(issue.id) ?? issue, completion, ctx) };
}

export async function undoAdsIssueFixed(input: { site: string; issueId: string; now?: Date }): Promise<AdsActionResult> {
  const cache = adsValidationCache(input.site);
  const issue = cache?.getIssueById(input.issueId);
  if (!cache || !issue?.ads) return { ok: false, status: 404, code: "ads_issue_not_found", message: "This issue is no longer open. Reload the page." };
  if (!cache.getCompletion(issue.id)?.verify) {
    return { ok: false, status: 409, code: "ads_not_pending", message: "This issue isn't marked as fixed." };
  }
  const at = (input.now ?? new Date()).toISOString();
  cache.clearAdsPending(issue.id, at);
  await cache.flush();
  return { ok: true, issue_id: issue.id, verify: computeVerifyView(cache.getIssueById(issue.id) ?? issue, undefined, verifyContextFor(input.site, input.now)) };
}
