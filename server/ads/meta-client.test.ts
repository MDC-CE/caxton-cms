import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  conversionCounts,
  fetchAdCreatives,
  listMetaAdAccounts,
  MetaApiError,
  parseAdAccount,
  parseCreative,
  parseCustomConversion,
  parseAdPlatformRow,
  parseInsightRow,
  parsePixelEventStats,
  resetMetaAdAccountCache,
} from "./meta-client";

describe("parseAdPlatformRow", () => {
  it("maps the placement, spend and clicks per ad", () => {
    expect(
      parseAdPlatformRow({
        date_start: "2026-09-01",
        account_id: "act_123",
        account_currency: "usd",
        campaign_id: "c1",
        adset_id: "s1",
        ad_id: "a1",
        publisher_platform: "instagram",
        spend: "4.5",
        impressions: "300",
        inline_link_clicks: "12",
        actions: [{ action_type: "offsite_conversion.fb_pixel_lead", value: "1" }],
      }),
    ).toEqual({
      date: "2026-09-01",
      account_id: "123",
      currency: "USD",
      campaign_id: "c1",
      adset_id: "s1",
      ad_id: "a1",
      platform: "instagram",
      spend: 4.5,
      impressions: 300,
      link_clicks: 12,
      pixel_leads: 1,
      conversions: { fb_pixel_lead: 1 },
    });
  });

  it("buckets unknown placements as other and drops rows without date or ad", () => {
    expect(parseAdPlatformRow({ date_start: "2026-09-01", ad_id: "a1", publisher_platform: "threads" })?.platform).toBe("other");
    expect(parseAdPlatformRow({ ad_id: "a1" })).toBeNull();
  });
});
import { datesForMode, META_BACKFILL_DAYS } from "./meta-ads-days";

describe("parseInsightRow", () => {
  it("maps spend, clicks and lead actions", () => {
    const row = parseInsightRow({
      date_start: "2026-09-01",
      account_id: "123456",
      account_currency: "usd",
      campaign_id: "c1",
      campaign_name: "Fall",
      adset_id: "s1",
      ad_id: "a1",
      spend: "12.34",
      impressions: "1000",
      inline_link_clicks: "40",
      actions: [
        { action_type: "landing_page_view", value: "30" },
        {
          action_type: "offsite_conversion.fb_pixel_lead",
          value: "3",
          "7d_click": "2",
          "1d_view": "1",
        },
        { action_type: "lead", value: "2" },
      ],
    });
    expect(row).toMatchObject({
      date: "2026-09-01",
      currency: "USD",
      spend: 12.34,
      link_clicks: 40,
      landing_page_views: 30,
      pixel_leads: 3,
      instant_form_leads: 2,
      pixel_leads_click: 2,
      pixel_leads_view: 1,
    });
  });

  it("sets click/view lead splits to 0 when window fields are missing", () => {
    const row = parseInsightRow({
      date_start: "2026-09-01",
      ad_id: "a1",
      actions: [{ action_type: "offsite_conversion.fb_pixel_lead", value: "3" }],
    });
    expect(row?.pixel_leads).toBe(3);
    expect(row?.pixel_leads_click).toBe(0);
    expect(row?.pixel_leads_view).toBe(0);
  });

  it("drops rows without a date or ad id", () => {
    expect(parseInsightRow({ ad_id: "a1" })).toBeNull();
    expect(parseInsightRow({ date_start: "2026-09-01" })).toBeNull();
  });

  it("keeps standard Lead and custom conversions by id, ignoring other actions", () => {
    const row = parseInsightRow({
      date_start: "2026-09-01",
      ad_id: "a1",
      actions: [
        { action_type: "offsite_conversion.fb_pixel_lead", value: "2" },
        { action_type: "offsite_conversion.custom.1086440567304045", value: "5" },
        { action_type: "offsite_conversion.custom.abc", value: "9" },
        { action_type: "offsite_conversion.fb_pixel_custom", value: "40" },
        { action_type: "lead", value: "3" },
        { action_type: "offsite_conversion.custom.1634685814697001", value: "0" },
      ],
    });
    expect(row?.conversions).toEqual({ fb_pixel_lead: 2, "1086440567304045": 5 });
  });
});

