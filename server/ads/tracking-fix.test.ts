import { describe, expect, it, vi } from "vitest";
import type { AdsIssue, AdsIssueAd } from "@shared/ads-diagnostics-rules";
import { META_UTM_TEMPLATE } from "@shared/ads-settings";
import { MetaApiError } from "./meta-client";
import type { MetaAdForFix } from "./meta-write";
import { applyTrackingFix, mergeMissingTags, planAdFix, previewTrackingFix, type TrackingFixDeps } from "./tracking-fix";

function live(ad_id: string, over: Partial<MetaAdForFix> = {}): MetaAdForFix {
  return {
    ad_id,
    ad_name: `Ad ${ad_id}`,
    account_id: "123",
    campaign_id: "c1",
    effective_status: "ACTIVE",
    creative_id: "cr",
    url_tags: undefined,
    links: ["https://4geeks.com/landing"],
    instant_form: false,
    story_id: "page_post",
    dynamic_creative: false,
    catalog: false,
    ...over,
  };
}

function issueAd(ad_id: string): AdsIssueAd {
  return {
    ad_id,
    ad_name: `Ad ${ad_id}`,
    adset_id: "s1",
    adset_name: "Set",
    campaign_id: "c1",
    campaign_name: "Fall",
    account_id: "123",
    effective_status: "ACTIVE",
    spend: { USD: 10 },
    link_clicks: 1,
    impressions: 10,
    landing_page_views: 1,
    last_spend_date: null,
    landing_url: null,
    url_tags: null,
    missing: ["utm_source"],
  };
}

function issue(adIds: string[]): AdsIssue {
  return {
    id: "missing_tracking_params:c1",
    code: "missing_tracking_params",
    severity: "warning",
    title: "t",
    why: "w",
    how_to_fix: "h",
    spend_affected: {},
    scope: { campaign_id: "c1", campaign_name: "Fall", account_id: "123" },
    site_fixable: false,
    details: { ads: adIds.map(issueAd), ads_total: adIds.length, ads_offset: 0 } as AdsIssue["details"],
  };
}

function deps(liveAds: MetaAdForFix[], over: Partial<TrackingFixDeps> = {}): TrackingFixDeps {
  return {
    writeConfigured: () => true,
    fetchAds: vi.fn(async (ids: string[]) => new Map(liveAds.filter((a) => ids.includes(a.ad_id)).map((a) => [a.ad_id, a]))),
    replace: vi.fn(async () => ({ creative_id: "new" })),
    requestRefresh: vi.fn(async () => true),
    now: () => new Date("2026-09-30T00:00:00Z"),
    ...over,
  };
}

describe("mergeMissingTags", () => {
  it("adds the whole template when nothing is set", () => {
    expect(mergeMissingTags(undefined, "https://x.com/a")).toEqual({
      tags: META_UTM_TEMPLATE,
      added: ["utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_term", "utm_content"],
    });
  });

  it("keeps existing tags and only appends what is missing", () => {
    const { tags, added } = mergeMissingTags("utm_source=fb&utm_medium=cpc&custom=1", "https://x.com/a?utm_id=9");
    expect(added).toEqual(["utm_campaign", "utm_term", "utm_content"]);
    expect(tags.startsWith("utm_source=fb&utm_medium=cpc&custom=1&")).toBe(true);
    expect(tags).not.toContain("utm_id");
  });

  it("replaces empty params instead of repeating the key", () => {
    const { tags } = mergeMissingTags("utm_source=&utm_medium=paid_social", undefined);
    expect(tags.match(/utm_source=/g)).toHaveLength(1);
    expect(tags).toContain("utm_source={{site_source_name}}");
  });
});

