import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADS_ALERT_THRESHOLDS,
  MAX_KNOWN_EXTERNAL_CAMPAIGNS,
  isKnownExternalCampaign,
  parseAdsSettings,
  parseKnownExternalCampaigns,
} from "./ads-settings";

describe("parseKnownExternalCampaigns", () => {
  it("accepts objects and plain strings, trims, and drops blanks", () => {
    expect(parseKnownExternalCampaigns([{ key: " 120249995075650344 ", note: " Agency " }, "Spring promo", 42, { key: "  " }, null])).toEqual([
      { key: "120249995075650344", note: "Agency" },
      { key: "Spring promo" },
      { key: "42" },
    ]);
  });

  it("dedupes case-insensitively and caps length and count", () => {
    const long = "x".repeat(300);
    const parsed = parseKnownExternalCampaigns(["Promo", "promo", long]);
    expect(parsed.map((c) => c.key)).toEqual(["Promo", "x".repeat(200)]);
    const many = Array.from({ length: MAX_KNOWN_EXTERNAL_CAMPAIGNS + 20 }, (_, i) => `c${i}`);
    expect(parseKnownExternalCampaigns(many)).toHaveLength(MAX_KNOWN_EXTERNAL_CAMPAIGNS);
  });

  it("returns [] for non-arrays", () => {
    expect(parseKnownExternalCampaigns(undefined)).toEqual([]);
    expect(parseKnownExternalCampaigns("abc")).toEqual([]);
  });
});

describe("isKnownExternalCampaign", () => {
  it("matches ignoring case and surrounding spaces", () => {
    const list = [{ key: "Spring Promo" }];
    expect(isKnownExternalCampaign(list, " spring promo ")).toBe(true);
    expect(isKnownExternalCampaign(list, "summer")).toBe(false);
  });
});

describe("parseAdsSettings", () => {
  it("defaults the unrecognized-campaign thresholds and known list", () => {
    const s = parseAdsSettings({ meta: { enabled: true } });
    expect(s.meta.known_external_campaigns).toEqual([]);
    expect(s.meta.alert_thresholds).toMatchObject({
      unrecognized_campaign_min_visits: 3,
      unrecognized_campaign_error_visits: 20,
      unrecognized_campaign_error_share_pct: 5,
      unrecognized_campaign_share_min_visits: 100,
    });
    expect(parseAdsSettings(null).meta.known_external_campaigns).toEqual([]);
  });

  it("reads overrides and the known list from YAML", () => {
    const s = parseAdsSettings({
      meta: {
        alert_thresholds: { unrecognized_campaign_min_visits: 10, unrecognized_campaign_error_share_pct: 2 },
        known_external_campaigns: [{ key: "123456789", note: "Partner" }],
      },
    });
    expect(s.meta.alert_thresholds.unrecognized_campaign_min_visits).toBe(10);
    expect(s.meta.alert_thresholds.unrecognized_campaign_error_share_pct).toBe(2);
    expect(s.meta.alert_thresholds.unrecognized_campaign_error_visits).toBe(DEFAULT_ADS_ALERT_THRESHOLDS.unrecognized_campaign_error_visits);
    expect(s.meta.known_external_campaigns).toEqual([{ key: "123456789", note: "Partner" }]);
  });
});