describe("conversionCounts", () => {
  it("returns {} for missing actions", () => {
    expect(conversionCounts(undefined)).toEqual({});
  });
});

describe("parseCustomConversion", () => {
  it("maps name, pixel and archived flag; drops non-numeric ids", () => {
    expect(
      parseCustomConversion({
        id: "1086440567304045",
        name: "request_more_info",
        custom_event_type: "OTHER",
        last_fired_time: "2026-09-30T16:19:51+0000",
        is_archived: false,
        pixel: { id: "414048075447471", name: "4GeeksAcademy" },
      }),
    ).toEqual({
      id: "1086440567304045",
      name: "request_more_info",
      pixel_id: "414048075447471",
      pixel_name: "4GeeksAcademy",
      custom_event_type: "OTHER",
      last_fired_time: "2026-09-30T16:19:51+0000",
      archived: false,
    });
    expect(parseCustomConversion({ id: "x" })).toBeNull();
  });
});

describe("parsePixelEventStats", () => {
  it("sums per event with hourly buckets, sorted by total", () => {
    const stats = parsePixelEventStats([
      { timestamp: "2026-09-30T15:00:00", data: [{ value: "Lead", count: 2 }, { value: "PageView", count: 50 }] },
      { timestamp: "2026-09-30T16:00:00", data: [{ value: "Lead", count: "3" }, { value: "empty", count: 0 }] },
      { data: [{ value: "Lead", count: 9 }] },
    ]);
    expect(stats).toEqual([
      { event: "PageView", total: 50, hourly: { "2026-09-30T15:00:00": 50 } },
      { event: "Lead", total: 5, hourly: { "2026-09-30T15:00:00": 2, "2026-09-30T16:00:00": 3 } },
    ]);
  });
});

describe("parseCreative", () => {
  it("collects links, url_tags and the Instant Form flag", () => {
    const c = parseCreative({
      id: "a1",
      campaign_id: "c1",
      creative: {
        url_tags: "utm_source=facebook&utm_medium=paid_social",
        object_story_spec: {
          link_data: { link: "https://4geeks.com/en/bootcamp", call_to_action: { value: { lead_gen_form_id: "f1" } } },
        },
        asset_feed_spec: { link_urls: [{ website_url: "https://4geeks.com/en/other" }] },
      },
    });
    expect(c?.links).toEqual(["https://4geeks.com/en/bootcamp", "https://4geeks.com/en/other"]);
    expect(c?.instant_form).toBe(true);
    expect(c?.url_tags).toContain("paid_social");
    expect(c).not.toHaveProperty("optimization_event");
  });

  it("reads the conversion the ad set optimizes for as a lead key", () => {
    const withAdset = (promoted_object: Record<string, unknown>) =>
      parseCreative({ id: "a1", adset: { promoted_object, id: "s1" }, creative: {} })?.optimization_event;
    expect(withAdset({ pixel_id: "414", custom_conversion_id: "1086440567304045" })).toBe("1086440567304045");
    expect(withAdset({ pixel_id: "414", custom_event_type: "LEAD" })).toBe("fb_pixel_lead");
    expect(withAdset({ pixel_id: "414", custom_event_type: "PURCHASE" })).toBeUndefined();
  });

  it("parses Instant Form and links from the slim nested story shape", () => {
    const c = parseCreative({
      id: "a2",
      creative: {
        link_url: "https://4geeks.com/landing/x",
        object_story_spec: {
          link_data: {
            link: "https://4geeks.com/landing/x",
            call_to_action: { value: { lead_gen_form_id: "form9" } },
            child_attachments: [{ link: "https://4geeks.com/landing/y", call_to_action: { value: { link: "https://4geeks.com/landing/z" } } }],
          },
          video_data: { call_to_action: { value: { link: "https://4geeks.com/landing/v" } } },
        },
        asset_feed_spec: { link_urls: [{ website_url: "https://4geeks.com/landing/feed" }] },
      },
    });
    expect(c?.instant_form).toBe(true);
    expect(c?.links).toEqual(
      expect.arrayContaining([
        "https://4geeks.com/landing/x",
        "https://4geeks.com/landing/y",
        "https://4geeks.com/landing/z",
        "https://4geeks.com/landing/v",
        "https://4geeks.com/landing/feed",
      ]),
    );
  });
});

