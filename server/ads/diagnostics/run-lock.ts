/**
 * Cross-process marker for an active Ads diagnostics fork job (full Run or big-scope Re-check).
 *
 * The fork is spawned by the web process; Sync and `ads_recheck` run in the Sidequest worker
 * process, so they read this file (pid + start time) instead of in-memory state. A lock whose
 * pid is gone, or older than the fork idle limit, is treated as stale.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../../db-cache";

export const ADS_DIAGNOSTICS_DIR = "ads-diagnostics";
const LOCK_FILE = "run.lock";
/** Matches the fork idle timeout — a lock older than this is a crashed parent. */
export const ADS_RUN_LOCK_STALE_MS = 20 * 60 * 1000;

export type AdsRunLock = { job_id: string; pid: number; started_at: string; mode: "full" | "scope" };

export function adsDiagnosticsDir(site: string): string {
  return path.join(CACHE_DIR, site, ADS_DIAGNOSTICS_DIR);
}

function lockPath(site: string): string {
  return path.join(adsDiagnosticsDir(site), LOCK_FILE);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readAdsRunLock(site: string, now = Date.now()): AdsRunLock | null {
  try {
    const raw = fs.readFileSync(lockPath(site), "utf-8");
    const lock = JSON.parse(raw) as AdsRunLock;
    const age = now - Date.parse(lock.started_at);
    if (!Number.isFinite(age) || age > ADS_RUN_LOCK_STALE_MS || !pidAlive(lock.pid)) return null;
    return lock;
  } catch {
    return null;
  }
}

export function isAdsRunActive(site: string): boolean {
  return readAdsRunLock(site) != null;
}

export function writeAdsRunLock(site: string, lock: AdsRunLock): void {
  fs.mkdirSync(adsDiagnosticsDir(site), { recursive: true });
  fs.writeFileSync(lockPath(site), JSON.stringify(lock), "utf-8");
}

export function clearAdsRunLock(site: string, jobId?: string): void {
  try {
    if (jobId) {
      const raw = JSON.parse(fs.readFileSync(lockPath(site), "utf-8")) as AdsRunLock;
      if (raw.job_id !== jobId) return;
    }
    fs.unlinkSync(lockPath(site));
  } catch {
    /* already gone */
  }
}

/** Poll until no Run holds the lock (or `maxMs` passes). Used by Sync before it writes day files. */
export async function waitForAdsRunToFinish(site: string, opts: { maxMs?: number; pollMs?: number } = {}): Promise<boolean> {
  const maxMs = opts.maxMs ?? ADS_RUN_LOCK_STALE_MS;
  const pollMs = opts.pollMs ?? 5000;
  const start = Date.now();
  while (isAdsRunActive(site)) {
    if (Date.now() - start > maxMs) return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return true;
}