describe("planAdFix", () => {
  const ref = { ad_id: "a1", ad_name: "A", account_id: "123" };
  const scope = { campaign_id: "c1", account_id: "123" };
  it.each([
    ["not_found", undefined],
    ["archived", live("a1", { effective_status: "ARCHIVED" })],
    ["outside_issue", live("a1", { campaign_id: "other" })],
    ["instant_form", live("a1", { instant_form: true })],
    ["already_tagged", live("a1", { url_tags: META_UTM_TEMPLATE })],
    ["dynamic_creative", live("a1", { dynamic_creative: true })],
    ["catalog", live("a1", { catalog: true })],
    ["no_post", live("a1", { story_id: null })],
  ] as const)("skips %s", (reason, ad) => {
    expect(planAdFix(ref, ad, scope)).toMatchObject({ status: "skipped", reason });
  });

  it("marks a plain ad fixable with before/after", () => {
    const p = planAdFix(ref, live("a1", { url_tags: "utm_source=facebook" }), scope);
    expect(p.status).toBe("fixable");
    expect(p.before).toBe("utm_source=facebook");
    expect(p.after?.startsWith("utm_source=facebook&utm_medium=paid_social")).toBe(true);
    expect(p.added).not.toContain("utm_source");
  });
});

describe("previewTrackingFix", () => {
  it("returns no ads when the Meta token is missing", async () => {
    const d = deps([live("a1")], { writeConfigured: () => false });
    const p = await previewTrackingFix(issue(["a1"]), d);
    expect(p.write_configured).toBe(false);
    expect(p.ads).toEqual([]);
    expect(d.fetchAds).not.toHaveBeenCalled();
  });

  it("lists fixable ads first", async () => {
    const p = await previewTrackingFix(issue(["a1", "a2"]), deps([live("a1", { catalog: true }), live("a2")]));
    expect(p.ads.map((a) => [a.ad_id, a.status])).toEqual([
      ["a2", "fixable"],
      ["a1", "skipped"],
    ]);
  });
});

describe("applyTrackingFix", () => {
  const base = { actor: "staff@4geeks.com", site: "4geeks-com" };

  it("fixes fixable ads, skips the rest, and requests a refresh", async () => {
    const d = deps([live("a1"), live("a2", { dynamic_creative: true })]);
    const r = await applyTrackingFix({ ...base, issue: issue(["a1", "a2"]), adIds: ["a1", "a2", "zz"] }, d);
    expect(r.fixed.map((a) => a.ad_id)).toEqual(["a1"]);
    expect(r.skipped.map((a) => [a.ad_id, a.reason])).toEqual([
      ["zz", "outside_issue"],
      ["a2", "dynamic_creative"],
    ]);
    expect(d.replace).toHaveBeenCalledWith(expect.objectContaining({ accountId: "123", adId: "a1", storyId: "page_post" }));
    expect(r.refresh_requested).toBe(true);
  });

  it("continues after a per-ad error", async () => {
    const replace = vi
      .fn()
      .mockRejectedValueOnce(new MetaApiError("bad creative", 400, 100, "other"))
      .mockResolvedValueOnce({ creative_id: "new" });
    const r = await applyTrackingFix({ ...base, issue: issue(["a1", "a2"]), adIds: ["a1", "a2"] }, deps([live("a1"), live("a2")], { replace }));
    expect(r.failed.map((a) => a.ad_id)).toEqual(["a1"]);
    expect(r.fixed.map((a) => a.ad_id)).toEqual(["a2"]);
    expect(r.stopped).toBeUndefined();
  });

  it("stops on a permission error and does not refresh", async () => {
    const replace = vi.fn().mockRejectedValue(new MetaApiError("no perms", 403, 200, "permission"));
    const d = deps([live("a1"), live("a2")], { replace });
    const r = await applyTrackingFix({ ...base, issue: issue(["a1", "a2"]), adIds: ["a1", "a2"] }, d);
    expect(r.stopped?.kind).toBe("permission");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(r.skipped.map((a) => [a.ad_id, a.reason])).toEqual([["a2", "not_attempted"]]);
    expect(d.requestRefresh).not.toHaveBeenCalled();
  });
});
