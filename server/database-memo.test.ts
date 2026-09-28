import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseManager } from "./database";

let tempDir: string;
let contentRoot: string;
let dbName: string;
let db: DatabaseManager;

function writeFixture(rows: Record<string, unknown>[]) {
  const dbDir = path.join(contentRoot, "db", dbName);
  fs.mkdirSync(dbDir, { recursive: true });
  fs.writeFileSync(
    path.join(dbDir, "config.yml"),
    yaml.dump({
      name: "Memo test",
      source: { type: "local", local: { filename: "rows.yml" } },
      field_mapping: { slug: "slug", title: "title" },
    }),
    "utf-8",
  );
  fs.writeFileSync(path.join(dbDir, "rows.yml"), yaml.dump(rows), "utf-8");
}

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-memo-"));
  contentRoot = path.join(tempDir, "site_test");
  dbName = `memo-test-${Math.random().toString(36).slice(2, 10)}`;
  writeFixture([{ slug: "a", title: "A" }]);
  db = new DatabaseManager(contentRoot);
  db.reload();
  await db.fetchItems(dbName, true);
});

afterEach(() => {
  db.clearCache(dbName);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("mapped-items memo", () => {
  it("parses the stored copy once while fetched_at is unchanged", () => {
    const cache = (db as unknown as { cache: { read: (...args: unknown[]) => unknown } }).cache;
    const readSpy = vi.spyOn(cache, "read");
    const first = db.getLastGoodItems(dbName);
    const second = db.getLastGoodItems(dbName);
    expect(first?.items).toBe(second?.items);
    expect(readSpy).toHaveBeenCalledTimes(1);
    readSpy.mockRestore();
  });

  it("re-reads after clearMappedMemo and after a new fetch", async () => {
    const first = db.getLastGoodItems(dbName);
    const version = db.mappedMemoVersion;
    db.clearMappedMemo(dbName);
    expect(db.mappedMemoVersion).toBeGreaterThan(version);
    const afterClear = db.getLastGoodItems(dbName);
    expect(afterClear?.items).not.toBe(first?.items);

    writeFixture([{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
    await new Promise((r) => setTimeout(r, 5));
    await db.fetchItems(dbName, true);
    expect(db.getLastGoodItems(dbName)?.items).toHaveLength(2);
  });

  it("freezes shared items outside production so callers must copy", () => {
    const items = db.getLastGoodItems(dbName)!.items;
    expect(Object.isFrozen(items)).toBe(true);
    expect(() => {
      (items[0] as Record<string, unknown>).title = "changed";
    }).toThrow();
  });

  it("returns the last good copy even after the TTL expired, flagged stale", () => {
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(realNow() + 365 * 24 * 60 * 60 * 1000);
    const got = db.getLastGoodItems(dbName);
    expect(got?.items).toHaveLength(1);
    expect(got?.stale).toBe(true);
    expect(db.getMappedItems(dbName)).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("returns null when the database never had a copy", () => {
    db.clearCache(dbName);
    expect(db.getLastGoodItems(dbName)).toBeNull();
  });
});

describe("refreshIfExpired", () => {
  const rowsFile = () => path.join(contentRoot, "db", dbName, "rows.yml");

  it("does nothing while the copy is fresh", async () => {
    const spy = vi.spyOn(db, "fetchItems");
    await db.refreshIfExpired(dbName);
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the last good copy when the source fails, then waits out the cool-down", async () => {
    const realNow = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(realNow + 365 * 24 * 60 * 60 * 1000);
    fs.rmSync(rowsFile());
    const spy = vi.spyOn(db, "fetchItems");

    await expect(db.refreshIfExpired(dbName)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(db.getLastGoodItems(dbName)?.items).toHaveLength(1);

    now.mockReturnValue(realNow + 365 * 24 * 60 * 60 * 1000 + 60_000);
    await db.refreshIfExpired(dbName);
    expect(spy).toHaveBeenCalledTimes(1);

    writeFixture([{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
    await db.fetchItems(dbName, true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(db.getLastGoodItems(dbName)?.items).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it("calls the source again after the cool-down", async () => {
    const realNow = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(realNow + 365 * 24 * 60 * 60 * 1000);
    fs.rmSync(rowsFile());
    const spy = vi.spyOn(db, "fetchItems");
    await db.refreshIfExpired(dbName);
    now.mockReturnValue(realNow + 365 * 24 * 60 * 60 * 1000 + 6 * 60_000);
    await db.refreshIfExpired(dbName);
    expect(spy).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});
