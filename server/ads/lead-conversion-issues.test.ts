import { describe, expect, it } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS } from "@shared/ads-settings";
import type { MetaAdDayRow, MetaPixelEventStats } from "./meta-client";
import type { MetaCustomConversionsFile, MetaPixelEventsFile } from "./meta-ads-days";
import {
  conversionOverlapIssues,
  conversionStoppedIssues,
  findConversionOverlaps,
  findStoppedConversions,
  pixelLockstepIssues,
} from "./lead-conversion-issues";

const t = DEFAULT_ADS_ALERT_THRESHOLDS;
const RMI = "1086440567304045";
const APP = "1634685814697001";

function adDay(ad_id: string, date: string, conversions?: Record<string, number>): MetaAdDayRow {
  return {
    date,
    account_id: "111",
    currency: "USD",
    campaign_id: "c1",
    campaign_name: "C1",
    adset_id: "s1",
    adset_name: "S1",
    ad_id,
    ad_name: ad_id,
    spend: 10,
    impressions: 100,
    reach: 90,
    frequency: 1.1,
    link_clicks: 5,
    landing_page_views: 4,
    pixel_leads: conversions?.fb_pixel_lead ?? 0,
    instant_form_leads: 0,
    ...(conversions ? { conversions } : {}),
  };
}

describe("findConversionOverlaps", () => {
  const overlapping = [
    adDay("a1", "2026-09-01", { fb_pixel_lead: 3, [RMI]: 3 }),
    adDay("a1", "2026-09-02", { fb_pixel_lead: 2, [RMI]: 2 }),
    adDay("a2", "2026-09-02", { fb_pixel_lead: 1, [RMI]: 1 }),
    adDay("a2", "2026-09-03", { fb_pixel_lead: 1 }),
    adDay("a2", "2026-09-04", { [APP]: 4 }),
  ];

  it("flags two picks that report on the same ad-days with near-equal counts", () => {
    // Both report on 3 of 4 ad-days (75%), below the 80% threshold; one more shared day crosses it.
    expect(findConversionOverlaps(overlapping, ["fb_pixel_lead", RMI], t)).toEqual([]);
    const more = [...overlapping, adDay("a3", "2026-09-05", { fb_pixel_lead: 2, [RMI]: 2 })];
    expect(findConversionOverlaps(more, ["fb_pixel_lead", RMI], t)).toEqual([
      { keys: ["fb_pixel_lead", RMI], counts: [9, 8], ad_days: 5, both_days_pct: 80, count_diff_pct: 11.1 },
    ]);
  });

  it("ignores pairs that report on different ad-days, days without per-conversion counts, and tiny samples", () => {
    expect(findConversionOverlaps(overlapping, [RMI, APP], t)).toEqual([]);
    expect(findConversionOverlaps([adDay("a1", "2026-09-01"), adDay("a1", "2026-09-02")], ["fb_pixel_lead", RMI], t)).toEqual([]);
    expect(findConversionOverlaps(overlapping.slice(0, 2), ["fb_pixel_lead", RMI], t)).toEqual([]);
    expect(findConversionOverlaps(overlapping, [RMI], t)).toEqual([]);
  });
});

describe("conversionOverlapIssues", () => {
  const rows = [
    adDay("a1", "2026-09-01", { fb_pixel_lead: 3, [RMI]: 3 }),
    adDay("a1", "2026-09-02", { fb_pixel_lead: 2, [RMI]: 2 }),
    adDay("a2", "2026-09-02", { fb_pixel_lead: 1, [RMI]: 2 }),
  ];
  const names = new Map([[RMI, "request_more_info"]]);

  it("keeps what ad sets optimize for and offers to unpick the other", () => {
    const creatives = {
      a1: { ad_id: "a1", campaign_id: "c1", adset_id: "s1", links: [], instant_form: false, optimization_event: RMI },
    };
    const [issue] = conversionOverlapIssues({ rows, picked: ["fb_pixel_lead", RMI], names, creatives, t });
    expect(issue).toMatchObject({
      id: `lead_conversions_overlap:${[RMI, "fb_pixel_lead"].sort().join("|")}`,
      code: "lead_conversions_overlap",
      severity: "warning",
      title: "Meta may count the same lead twice: Standard Lead event and request_more_info",
      site_fixable: false,
      action: { kind: "unpick_lead_conversion", conversion_key: "fb_pixel_lead", label: "Unpick Standard Lead event" },
      evidence: { kind: "conversion_overlap", estimated_extra: 6, ad_days: 3, both_days_pct: 100 },
    });
    expect(issue!.how_to_fix).toContain("optimize for request_more_info");
  });

  it("with no optimization signal, unpicks the smaller count", () => {
    const [issue] = conversionOverlapIssues({ rows, picked: ["fb_pixel_lead", RMI], names, creatives: {}, t });
    expect(issue!.action).toMatchObject({ conversion_key: "fb_pixel_lead" });
    expect(issue!.how_to_fix).toContain("No ad set optimizes for either");
  });
});

