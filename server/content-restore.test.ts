import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderTreeFile } from "./github-graphql";
import {
  findMissingVariantFiles,
  getFolderCommitFiles,
  restoreFolder,
  validateRestoreFolder,
  type RestoreDeps,
} from "./content-restore";

const ROOT = "site_test";
const FOLDER = `${ROOT}/landings/my-page`;
const COMMIT = "c".repeat(40);
const PARENT = "b".repeat(40);

function file(name: string, text: string | null, extra: Partial<FolderTreeFile> = {}): FolderTreeFile {
  return {
    path: `${FOLDER}/${name}`,
    oid: `oid-${name}-${text}`,
    text,
    isBinary: false,
    isTruncated: false,
    ...extra,
  };
}

let cwd: string;

function writeLocal(name: string, text: string) {
  const abs = path.join(cwd, FOLDER, name);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf-8");
}

function readLocal(name: string): string | null {
  const abs = path.join(cwd, FOLDER, name);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
}

function makeDeps(opts: {
  trees: Record<string, FolderTreeFile[]>;
  parentSha?: string | null;
  overrides?: Partial<RestoreDeps>;
}): RestoreDeps {
  return {
    listCommits: vi.fn(async () => ({ success: true, entries: [] })),
    fetchCommitParent: vi.fn(async () => ({
      success: true,
      sha: COMMIT,
      parentSha: opts.parentSha === undefined ? PARENT : opts.parentSha,
    })),
    fetchFolderTrees: vi.fn(async ({ shas }: { shas: string[] }) => ({
      success: true,
      trees: Object.fromEntries(shas.map((s) => [s, opts.trees[s] ?? []])),
      repoUrl: "https://github.com/org/content",
    })),
    getConflictInfo: vi.fn(async () => ({
      hasConflict: false,
      behindBy: 0,
      commits: [],
      changedFiles: [],
      fileBlobShas: {},
      lastSyncedCommit: "a".repeat(40),
      remoteCommit: "a".repeat(40),
    })),
    commitAndPush: vi.fn(async () => ({ success: true, commitHash: "d".repeat(40) })),
    markFileAsModified: vi.fn(),
    detectPendingChanges: vi.fn(() => []),
    shouldTrackFile: vi.fn((f: string) => f.startsWith(`${ROOT}/`)),
    isSeoIndexRelPath: vi.fn((f: string) => f.endsWith("/seo-index.json")),
    syncEnabled: () => true,
    hasGitHubConfig: () => true,
    ...opts.overrides,
  } as RestoreDeps;
}

const base = { folder: FOLDER, sha: COMMIT, contentRootName: ROOT };

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "content-restore-"));
});
afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe("validateRestoreFolder", () => {
  it("accepts entry folders inside the content root", () => {
    expect(validateRestoreFolder(FOLDER, ROOT)).toBeNull();
  });
  it("rejects folders outside the content root or traversal", () => {
    expect(validateRestoreFolder("4geeks-com/landings/x", ROOT)).not.toBeNull();
    expect(validateRestoreFolder(`${ROOT}/landings`, ROOT)).not.toBeNull();
    expect(validateRestoreFolder(`${ROOT}/landings/../../etc`, ROOT)).not.toBeNull();
    expect(validateRestoreFolder(`/abs/${FOLDER}`, ROOT)).not.toBeNull();
  });
});

