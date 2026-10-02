import { describe, expect, it } from "vitest";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import {
  AdsIdFilterError,
  clampAdsLimit,
  clampAdsOffset,
  filterIssuesByIds,
  parseAdIdFilters,
  parseAdIdList,
  parseIssueIds,
  trimIssueAds,
} from "./ads-query";

function issue(id: string, ads = 5): AdsIssue {
  return {
    id,
    code: "missing_tracking_params",
    severity: "warning",
    title: id,
    why: "",
    how_to_fix: "",
    spend_affected: { USD: 10 },
    scope: {},
    site_fixable: false,
    details: {
      ads: Array.from({ length: ads }, (_, i) => ({ ad_id: `ad${i}` }) as never),
      ads_total: ads,
      ads_offset: 0,
    },
  };
}

describe("trimming helpers", () => {
  it("pages each issue's ads and keeps the total", () => {
    const [t] = trimIssueAds([issue("x", 7)], 3, 2);
    expect(t!.details!.ads.map((a) => a.ad_id)).toEqual(["ad2", "ad3", "ad4"]);
    expect(t!.details).toMatchObject({ ads_total: 7, ads_offset: 2 });
    const noDetails = { ...issue("y"), details: undefined };
    expect(trimIssueAds([noDetails], 3, 0)[0]).toBe(noDetails);
  });

  it("clamps limits / offsets and parses issue ids", () => {
    expect(clampAdsLimit(undefined, 3)).toBe(3);
    expect(clampAdsLimit("500", 3)).toBe(200);
    expect(clampAdsLimit("0", 50)).toBe(50);
    expect(clampAdsOffset("-4")).toBe(0);
    expect(clampAdsOffset("12")).toBe(12);
    expect(parseIssueIds("a, b,,a")).toEqual(["a", "b"]);
    expect(parseIssueIds(["dest:x.com|/a,b"])).toEqual(["dest:x.com|/a,b"]);
    expect(parseIssueIds(Array.from({ length: 12 }, (_, i) => `i${i}`))).toHaveLength(10);
    expect(parseIssueIds(undefined)).toEqual([]);
  });
});

describe("id filters", () => {
  const ad = (ad_id: string, adset_id: string, campaign_id: string) => ({ ad_id, adset_id, campaign_id }) as never;
  const withAds = (id: string, ads: unknown[], extra: Record<string, unknown> = {}): AdsIssue => ({
    ...issue(id, 0),
    details: { ads: ads as never, ads_total: ads.length, ads_offset: 0, ...extra },
  });

  it("parses numeric id lists and rejects bad or too many ids", () => {
    expect(parseAdIdFilters({ campaign_ids: ["1", "2", "1"], "ad_ids[]": "5,6" })).toEqual({ campaign_ids: ["1", "2"], ad_ids: ["5", "6"] });
    expect(parseAdIdFilters({})).toEqual({});
    expect(() => parseAdIdList(["12a"], "ad_ids")).toThrow(AdsIdFilterError);
    expect(() => parseAdIdList(Array.from({ length: 21 }, (_, i) => String(i)), "ad_ids")).toThrow(/at most 20/);
  });

  it("keeps matching issues, narrows their ads and totals, and keeps issues with no ad scope", () => {
    const issues = [
      withAds("a", [ad("1", "10", "100"), ad("2", "20", "200"), ad("3", "10", "100")]),
      withAds("b", [ad("4", "40", "400")]),
      { ...issue("sync"), details: undefined },
      withAds("dest", [], { ga4_seen: [{ campaign_id: "100", adset_id: null, ad_id: null }, { campaign_id: "999", adset_id: null, ad_id: null }] }),
    ];
    const out = filterIssuesByIds(issues, { campaign_ids: ["100"] });
    expect(out.map((i) => i.id)).toEqual(["a", "sync", "dest"]);
    expect(out[0]!.details!.ads.map((a) => a.ad_id)).toEqual(["1", "3"]);
    expect(out[0]!.details!.ads_total).toBe(2);
    expect(out[2]!.details!.ga4_seen).toHaveLength(1);
    expect(filterIssuesByIds(issues, { campaign_ids: ["100"], adset_ids: ["20"] }).map((i) => i.id)).toEqual(["sync"]);
    expect(filterIssuesByIds(issues, {})).toBe(issues);
  });
});
