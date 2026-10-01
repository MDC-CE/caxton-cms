import { describe, expect, it } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS } from "@shared/ads-settings";
import {
  clicksByAd,
  isDubiousUtmContent,
  resolveAdTagging,
  resolveAdTaggingOnWindow,
} from "./observed-tagging";
import type { MetaAdDayRow } from "./meta-client";

const T = DEFAULT_ADS_ALERT_THRESHOLDS;

describe("isDubiousUtmContent", () => {
  it("accepts {{ad.id}} and the ad's own id", () => {
    expect(isDubiousUtmContent("a1", { utm_content: "{{ad.id}}" })).toBe(false);
    expect(isDubiousUtmContent("a1", { utm_content: "a1" })).toBe(false);
  });

  it("flags another ad's id, {{ad.name}}, and {{placement}}", () => {
    expect(isDubiousUtmContent("a1", { utm_content: "a2" })).toBe(true);
    expect(isDubiousUtmContent("a1", { utm_content: "{{ad.name}}" })).toBe(true);
    expect(isDubiousUtmContent("a1", { utm_content: "{{placement}}" })).toBe(true);
  });

  it("is not dubious when utm_content is absent", () => {
    expect(isDubiousUtmContent("a1", {})).toBe(false);
  });
});

describe("resolveAdTaggingOnWindow", () => {
  it("returns unverified with fewer than 4 complete days", () => {
    expect(resolveAdTaggingOnWindow({ clicks: 100, sessions: 50, completeDayCount: 3, thresholds: T })).toBe("unverified");
  });

  it("returns unverified when clicks are below the minimum", () => {
    expect(resolveAdTaggingOnWindow({ clicks: 19, sessions: 10, completeDayCount: 7, thresholds: T })).toBe("unverified");
  });

  it("returns meta_auto when sessions and ratio both clear the floors", () => {
    // 25 sessions / 100 clicks = 25% ≥ 10%, sessions ≥ 3
    expect(resolveAdTaggingOnWindow({ clicks: 100, sessions: 25, completeDayCount: 7, thresholds: T })).toBe("meta_auto");
  });

  it("returns none when clicks are enough but almost no tagged sessions (300 clicks / 3 sessions)", () => {
    expect(resolveAdTaggingOnWindow({ clicks: 300, sessions: 3, completeDayCount: 7, thresholds: T })).toBe("none");
  });

  it("returns none when sessions clear the min but the ratio does not", () => {
    // 3 / 100 = 3% < 10%
    expect(resolveAdTaggingOnWindow({ clicks: 100, sessions: 3, completeDayCount: 7, thresholds: T })).toBe("none");
  });
});

describe("resolveAdTagging", () => {
  it("uses the short window when it has enough clicks", () => {
    const r = resolveAdTagging({
      shortClicks: 50,
      shortSessions: 20,
      shortCompleteDays: 7,
      fallbackClicks: 300,
      fallbackSessions: 0,
      fallbackCompleteDays: 28,
      thresholds: T,
    });
    expect(r).toEqual({ state: "meta_auto", checked_clicks: 50, ga4_tagged_sessions: 20 });
  });

  it("falls back to the issue window when the short window lacks clicks", () => {
    const r = resolveAdTagging({
      shortClicks: 5,
      shortSessions: 0,
      shortCompleteDays: 7,
      fallbackClicks: 80,
      fallbackSessions: 2,
      fallbackCompleteDays: 28,
      thresholds: T,
    });
    expect(r).toEqual({ state: "none", checked_clicks: 80, ga4_tagged_sessions: 2 });
  });
});

describe("clicksByAd", () => {
  it("sums link clicks only on the given dates", () => {
    const rows: MetaAdDayRow[] = [
      { date: "2026-09-20", ad_id: "a1", link_clicks: 10 } as MetaAdDayRow,
      { date: "2026-09-21", ad_id: "a1", link_clicks: 5 } as MetaAdDayRow,
      { date: "2026-09-22", ad_id: "a1", link_clicks: 7 } as MetaAdDayRow,
      { date: "2026-09-20", ad_id: "a2", link_clicks: 3 } as MetaAdDayRow,
    ];
    const map = clicksByAd(rows, new Set(["2026-09-20", "2026-09-21"]));
    expect(map.get("a1")).toBe(15);
    expect(map.get("a2")).toBe(3);
  });
});
