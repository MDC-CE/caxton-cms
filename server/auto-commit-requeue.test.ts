import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sync-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sync-state")>();
  return {
    ...actual,
    shouldTrackFile: vi.fn(() => true),
    getSyncConfig: () => ({ commitIntervalSeconds: 60 }),
  };
});

describe("requeueTrackedLocalDirties", () => {
  const prevSync = process.env.GITHUB_SYNC_ENABLED;
  const prevAuto = process.env.GITHUB_AUTO_COMMIT_ENABLED;

  beforeEach(async () => {
    vi.resetModules();
    process.env.GITHUB_SYNC_ENABLED = "true";
    process.env.GITHUB_AUTO_COMMIT_ENABLED = "true";
  });

  afterEach(async () => {
    const mod = await import("./auto-commit");
    mod._resetAutoCommitForTests();
    if (prevSync === undefined) delete process.env.GITHUB_SYNC_ENABLED;
    else process.env.GITHUB_SYNC_ENABLED = prevSync;
    if (prevAuto === undefined) delete process.env.GITHUB_AUTO_COMMIT_ENABLED;
    else process.env.GITHUB_AUTO_COMMIT_ENABLED = prevAuto;
  });

  it("no-ops when auto-commit is disabled", async () => {
    process.env.GITHUB_SYNC_ENABLED = "false";
    process.env.GITHUB_AUTO_COMMIT_ENABLED = "false";
    const mod = await import("./auto-commit");
    mod._resetAutoCommitForTests();
    mod.requeueTrackedLocalDirties([
      { filePath: "site_test/pages/a/en.yml", author: "alice" },
    ]);
    expect(mod.getAutoCommitStatus().pendingFiles).toBe(0);
  });

  it("queues each file with author when auto-commit is enabled", async () => {
    const mod = await import("./auto-commit");
    mod._resetAutoCommitForTests();
    mod.requeueTrackedLocalDirties([
      { filePath: "site_x/blog/hello/en.yml", author: "alice" },
      { filePath: "site_x/blog/hello/_common.yml", author: "bob" },
    ]);

    const status = mod.getAutoCommitStatus();
    expect(status.pendingFiles).toBe(2);
    const authors = status.pendingFilesDetails.map((d) => d.author).sort();
    expect(authors).toEqual(["alice", "bob"]);
    expect(status.pendingFilesDetails.every((d) => d.filePath.includes("blog/hello"))).toBe(true);
  });
});
