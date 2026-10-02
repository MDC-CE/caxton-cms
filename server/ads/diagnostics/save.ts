/**
 * Web-process save step: Ads job results → validation cache (single writer).
 * Groups findings against the current cache (sticky groups, safe merge), plans the batch with
 * the race rule / pending carry-over / archive resolutions, then writes and flushes once.
 */

import fs from "fs";
import type { StoredValidationIssue } from "../../../scripts/validation/shared/types";
import type { AdsIssueCheckNote } from "@shared/ads-issues";
import type { ValidationCacheService } from "../../services/validationCacheService";
import { getSiteContextMap } from "../../site-manager";
import { child } from "../../logger";
import { planAdsApply, type AdsApplyScope, type AdsApplySummary } from "./apply";
import { makeResourceGoneCheck, verifyContextFor } from "./context";
import { groupFindings, universeAdsUnder, type AdsIssueDraft } from "./grouping";
import { listAdsJobResultFiles, updateAdsJobRecord, type AdsJobResult } from "./jobs";
import { isReadyToVerify } from "./verify";

const log = child({ module: "ads/diagnostics/save" });

export function adsValidationCache(site: string): ValidationCacheService | null {
  for (const ctx of Array.from(getSiteContextMap().values())) {
    if (ctx.contentRootName === site || ctx.config.contentFolder === site) return ctx.validationCache;
  }
  return null;
}

function touchedIds(cache: ValidationCacheService, issues: StoredValidationIssue[]): Set<string> {
  const out = new Set<string>();
  for (const i of issues) {
    if (cache.getCompletion(i.id) || cache.getActiveClaim(i.id) || cache.getAttempts(i.id).length > 0) out.add(i.id);
  }
  return out;
}

/** Existing issues + ads a Re-check scope covers. */
export function scopeFor(result: AdsJobResult, existing: StoredValidationIssue[], drafts: AdsIssueDraft[]): AdsApplyScope | undefined {
  if (result.mode !== "scope" || !result.scopes) return undefined;
  const issueIds = new Set<string>();
  const adIds = new Set<string>();
  let resourceKey: string | null = null;
  for (const s of result.scopes) {
    if (s.type === "issue") {
      issueIds.add(s.issue_id);
      continue;
    }
    resourceKey = `${s.level}:${s.id}`;
    universeAdsUnder(result.universe, s.level, s.id).forEach((a) => adIds.add(a));
    for (const i of existing) {
      const a = i.ads;
      if (!a) continue;
      const platformMatch = s.platform === "google" ? a.platform === "google" : a.platform !== "google";
      if (!platformMatch) continue;
      if (`${a.level}:${a.resource_id}` === resourceKey || a.affected_ads.some((x) => adIds.has(x))) issueIds.add(i.id);
    }
  }
  // Group drafts that now cover scoped ads replace scoped ad issues (superseded) — keep their ids in scope.
  for (const d of drafts) if (d.affected_ads.some((x) => adIds.has(x))) issueIds.add(d.id);
  return { issueIds, adIds, resourceKey };
}

export type AdsSaveOutcome = { summary: AdsApplySummary; couldnt_check: number };

export async function applyAdsJobResult(site: string, result: AdsJobResult, cache = adsValidationCache(site)): Promise<AdsSaveOutcome> {
  if (!cache) throw new Error(`No validation cache for site ${site}`);
  const existing = cache.getAdsIssues();
  const touched = touchedIds(cache, existing);
  const prior = existing.filter((i): i is StoredValidationIssue & { ads: NonNullable<StoredValidationIssue["ads"]> } => !!i.ads);
  const { drafts, superseded } = groupFindings({ findings: result.findings, universe: result.universe, prior, touched });
  const ctx = verifyContextFor(site);
  const completions = cache.getCompletions();
  const claims: Record<string, ReturnType<ValidationCacheService["getActiveClaim"]>> = {};
  for (const i of existing) claims[i.id] = cache.getActiveClaim(i.id);
  const couldnt = new Map((result.couldnt_check ?? []).map((c) => [c.issue_id, c.message]));
  const scope = scopeFor(result, existing, drafts);
  if (scope) for (const id of Array.from(couldnt.keys())) scope.issueIds.delete(id);

  const plan = planAdsApply({
    mode: result.mode,
    runStartedAt: result.started_at,
    nowIso: new Date().toISOString(),
    window: result.window,
    checked: result.checked,
    drafts,
    superseded,
    existing,
    completions,
    claims,
    isReady: (issue, completion) => isReadyToVerify(issue, completion, ctx),
    postFix: result.post_fix,
    isResourceGone: makeResourceGoneCheck(site),
    scope,
    actorLabel: result.kind === "run" ? "ads-run" : "ads-recheck",
  });

  // Couldn't check: leave the issue as it was, with a note (no failed attempt).
  const nowIso = new Date().toISOString();
  for (const [id, message] of Array.from(couldnt.entries())) {
    const issue = cache.getIssueById(id);
    if (!issue?.ads) continue;
    const note: AdsIssueCheckNote = { at: nowIso, outcome: "couldnt_check", message };
    plan.changes.upserts.push({ ...issue, ads: { ...issue.ads, last_check: note, last_action_at: nowIso } });
  }
  // Re-check outcome notes count as a human-triggered action (newer Runs only override after it).
  if (result.kind === "recheck") {
    plan.changes.upserts = plan.changes.upserts.map((u) =>
      u.ads && scope?.issueIds.has(u.id) ? { ...u, ads: { ...u.ads, last_action_at: u.ads.last_action_at && u.ads.last_action_at > nowIso ? u.ads.last_action_at : nowIso } } : u,
    );
  }

  cache.applyAdsChanges(plan.changes);
  await cache.flush();
  return { summary: plan.summary, couldnt_check: couldnt.size };
}

let applying = new Set<string>();

/** Save every finished job result waiting on disk (fork completions + ads_recheck jobs). */
export async function processPendingAdsResults(site: string): Promise<number> {
  if (applying.has(site)) return 0;
  applying.add(site);
  let n = 0;
  try {
    for (const file of listAdsJobResultFiles(site)) {
      let result: AdsJobResult;
      try {
        result = JSON.parse(fs.readFileSync(file, "utf-8")) as AdsJobResult;
      } catch (err) {
        log.warn({ err, file }, "[ads-save] unreadable result file; removing");
        fs.rmSync(file, { force: true });
        continue;
      }
      try {
        const outcome = await applyAdsJobResult(site, result);
        updateAdsJobRecord(site, result.job_id, {
          status: "completed",
          finished_at: new Date().toISOString(),
          started_at: result.started_at,
          checked: result.checked_platforms,
          skipped: result.skipped,
          ...(result.validator_errors.length > 0 ? { validator_errors: result.validator_errors } : {}),
          summary: outcome.summary,
        });
        n += 1;
      } catch (err) {
        log.error({ err, site, job: result.job_id }, "[ads-save] saving Ads results failed");
        updateAdsJobRecord(site, result.job_id, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: `Saving the results failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      fs.rmSync(file, { force: true });
    }
  } finally {
    applying.delete(site);
  }
  return n;
}

export function resetAdsSaveStateForTests(): void {
  applying = new Set();
}
