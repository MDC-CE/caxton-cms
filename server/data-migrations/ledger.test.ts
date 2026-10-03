import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { PIPELINE_MIGRATIONS } from "../pipeline-db/migrations";
import {
  MAX_OUTPUT_BYTES,
  changedSinceCompleted,
  completedRun,
  finishRun,
  isCompleted,
  isRunning,
  latestFor,
  markDone,
  markInterrupted,
  startRun,
  truncateOutput,
} from "./ledger";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  PIPELINE_MIGRATIONS.find((m) => m.name === "data_migration_runs")!.up(db);
});

afterEach(() => db.close());

const F = "003_migrate_proposals_v1.ts";

describe("data migration ledger", () => {
  it("a real run that exits 0 counts as completed", () => {
    const id = startRun(db, { filename: F, mode: "run", actor: "ana@4geeks.com", fileSha: "sha1", now: 1 })!;
    expect(isRunning(db, F)).toBe(true);
    expect(isCompleted(db, F)).toBe(false);
    finishRun(db, id, { status: "succeeded", exitCode: 0, output: "ok", now: 2 });
    expect(isRunning(db, F)).toBe(false);
    expect(completedRun(db, F)).toMatchObject({ actor: "ana@4geeks.com", mode: "run", finished_at: 2 });
  });

  it("blocks a second active run of the same migration", () => {
    expect(startRun(db, { filename: F, mode: "run", actor: null, fileSha: null })).toBeTruthy();
    expect(startRun(db, { filename: F, mode: "dry_run", actor: null, fileSha: null })).toBeNull();
    expect(startRun(db, { filename: "001_other.ts", mode: "run", actor: null, fileSha: null })).toBeTruthy();
  });

  it("dry, failed and timed-out runs never complete", () => {
    for (const [mode, status] of [
      ["dry_run", "succeeded"],
      ["run", "failed"],
      ["run", "timed_out"],
    ] as const) {
      const id = startRun(db, { filename: F, mode, actor: null, fileSha: "s" })!;
      finishRun(db, id, { status, exitCode: status === "succeeded" ? 0 : 1, output: "" });
    }
    expect(isCompleted(db, F)).toBe(false);
    expect(latestFor(db, F)?.status).toBe("timed_out");
  });

  it("mark as done records a completion without a run", () => {
    const row = markDone(db, { filename: F, actor: "ana", note: " ran by hand ", fileSha: "s", now: 5 });
    expect(row).toMatchObject({ mode: "mark_done", status: "succeeded", note: "ran by hand" });
    expect(isCompleted(db, F)).toBe(true);
  });

  it("a failed re-run does not undo an earlier completion", () => {
    markDone(db, { filename: F, actor: "ana", fileSha: "s", now: 1 });
    const id = startRun(db, { filename: F, mode: "run", actor: "ana", fileSha: "s", now: 2 })!;
    finishRun(db, id, { status: "failed", exitCode: 1, output: "boom", now: 3 });
    expect(isCompleted(db, F)).toBe(true);
    expect(latestFor(db, F)?.status).toBe("failed");
  });

  it("flags a file that changed after it completed", () => {
    markDone(db, { filename: F, actor: "ana", fileSha: "old" });
    expect(changedSinceCompleted(db, F, "old")).toBe(false);
    expect(changedSinceCompleted(db, F, "new")).toBe(true);
    expect(changedSinceCompleted(db, "001_never.ts", "new")).toBe(false);
  });

  it("leftover running rows become interrupted on boot and do not complete", () => {
    startRun(db, { filename: F, mode: "run", actor: null, fileSha: null });
    expect(markInterrupted(db)).toBe(1);
    expect(isRunning(db, F)).toBe(false);
    expect(isCompleted(db, F)).toBe(false);
    expect(latestFor(db, F)).toMatchObject({ status: "interrupted" });
    expect(latestFor(db, F)?.output).toContain("server restarted");
  });

  it("keeps the tail of long output", () => {
    const long = "a".repeat(MAX_OUTPUT_BYTES) + "END";
    const out = truncateOutput(long);
    expect(out.endsWith("END")).toBe(true);
    expect(out).toContain("truncated");
    expect(truncateOutput("short")).toBe("short");
  });
});
