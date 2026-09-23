import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import {
  DEFAULT_OPENRUSH_SETTINGS,
  getOpenRushSettings,
  parseOpenRushSettings,
  resetSettings,
  updateOpenRushSettings,
} from "./settings";

describe("parseOpenRushSettings", () => {
  it("returns defaults for missing input", () => {
    expect(parseOpenRushSettings(undefined)).toEqual(DEFAULT_OPENRUSH_SETTINGS);
  });

  it("clamps serp_top_n and budget fields", () => {
    expect(parseOpenRushSettings({ enabled: true, serp_top_n: 500 }).serp_top_n).toBe(100);
    expect(parseOpenRushSettings({ serp_top_n: 0 }).serp_top_n).toBe(1);
    expect(parseOpenRushSettings({ budget_warn_percent: 0 }).budget_warn_percent).toBe(1);
    expect(parseOpenRushSettings({ budget_warn_percent: 150 }).budget_warn_percent).toBe(99);
    expect(parseOpenRushSettings({ session_credit_limit: 10 }).session_credit_limit).toBe(10);
  });
});

describe("openrush settings.yml", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openrush-settings-"));
    resetSettings(tmp);
  });

  afterEach(() => {
    resetSettings(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("saves and reloads openrush without storing an API key", () => {
    fs.writeFileSync(path.join(tmp, "settings.yml"), "i18n: {}\n", "utf-8");
    const updated = updateOpenRushSettings(
      {
        enabled: true,
        serp_top_n: 20,
        location: "United States",
        language: "English",
        session_credit_limit: 40,
        daily_credit_limit: 150,
        budget_warn_percent: 75,
      },
      tmp,
    );
    expect(updated.enabled).toBe(true);
    expect(updated.session_credit_limit).toBe(40);
    expect(updated.daily_credit_limit).toBe(150);
    expect(updated.budget_warn_percent).toBe(75);
    resetSettings(tmp);
    expect(getOpenRushSettings(tmp).session_credit_limit).toBe(40);
    const parsed = yaml.load(fs.readFileSync(path.join(tmp, "settings.yml"), "utf-8")) as {
      openrush?: Record<string, unknown>;
    };
    expect(parsed.openrush).toMatchObject({
      enabled: true,
      serp_top_n: 20,
      session_credit_limit: 40,
      daily_credit_limit: 150,
      budget_warn_percent: 75,
    });
    expect(JSON.stringify(parsed.openrush)).not.toMatch(/api_key|OPENRUSH/i);
  });
});