describe("pixelLockstepIssues", () => {
  const hourly = (counts: number[]) => Object.fromEntries(counts.map((c, i) => [`2026-09-2${i}T10:00:00+0000`, c]));
  const ev = (event: string, counts: number[]): MetaPixelEventStats => ({ event, total: counts.reduce((s, c) => s + c, 0), hourly: hourly(counts) });
  const file = (events: MetaPixelEventStats[]): MetaPixelEventsFile => ({
    fetched_at: "2026-09-29T00:00:00.000Z",
    since: "2026-09-22",
    pixels: { "414": { name: "4Geeks pixel", last_fired_time: null, accounts: ["111"], events } },
  });
  const same = [5, 6, 4, 5, 3];

  it("flags two events with the same counts hour by hour", () => {
    const issues = pixelLockstepIssues({ pixels: file([ev("Lead", same), ev("request_more_info", same), ev("Contact", [1, 0, 0, 0, 0])]), expected: [], t });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "pixel_events_lockstep:414:Lead|request_more_info",
      code: "pixel_events_lockstep",
      site_fixable: false,
      action: { kind: "mark_expected_event_pair", pixel_id: "414", events: ["Lead", "request_more_info"] },
      evidence: { kind: "event_lockstep", hours_matching_pct: 100, count_diff_pct: 0, pixel_name: "4Geeks pixel" },
    });
  });

  it("skips pairs marked as expected, PageView, low volume and different hourly patterns", () => {
    const expected = [{ pixel_id: "414", events: ["Lead", "request_more_info"] as [string, string] }];
    expect(pixelLockstepIssues({ pixels: file([ev("Lead", same), ev("request_more_info", same)]), expected, t })).toEqual([]);
    expect(pixelLockstepIssues({ pixels: file([ev("PageView", same), ev("Lead", same)]), expected: [], t })).toEqual([]);
    expect(pixelLockstepIssues({ pixels: file([ev("Lead", [1, 1, 1]), ev("Contact", [1, 1, 1])]), expected: [], t })).toEqual([]);
    expect(pixelLockstepIssues({ pixels: file([ev("Lead", [5, 6, 4, 5, 3]), ev("Contact", [6, 5, 5, 4, 3])]), expected: [], t })).toEqual([]);
  });
});

describe("findStoppedConversions", () => {
  const conv = (id: string, archived = false) => ({
    id,
    name: id === RMI ? "request_more_info" : "student_application",
    pixel_id: "414",
    pixel_name: "px",
    custom_event_type: "LEAD",
    last_fired_time: null,
    archived,
  });
  const cc = (accounts: MetaCustomConversionsFile["accounts"]): MetaCustomConversionsFile => ({ fetched_at: "", accounts });

  it("reports missing, archived and not-shared picks; the standard Lead event is never checked", () => {
    const stopped = findStoppedConversions({
      picked: ["fb_pixel_lead", RMI, APP, "999999999"],
      customConversions: cc({ "111": { conversions: [conv(RMI), conv(APP, true)] }, "222": { conversions: [conv(APP, true)] } }),
      accountIds: ["111", "222"],
      accountsWithSpend: new Set(["111", "222"]),
    });
    expect(stopped).toEqual([
      { key: RMI, name: "request_more_info", reason: "not_shared", accounts: ["222"] },
      { key: APP, name: "student_application", reason: "archived", accounts: [] },
      { key: "999999999", name: "999999999", reason: "missing", accounts: [] },
    ]);
    const issues = conversionStoppedIssues({ stopped, accountNames: { "222": "USA" } });
    expect(issues[0]).toMatchObject({ id: `lead_conversion_stopped:${RMI}`, scope: { account_id: "222" } });
    expect(issues[0]!.why).toContain("USA can't see it");
    expect(issues[0]!.action).toBeUndefined();
    expect(issues[2]!.action).toMatchObject({ kind: "unpick_lead_conversion", conversion_key: "999999999" });
  });

  it("stays quiet when no account list could be read, or the unshared account has no spend", () => {
    expect(findStoppedConversions({ picked: [RMI], customConversions: cc({ "111": { conversions: [], error: "x" } }), accountIds: ["111"], accountsWithSpend: new Set(["111"]) })).toEqual([]);
    expect(
      findStoppedConversions({
        picked: [RMI],
        customConversions: cc({ "111": { conversions: [conv(RMI)] }, "222": { conversions: [] } }),
        accountIds: ["111", "222"],
        accountsWithSpend: new Set(["111"]),
      }),
    ).toEqual([]);
  });
});
