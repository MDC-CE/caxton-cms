/**
 * Lightweight read-only lookups against the Sidequest queue DB and worker PID/heartbeat,
 * for features that need to explain a job's fate (e.g. Ads refresh status).
 */

import fs from "fs";
import Database from "better-sqlite3";
import { isProcessAlive, readSidequestHeartbeat, readSidequestWorkerPid, SIDEQUEST_DB_PATH } from "./queue";

export type JobRowSummary = {
  id: number;
  state: string;
  args: unknown;
  error: string | null;
  inserted_at: number | null;
  attempted_at: number | null;
  completed_at: number | null;
  failed_at: number | null;
  canceled_at: number | null;
};

function toMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function lastErrorMessage(raw: unknown): string | null {
  const parsed = parseJson(raw);
  if (Array.isArray(parsed) && parsed.length > 0) {
    const last = parsed[parsed.length - 1] as { message?: unknown };
    if (typeof last?.message === "string" && last.message.trim()) return last.message.split("\n")[0].trim();
  }
  return typeof raw === "string" && raw.trim() ? raw.split("\n")[0].trim().slice(0, 300) : null;
}

/** Newest rows for a job class inserted at/after `sinceMs` (newest first). Never throws. */
export function latestJobRows(className: string, sinceMs: number, limit = 10): JobRowSummary[] {
  if (!fs.existsSync(SIDEQUEST_DB_PATH)) return [];
  let db: Database.Database | null = null;
  try {
    db = new Database(SIDEQUEST_DB_PATH, { readonly: true, fileMustExist: true });
    db.pragma("busy_timeout = 500");
    const rows = db
      .prepare(
        `SELECT id, state, args, errors, inserted_at, attempted_at, completed_at, failed_at, canceled_at
         FROM sidequest_jobs WHERE class = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(className, limit) as Array<Record<string, unknown>>;
    return rows
      .map((r) => ({
        id: Number(r.id),
        state: String(r.state),
        args: parseJson(r.args),
        error: lastErrorMessage(r.errors),
        inserted_at: toMs(r.inserted_at),
        attempted_at: toMs(r.attempted_at),
        completed_at: toMs(r.completed_at),
        failed_at: toMs(r.failed_at),
        canceled_at: toMs(r.canceled_at),
      }))
      .filter((r) => r.inserted_at === null || r.inserted_at >= sinceMs);
  } catch {
    return [];
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

export function isSidequestWorkerAlive(): boolean {
  const pid = readSidequestWorkerPid();
  return pid !== null && isProcessAlive(pid);
}

/** Job type the worker is running right now (from its heartbeat), when the worker is alive. */
export function currentWorkerJob(): string | undefined {
  if (!isSidequestWorkerAlive()) return undefined;
  return readSidequestHeartbeat().payload?.currentJob;
}
