import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ cacheDir: "" }));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ads-change-log-test-"));
vi.mock("../db-cache", () => ({ CACHE_DIR: h.cacheDir }));

const {
  appendChanges,
  changeLogCutoffMonth,
  listChangeLogFiles,
  metaDeliveryIssue,
  pruneChangeLog,
  readChangeLogFile,
  targetingHash,
  targetingSummary,
  trackHistory,
} = await import("./ads-change-log");
const {
  applyMetaNames,
  campaignIdsByName,
  emptyAdsSetup,
  matchCampaignByName,
  mergeGoogleCustomer,
  mergeMetaAccountAds,
  mergeMetaAdsets,
  mergeMetaCampaigns,
  noteCampaignName,
} = await import("./ads-setup");
type AdsChange = import("./ads-change-log").AdsChange;
type AdsSetupCampaign = import("./ads-setup").AdsSetupCampaign;

const SITE = "site_test";
const AT1 = "2026-09-01T10:00:00.000Z";
const AT2 = "2026-09-02T10:00:00.000Z";
const ctx = (at: string) => ({ at, platform: "meta" as const, level: "campaign" as const, id: "c1", campaign_id: "c1", source: "sync" as const });

beforeEach(() => {
  fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
});

describe("trackHistory", () => {
  it("seeds on the first read without logging", () => {
    const sink: AdsChange[] = [];
    const h1 = trackHistory(undefined, { status: "ACTIVE" }, ctx(AT1), sink);
    expect(sink).toEqual([]);
    expect(h1.fields).toEqual({ status: "ACTIVE" });
  });

  it("only bumps seen_at when nothing changed", () => {
    const sink: AdsChange[] = [];
    const h1 = trackHistory(undefined, { status: "ACTIVE" }, ctx(AT1), sink);
    const h2 = trackHistory(h1, { status: "ACTIVE" }, ctx(AT2), sink);
    expect(sink).toEqual([]);
    expect(h2.seen_at).toBe(AT2);
    expect(h2.fingerprint).toBe(h1.fingerprint);
  });

  it("logs one entry per changed field, including fields that appeared", () => {
    const sink: AdsChange[] = [];
    const h1 = trackHistory(undefined, { status: "ACTIVE", daily_budget: "5000" }, ctx(AT1), sink);
    trackHistory(h1, { status: "PAUSED", daily_budget: "5000", bid_strategy: "COST_CAP" }, ctx(AT2), sink);
    expect(sink.map((c) => [c.field, c.from, c.to])).toEqual([
      ["bid_strategy", null, "COST_CAP"],
      ["status", "ACTIVE", "PAUSED"],
    ]);
    expect(sink[0]).toMatchObject({ at: AT2, platform: "meta", level: "campaign", id: "c1", source: "sync" });
  });
});

describe("targeting", () => {
  it("ignores key and list order and Meta's own automation keys", () => {
    const a = { geo_locations: { countries: ["US", "CA"] }, age_min: 25, targeting_automation: { advantage_audience: 1 } };
    const b = { age_min: 25, geo_locations: { countries: ["CA", "US"] } };
    expect(targetingHash(a)).toBe(targetingHash(b));
    expect(targetingHash({ ...b, age_min: 30 })).not.toBe(targetingHash(b));
  });

  it("summarizes countries, age, audiences and placements", () => {
    expect(targetingSummary({ geo_locations: { countries: ["US", "CA"] }, age_min: 25, age_max: 45, custom_audiences: [{ id: "1" }], publisher_platforms: ["facebook"] })).toBe(
      "countries CA,US; age 25-45; custom audiences 1; placements manual",
    );
    expect(targetingSummary(null)).toBeNull();
  });
});

describe("metaDeliveryIssue", () => {
  it("keeps only disapproved, with issues and account disabled", () => {
    expect(metaDeliveryIssue("DISAPPROVED")).toBe("DISAPPROVED");
    expect(metaDeliveryIssue("WITH_ISSUES")).toBe("WITH_ISSUES");
    expect(metaDeliveryIssue("IN_PROCESS")).toBeNull();
    expect(metaDeliveryIssue("CAMPAIGN_PAUSED")).toBeNull();
    expect(metaDeliveryIssue("ACTIVE", 2)).toBe("ACCOUNT_DISABLED");
    expect(metaDeliveryIssue("ACTIVE", 1)).toBeNull();
  });
});