describe("fetchAdCreatives", () => {
  const originalToken = process.env.META_ADS_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.META_ADS_ACCESS_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) delete process.env.META_ADS_ACCESS_TOKEN;
    else process.env.META_ADS_ACCESS_TOKEN = originalToken;
  });

  function jsonResponse(body: unknown, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }

  it("requests page size 50 with slim fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "a1", creative: { link_url: "https://4geeks.com/x" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const ads = await fetchAdCreatives("111");
    expect(ads).toHaveLength(1);
    expect(ads[0]?.links).toContain("https://4geeks.com/x");
    const url = decodeURIComponent(String(fetchMock.mock.calls[0]![0]));
    expect(url).toContain("limit=50");
    expect(url).toContain("object_story_spec{link_data{link,call_to_action");
    expect(url).not.toContain("creative{link_url,url_tags,object_story_spec,asset_feed_spec");
  });

  it("retries at limit 25 when Meta says to reduce the amount of data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Please reduce the amount of data you're asking for, then retry your request", code: 1 } }, 500),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "a9", creative: { url_tags: "utm_content=a9" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const ads = await fetchAdCreatives("222");
    expect(ads).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("limit=25");
  });

  it("does not retry unrelated Graph errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Missing permission", code: 200 } }, 403)),
    );
    await expect(fetchAdCreatives("333")).rejects.toMatchObject({ kind: "permission" });
  });
});

describe("parseAdAccount", () => {
  it("strips act_ and falls back to id", () => {
    expect(parseAdAccount({ id: "act_123", name: "Main", currency: "usd", account_status: 1 })).toEqual({
      id: "123",
      name: "Main",
      currency: "USD",
      account_status: 1,
    });
    expect(parseAdAccount({ account_id: "456", id: "act_456" })?.id).toBe("456");
    expect(parseAdAccount({ id: "not-a-number" })).toBeNull();
  });
});

describe("listMetaAdAccounts", () => {
  const originalToken = process.env.META_ADS_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.META_ADS_ACCESS_TOKEN = "test-token";
    resetMetaAdAccountCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) delete process.env.META_ADS_ACCESS_TOKEN;
    else process.env.META_ADS_ACCESS_TOKEN = originalToken;
    resetMetaAdAccountCache();
  });

  function jsonResponse(body: unknown, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }

  it("follows paging, dedupes, sorts by name and caches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ account_id: "2", id: "act_2", name: "Zeta", currency: "eur", account_status: 1 }],
          paging: { next: "https://graph.facebook.com/v21.0/me/adaccounts?after=x" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { account_id: "1", id: "act_1", name: "Alpha", currency: "usd", account_status: 2 },
            { account_id: "2", id: "act_2", name: "Zeta", currency: "eur", account_status: 1 },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const accounts = await listMetaAdAccounts({ now: 1000 });
    expect(accounts.map((a) => a.id)).toEqual(["1", "2"]);
    expect(accounts[0]).toMatchObject({ name: "Alpha", currency: "USD", account_status: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await listMetaAdAccounts({ now: 2000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps Graph errors to MetaApiError kinds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Missing permission", code: 200 } }, 403)),
    );
    await expect(listMetaAdAccounts()).rejects.toMatchObject({ name: "MetaApiError", kind: "permission" });
  });

  it("fails fast without a token", async () => {
    delete process.env.META_ADS_ACCESS_TOKEN;
    await expect(listMetaAdAccounts()).rejects.toBeInstanceOf(MetaApiError);
  });
});

describe("datesForMode", () => {
  const now = new Date("2026-09-29T10:00:00Z");
  it("backfills 90 days on first connect and refreshes 10 days after", () => {
    expect(datesForMode("refresh", [], now)).toEqual({ since: "2026-07-02", until: "2026-09-29" });
    expect(datesForMode("refresh", ["2026-09-01"], now)).toEqual({ since: "2026-09-20", until: "2026-09-29" });
  });
  it("loads older history in 90-day steps down to 13 months", () => {
    expect(datesForMode("older", ["2026-07-02"], now)).toEqual({ since: "2026-04-03", until: "2026-07-01" });
    expect(datesForMode("older", ["2025-08-31"], now)).toBeNull();
    expect(META_BACKFILL_DAYS).toBe(90);
  });
});