describe("getFolderCommitFiles", () => {
  it("undo mode reads from the parent and flags added/removed files", async () => {
    writeLocal("en.yml", "new en");
    writeLocal("draft.es.yml", "draft now");
    const deps = makeDeps({
      trees: {
        [PARENT]: [file("en.yml", "old en"), file("es.yml", "old es")],
        [COMMIT]: [file("en.yml", "new en"), file("draft.es.yml", "draft")],
      },
    });
    const result = await getFolderCommitFiles({ ...base, mode: "undo", cwd }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceSha).toBe(PARENT);
    const byName = Object.fromEntries(result.changedFiles.map((f) => [path.basename(f.path), f]));
    expect(byName["en.yml"]).toMatchObject({ status: "modified", restorable: true });
    // Removed in the commit: undo can bring it back.
    expect(byName["es.yml"]).toMatchObject({ status: "removed", restorable: true });
    // Added in the commit: undo never deletes.
    expect(byName["draft.es.yml"]).toMatchObject({ status: "added", restorable: false });
    expect(result.extraFilesNow).toEqual([`${FOLDER}/draft.es.yml`]);
  });

  it("restore mode greys out files the commit deleted", async () => {
    const deps = makeDeps({
      trees: {
        [PARENT]: [file("es.yml", "old es")],
        [COMMIT]: [],
      },
    });
    const result = await getFolderCommitFiles({ ...base, mode: "restore", cwd }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceSha).toBe(COMMIT);
    expect(result.changedFiles[0]).toMatchObject({ status: "removed", restorable: false });
  });

  it("undo on a root commit is rejected", async () => {
    const deps = makeDeps({ trees: {}, parentSha: null });
    const result = await getFolderCommitFiles({ ...base, mode: "undo", cwd }, deps);
    expect(result).toMatchObject({ ok: false, status: 400, code: "no_parent" });
  });

  it("lists unpushed local files in the folder", async () => {
    const deps = makeDeps({
      trees: { [PARENT]: [], [COMMIT]: [file("en.yml", "x")] },
      overrides: {
        detectPendingChanges: vi.fn(() => [
          { file: `${FOLDER}/en.yml`, status: "modified", source: "local" },
          { file: `${FOLDER}/es.yml`, status: "modified", source: "incoming" },
          { file: `${ROOT}/landings/other/en.yml`, status: "modified", source: "local" },
        ]) as unknown as RestoreDeps["detectPendingChanges"],
      },
    });
    const result = await getFolderCommitFiles({ ...base, mode: "restore", cwd }, deps);
    expect(result.ok && result.pendingFiles).toEqual([`${FOLDER}/en.yml`]);
  });
});

