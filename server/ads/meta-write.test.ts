import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdsForFix, parseAdForFix, replaceAdUrlTags } from "./meta-write";
import { MetaApiError } from "./meta-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("parseAdForFix", () => {
  it("reads the reusable post, dynamic and catalog flags", () => {
    const ad = parseAdForFix({
      id: "a1",
      name: "Ad 1",
      account_id: "act_123",
      campaign_id: "c1",
      effective_status: "ACTIVE",
      creative: {
        id: "cr1",
        url_tags: "utm_source=facebook",
        effective_object_story_id: "page_post",
        object_story_spec: { link_data: { link: "https://4geeks.com/x" } },
      },
    });
    expect(ad).toMatchObject({
      ad_id: "a1",
      account_id: "123",
      story_id: "page_post",
      url_tags: "utm_source=facebook",
      links: ["https://4geeks.com/x"],
      dynamic_creative: false,
      catalog: false,
    });
    expect(parseAdForFix({ id: "a2", creative: { asset_feed_spec: {} } })?.dynamic_creative).toBe(true);
    expect(parseAdForFix({ id: "a3", creative: { product_set_id: "p" } })?.catalog).toBe(true);
  });
});

describe("meta-write requests", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.META_ADS_ACCESS_TOKEN = "meta-token";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    delete process.env.META_ADS_ACCESS_TOKEN;
    vi.unstubAllGlobals();
  });

  it("fails as an auth error without the Meta token", async () => {
    delete process.env.META_ADS_ACCESS_TOKEN;
    const err = await fetchAdsForFix(["a1"]).catch((e) => e);
    expect((err as MetaApiError).kind).toBe("auth");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads each ad by id with the shared Meta token (no ?ids=)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1", creative: { effective_object_story_id: "p1" } }));
    const ads = await fetchAdsForFix(["a1"]);
    const url = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(url.pathname).toMatch(/\/a1$/);
    expect(url.searchParams.has("ids")).toBe(false);
    expect(url.searchParams.get("access_token")).toBe("meta-token");
    expect(ads.get("a1")?.story_id).toBe("p1");
  });

  it("omits deleted ads but stops on permission errors", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "a1", creative: { effective_object_story_id: "p1" } }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Unsupported get request", code: 100 } }, 400));
    const ads = await fetchAdsForFix(["a1", "gone"]);
    expect([...ads.keys()]).toEqual(["a1"]);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "no perms", code: 200 } }, 403));
    const err = await fetchAdsForFix(["a1"]).catch((e) => e);
    expect((err as MetaApiError).kind).toBe("permission");
  });

  it("creates a creative from the same post, then points the ad at it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "new_cr" })).mockResolvedValueOnce(jsonResponse({ success: true }));
    const out = await replaceAdUrlTags({ accountId: "123", adId: "a1", storyId: "p1", urlTags: "utm_source=facebook", name: "Ad 1" });
    expect(out.creative_id).toBe("new_cr");

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(createUrl)).toContain("/act_123/adcreatives");
    const createBody = createInit.body as URLSearchParams;
    expect(createBody.get("object_story_id")).toBe("p1");
    expect(createBody.get("url_tags")).toBe("utm_source=facebook");

    const [adUrl, adInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(String(adUrl)).toMatch(/\/a1$/);
    expect((adInit.body as URLSearchParams).get("creative")).toBe(JSON.stringify({ creative_id: "new_cr" }));
  });

  it("classifies permission errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "no perms", code: 200 } }, 403));
    const err = await replaceAdUrlTags({ accountId: "1", adId: "a", storyId: "p", urlTags: "x=1", name: "n" }).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as MetaApiError).kind).toBe("permission");
  });
});
