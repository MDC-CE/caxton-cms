import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { CUTOVER_AUTHOR, cutoverMigratedIds, selectRecoveryFiles } from "./cutover";

describe("proposals cutover recovery", () => {
  it("finds proposals converted by the cutover only", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT, site TEXT, payload_json TEXT, attribution_json TEXT)`);
    const insert = db.prepare(`INSERT INTO events (type, site, payload_json, attribution_json) VALUES (?, ?, ?, ?)`);
    insert.run("proposal_migrated_v1", "s", JSON.stringify({ proposal_id: "p1" }), JSON.stringify([{ author: CUTOVER_AUTHOR }]));
    insert.run("proposal_migrated_v1", "s", JSON.stringify({ proposal_id: "p2" }), JSON.stringify([{ author: "ana" }]));
    insert.run("proposal_migrated_v1", "other", JSON.stringify({ proposal_id: "p3" }), JSON.stringify([{ author: CUTOVER_AUTHOR }]));
    insert.run("proposal_created", "s", JSON.stringify({ proposal_id: "p4" }), JSON.stringify([{ author: CUTOVER_AUTHOR }]));
    expect([...cutoverMigratedIds(db, "s")]).toEqual(["p1"]);
    db.close();
  });

  it("pushes the leftover drafts and their folder's versioning file, nothing else", () => {
    const pending = [
      "site_x/blog/a/draft-p123456.en.yml",
      "site_x/blog/a/versioning.yml",
      "site_x/blog/b/draft-pother.en.yml",
      "site_x/blog/b/versioning.yml",
      "site_x/landings/c/en.yml",
    ];
    const ids: Record<string, string> = {
      "site_x/blog/a/draft-p123456.en.yml": "p1",
      "site_x/blog/b/draft-pother.en.yml": "p9",
    };
    expect(selectRecoveryFiles(pending, new Set(["p1"]), (f) => ids[f] ?? null)).toEqual([
      "site_x/blog/a/draft-p123456.en.yml",
      "site_x/blog/a/versioning.yml",
    ]);
    expect(selectRecoveryFiles(pending, new Set(), (f) => ids[f] ?? null)).toEqual([]);
  });
});
