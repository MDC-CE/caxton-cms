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

  it("keeps comments and blank lines when patching an existing file", () => {
    fs.writeFileSync(
      file(),
      [
        "meta:",
        "  enabled: true",
        "  ad_account_ids:",
        "    - '11111'",
        "",
        "# Diagnostics thresholds",
        "alert_thresholds:",
        "",
        "  # Severity",
        "  severity_spend_share_pct: 5 # share of spend",
        "  severity_spend_floor:",
        "    USD: 50",
        "",
        "  # Clicks -> visits",
        "  clicks_visits_drop_pct: 30",
        "  ratio_min_clicks: 100",
        "test_email_patterns: []",
        "",
      ].join("\n"),
    );
    writeAdsConfigRaw(
      {
        meta: { enabled: true, ad_account_ids: ["11111", "22222"] },
        alert_thresholds: { severity_spend_share_pct: 10, severity_spend_floor: { USD: 50 }, clicks_visits_drop_pct: 30 },
        test_email_patterns: ["*@example.com"],
      },
      root,
    );
    const text = fs.readFileSync(file(), "utf-8");
    expect(text).toContain("\n\n# Diagnostics thresholds\nalert_thresholds:\n\n  # Severity\n");
    expect(text).toContain("severity_spend_share_pct: 10 # share of spend");
    expect(text).toContain("\n\n  # Clicks -> visits\n  clicks_visits_drop_pct: 30\n");
    expect(text).not.toContain("ratio_min_clicks");
    const raw = readAdsConfigRaw(root);
    expect(raw.ok && raw.data).toEqual({
      meta: { enabled: true, ad_account_ids: ["11111", "22222"] },
      alert_thresholds: { severity_spend_share_pct: 10, severity_spend_floor: { USD: 50 }, clicks_visits_drop_pct: 30 },
      test_email_patterns: ["*@example.com"],
    });
  });

  it("an unchanged save leaves the file byte-for-byte the same", () => {
    const original = "# top\nmeta:\n  enabled: false\n  ad_account_ids: ['33333']\n\n# hand-edited\nutm_convention:\n  case: any\n";
    fs.writeFileSync(file(), original);
    const raw = readAdsConfigRaw(root);
    writeAdsConfigRaw(raw.ok ? raw.data : {}, root);
    expect(fs.readFileSync(file(), "utf-8")).toBe(original);
  });
});
