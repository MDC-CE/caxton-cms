/**
 * Ads diagnostics job records + result hand-off files.
 *
 * `.cache/{site}/ads-diagnostics/jobs/{job_id}.json` — one record per Run / Re-check (last 30).
 * `.cache/{site}/ads-diagnostics/results/{job_id}.json` — finished job output waiting for the web
 * process to save it into the validation cache (single writer). The fork parent saves right away;
 * `ads_recheck` results (Sidequest worker) are picked up by the job applier tick.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CACHE_DIR } from "../../db-cache";
import type { AdsCheckPlatform, AdsDiagnosticsJobRecord, AdsRecheckScope, AdsRunSkip } from "@shared/ads-issues";
import type { AdsCheckedMap } from "./apply";
import type { AdsFinding, AdsUniverse } from "./grouping";
import { adsDiagnosticsDir } from "./run-lock";

const MAX_JOB_RECORDS = 30;

/** Output of one Run / Re-check, saved by the web process. */
export type AdsJobResult = {
  job_id: string;
  kind: AdsDiagnosticsJobRecord["kind"];
  mode: "full" | "scope";
  started_at: string;
  finished_at: string;
  window: { start: string; end: string; days: number };
  checked: AdsCheckedMap;
  checked_platforms: AdsCheckPlatform[];
  skipped: AdsRunSkip[];
  validator_errors: Array<{ validator: string; error: string }>;
  findings: AdsFinding[];
  universe: AdsUniverse;
  /** fresh_days pending issues judged on post-fix days (min data reached). */
  post_fix: Record<string, "found" | "not_found">;
  scopes?: AdsRecheckScope[];
  /** Issues the Re-check could not evaluate (e.g. Meta unreachable) — left as-is with a note. */
  couldnt_check?: Array<{ issue_id: string; message: string }>;
  requested_by?: string | null;
};

function jobsDir(site: string): string {
  return path.join(adsDiagnosticsDir(site), "jobs");
}

export function adsResultsDir(site: string): string {
  return path.join(adsDiagnosticsDir(site), "results");
}

export function newAdsJobId(kind: AdsDiagnosticsJobRecord["kind"]): string {
  return `ads-${kind}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function writeAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf-8");
  fs.renameSync(tmp, file);
}

export function writeAdsJobRecord(site: string, record: AdsDiagnosticsJobRecord): void {
  writeAtomic(path.join(jobsDir(site), `${record.job_id}.json`), record);
  pruneJobRecords(site);
}

export function readAdsJobRecord(site: string, jobId: string): AdsDiagnosticsJobRecord | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(jobsDir(site), `${jobId}.json`), "utf-8")) as AdsDiagnosticsJobRecord;
  } catch {
    return null;
  }
}

export function updateAdsJobRecord(site: string, jobId: string, patch: Partial<AdsDiagnosticsJobRecord>): AdsDiagnosticsJobRecord | null {
  const cur = readAdsJobRecord(site, jobId);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  writeAdsJobRecord(site, next);
  return next;
}

/** Newest first. */
export function listAdsJobRecords(site: string): AdsDiagnosticsJobRecord[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(jobsDir(site)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: AdsDiagnosticsJobRecord[] = [];
  for (const n of names) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(jobsDir(site), n), "utf-8")) as AdsDiagnosticsJobRecord);
    } catch {
      /* skip unreadable */
    }
  }
  return out.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
}

function pruneJobRecords(site: string): void {
  const all = listAdsJobRecords(site);
  for (const r of all.slice(MAX_JOB_RECORDS)) {
    try {
      fs.unlinkSync(path.join(jobsDir(site), `${r.job_id}.json`));
    } catch {
      /* gone */
    }
  }
}

/** Latest finished full Run (completed), for "last Run" dates and not-checked platforms. */
export function latestCompletedRun(site: string): AdsDiagnosticsJobRecord | null {
  return listAdsJobRecords(site).find((r) => r.kind === "run" && r.status === "completed") ?? null;
}

export function activeAdsJobs(site: string): AdsDiagnosticsJobRecord[] {
  return listAdsJobRecords(site).filter((r) => r.status === "queued" || r.status === "running");
}

/**
 * Interrupted jobs (server restart / crashed fork) → failed. Issues are kept as they were.
 * `keep` = job ids still alive (e.g. queued ads_recheck jobs in the Sidequest queue).
 */
export function failInterruptedAdsJobs(site: string, opts: { lane?: "fork" | "queue"; keep?: Set<string> } = {}): number {
  let n = 0;
  for (const r of activeAdsJobs(site)) {
    if (opts.lane && r.lane !== opts.lane) continue;
    if (opts.keep?.has(r.job_id)) continue;
    writeAdsJobRecord(site, {
      ...r,
      status: "failed",
      finished_at: new Date().toISOString(),
      error: "Interrupted (server restarted). Issues were left as they were — start a new Run.",
    });
    n += 1;
  }
  return n;
}

export function writeAdsJobResult(site: string, result: AdsJobResult): string {
  const file = path.join(adsResultsDir(site), `${result.job_id}.json`);
  writeAtomic(file, result);
  return file;
}

/** Pending result files, oldest first. */
export function listAdsJobResultFiles(site: string): string[] {
  try {
    return fs
      .readdirSync(adsResultsDir(site))
      .filter((n) => n.endsWith(".json"))
      .map((n) => path.join(adsResultsDir(site), n))
      .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  } catch {
    return [];
  }
}

/** Files from the old live-build design (issue state + 30-minute snapshots). */
const LEGACY_ENTRIES = ["ads-issues.json", "ads-issues-google.json", "ads-diagnostics-snapshots"];

export function removeLegacyAdsDiagnosticsFiles(site: string): void {
  for (const name of LEGACY_ENTRIES) {
    try {
      fs.rmSync(path.join(CACHE_DIR, site, name), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
