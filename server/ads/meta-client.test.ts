import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listMetaAdAccounts,
  MetaApiError,
  parseAdAccount,
  parseCreative,
  parseInsightRow,
  resetMetaAdAccountCache,
} from "./meta-client";
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
        { action_type: "offsite_conversion.fb_pixel_lead", value: "3" },
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
    });
  });

  it("drops rows without a date or ad id", () => {
    expect(parseInsightRow({ ad_id: "a1" })).toBeNull();
    expect(parseInsightRow({ date_start: "2026-09-01" })).toBeNull();
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
