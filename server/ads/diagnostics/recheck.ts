/**
 * Re-check routing (web process). Small scopes go to the `ads_recheck` Sidequest job (coalesced
 * per site for a few seconds, deduped by issue / resource); big scopes — any account, or a
 * campaign / ad set with more than ADS_RECHECK_FORK_THRESHOLD ads — go to the fork lane.
 *
 * Only issues that make sense to check now are accepted: `instant` codes, or pending issues
 * that are ready to verify. Everything else is rejected with the reason (no job queued).
 */

import type { AdsCheckPlatform, AdsDiagnosticsJobRecord, AdsDiagnosticsRejectCode, AdsRecheckScope } from "@shared/ads-issues";
import type { StoredValidationIssue } from "../../../scripts/validation/shared/types";
import { enqueueJob } from "../../jobs/queue";
import { child } from "../../logger";
import { adIdsUnder, loadAdsSetup } from "../ads-setup";
import { getAdsCodeDefinition } from "./codes";
import { verifyContextFor } from "./context";
import type { PendingForVerify } from "./engine";
import { pendingForVerify, startAdsForkJob } from "./fork-service";
import { newAdsJobId, updateAdsJobRecord, writeAdsJobRecord } from "./jobs";
import { adsValidationCache } from "./save";
import { computeVerifyView } from "./verify";

const log = child({ module: "ads/diagnostics/recheck" });

/** Campaign / ad set Re-checks above this many ads run on the fork (accounts always do). */
export const ADS_RECHECK_FORK_THRESHOLD = 50;
/** Re-check requests within this window share one `ads_recheck` job per site. */
export const ADS_RECHECK_COALESCE_MS = 3000;
/** Meta ads re-read per Re-check (instant setup codes). */
const MAX_REFRESH_ADS = 200;

export type AdsRecheckPayload = {
  site: string;
  contentRoot?: string;
  job_id: string;
  scopes: AdsRecheckScope[];
  platforms: AdsCheckPlatform[];
  refreshMeta?: { ad_ids: string[]; issue_ids: string[] };
  /** Pending fresh_days issues in scope (captured when queued; newer actions win on save). */
  pending: PendingForVerify[];
  requested_by?: string | null;
  /** Re-enqueues while a full Run holds the lock. */
  deferrals?: number;
};

export type RecheckOutcome =
  | { ok: true; lane: "queue" | "fork"; job_id: string; coalesced?: boolean }
  | { ok: false; status: 404 | 409; code: AdsDiagnosticsRejectCode | "ads_run_busy" | "ads_sync_active"; message: string };

type Batch = {
  jobId: string;
  site: string;
  contentRoot?: string;
  scopes: AdsRecheckScope[];
  platforms: Set<AdsCheckPlatform>;
  refreshAds: Set<string>;
  refreshIssues: Set<string>;
  requestedBy: string | null;
  timer: ReturnType<typeof setTimeout>;
};

const batches = new Map<string, Batch>();

function platformOf(issue: StoredValidationIssue): AdsCheckPlatform {
  return issue.ads?.platform === "google" ? "google" : "meta";
}

function scopeKey(s: AdsRecheckScope): string {
  return s.type === "issue" ? `issue:${s.issue_id}` : `${s.platform}:${s.level}:${s.id}`;
}

/** A resource scope already in the batch covers issues under it. */
function covered(batch: Batch, scope: AdsRecheckScope, issue: StoredValidationIssue | null): boolean {
  const key = scopeKey(scope);
  if (batch.scopes.some((s) => scopeKey(s) === key)) return true;
  if (scope.type !== "issue" || !issue?.ads) return false;
  const a = issue.ads;
  return batch.scopes.some(
    (s) =>
      s.type === "resource" &&
      s.platform === platformOf(issue) &&
      (`${s.level}:${s.id}` === `${a.level}:${a.resource_id}` ||
        (s.level === "campaign" && a.campaign_id === s.id) ||
        (s.level === "adset" && a.adset_id === s.id) ||
        (s.level === "account" && a.account_id === s.id)),
  );
}

function adsInResource(site: string, scope: Extract<AdsRecheckScope, { type: "resource" }>): string[] {
  if (scope.level === "ad") return [scope.id];
  return adIdsUnder(loadAdsSetup(site, scope.platform), scope.level, scope.id);
}