describe("monthly files", () => {
  const change = (at: string, platform: "meta" | "google" = "meta"): AdsChange => ({
    at,
    platform,
    level: "campaign",
    id: "c1",
    campaign_id: "c1",
    field: "status",
    from: "ACTIVE",
    to: "PAUSED",
    source: "sync",
  });

  it("appends to {platform}-{yyyy-mm}.json arrays", () => {
    appendChanges(SITE, [change("2026-08-31T23:00:00.000Z"), change("2026-09-01T01:00:00.000Z"), change("2026-09-01T02:00:00.000Z", "google")]);
    appendChanges(SITE, [change("2026-09-03T00:00:00.000Z")]);
    const files = listChangeLogFiles(SITE);
    expect(files.map((f) => path.basename(f.file))).toEqual(["meta-2026-08.json", "google-2026-09.json", "meta-2026-09.json"]);
    const sept = files.find((f) => f.platform === "meta" && f.month === "2026-09")!;
    expect(readChangeLogFile(sept.file)).toHaveLength(2);
  });

  it("prunes months older than 25 months", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    expect(changeLogCutoffMonth(now)).toBe("2024-09");
    appendChanges(SITE, [change("2024-08-10T00:00:00.000Z"), change("2024-09-10T00:00:00.000Z")]);
    pruneChangeLog(SITE, now);
    expect(listChangeLogFiles(SITE).map((f) => f.month)).toEqual(["2024-09"]);
  });
});

describe("Meta catalog merges", () => {
  it("logs campaign and ad set setting changes and keeps names / extras across name refreshes", () => {
    const cat = emptyAdsSetup("meta");
    const base = {
      id: "c1",
      account_id: "111",
      name: "Brand",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      objective: "OUTCOME_LEADS",
      daily_budget: "5000",
      lifetime_budget: null,
      bid_strategy: null,
      spend_cap: null,
    };
    mergeMetaCampaigns(cat, "111", [base], AT1, { changes: [], source: "sync" });
    applyMetaNames(cat, [{ account_id: "111", campaign_id: "c1", campaign_name: "Brand", adset_id: "s1", adset_name: "S", ad_id: "a1", ad_name: "A", date: "2026-09-01" }], AT1);
    expect(cat.campaigns.c1.history).toBeTruthy();
    expect(cat.campaigns.c1.extras?.objective).toBe("OUTCOME_LEADS");

    const sink = { changes: [] as AdsChange[], source: "sync" as const };
    mergeMetaCampaigns(cat, "111", [{ ...base, name: "Brand v2", effective_status: "DISAPPROVED" }], AT2, sink);
    expect(sink.changes.map((c) => c.field).sort()).toEqual(["delivery_issue", "name"]);

    const adset = {
      id: "s1",
      account_id: "111",
      campaign_id: "c1",
      name: "S",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      daily_budget: null,
      lifetime_budget: null,
      bid_strategy: null,
      bid_amount: null,
      optimization_goal: "OFFSITE_CONVERSIONS",
      targeting: { geo_locations: { countries: ["US"] } },
      start_time: null,
      end_time: null,
    };
    mergeMetaAdsets(cat, "111", [adset], AT1, sink);
    mergeMetaAdsets(cat, "111", [{ ...adset, targeting: { geo_locations: { countries: ["US", "CA"] } } }], AT2, sink);
    const t = sink.changes.find((c) => c.level === "adset");
    expect(t?.field).toBe("targeting");
    expect(t?.to).toContain("countries CA,US");
    expect(cat.adsets.s1.delivery?.targeting_summary).toContain("countries CA,US");
  });

  it("logs a replaced creative on ads", () => {
    const cat = emptyAdsSetup("meta");
    const ad = { ad_id: "a1", campaign_id: "c1", adset_id: "s1", links: ["https://x.com/a"], instant_form: false, creative_id: "cr1", status: "ACTIVE" };
    mergeMetaAccountAds(cat, "111", [ad], AT1, { changes: [], source: "sync" });
    const sink = { changes: [] as AdsChange[], source: "recheck" as const };
    mergeMetaAccountAds(cat, "111", [{ ...ad, creative_id: "cr2" }], AT2, sink);
    expect(sink.changes).toEqual([expect.objectContaining({ level: "ad", id: "a1", field: "creative_id", from: "cr1", to: "cr2", source: "recheck" })]);
  });
});

