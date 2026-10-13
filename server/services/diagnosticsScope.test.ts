import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  fork: () => {
    const child = new EventEmitter() as EventEmitter & {
      send: () => boolean;
      kill: () => void;
      connected: boolean;
    };
    child.send = () => true;
    child.kill = () => {};
    child.connected = true;
    return child;
  },
}));
import { ContentIndex } from "../content-index";
import { resetRegistry } from "../content-types";
import { resetVariableManagerCache } from "../variable-manager";
import { mockDatabase } from "../test-helpers/mock-database";
import { resolveUrlTargets } from "../../scripts/validation/runDiagnosticsJob";
import { clearDiagnosticsRuntimeForTests, startDiagnosticsJob } from "./diagnosticsJobService";
import { ValidationCacheService } from "./validationCacheService";

let tempDir: string;
let contentRoot: string;
let cachedItems: Record<string, unknown>[] | null;

function write(rel: string, body: string) {
  const full = path.join(contentRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf-8");
}

function buildIndex(): ContentIndex {
  resetRegistry(contentRoot);
  const ci = new ContentIndex(contentRoot);
  ci.scanFast();
  vi.spyOn(ci, "getDatabase").mockReturnValue(
    mockDatabase((name) => (name === "exercises" ? cachedItems : null)),
  );
  return ci;
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostics-scope-"));
  contentRoot = path.join(tempDir, "site_test");
  write(
    "content-types.yml",
    `exercise:
  directory: exercises
  single_template: true
  database:
    slug: exercises
  field_mapping:
    _slug: slug
    _locale: lang
    title: title
  url_pattern:
    en: /en/exercise/:slug
`,
  );
  write("exercises/template.en.yml", 'meta:\n  page_title: "{{ entry.title }}"\n');
  cachedItems = [{ slug: "bootstrap-exercises", lang: "en", title: "Bootstrap Exercises" }];
  resetVariableManagerCache();
});

afterEach(() => {
  clearDiagnosticsRuntimeForTests();
  vi.restoreAllMocks();
  resetRegistry(contentRoot);
  resetVariableManagerCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("diagnostics scope for database-backed pages", () => {
  it("finds a database slug like any other page", async () => {
    const ci = buildIndex();
    const targets = await resolveUrlTargets(contentRoot, ci, ["bootstrap-exercises"]);
    expect(targets.map((t) => t.url)).toEqual(["/en/exercise/bootstrap-exercises"]);
  }, 60_000);

  it("queues an unknown slug and lets the child report it on the first poll", async () => {
    cachedItems = null;
    const ci = buildIndex();
    const result = await startDiagnosticsJob({
      contentRoot,
      contentRootName: "site_test",
      ci,
      cache: new ValidationCacheService(contentRoot),
      slugs: ["bootstrap-exercises"],
      confirm: true,
    });
    expect(result.status).toBe("queued");
    if (result.status === "queued" || result.status === "running") {
      expect(result.job_id).toMatch(/^diag-/);
    }
  }, 60_000);
});
