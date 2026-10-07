/**
 * Run history for one-time data migrations (table `data_migration_runs` in data/<site>/app.db).
 * Completed = a real run that exited 0, or a "mark as done". Dry, failed, timed-out and
 * interrupted runs are logged but never count as completed.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";
import { getSiteSqlite } from "../db";
import { ensurePipelineDb } from "../pipeline-db/runner";
import { child } from "../logger";

const log = child({ module: "data-migrations/ledger" });

export const MAX_OUTPUT_BYTES = 64 * 1024;

export type RunMode = "run" | "dry_run" | "mark_done";
export type RunStatus = "running" | "succeeded" | "failed" | "timed_out" | "interrupted";

export type MigrationRun = {
  id: string;
  filename: string;
  mode: RunMode;
  status: RunStatus;
  actor: string | null;
  started_at: number;
  finished_at: number | null;
  exit_code: number | null;
  output: string | null;
  note: string | null;
  file_sha: string | null;
};

export function ledgerDb(site: string): Database.Database {
  ensurePipelineDb(site);
  return getSiteSqlite(site);
}

export function fileSha(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Keeps the tail of long output; the end of a run is where failures show up. */
export function truncateOutput(output: string): string {
  if (Buffer.byteLength(output, "utf8") <= MAX_OUTPUT_BYTES) return output;
  const tail = Buffer.from(output, "utf8").subarray(-MAX_OUTPUT_BYTES).toString("utf8");
  return `…(output truncated; showing the last ${Math.round(MAX_OUTPUT_BYTES / 1024)} KB)\n${tail}`;
}

function newId(): string {
  return crypto.randomUUID();
}

export function isRunning(db: Database.Database, filename: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM data_migration_runs WHERE filename = ? AND status = 'running' LIMIT 1`)
    .get(filename);
  return !!row;
}

/**
 * Inserts a `running` row unless one is already active for this file.
 * Returns the run id, or null when another run is in progress.
 */
export function startRun(
  db: Database.Database,
  opts: { filename: string; mode: "run" | "dry_run"; actor: string | null; fileSha: string | null; now?: number },
): string | null {
  const tx = db.transaction(() => {
    if (isRunning(db, opts.filename)) return null;
    const id = newId();
    db.prepare(
      `INSERT INTO data_migration_runs (id, filename, mode, status, actor, started_at, file_sha)
       VALUES (?, ?, ?, 'running', ?, ?, ?)`,
    ).run(id, opts.filename, opts.mode, opts.actor, opts.now ?? Date.now(), opts.fileSha);
    return id;
  });
  return tx.immediate();
}

export function finishRun(
  db: Database.Database,
  id: string,
  opts: { status: Exclude<RunStatus, "running">; exitCode: number | null; output: string; now?: number },
): void {
  db.prepare(
    `UPDATE data_migration_runs
     SET status = ?, exit_code = ?, output = ?, finished_at = ?
     WHERE id = ? AND status = 'running'`,
  ).run(opts.status, opts.exitCode, truncateOutput(opts.output), opts.now ?? Date.now(), id);
}

/** Saves partial output while a long run is still going, so the page can show progress. */
export function updateRunningOutput(db: Database.Database, id: string, output: string): void {
  db.prepare(`UPDATE data_migration_runs SET output = ? WHERE id = ? AND status = 'running'`).run(
    truncateOutput(output),
    id,
  );
}

export function markDone(
  db: Database.Database,
  opts: { filename: string; actor: string | null; note?: string | null; fileSha: string | null; now?: number },
): MigrationRun {
  const id = newId();
  const now = opts.now ?? Date.now();
  db.prepare(
    `INSERT INTO data_migration_runs (id, filename, mode, status, actor, started_at, finished_at, note, file_sha)
     VALUES (?, ?, 'mark_done', 'succeeded', ?, ?, ?, ?, ?)`,
  ).run(id, opts.filename, opts.actor, now, now, opts.note?.trim() || null, opts.fileSha);
  return getRun(db, id)!;
}

export function getRun(db: Database.Database, id: string): MigrationRun | null {
  return (db.prepare(`SELECT * FROM data_migration_runs WHERE id = ?`).get(id) as MigrationRun | undefined) ?? null;
}

/** Most recent row of any mode (what the "last output" panel shows). */
export function latestFor(db: Database.Database, filename: string): MigrationRun | null {
  return (
    (db
      .prepare(`SELECT * FROM data_migration_runs WHERE filename = ? ORDER BY started_at DESC, rowid DESC LIMIT 1`)
      .get(filename) as MigrationRun | undefined) ?? null
  );
}

/** Most recent completion (real run that succeeded, or mark as done). */
export function completedRun(db: Database.Database, filename: string): MigrationRun | null {
  return (
    (db
      .prepare(
        `SELECT * FROM data_migration_runs
         WHERE filename = ? AND status = 'succeeded' AND mode IN ('run', 'mark_done')
         ORDER BY COALESCE(finished_at, started_at) DESC, rowid DESC LIMIT 1`,
      )
      .get(filename) as MigrationRun | undefined) ?? null
  );
}

export function isCompleted(db: Database.Database, filename: string): boolean {
  return completedRun(db, filename) !== null;
}

/** True when the file's fingerprint differs from the one stored at completion. */
export function changedSinceCompleted(db: Database.Database, filename: string, currentSha: string): boolean {
  const done = completedRun(db, filename);
  return !!done && !!done.file_sha && done.file_sha !== currentSha;
}

/** Rows left `running` by a previous process can never finish; mark them interrupted. */
export function markInterrupted(db: Database.Database, now = Date.now()): number {
  return db
    .prepare(
      `UPDATE data_migration_runs
       SET status = 'interrupted', finished_at = ?,
           output = COALESCE(output, '') || 'Interrupted: the server restarted before this run finished.'
       WHERE status = 'running'`,
    )
    .run(now).changes;
}

export function markInterruptedOnBoot(sites: string[]): void {
  for (const site of sites) {
    try {
      const changed = markInterrupted(ledgerDb(site));
      if (changed > 0) log.warn({ site, changed }, "[data-migrations] marked leftover runs as interrupted");
    } catch (err) {
      log.error({ err, site }, "[data-migrations] could not mark interrupted runs");
    }
  }
}