export function requestAdsRecheck(input: { site: string; contentRoot?: string; scope: AdsRecheckScope; requestedBy?: string | null }): RecheckOutcome {
  const { site, scope } = input;
  const cache = adsValidationCache(site);
  let issue: StoredValidationIssue | null = null;
  let platform: AdsCheckPlatform;
  let big = false;
  let refreshAds: string[] = [];

  if (scope.type === "issue") {
    issue = cache?.getIssueById(scope.issue_id) ?? null;
    if (!issue?.ads) return { ok: false, status: 404, code: "ads_issue_not_found", message: "This issue is no longer open. Reload the page." };
    const view = computeVerifyView(issue, cache!.getCompletion(issue.id), verifyContextFor(site));
    if (view.state === "open" && view.verify.kind !== "instant") {
      return {
        ok: false,
        status: 409,
        code: "ads_recheck_not_instant",
        message: "This check needs new data to confirm a fix. Fix it, then use Mark as fixed — it confirms on its own schedule.",
      };
    }
    if (view.state === "pending" && !view.ready_to_verify) {
      return { ok: false, status: 409, code: "ads_recheck_not_ready", message: `Not ready to confirm yet: ${view.label}.` };
    }
    platform = platformOf(issue);
    big = issue.ads.level === "account" || issue.ads.affected_ads.length > ADS_RECHECK_FORK_THRESHOLD;
    const def = getAdsCodeDefinition(issue.validator, issue.code);
    if (platform === "meta" && def?.verify.kind === "instant") refreshAds = issue.ads.affected_ads.slice(0, MAX_REFRESH_ADS);
  } else {
    platform = scope.platform;
    const ads = adsInResource(site, scope);
    big = scope.level === "account" || ads.length > ADS_RECHECK_FORK_THRESHOLD;
    if (platform === "meta") refreshAds = ads.slice(0, MAX_REFRESH_ADS);
  }

  if (big) {
    const started = startAdsForkJob({
      site,
      contentRoot: input.contentRoot,
      kind: "recheck",
      mode: "scope",
      platforms: [platform],
      scopes: [scope],
      ...(refreshAds.length > 0 ? { refreshMeta: { ad_ids: refreshAds, issue_ids: issue ? [issue.id] : [] } } : {}),
      requestedBy: input.requestedBy ?? null,
    });
    if (!started.ok) return { ok: false, status: 409, code: started.code, message: started.message };
    return { ok: true, lane: "fork", job_id: started.job.job_id };
  }

  const existing = batches.get(site);
  if (existing) {
    if (!covered(existing, scope, issue)) {
      existing.scopes.push(scope);
      existing.platforms.add(platform);
      refreshAds.forEach((a) => existing.refreshAds.add(a));
      if (issue && refreshAds.length > 0) existing.refreshIssues.add(issue.id);
      updateAdsJobRecord(site, existing.jobId, { scopes: existing.scopes });
    }
    return { ok: true, lane: "queue", job_id: existing.jobId, coalesced: true };
  }

  const jobId = newAdsJobId("recheck");
  const record: AdsDiagnosticsJobRecord = {
    job_id: jobId,
    kind: "recheck",
    lane: "queue",
    status: "queued",
    requested_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    requested_by: input.requestedBy ?? null,
    scopes: [scope],
    checked: [],
    skipped: [],
  };
  writeAdsJobRecord(site, record);
  const batch: Batch = {
    jobId,
    site,
    contentRoot: input.contentRoot,
    scopes: [scope],
    platforms: new Set([platform]),
    refreshAds: new Set(refreshAds),
    refreshIssues: new Set(issue && refreshAds.length > 0 ? [issue.id] : []),
    requestedBy: input.requestedBy ?? null,
    timer: setTimeout(() => flushBatch(site), ADS_RECHECK_COALESCE_MS),
  };
  batch.timer.unref?.();
  batches.set(site, batch);
  return { ok: true, lane: "queue", job_id: jobId };
}

function flushBatch(site: string): void {
  const b = batches.get(site);
  if (!b) return;
  batches.delete(site);
  const payload: AdsRecheckPayload = {
    site,
    contentRoot: b.contentRoot,
    job_id: b.jobId,
    scopes: b.scopes,
    platforms: Array.from(b.platforms),
    pending: pendingForScopes(site, b.scopes),
    ...(b.refreshAds.size > 0 ? { refreshMeta: { ad_ids: Array.from(b.refreshAds), issue_ids: Array.from(b.refreshIssues) } } : {}),
    requested_by: b.requestedBy,
  };
  void enqueueJob("ads_recheck", payload as unknown as Record<string, unknown>)
    .then((r) => {
      if (!r.queued) updateAdsJobRecord(site, b.jobId, { status: "failed", finished_at: new Date().toISOString(), error: "Couldn't queue the Re-check. Try again." });
    })
    .catch((err) => {
      log.error({ err, site }, "[ads-recheck] enqueue failed");
      updateAdsJobRecord(site, b.jobId, { status: "failed", finished_at: new Date().toISOString(), error: "Couldn't queue the Re-check. Try again." });
    });
}

/** Pending fresh_days issues in the Re-check scope (worker judges them on post-fix days). */
export function pendingForScopes(site: string, scopes: AdsRecheckScope[]): PendingForVerify[] {
  const ids = new Set(scopes.filter((s): s is Extract<AdsRecheckScope, { type: "issue" }> => s.type === "issue").map((s) => s.issue_id));
  const resources = scopes.filter((s): s is Extract<AdsRecheckScope, { type: "resource" }> => s.type === "resource");
  return pendingForVerify(site).filter(
    ({ issue }) =>
      ids.has(issue.id) ||
      resources.some((r) => issue.ads && (`${issue.ads.level}:${issue.ads.resource_id}` === `${r.level}:${r.id}` || issue.ads.campaign_id === r.id || issue.ads.adset_id === r.id)),
  );
}

export function resetRecheckBatchesForTests(): void {
  for (const b of Array.from(batches.values())) clearTimeout(b.timer);
  batches.clear();
}
