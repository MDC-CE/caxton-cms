import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ADS_SETTINGS, type AdsSettings } from "@shared/ads-settings";
import type { MetaAdDayRow, MetaCustomConversion } from "./meta-client";

const RMI = "1086440567304045";
const APP = "1634685814697001";

const h = vi.hoisted(() => ({
  token: true,
  live: {} as Record<string, MetaCustomConversion[] | Error>,
  cached: {} as Record<string, { conversions: MetaCustomConversion[]; error?: string }>,
  rows: [] as MetaAdDayRow[],
  calls: 0,
}));

vi.mock("./meta-client", () => ({
  isMetaTokenConfigured: () => h.token,
  fetchCustomConversions: async (id: string) => {
    h.calls++;
    const v = h.live[id];
    if (v instanceof Error) throw v;
    return v ?? [];
  },
}));
vi.mock("./meta-ads-days", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  loadMetaCustomConversions: () => ({ fetched_at: "", accounts: h.cached }),
  loadMetaRows: () => h.rows,
}));

const { listLeadConversionOptions, resetConversionOptionsCache } = await import("./meta-conversion-options");

const conv = (id: string, name: string, archived = false): MetaCustomConversion => ({
  id,
  name,
  pixel_id: "414",
  pixel_name: "4Geeks",
  custom_event_type: "LEAD",
  last_fired_time: null,
  archived,
});
const settings = (lead_conversions: string[] = []): AdsSettings => ({
  ...DEFAULT_ADS_SETTINGS,
  meta: { ...DEFAULT_ADS_SETTINGS.meta, ad_account_ids: ["111", "222"], lead_conversions },
});

beforeEach(() => {
  resetConversionOptionsCache();
  h.token = true;
  h.live = {};
  h.cached = {};
  h.rows = [];
  h.calls = 0;
});

describe("listLeadConversionOptions", () => {
  it("lists the standard Lead event first, then custom conversions with per-account availability", async () => {
    h.live = { "111": [conv(RMI, "request_more_info"), conv(APP, "student_application")], "222": [conv(RMI, "request_more_info")] };
    const r = await listLeadConversionOptions({ site: "s", settings: settings(), accountIds: ["111", "222"] });
    expect(r.options.map((o) => [o.key, o.accounts, o.missing_accounts])).toEqual([
      ["fb_pixel_lead", ["111", "222"], []],
      [RMI, ["111", "222"], []],
      [APP, ["111"], ["222"]],
    ]);
    expect(r.accounts).toEqual([
      { id: "111", source: "live" },
      { id: "222", source: "live" },
    ]);
  });

  it("caches live reads and falls back to the sync file when Meta fails", async () => {
    h.live = { "111": [conv(RMI, "request_more_info")] };
    await listLeadConversionOptions({ site: "s", settings: settings(), accountIds: ["111"] });
    await listLeadConversionOptions({ site: "s", settings: settings(), accountIds: ["111"] });
    expect(h.calls).toBe(1);

    h.live = { "222": new Error("rate limited") };
    h.cached = { "222": { conversions: [conv(APP, "student_application")] } };
    const r = await listLeadConversionOptions({ site: "s", settings: settings(), accountIds: ["222"] });
    expect(r.accounts).toEqual([{ id: "222", source: "cache", error: "rate limited" }]);
    expect(r.options.map((o) => o.key)).toEqual(["fb_pixel_lead", APP]);
  });

  it("keeps saved picks Meta no longer lists visible, and checks the form's picks for overlap", async () => {
    h.live = { "111": [conv(RMI, "request_more_info")] };
    h.cached = { "999": { conversions: [conv(APP, "student_application")] } };
    const row = (d: string, conversions: Record<string, number>) => ({ ad_id: "a", date: d, conversions, pixel_leads: conversions.fb_pixel_lead ?? 0 }) as MetaAdDayRow;
    h.rows = [row("2026-09-01", { fb_pixel_lead: 2, [RMI]: 2 }), row("2026-09-02", { fb_pixel_lead: 1, [RMI]: 1 }), row("2026-09-03", { fb_pixel_lead: 3, [RMI]: 3 })];
    const r = await listLeadConversionOptions({ site: "s", settings: settings([RMI, APP]), accountIds: ["111"], picked: ["fb_pixel_lead", RMI] });
    expect(r.unlisted_picked).toEqual([{ key: APP, name: "student_application" }]);
    expect(r.overlaps).toEqual([{ keys: ["fb_pixel_lead", RMI], names: ["Standard Lead event", "request_more_info"], both_days_pct: 100, count_diff_pct: 0 }]);
  });

  it("without a token reads the sync file only", async () => {
    h.token = false;
    h.cached = { "111": { conversions: [conv(RMI, "request_more_info")] } };
    const r = await listLeadConversionOptions({ site: "s", settings: settings(), accountIds: ["111", "222"] });
    expect(h.calls).toBe(0);
    expect(r.token_configured).toBe(false);
    expect(r.accounts).toEqual([
      { id: "111", source: "cache" },
      { id: "222", source: "none" },
    ]);
    expect(r.options.find((o) => o.key === RMI)?.missing_accounts).toEqual([]);
  });
});
