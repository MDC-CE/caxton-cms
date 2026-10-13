import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { SqliteCache } from "./db-cache";

const temps: string[] = [];

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-cache-"));
  temps.push(dir);
  return path.join(dir, "db-cache.sqlite");
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("SqliteCache item_count", () => {
  it("stores items.length on write and later reads only that integer", () => {
    const cache = new SqliteCache(tempDbPath());
    cache.write("posts", {
      fetched_at: "2026-10-06T00:00:00.000Z",
      items: [{ slug: "a" }, { slug: "b" }],
      raw_count: 99,
    });

    expect(cache.getCacheStats().perDb.posts).toEqual({
      item_count: 2,
      fetched_at: "2026-10-06T00:00:00.000Z",
    });
  });

  it("fills a missing count once, then keeps the stored integer", () => {
    const dbPath = tempDbPath();
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE cache_entries (
        db_name TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT '',
        fetched_at TEXT NOT NULL,
        raw_count INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (db_name, variant)
      )
    `);
    legacy
      .prepare(
        "INSERT INTO cache_entries (db_name, variant, fetched_at, raw_count, payload) VALUES (?, '', ?, ?, ?)",
      )
      .run("posts", "2026-10-06T00:00:00.000Z", 1, JSON.stringify([{ slug: "a" }, { slug: "b" }, { slug: "c" }]));
    legacy.close();

    const cache = new SqliteCache(dbPath);
    expect(cache.getCacheStats().perDb.posts?.item_count).toBe(3);

    const rewrite = new Database(dbPath);
    rewrite
      .prepare("UPDATE cache_entries SET payload = ? WHERE db_name = ? AND variant = ''")
      .run(JSON.stringify([{ slug: "only" }]), "posts");
    rewrite.close();

    expect(cache.getCacheStats().perDb.posts?.item_count).toBe(3);
  });
});
