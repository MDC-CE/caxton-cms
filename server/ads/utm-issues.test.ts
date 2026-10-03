import { describe, expect, it } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS, DEFAULT_UTM_CONVENTION, metaUtmTemplate } from "@shared/ads-settings";
import { NO_UTM_GRACE, type AdsIssueAd, type UtmGrace } from "@shared/ads-diagnostics-rules";
import { utmIssues, type DeclaredUtm, type ObservedUtmGroup, type UtmIssueInput } from "./utm-issues";

const params = (q: string) => Object.fromEntries(new URLSearchParams(q));

function obs(over: Partial<ObservedUtmGroup>): ObservedUtmGroup {
  return {
    platform: "meta",
    source: "fb",
    medium: "paid_social",
    campaign: "spring",
    utm_id: "120200000000001",
    utm_term: null,
    utm_content: null,
    visits: 10,
    leads: 1,
    first_seen: "2026-09-01",
    last_seen: "2026-09-20",
    ...over,
  };
}

function input(over: Partial<UtmIssueInput>): UtmIssueInput {
  return {
    platform: "meta",
    convention: DEFAULT_UTM_CONVENTION,
    grace: NO_UTM_GRACE,
    declared: [],
    observed: [],
    totalSpend: { USD: 1000 },
    t: DEFAULT_ADS_ALERT_THRESHOLDS,
    known: [],
    ...over,
  };
}

const ad = (id: string): AdsIssueAd => ({ ad_id: id, ad_name: `Ad ${id}`, spend: { USD: 100 } }) as unknown as AdsIssueAd;

describe("utmIssues", () => {
  it("clean template and clean traffic → no issues", () => {
    const declared: DeclaredUtm[] = [{ campaign_id: "120200000000001", campaign_name: "Spring", params: params(metaUtmTemplate()), spend: { USD: 200 } }];
    expect(utmIssues(input({ declared, observed: [obs({})] }))).toEqual([]);
  });

  it("merges setup and GA4 evidence into one issue per campaign and code", () => {
    const declared: DeclaredUtm[] = [
      { campaign_id: "120200000000001", campaign_name: "Spring", params: { utm_source: "facebook", utm_medium: "paid_social" }, spend: { USD: 200 }, ad: ad("a1") },
      { campaign_id: "120200000000001", campaign_name: "Spring", params: { utm_source: "facebook", utm_medium: "paid_social" }, spend: { USD: 50 }, ad: ad("a2") },
    ];
    const issues = utmIssues(input({ declared, observed: [obs({ source: "facebook", visits: 30, leads: 2 })] }));
    expect(issues).toHaveLength(1);
    const i = issues[0]!;
    expect(i.code).toBe("utm_source_alias");
    expect(i.id).toBe("utm_source_alias:120200000000001");
    expect(i.spend_affected).toEqual({ USD: 250 });
    expect(i.details?.utm?.visits).toBe(30);
    expect(i.details?.utm?.leads).toBe(2);
    expect(i.details?.ads?.map((a) => a.ad_id).sort()).toEqual(["a1", "a2"]);
    expect(i.details?.utm?.values[0]).toMatchObject({ param: "utm_source", seen_in: expect.arrayContaining(["setup", "ga4"]) });
  });

  it("skips medium codes where non_paid_medium already fires", () => {
    const observed = [obs({ medium: "cpc", visits: 100 })];
    expect(utmIssues(input({ observed })).map((i) => i.code)).toEqual(["utm_medium_off_convention"]);
    expect(utmIssues(input({ observed, nonPaidCampaigns: new Set(["120200000000001"]) }))).toEqual([]);
  });

  it("small traffic with no spend is not raised", () => {
    expect(utmIssues(input({ observed: [obs({ source: "facebook", visits: 2, leads: 0 })] }))).toEqual([]);
  });

  it("values accepted by grace → info with in_grace", () => {
    const grace: UtmGrace = { ...NO_UTM_GRACE, active: true, changed_at: "2026-09-10T00:00:00.000Z", ends_at: "2026-10-08T00:00:00.000Z", accepted: { meta: { sources: ["facebook"], mediums: [] } } };
    const [i] = utmIssues(input({ grace, observed: [obs({ source: "facebook", visits: 200 })] }));
    expect(i).toMatchObject({ severity: "info", in_grace: true, grace_ends_at: "2026-10-08T00:00:00.000Z" });
  });

  it("exceptions turn matches into info", () => {
    const convention = { ...DEFAULT_UTM_CONVENTION, exceptions: [{ key: "120200000000001" }] };
    const [i] = utmIssues(input({ convention, observed: [obs({ source: "facebook", visits: 200 })] }));
    expect(i?.severity).toBe("info");
  });

  it("shared: traffic from other platforms gets universal rules only, keyed by platform", () => {
    const observed = [obs({ platform: "tiktok", source: "TikTok", medium: "paid_social", utm_id: null, campaign: "launch", visits: 20 })];
    const issues = utmIssues(input({ platform: "shared", observed }));
    expect(issues.map((i) => i.code)).toEqual(["utm_case_mixed"]);
    expect(issues[0]!.id).toBe("utm_case_mixed:tiktok:launch");
  });
});
