/**
 * Ads check engine: runs the platform validators over the fixed issue window and judges pending
 * (marked fixed) issues on post-fix days. Runs inside the Ads fork worker (full Runs, big
 * Re-checks) or the `ads_recheck` Sidequest job (small Re-checks). Never writes the validation
 * cache — the web process saves the returned `AdsJobResult`.
 */

import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsCheckPlatform, AdsRecheckScope, AdsRunSkip } from "@shared/ads-issues";
import type { StoredValidationIssue, ValidationIssueCompletion } from "../../../scripts/validation/shared/types";
import { buildAdsDiagnostics, type MetaChecks } from "../ads-diagnostics";
import { buildGoogleAdsDiagnostics, type GoogleChecks } from "../google-ads-diagnostics";
import { loadMetaState } from "../meta-ads-days";
import { refreshAdSetup, type RefreshAdSetupResult } from "../ads-setup";
import { child } from "../../logger";
import type { ContentIndex } from "../../content-index";
import type { AdsCheckedMap } from "./apply";
import { assertDeclaredCodes, getAdsCodeDefinition, type AdsValidatorName } from "./codes";
import { verifyContextFor } from "./context";
import { findingsFromIssues, subjectFromIssue, type AdsFinding, type AdsUniverse } from "./grouping";
import type { AdsJobResult } from "./jobs";
import { freshDaysStatus } from "./verify";

const log = child({ module: "ads/diagnostics/engine" });

/** Codes still evaluated while Meta rejects our access (they explain why the rest is skipped). */
const META_ACCESS_CODES = ["meta_access_failed", "meta_sync_failing"];

export type PendingForVerify = { issue: StoredValidationIssue; completion: ValidationIssueCompletion };

export type AdsEngineDeps = {
  buildMeta: typeof buildAdsDiagnostics;
  buildGoogle: typeof buildGoogleAdsDiagnostics;
  refreshMetaSetup: (site: string, adIds: string[]) => Promise<RefreshAdSetupResult>;
  metaAccessFailed: (site: string) => string | null;
};

const defaultDeps: AdsEngineDeps = {
  buildMeta: buildAdsDiagnostics,
  buildGoogle: buildGoogleAdsDiagnostics,
  refreshMetaSetup: (site, adIds) => refreshAdSetup(site, "meta", adIds),
  metaAccessFailed: (site) => {
    const s = loadMetaState(site);
    return s.last_error && (s.last_error_kind === "auth" || s.last_error_kind === "permission") ? s.last_error : null;
  },
};

export type RunAdsChecksInput = {
  site: string;
  contentRoot?: string;
  jobId: string;
  kind: AdsJobResult["kind"];
  mode: AdsJobResult["mode"];
  platforms: AdsCheckPlatform[];
  /** Pending fresh_days issues to judge on post-fix days. */
  pending: PendingForVerify[];
  scopes?: AdsRecheckScope[];
  /** Instant Meta Re-checks: re-read these ads from Meta first (short timeout). */
  refreshMeta?: { ad_ids: string[]; issue_ids: string[] };
  requestedBy?: string | null;
  /** Worker processes pass a light content index for the site. */
  contentIndex?: ContentIndex;
  now?: Date;
  onStep?: (message: string) => void;
};

/** Same code on the same resource / ads / subject. */
export function matchesIssue(issue: StoredValidationIssue, found: AdsIssue[]): boolean {
  const a = issue.ads;
  if (!a) return false;
  const sameCode = found.filter((f) => f.code === issue.code);
  if (sameCode.length === 0) return false;
  if (a.affected_ads.length > 0) {
    const ads = new Set(a.affected_ads);
    return sameCode.some((f) => (f.details?.ads ?? []).some((x) => ads.has(x.ad_id)));
  }
  if (a.level === "account") return sameCode.some((f) => f.scope.account_id === a.resource_id);
  if (a.level === "campaign") return sameCode.some((f) => f.scope.campaign_id === a.resource_id);
  if (a.level === "none") return sameCode.some((f) => (subjectFromIssue(f) ?? null) === (a.subject ?? null));
  return true;
}

function guard(validator: AdsValidatorName, findings: AdsFinding[], checked: AdsCheckedMap, errors: AdsJobResult["validator_errors"]): AdsFinding[] {
  try {
    assertDeclaredCodes(
      validator,
      findings.map((f) => f.issue.code),
    );
    return findings;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ validator, err }, "[ads-engine] validator emitted undeclared codes; its results are not applied");
    errors.push({ validator, error: message });
    delete checked[validator];
    return [];
  }
}