describe("restoreFolder", () => {
  it("per-file restore writes only the selected files and pushes them", async () => {
    writeLocal("en.yml", "current en");
    writeLocal("es.yml", "current es");
    const deps = makeDeps({
      trees: { [COMMIT]: [file("en.yml", "v1 en"), file("es.yml", "v1 es")] },
    });
    const result = await restoreFolder(
      { ...base, mode: "restore", files: [`${FOLDER}/en.yml`], cwd },
      deps,
    );
    expect(result).toMatchObject({ ok: true, pushed: true, restoredFiles: [`${FOLDER}/en.yml`] });
    expect(readLocal("en.yml")).toBe("v1 en");
    expect(readLocal("es.yml")).toBe("current es");
    expect(deps.commitAndPush).toHaveBeenCalledWith(
      expect.stringContaining("Restore:"),
      expect.objectContaining({ files: [`${FOLDER}/en.yml`], contentRoot: ROOT }),
    );
  });

  it("undo reads from the parent commit", async () => {
    writeLocal("en.yml", "after");
    const deps = makeDeps({ trees: { [PARENT]: [file("en.yml", "before")] } });
    const result = await restoreFolder({ ...base, mode: "undo", files: [`${FOLDER}/en.yml`], cwd }, deps);
    expect(result.ok).toBe(true);
    expect(readLocal("en.yml")).toBe("before");
    expect(deps.fetchFolderTrees).toHaveBeenCalledWith(expect.objectContaining({ shas: [PARENT] }));
    expect(deps.commitAndPush).toHaveBeenCalledWith(expect.stringContaining("Undo:"), expect.anything());
  });

  it("whole-folder keeps extra files unless removeExtra is set", async () => {
    writeLocal("en.yml", "now");
    writeLocal("fr.yml", "new locale");
    const trees = { [COMMIT]: [file("en.yml", "then")] };

    const keep = await restoreFolder({ ...base, mode: "restore", cwd }, makeDeps({ trees }));
    expect(keep).toMatchObject({ ok: true, deletedFiles: [] });
    expect(readLocal("fr.yml")).toBe("new locale");

    const remove = await restoreFolder({ ...base, mode: "restore", removeExtra: true, cwd }, makeDeps({ trees }));
    expect(remove).toMatchObject({ ok: true, deletedFiles: [`${FOLDER}/fr.yml`] });
    expect(readLocal("fr.yml")).toBeNull();
  });

  it("skips binary files in whole-folder restore and rejects them per-file", async () => {
    const trees = {
      [COMMIT]: [file("en.yml", "then"), file("hero.png", null, { isBinary: true })],
    };
    const whole = await restoreFolder({ ...base, mode: "restore", cwd }, makeDeps({ trees }));
    expect(whole).toMatchObject({ ok: true, skippedBinary: [`${FOLDER}/hero.png`] });

    const perFile = await restoreFolder(
      { ...base, mode: "restore", files: [`${FOLDER}/hero.png`], cwd },
      makeDeps({ trees }),
    );
    expect(perFile).toMatchObject({ ok: false, status: 400, code: "not_restorable" });
  });

  it("rejects a folder outside the content root", async () => {
    const result = await restoreFolder(
      { ...base, folder: "4geeks-com/landings/my-page", mode: "restore", cwd },
      makeDeps({ trees: {} }),
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("restores invalid YAML anyway and returns a warning", async () => {
    const deps = makeDeps({ trees: { [COMMIT]: [file("en.yml", "sections: [unclosed")] } });
    const result = await restoreFolder({ ...base, mode: "restore", files: [`${FOLDER}/en.yml`], cwd }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.length).toBe(1);
    expect(readLocal("en.yml")).toBe("sections: [unclosed");
  });

  it("blocks with 409 and writes nothing when GitHub changed the same file", async () => {
    writeLocal("en.yml", "local");
    const deps = makeDeps({
      trees: { [COMMIT]: [file("en.yml", "then")] },
      overrides: {
        getConflictInfo: vi.fn(async () => ({
          hasConflict: true,
          behindBy: 1,
          commits: [],
          changedFiles: [`${FOLDER}/en.yml`],
          fileBlobShas: {},
          lastSyncedCommit: "a".repeat(40),
          remoteCommit: "e".repeat(40),
        })),
      },
    });
    const result = await restoreFolder({ ...base, mode: "restore", files: [`${FOLDER}/en.yml`], cwd }, deps);
    expect(result).toMatchObject({ ok: false, status: 409, code: "remote_overlap" });
    expect(readLocal("en.yml")).toBe("local");
    expect(deps.markFileAsModified).not.toHaveBeenCalled();
    expect(deps.commitAndPush).not.toHaveBeenCalled();
  });

  it("blocks with 409 when other unpulled site changes would make the push fail", async () => {
    writeLocal("en.yml", "local");
    const deps = makeDeps({
      trees: { [COMMIT]: [file("en.yml", "then")] },
      overrides: {
        getConflictInfo: vi.fn(async () => ({
          hasConflict: true,
          behindBy: 1,
          commits: [],
          changedFiles: [`${ROOT}/landings/other/en.yml`, "site_other/x.yml", `${ROOT}/seo-index.json`],
          fileBlobShas: {},
          lastSyncedCommit: "a".repeat(40),
          remoteCommit: "e".repeat(40),
        })),
      },
    });
    const result = await restoreFolder({ ...base, mode: "restore", files: [`${FOLDER}/en.yml`], cwd }, deps);
    expect(result).toMatchObject({ ok: false, status: 409, code: "remote_behind" });
    expect(readLocal("en.yml")).toBe("local");
  });

  it("does not block on remote changes that belong to other sites or the SEO index", async () => {
    const deps = makeDeps({
      trees: { [COMMIT]: [file("en.yml", "then")] },
      overrides: {
        getConflictInfo: vi.fn(async () => ({
          hasConflict: true,
          behindBy: 1,
          commits: [],
          changedFiles: ["site_other/x.yml", `${ROOT}/seo-index.json`],
          fileBlobShas: {},
          lastSyncedCommit: "a".repeat(40),
          remoteCommit: "e".repeat(40),
        })),
      },
    });
    const result = await restoreFolder({ ...base, mode: "restore", files: [`${FOLDER}/en.yml`], cwd }, deps);
    expect(result.ok).toBe(true);
  });

  it("returns 503 and writes nothing when sync is disabled", async () => {
    writeLocal("en.yml", "local");
    const deps = makeDeps({
      trees: { [COMMIT]: [file("en.yml", "then")] },
      overrides: { syncEnabled: () => false },
    });
    const result = await restoreFolder({ ...base, mode: "restore", files: [`${FOLDER}/en.yml`], cwd }, deps);
    expect(result).toMatchObject({ ok: false, status: 503, code: "sync_off" });
    expect(readLocal("en.yml")).toBe("local");
  });

  it("keeps files as pending and reports pushed:false when the push fails", async () => {
    const deps = makeDeps({
      trees: { [COMMIT]: [file("en.yml", "then")] },
      overrides: { commitAndPush: vi.fn(async () => ({ success: false, error: "GitHub down" })) },
    });
    const result = await restoreFolder({ ...base, mode: "restore", files: [`${FOLDER}/en.yml`], cwd }, deps);
    expect(result).toMatchObject({ ok: true, pushed: false, pushError: "GitHub down" });
    expect(readLocal("en.yml")).toBe("then");
    expect(deps.markFileAsModified).toHaveBeenCalledWith(`${FOLDER}/en.yml`, undefined, undefined, ROOT);
  });

  it("recovers a file deleted by the commit in undo mode", async () => {
    const deps = makeDeps({ trees: { [PARENT]: [file("es.yml", "es before delete")] } });
    const result = await restoreFolder({ ...base, mode: "undo", files: [`${FOLDER}/es.yml`], cwd }, deps);
    expect(result.ok).toBe(true);
    expect(readLocal("es.yml")).toBe("es before delete");
  });

  it("rejects a restore-mode pick of a file that did not exist at that version", async () => {
    const deps = makeDeps({ trees: { [COMMIT]: [file("en.yml", "x")] } });
    const result = await restoreFolder({ ...base, mode: "restore", files: [`${FOLDER}/es.yml`], cwd }, deps);
    expect(result).toMatchObject({ ok: false, status: 400, code: "not_restorable" });
  });

  it("blocks versioning.yml that points at a missing variant and writes nothing", async () => {
    writeLocal("versioning.yml", "es:\n  variants: []\n");
    const deps = makeDeps({
      trees: {
        [COMMIT]: [file("versioning.yml", "es:\n  variants:\n    - slug: promo\n      allocation: 50\n")],
      },
    });
    const result = await restoreFolder(
      { ...base, mode: "restore", files: [`${FOLDER}/versioning.yml`], cwd },
      deps,
    );
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: "versioning_missing_variants",
      files: [`${FOLDER}/promo.es.yml`],
    });
    expect(readLocal("versioning.yml")).toBe("es:\n  variants: []\n");
  });

  it("allows versioning.yml when the variant is restored alongside it", async () => {
    const deps = makeDeps({
      trees: {
        [COMMIT]: [
          file("versioning.yml", "es:\n  variants:\n    - slug: promo\n      allocation: 50\n"),
          file("promo.es.yml", "sections: []\n"),
        ],
      },
    });
    const result = await restoreFolder(
      { ...base, mode: "restore", files: [`${FOLDER}/versioning.yml`, `${FOLDER}/promo.es.yml`], cwd },
      deps,
    );
    expect(result.ok).toBe(true);
  });
});

describe("findMissingVariantFiles", () => {
  it("accepts legacy versioned variant file names", () => {
    const { missing } = findMissingVariantFiles({
      folder: FOLDER,
      versioningText: "en:\n  variants:\n    - slug: promo\n",
      fileExistsAfter: () => false,
      listFilesAfter: () => [`${FOLDER}/promo.v2.en.yml`],
    });
    expect(missing).toEqual([]);
  });
});
