import { describe, expect, it } from "vitest";
import {
  adSourceTagState,
  classifyTraffic,
  fbcFromFbclid,
  hasCampaignSignals,
  metaPlacementFromPublisher,
  metaPlatformFromSource,
  normalizeLandingPath,
} from "./paid-traffic";

describe("Meta placements", () => {
  it("maps {{site_source_name}} values and leaves everything else not split", () => {
    expect(metaPlatformFromSource("fb")).toBe("facebook");
    expect(metaPlatformFromSource(" IG ")).toBe("instagram");
    expect(metaPlatformFromSource("msg")).toBe("messenger");
    expect(metaPlatformFromSource("an")).toBe("audience_network");
    expect(metaPlatformFromSource("facebook")).toBe("not_split");
    expect(metaPlatformFromSource("instagram")).toBe("not_split");
    expect(metaPlatformFromSource(null)).toBe("not_split");
  });

  it("maps publisher_platform and buckets unknown placements as other", () => {
    expect(metaPlacementFromPublisher("instagram")).toBe("instagram");
    expect(metaPlacementFromPublisher("audience_network")).toBe("audience_network");
    expect(metaPlacementFromPublisher("threads")).toBe("other");
  });

  it("marks ads split only when utm_source tags the platform", () => {
    expect(adSourceTagState({ utm_source: "{{site_source_name}}" })).toBe("split");
    expect(adSourceTagState({ utm_source: "{{ site_source_name }}" })).toBe("split");
    expect(adSourceTagState({ utm_source: "ig" })).toBe("split");
    expect(adSourceTagState({ utm_source: "facebook" })).toBe("not_split");
    expect(adSourceTagState({})).toBe("not_split");
    expect(adSourceTagState(null)).toBe("not_split");
  });

  it("classifies Messenger paid visits as Meta", () => {
    expect(classifyTraffic({ utm_source: "msg", utm_medium: "paid_social" }).platform).toBe("meta");
  });
});

describe("classifyTraffic", () => {
  it("treats paid medium from Meta sources as paid Meta", () => {
    expect(classifyTraffic({ utm_source: "facebook", utm_medium: "paid_social" })).toEqual({
      status: "paid",
      platform: "meta",
      click_id_type: null,
    });
  });

  it("marks fbclid-only visits as Meta unclear", () => {
    expect(classifyTraffic({ click_ids: { fbclid: "abc" } }).status).toBe("unclear");
    expect(classifyTraffic({ utm_source: "facebook", utm_medium: "social", click_ids: { fbclid: "abc" } }).status).toBe(
      "unclear",
    );
  });

  it("treats a known Meta id as paid even without a paid medium", () => {
    expect(classifyTraffic({ click_ids: { fbclid: "abc" }, matches_known_meta_id: true })).toMatchObject({
      status: "paid",
      platform: "meta",
    });
  });

  it("treats gclid alone as paid Google", () => {
    expect(classifyTraffic({ click_ids: { gclid: "g1" } })).toEqual({
      status: "paid",
      platform: "google",
      click_id_type: "gclid",
    });
  });

  it("returns organic without paid signals", () => {
    expect(classifyTraffic({ utm_source: "newsletter", utm_medium: "email" }).status).toBe("organic");
    expect(classifyTraffic({}).status).toBe("organic");
  });
});

describe("helpers", () => {
  it("normalizes landing paths", () => {
    expect(normalizeLandingPath("/en/bootcamp/?utm_source=x#top")).toBe("/en/bootcamp");
    expect(normalizeLandingPath("/")).toBe("/");
    expect(normalizeLandingPath("es/aplica")).toBe("/es/aplica");
  });

  it("derives fbc from fbclid", () => {
    expect(fbcFromFbclid("XYZ", 1700000000000)).toBe("fb.1.1700000000000.XYZ");
  });

  it("detects campaign signals", () => {
    expect(hasCampaignSignals({ utm_campaign: "spring" })).toBe(true);
    expect(hasCampaignSignals({ gclid: "1" })).toBe(true);
    expect(hasCampaignSignals({ coupon: "SAVE" })).toBe(false);
  });
});