describe("Google catalog merge", () => {
  it("tracks bidding, budget and networks and notes the campaign name", () => {
    const cat = emptyAdsSetup("google");
    const camp = {
      customer_id: "9",
      name: "Search",
      channel_type: "SEARCH",
      status: "ENABLED",
      final_url_suffix: null,
      bidding_strategy_type: "MAXIMIZE_CONVERSIONS",
      budget_amount_micros: "10000000",
      networks: "google_search",
    };
    const meta = { customer: { name: "G", currency: "USD", auto_tagging: true }, campaigns: { g1: camp }, adGroups: {}, ads: {} };
    mergeGoogleCustomer(cat, "9", meta, AT1, { changes: [], source: "sync" });
    expect(cat.campaigns.g1.names).toEqual([{ name: "Search", first_seen: "2026-09-01", last_seen: "2026-09-01" }]);
    const sink = { changes: [] as AdsChange[], source: "sync" as const };
    mergeGoogleCustomer(cat, "9", { ...meta, campaigns: { g1: { ...camp, budget_amount_micros: "20000000", networks: "google_search,display" } } }, AT2, sink);
    expect(sink.changes.map((c) => c.field).sort()).toEqual(["budget_amount", "networks"]);
    expect(cat.campaigns.g1.extras?.budget_amount).toBe("20000000");
  });
});

describe("campaign name history", () => {
  const campaign = (id: string): AdsSetupCampaign => ({ id, account_id: "111", name: "", status: null, last_seen_at: AT1 });

  it("extends a name's range and reuses it when renamed back", () => {
    const c = campaign("c1");
    noteCampaignName(c, "Spring", "2026-03-01");
    noteCampaignName(c, "Spring", "2026-03-10");
    noteCampaignName(c, "Summer", "2026-06-01");
    noteCampaignName(c, "Spring", "2026-09-01");
    expect(c.names).toEqual([
      { name: "Spring", first_seen: "2026-03-01", last_seen: "2026-09-01" },
      { name: "Summer", first_seen: "2026-06-01", last_seen: "2026-06-01" },
    ]);
  });

  it("matches a name by day; same-day collisions are ambiguous", () => {
    const cat = emptyAdsSetup("meta");
    const a = (cat.campaigns.a = campaign("a"));
    const b = (cat.campaigns.b = campaign("b"));
    noteCampaignName(a, "Promo", "2026-01-01");
    noteCampaignName(a, "Promo", "2026-01-31");
    noteCampaignName(b, "Promo", "2026-03-01");
    noteCampaignName(b, "Promo", "2026-03-31");
    noteCampaignName(b, "Only B", "2026-04-01");
    const idx = campaignIdsByName(cat);
    expect(matchCampaignByName(idx, "promo", "2026-01-15")).toEqual({ kind: "matched", campaign_id: "a" });
    expect(matchCampaignByName(idx, "Promo", "2026-03-15")).toEqual({ kind: "matched", campaign_id: "b" });
    expect(matchCampaignByName(idx, "Promo", "2026-02-15")).toEqual({ kind: "ambiguous" });
    expect(matchCampaignByName(idx, "Only B", "2026-08-01")).toEqual({ kind: "matched", campaign_id: "b" });
    expect(matchCampaignByName(idx, "Nobody", "2026-08-01")).toEqual({ kind: "none" });
    noteCampaignName(a, "Promo", "2026-03-10");
    expect(matchCampaignByName(campaignIdsByName(cat), "Promo", "2026-03-05")).toEqual({ kind: "ambiguous" });
  });
});
