import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

vi.mock("../site-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../site-config")>()),
  getSiteConfigs: () => [
    { domain: "4geeks.com", contentFolder: "site_4geeks-com" },
    { domain: "fl.4geeksacademy.com", contentFolder: "site_4geeks-florida" },
  ],
}));

import { PIPELINE_MIGRATIONS } from "../pipeline-db/migrations";
import { listMigrations, markMigrationDone, startMigration, type MigrationDeps, type SpawnScript } from "./service";

let dir: string;
let dbs: Map<string, Database.Database>;
let live: boolean;
let spawnCalls: Parameters<SpawnScript>[0][];
let spawnResult: Awaited<ReturnType<SpawnScript>>;

function dbFor(site: string) {
  let db = dbs.get(site);
  if (!db) {
    db = new Database(":memory:");
    PIPELINE_MIGRATIONS.find((m) => m.name === "data_migration_runs")!.up(db);
    dbs.set(site, db);
  }
  return db;
}

function deps(): MigrationDeps {
  return {
    migrationsDir: dir,
    db: dbFor,
    live: () => live,
    spawnScript: async (opts) => {
      spawnCalls.push(opts);
      return spawnResult;
    },
  };
}

function writeMigration(filename: string, tags: string) {
  fs.writeFileSync(path.join(dir, filename), `/**\n * @migration ${filename}\n * @description Test.\n${tags}\n */\n`);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "data-mig-"));
  dbs = new Map();
  live = false;
  spawnCalls = [];
  spawnResult = { status: "succeeded", exitCode: 0, output: "done" };
  writeMigration("001_all.ts", " * @scope all");
  writeMigration("002_site.ts", " * @scope site\n * @dry-run\n * @timeout 900");
  writeMigration("003_prod.ts", " * @scope site\n * @dry-run\n * @production-only");
  writeMigration("004_noscope.ts", "");
});

afterEach(() => {
  for (const db of dbs.values()) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const FL = "site_4geeks-florida";

describe("migration route gates", () => {
  it("a real run completes, then needs confirm to run again", async () => {
    const first = startMigration(deps(), { filename: "002_site.ts", mode: "run", actor: "ana", currentSite: FL });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await first.done;
    expect(spawnCalls[0]).toMatchObject({ dryRun: false, timeoutSeconds: 900 });
    expect(spawnCalls[0].env.MIGRATION_SITE).toBe(FL);

    const again = startMigration(deps(), { filename: "002_site.ts", mode: "run", actor: "ana", currentSite: FL });
    expect(again).toMatchObject({ ok: false, status: 409, code: "already_completed" });

    const confirmed = startMigration(deps(), {
      filename: "002_site.ts",
      mode: "run",
      confirmRerun: true,
      actor: "ana",
      currentSite: FL,
    });
    expect(confirmed.ok).toBe(true);
  });

  it("returns already_running while a run is active", () => {
    const pending = new Promise<never>(() => {});
    const d = { ...deps(), spawnScript: () => pending };
    expect(startMigration(d, { filename: "002_site.ts", mode: "run", actor: null, currentSite: FL }).ok).toBe(true);
    expect(startMigration(d, { filename: "002_site.ts", mode: "dry_run", actor: null, currentSite: FL })).toMatchObject({
      status: 409,
      code: "already_running",
    });
    expect(markMigrationDone(d, { filename: "002_site.ts", actor: null, currentSite: FL })).toMatchObject({
      code: "already_running",
    });
  });

  it("blocks production-only real runs and mark-done off the live server, allows dry run", async () => {
    expect(startMigration(deps(), { filename: "003_prod.ts", mode: "run", actor: null, currentSite: FL })).toMatchObject({
      status: 403,
      code: "production_only",
    });
    expect(markMigrationDone(deps(), { filename: "003_prod.ts", actor: null, currentSite: FL })).toMatchObject({
      status: 403,
    });
    const dry = startMigration(deps(), { filename: "003_prod.ts", mode: "dry_run", actor: null, currentSite: FL });
    expect(dry.ok).toBe(true);
    if (dry.ok) await dry.done;
    expect(spawnCalls[0].dryRun).toBe(true);

    live = true;
    expect(startMigration(deps(), { filename: "003_prod.ts", mode: "run", actor: null, currentSite: FL }).ok).toBe(true);
  });

  it("rejects dry run for files without @dry-run, and bad filenames", () => {
    expect(startMigration(deps(), { filename: "001_all.ts", mode: "dry_run", actor: null, currentSite: FL })).toMatchObject({
      status: 400,
      code: "dry_run_unsupported",
    });
    expect(startMigration(deps(), { filename: "../x.ts", mode: "run", actor: null, currentSite: FL })).toMatchObject({
      status: 400,
      code: "invalid_filename",
    });
    expect(startMigration(deps(), { filename: "009_missing.ts", mode: "run", actor: null, currentSite: FL })).toMatchObject({
      status: 404,
    });
  });

  it("dry runs and failed runs never complete", async () => {
    const dry = startMigration(deps(), { filename: "002_site.ts", mode: "dry_run", actor: null, currentSite: FL });
    if (dry.ok) await dry.done;
    spawnResult = { status: "failed", exitCode: 1, output: "boom" };
    const failed = startMigration(deps(), { filename: "002_site.ts", mode: "run", actor: null, currentSite: FL });
    if (failed.ok) await failed.done;
    const row = listMigrations(deps(), FL).find((m) => m.filename === "002_site.ts")!;
    expect(row.completed).toBeNull();
    expect(row.last_run).toMatchObject({ status: "failed", output: "boom" });
  });
});

describe("listMigrations", () => {
  it("all-sites migrations are recorded in the primary site and shared across sites", () => {
    live = true;
    markMigrationDone(deps(), { filename: "001_all.ts", note: "ran by hand", actor: "ana", currentSite: FL });
    for (const site of [FL, "site_4geeks-com"]) {
      const row = listMigrations(deps(), site).find((m) => m.filename === "001_all.ts")!;
      expect(row).toMatchObject({ recorded_in: "site_4geeks-com", completed: { by: "ana", mode: "mark_done" } });
    }
    expect(dbs.has(FL)).toBe(true);
    const flRow = listMigrations(deps(), FL).find((m) => m.filename === "002_site.ts")!;
    expect(flRow.recorded_in).toBe(FL);
  });

  it("flags a missing @scope, production-only blocking, and a changed file", () => {
    live = false;
    markMigrationDone(deps(), { filename: "002_site.ts", actor: "ana", currentSite: FL });
    fs.appendFileSync(path.join(dir, "002_site.ts"), "console.log('edited');\n");
    const rows = Object.fromEntries(listMigrations(deps(), FL).map((m) => [m.filename, m]));
    expect(rows["004_noscope.ts"]).toMatchObject({ scope: "all", scope_missing: true });
    expect(rows["003_prod.ts"].blocked_here).toBe(true);
    expect(rows["002_site.ts"].changed_since_completed).toBe(true);
    expect(startMigration(deps(), { filename: "002_site.ts", mode: "run", actor: null, currentSite: FL }).ok).toBe(true);
  });

  it("all-sites runs do not pass MIGRATION_SITE", async () => {
    process.env.MIGRATION_SITE = "leftover";
    const run = startMigration(deps(), { filename: "001_all.ts", mode: "run", actor: null, currentSite: FL });
    if (run.ok) await run.done;
    delete process.env.MIGRATION_SITE;
    expect(spawnCalls[0].env.MIGRATION_SITE).toBeUndefined();
  });
});
