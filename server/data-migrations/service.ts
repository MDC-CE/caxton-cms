/**
 * List, run and mark one-time data migrations (scripts/migrations/NNN_name.ts) with a per-site run history.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type Database from "better-sqlite3";
import { getPackageRoot, getProjectRoot } from "@shared/paths";
import { isLiveServer } from "../live-server";
import { child } from "../logger";
import {
  MIGRATION_FILENAME_RE,
  parseMigrationHeaders,
  recordingSiteFor,
  type MigrationHeaders,
} from "./headers";
import {
  changedSinceCompleted,
  completedRun,
  fileSha,
  finishRun,
  isRunning,
  latestFor,
  ledgerDb,
  markDone,
  startRun,
  updateRunningOutput,
  type MigrationRun,
  type RunStatus,
} from "./ledger";

const log = child({ module: "data-migrations" });

const OUTPUT_FLUSH_MS = 3000;
const KILL_GRACE_MS = 5000;
const MAX_BUFFERED_OUTPUT = 512 * 1024;

export type SpawnResult = { status: Exclude<RunStatus, "running">; exitCode: number | null; output: string };

export type SpawnScript = (opts: {
  fullPath: string;
  dryRun: boolean;
  env: NodeJS.ProcessEnv;
  timeoutSeconds: number;
  onOutput: (output: string) => void;
}) => Promise<SpawnResult>;

export type MigrationDeps = {
  migrationsDir: string;
  db: (site: string) => Database.Database;
  live: () => boolean;
  spawnScript: SpawnScript;
};

export type MigrationListItem = MigrationHeaders & {
  filename: string;
  recorded_in: string;
  blocked_here: boolean;
  completed: { by: string | null; at: number | null; mode: "run" | "mark_done"; note: string | null } | null;
  changed_since_completed: boolean;
  running: boolean;
  last_run: Pick<
    MigrationRun,
    "id" | "mode" | "status" | "actor" | "started_at" | "finished_at" | "exit_code" | "output" | "note"
  > | null;
};

export type MigrationActionError = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code: "invalid_filename" | "not_found" | "dry_run_unsupported" | "production_only" | "already_running" | "already_completed";
  error: string;
};

export const PRODUCTION_ONLY_MESSAGE = "Only runs in production. Use Dry run here to test.";

function readMigration(deps: MigrationDeps, filename: string) {
  const fullPath = path.join(deps.migrationsDir, filename);
  const content = fs.readFileSync(fullPath, "utf-8");
  return { fullPath, content, headers: parseMigrationHeaders(filename, content), sha: fileSha(content) };
}

function lookup(
  deps: MigrationDeps,
  filename: unknown,
): MigrationActionError | { ok: true; filename: string; migration: ReturnType<typeof readMigration> } {
  if (typeof filename !== "string" || !MIGRATION_FILENAME_RE.test(filename)) {
    return { ok: false, status: 400, code: "invalid_filename", error: "Invalid migration filename." };
  }
  if (!fs.existsSync(path.join(deps.migrationsDir, filename))) {
    return { ok: false, status: 404, code: "not_found", error: "Migration script not found." };
  }
  return { ok: true, filename, migration: readMigration(deps, filename) };
}

export function listMigrations(deps: MigrationDeps, currentSite: string): MigrationListItem[] {
  if (!fs.existsSync(deps.migrationsDir)) return [];
  const live = deps.live();
  return fs
    .readdirSync(deps.migrationsDir)
    .filter((f) => MIGRATION_FILENAME_RE.test(f))
    .sort()
    .map((filename) => {
      const { headers, sha } = readMigration(deps, filename);
      const recordedIn = recordingSiteFor(headers.scope, currentSite);
      const db = deps.db(recordedIn);
      const done = completedRun(db, filename);
      const last = latestFor(db, filename);
      return {
        filename,
        ...headers,
        recorded_in: recordedIn,
        blocked_here: headers.production_only && !live,
        completed: done
          ? {
              by: done.actor,
              at: done.finished_at ?? done.started_at,
              mode: done.mode === "mark_done" ? "mark_done" : "run",
              note: done.note,
            }
          : null,
        changed_since_completed: changedSinceCompleted(db, filename, sha),
        running: isRunning(db, filename),
        last_run: last
          ? {
              id: last.id,
              mode: last.mode,
              status: last.status,
              actor: last.actor,
              started_at: last.started_at,
              finished_at: last.finished_at,
              exit_code: last.exit_code,
              output: last.output,
              note: last.note,
            }
          : null,
      };
    });
}

export function startMigration(
  deps: MigrationDeps,
  opts: { filename: unknown; mode: unknown; confirmRerun?: unknown; actor: string | null; currentSite: string },
): MigrationActionError | { ok: true; run_id: string; recorded_in: string; done: Promise<void> } {
  const found = lookup(deps, opts.filename);
  if (!found.ok) return found;
  const { filename, migration } = found;
  const { headers } = migration;
  const dryRun = opts.mode === "dry_run";

  if (dryRun && !headers.supports_dry_run) {
    return {
      ok: false,
      status: 400,
      code: "dry_run_unsupported",
      error: "This migration does not support a dry run (no @dry-run tag).",
    };
  }
  if (!dryRun && headers.production_only && !deps.live()) {
    return { ok: false, status: 403, code: "production_only", error: PRODUCTION_ONLY_MESSAGE };
  }

  const recordedIn = recordingSiteFor(headers.scope, opts.currentSite);
  const db = deps.db(recordedIn);

  if (!dryRun && opts.confirmRerun !== true) {
    const done = completedRun(db, filename);
    if (done && !changedSinceCompleted(db, filename, migration.sha)) {
      return {
        ok: false,
        status: 409,
        code: "already_completed",
        error: "This migration already finished. Confirm to run it again.",
      };
    }
  }

  const runId = startRun(db, { filename, mode: dryRun ? "dry_run" : "run", actor: opts.actor, fileSha: migration.sha });
  if (!runId) {
    return { ok: false, status: 409, code: "already_running", error: "This migration is already running." };
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (headers.scope === "site") env.MIGRATION_SITE = opts.currentSite;
  else delete env.MIGRATION_SITE;

  const done = deps
    .spawnScript({
      fullPath: migration.fullPath,
      dryRun,
      env,
      timeoutSeconds: headers.timeout_seconds,
      onOutput: (output) => updateRunningOutput(db, runId, output),
    })
    .then((result) => finishRun(db, runId, result))
    .catch((err: unknown) => {
      log.error({ err, filename }, "[data-migrations] run crashed");
      finishRun(db, runId, { status: "failed", exitCode: null, output: String(err) });
    });

  return { ok: true, run_id: runId, recorded_in: recordedIn, done };
}

export function markMigrationDone(
  deps: MigrationDeps,
  opts: { filename: unknown; note?: unknown; actor: string | null; currentSite: string },
): MigrationActionError | { ok: true; run: MigrationRun; recorded_in: string } {
  const found = lookup(deps, opts.filename);
  if (!found.ok) return found;
  const { filename, migration } = found;
  if (migration.headers.production_only && !deps.live()) {
    return { ok: false, status: 403, code: "production_only", error: PRODUCTION_ONLY_MESSAGE };
  }
  const recordedIn = recordingSiteFor(migration.headers.scope, opts.currentSite);
  const db = deps.db(recordedIn);
  if (isRunning(db, filename)) {
    return { ok: false, status: 409, code: "already_running", error: "This migration is already running." };
  }
  const note = typeof opts.note === "string" ? opts.note.slice(0, 2000) : null;
  const run = markDone(db, { filename, actor: opts.actor, note, fileSha: migration.sha });
  return { ok: true, run, recorded_in: recordedIn };
}

/** Runs `npx tsx <script>` in its own process group so a timeout can stop tsx and its node child. */
export const spawnTsxScript: SpawnScript = ({ fullPath, dryRun, env, timeoutSeconds, onOutput }) =>
  new Promise((resolve) => {
    const args = ["tsx", fullPath, ...(dryRun ? ["--dry-run"] : [])];
    const proc = spawn("npx", args, { cwd: getProjectRoot(), env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    let dirty = false;

    const append = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > MAX_BUFFERED_OUTPUT) output = output.slice(-MAX_BUFFERED_OUTPUT);
      dirty = true;
    };
    proc.stdout?.on("data", append);
    proc.stderr?.on("data", append);

    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (proc.pid) process.kill(-proc.pid, signal);
      } catch {
        proc.kill(signal);
      }
    };

    const flush = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      try {
        onOutput(output);
      } catch (err) {
        log.warn({ err }, "[data-migrations] could not save partial output");
      }
    }, OUTPUT_FLUSH_MS);

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS).unref();
    }, timeoutSeconds * 1000);

    const settle = (result: SpawnResult) => {
      clearInterval(flush);
      clearTimeout(timer);
      resolve(result);
    };

    proc.on("error", (err) => settle({ status: "failed", exitCode: null, output: `${output}\n${err.message}`.trim() }));
    proc.on("close", (code) => {
      const text = output.trim();
      if (timedOut) {
        settle({ status: "timed_out", exitCode: code, output: `${text}\nTimed out after ${timeoutSeconds}s.`.trim() });
      } else {
        settle({ status: code === 0 ? "succeeded" : "failed", exitCode: code, output: text });
      }
    });
  });

export function defaultMigrationDeps(): MigrationDeps {
  return {
    migrationsDir: path.join(getPackageRoot(), "scripts", "migrations"),
    db: ledgerDb,
    live: isLiveServer,
    spawnScript: spawnTsxScript,
  };
}
