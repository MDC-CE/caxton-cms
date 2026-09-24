import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifySameCommitDrift,
  computeFileSha,
  flushPendingSyncStateWrites,
  isProtectedLocalDelete,
  isProtectedLocalEdit,
  loadSyncState,
  markFileAsModified,
  saveSyncState,
  type FileSyncInfo,
} from "./sync-state";

describe("isProtectedLocalEdit", () => {
  it("protects when disk matches recorded local sha and differs from remote", () => {
    const disk = "local-bytes";
    const sha = computeFileSha(disk);
    const info: FileSyncInfo = {
      sha,
      remoteSha: "remote-hash",
      lastModified: 1,
      author: "alice",
    };
    expect(isProtectedLocalEdit(info, sha)).toBe(true);
  });

  it("does not protect when disk does not match recorded sha", () => {
    const recorded = computeFileSha("recorded");
    const diskSha = computeFileSha("old-deploy");
    const info: FileSyncInfo = {
      sha: recorded,
      remoteSha: "remote-hash",
      lastModified: 1,
    };
    expect(isProtectedLocalEdit(info, diskSha)).toBe(false);
  });

  it("does not protect when already matching remote", () => {
    const sha = computeFileSha("same");
    const info: FileSyncInfo = { sha, remoteSha: sha, lastModified: 1 };
    expect(isProtectedLocalEdit(info, sha)).toBe(false);
  });
});

describe("isProtectedLocalDelete", () => {
  it("protects pending delete when local sha cleared", () => {
    const info: FileSyncInfo = {
      sha: "",
      remoteSha: "remote-hash",
      lastModified: 1,
      author: "bob",
    };
    expect(isProtectedLocalDelete(info)).toBe(true);
  });

  it("does not protect stale missing file still marked in sync", () => {
    const sha = "same-as-remote";
    const info: FileSyncInfo = { sha, remoteSha: sha, lastModified: 1 };
    expect(isProtectedLocalDelete(info)).toBe(false);
  });
});

describe("classifySameCommitDrift", () => {
  it("protects tracked edit and pending delete; marks true stale for pull", () => {
    const editSha = computeFileSha("local edit");
    const remoteEdit = "remote-edit-sha";
    const staleRemote = computeFileSha("on github");
    const files: Record<string, FileSyncInfo> = {
      "site/a.yml": {
        sha: editSha,
        remoteSha: remoteEdit,
        lastModified: 1,
        author: "alice",
      },
      "site/b.yml": {
        sha: "",
        remoteSha: "was-on-remote",
        lastModified: 1,
        author: "bob",
      },
      "site/c.yml": {
        sha: staleRemote,
        remoteSha: staleRemote,
        lastModified: 1,
      },
      "site/d.yml": {
        sha: staleRemote,
        remoteSha: staleRemote,
        lastModified: 1,
      },
    };

    const disk: Record<string, string | null> = {
      "site/a.yml": editSha,
      "site/b.yml": null,
      "site/c.yml": computeFileSha("old deploy bytes"),
      "site/d.yml": null,
    };

    const result = classifySameCommitDrift(files, {
      shouldTrack: () => true,
      diskSha: (p) => disk[p] ?? null,
    });

    expect(result.protectedLocal).toEqual([
      { filePath: "site/a.yml", author: "alice" },
      { filePath: "site/b.yml", author: "bob" },
    ]);
    expect(result.staleFiles.sort()).toEqual(["site/c.yml", "site/d.yml"]);
  });
});

describe("markFileAsModified pending delete", () => {
  const ORIGINAL_CWD = process.cwd();
  let tempDir: string;
  let contentRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-del-"));
    contentRoot = path.join(tempDir, "site_test");
    fs.mkdirSync(path.join(contentRoot, "pages", "hello"), { recursive: true });
    process.chdir(tempDir);
  });

  afterEach(() => {
    flushPendingSyncStateWrites(contentRoot);
    process.chdir(ORIGINAL_CWD);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("clears local sha so delete is dirty vs remote", () => {
    const rel = "site_test/pages/hello/en.yml";
    const full = path.join(tempDir, rel);
    fs.writeFileSync(full, "title: Hello\n", "utf-8");
    const sha = computeFileSha("title: Hello\n");

    saveSyncState(
      {
        lastSyncedCommit: "abc",
        lastSyncedAt: new Date().toISOString(),
        files: {
          [rel]: {
            sha,
            remoteSha: sha,
            lastModified: Date.now(),
            author: "alice",
            committedAt: "2020-01-01T00:00:00.000Z",
            modifiedAt: "2020-01-01T00:00:00.000Z",
          },
        },
      },
      contentRoot,
    );

    fs.unlinkSync(full);
    markFileAsModified(rel, "alice", undefined, contentRoot);
    flushPendingSyncStateWrites(contentRoot);

    const state = loadSyncState(contentRoot);
    expect(state.files[rel].sha).toBe("");
    expect(state.files[rel].remoteSha).toBe(sha);
    expect(state.files[rel].author).toBe("alice");
    expect(isProtectedLocalDelete(state.files[rel])).toBe(true);
  });
});