export async function runAdsChecks(input: RunAdsChecksInput, deps: AdsEngineDeps = defaultDeps): Promise<AdsJobResult> {
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  const checked: AdsCheckedMap = {};
  const skipped: AdsRunSkip[] = [];
  const errors: AdsJobResult["validator_errors"] = [];
  const findings: AdsFinding[] = [];
  let universe: AdsUniverse = { ads: [], account_names: {} };
  let window: AdsJobResult["window"] | null = null;
  const couldnt: NonNullable<AdsJobResult["couldnt_check"]> = [];

  if (input.refreshMeta && input.refreshMeta.ad_ids.length > 0) {
    input.onStep?.("Re-reading the ads from Meta");
    const r = await deps.refreshMetaSetup(input.site, input.refreshMeta.ad_ids);
    if (!r.ok) {
      const message = `Couldn't check: Meta didn't answer (${r.error}). Nothing changed. Try Re-check again later.`;
      for (const id of input.refreshMeta.issue_ids) couldnt.push({ issue_id: id, message });
    }
  }

  let meta: MetaChecks | null = null;
  if (input.platforms.includes("meta")) {
    input.onStep?.("Checking Meta ads");
    try {
      meta = await deps.buildMeta({ site: input.site, contentRoot: input.contentRoot, contentIndex: input.contentIndex, now });
      window = meta.window;
      universe = meta.universe;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ err }, "[ads-engine] Meta checks failed");
      skipped.push({ platform: "meta", reason: `The Meta checks failed: ${message}` });
    }
    if (meta) {
      const accessError = deps.metaAccessFailed(input.site);
      if (!meta.connected) {
        skipped.push({ platform: "meta", reason: "Meta isn't connected" });
      } else if (accessError) {
        checked["ads-meta"] = [...META_ACCESS_CODES];
        skipped.push({ platform: "meta", reason: `Meta rejected our access (${accessError}); only the access check ran` });
      } else {
        checked["ads-meta"] = "all";
      }
      checked["ads-shared"] = "all";
      const metaIssues = meta.issues.filter((i) => i.platform !== "shared");
      const sharedIssues = meta.issues.filter((i) => i.platform === "shared");
      if (checked["ads-meta"]) findings.push(...guard("ads-meta", findingsFromIssues("ads-meta", "meta", metaIssues), checked, errors));
      findings.push(...guard("ads-shared", findingsFromIssues("ads-shared", "shared", sharedIssues), checked, errors));
    }
  }

  let google: GoogleChecks | null = null;
  if (input.platforms.includes("google")) {
    input.onStep?.("Checking Google Ads");
    try {
      google = await deps.buildGoogle({ site: input.site, contentRoot: input.contentRoot, contentIndex: input.contentIndex, now });
      window ??= google.window;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ err }, "[ads-engine] Google checks failed");
      skipped.push({ platform: "google", reason: `The Google checks failed: ${message}` });
    }
    if (google) {
      if (!google.connected) {
        skipped.push({ platform: "google", reason: "Google Ads isn't connected" });
      } else {
        checked["ads-google"] = "all";
        findings.push(...guard("ads-google", findingsFromIssues("ads-google", "google", google.issues), checked, errors));
      }
    }
  }

  // Pending fresh_days issues: judge on post-fix days only (enough data → pass / fail, early fail allowed).
  const postFix: Record<string, "found" | "not_found"> = {};
  const ctx = verifyContextFor(input.site, now);
  const postBuilds = new Map<string, Promise<AdsIssue[] | null>>();
  for (const { issue, completion } of input.pending) {
    const def = getAdsCodeDefinition(issue.validator, issue.code);
    if (!def || def.verify.kind !== "fresh_days" || !def.min_data || !completion.verify) continue;
    if (!checked[issue.validator as AdsValidatorName]) continue;
    const st = freshDaysStatus(issue, completion, def.verify, def.min_data, ctx);
    if (!st.min_data_met || st.window_start > st.until) continue;
    const platform = issue.ads?.platform === "google" ? "google" : "meta";
    const key = `${platform}|${st.window_start}|${st.until}`;
    if (!postBuilds.has(key)) {
      input.onStep?.(`Checking the days after a fix (${st.window_start} → ${st.until})`);
      const win = { since: st.window_start, until: st.until };
      postBuilds.set(
        key,
        (platform === "google"
          ? deps.buildGoogle({ site: input.site, contentRoot: input.contentRoot, contentIndex: input.contentIndex, window: win, now }).then((g) => g.issues)
          : deps.buildMeta({ site: input.site, contentRoot: input.contentRoot, contentIndex: input.contentIndex, window: win, now }).then((m) => m.issues)
        ).catch((err) => {
          log.warn({ err, key }, "[ads-engine] post-fix check failed");
          return null;
        }),
      );
    }
    const issues = await postBuilds.get(key)!;
    if (issues) postFix[issue.id] = matchesIssue(issue, issues) ? "found" : "not_found";
  }

  return {
    job_id: input.jobId,
    kind: input.kind,
    mode: input.mode,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    window: window ?? { start: startedAt.slice(0, 10), end: startedAt.slice(0, 10), days: 0 },
    checked,
    checked_platforms: input.platforms.filter((p) => !skipped.some((s) => s.platform === p && !(p === "meta" && checked["ads-meta"]))),
    skipped,
    validator_errors: errors,
    findings,
    universe,
    post_fix: postFix,
    ...(input.scopes ? { scopes: input.scopes } : {}),
    ...(couldnt.length > 0 ? { couldnt_check: couldnt } : {}),
    requested_by: input.requestedBy ?? null,
  };
}
