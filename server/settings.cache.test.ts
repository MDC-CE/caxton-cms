import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getAdsSettings, resetSettings } from "./settings";

function writeAccounts(file: string, ids: string[], mtime: Date) {
  const lines = ids.map((id) => `      - '${id}'`).join("\n");
  fs.writeFileSync(file, `ads:\n  meta:\n    enabled: true\n    ad_account_ids:\n${lines}\n`, "utf-8");
  fs.utimesSync(file, mtime, mtime);
}

describe("settings cache reloads on file change", () => {
  let tmp: string;
  let file: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "settings-cache-"));
    file = path.join(tmp, "settings.yml");
    resetSettings(tmp);
  });

  afterEach(() => {
    resetSettings(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("picks up a write from another process without resetSettings", () => {
    writeAccounts(file, ["11111"], new Date("2026-01-01T00:00:00Z"));
    expect(getAdsSettings(tmp).meta.ad_account_ids).toEqual(["11111"]);

    writeAccounts(file, ["11111", "22222"], new Date("2026-01-01T00:00:05Z"));
    expect(getAdsSettings(tmp).meta.ad_account_ids).toEqual(["11111", "22222"]);
  });

  it("keeps the last good settings when the file is unparseable, then recovers", () => {
    writeAccounts(file, ["11111"], new Date("2026-01-01T00:00:00Z"));
    expect(getAdsSettings(tmp).meta.ad_account_ids).toEqual(["11111"]);

    fs.writeFileSync(file, "ads:\n  meta: [unclosed\n", "utf-8");
    fs.utimesSync(file, new Date("2026-01-01T00:00:05Z"), new Date("2026-01-01T00:00:05Z"));
    expect(getAdsSettings(tmp).meta.ad_account_ids).toEqual(["11111"]);
    expect(getAdsSettings(tmp).meta.enabled).toBe(true);

    writeAccounts(file, ["33333"], new Date("2026-01-01T00:00:10Z"));
    expect(getAdsSettings(tmp).meta.ad_account_ids).toEqual(["33333"]);
  });
});
