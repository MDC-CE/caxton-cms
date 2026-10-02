import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAdsSettings } from "@shared/ads-settings";
import { adsConfigReadError, loadAdsConfig, readAdsConfigRaw, resetAdsConfig, writeAdsConfigRaw } from "./ads-config";

let root: string;
const file = () => path.join(root, "ads-config.yml");
const legacy = (present: boolean, raw: unknown = undefined) => () => ({ present, settings: parseAdsSettings(raw) });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ads-config-"));
  resetAdsConfig();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("loadAdsConfig", () => {
  it("missing file → legacy settings.yml block", () => {
    const load = loadAdsConfig(root, legacy(true, { meta: { enabled: true, ad_account_ids: ["11111"] } }));
    expect(load.status).toEqual({ status: "missing", source: "settings" });
    expect(load.settings.meta.ad_account_ids).toEqual(["11111"]);
  });

  it("missing file and no legacy block → defaults", () => {
    expect(loadAdsConfig(root, legacy(false)).status).toEqual({ status: "missing", source: "defaults" });
  });

  it("ads-config.yml wins over the legacy block", () => {
    fs.writeFileSync(file(), "meta:\n  enabled: true\n  ad_account_ids: ['22222']\n");
    const load = loadAdsConfig(root, legacy(true, { meta: { ad_account_ids: ["11111"] } }));
    expect(load.status).toEqual({ status: "ok", source: "ads-config" });
    expect(load.settings.meta.ad_account_ids).toEqual(["22222"]);
  });

  it("unreadable file keeps the last good parse and never falls back to the legacy block", () => {
    fs.writeFileSync(file(), "meta:\n  ad_account_ids: ['22222']\n");
    loadAdsConfig(root, legacy(true));
    fs.writeFileSync(file(), "meta: [unclosed\n  - x: : :\n");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(file(), future, future);
    const load = loadAdsConfig(root, legacy(true, { meta: { ad_account_ids: ["11111"] } }));
    expect(load.status.status).toBe("unreadable");
    expect(load.status.error).toBeTruthy();
    expect(load.settings.meta.ad_account_ids).toEqual(["22222"]);
    expect(adsConfigReadError(root)).toBeTruthy();
  });

  it("top level that isn't a mapping is unreadable", () => {
    fs.writeFileSync(file(), "- a\n- b\n");
    expect(readAdsConfigRaw(root)).toEqual({ ok: false, error: "top level is not a mapping" });
  });

  it("adsConfigReadError is null when the file is missing or fine", () => {
    expect(adsConfigReadError(root)).toBeNull();
    fs.writeFileSync(file(), "meta: {}\n");
    expect(adsConfigReadError(root)).toBeNull();
  });
});

describe("writeAdsConfigRaw", () => {
  it("keeps hand-edited keys passed in data", () => {
    writeAdsConfigRaw({ meta: { enabled: false }, utm_convention: { mediums: { meta: "cpc" } } }, root);
    const raw = readAdsConfigRaw(root);
    expect(raw.ok && raw.data.utm_convention).toEqual({ mediums: { meta: "cpc" } });
    expect(loadAdsConfig(root, legacy(false)).settings.utm_convention.mediums.meta).toBe("cpc");
  });
});
