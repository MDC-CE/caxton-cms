import { describe, expect, it } from "vitest";
import { adVersions, emptyAdsSetup, mergeMetaAccountAds, nextVersions, type AdsSetupAd, type AdsSetupAdVersion } from "./ads-setup";
import {
  adChangeoverDays,
  adPageForDay,
  adTargetsInWindow,
  buildAdLandingByDay,
  dayInTimeZone,
  previousUrls,
  type HostPath,
} from "./ad-url-history";
import type { MetaAdCreativeInfo } from "./meta-client";

const HOST = "example.com";
const A = `https://${HOST}/en/a?utm_source=facebook`;
const B = `https://${HOST}/en/b?utm_source=facebook`;
/** Pages that redirect to /en/a count as /en/a (the report passes its resolver here). */
const samePage = (x: HostPath, y: HostPath) => {
  const norm = (p: string) => (p === "/en/old-a" ? "/en/a" : p);
  return x.host === y.host && norm(x.path) === norm(y.path);
};

function version(over: Partial<AdsSetupAdVersion>): AdsSetupAdVersion {
  return { v: 1, landing_urls: [A], url_tags: null, destination: "website", first_seen_at: null, last_seen_at: "2026-09-20T10:00:00.000Z", ...over };
}

function ad(versions: AdsSetupAdVersion[]): AdsSetupAd {
  const last = versions.at(-1)!;
  return {
    id: "ad1",
    account_id: "111",
    campaign_id: "c1",
    adset_id: "s1",
    name: "Ad 1",
    status: "ACTIVE",
    landing_urls: last.landing_urls,
    url_tags: last.url_tags,
    destination: last.destination,
    last_seen_at: last.last_seen_at,
    versions,
  };
}

function creative(links: string[], over: Partial<MetaAdCreativeInfo> = {}): MetaAdCreativeInfo {
  return { ad_id: "ad1", campaign_id: "c1", adset_id: "s1", account_id: "111", links, instant_form: false, ...over } as MetaAdCreativeInfo;
}

describe("nextVersions / catalog merge", () => {
  it("first read seeds v1 with no first_seen_at", () => {
    const v = nextVersions([], { landing_urls: [A], url_tags: null, destination: "website" }, "2026-09-01T00:00:00.000Z");
    expect(v).toEqual([expect.objectContaining({ v: 1, first_seen_at: null, seeded_at: "2026-09-01T00:00:00.000Z" })]);
  });

  it("host/path change appends a version; parameter-only change is a tag change", () => {
    const t1 = "2026-09-01T00:00:00.000Z";
    const t2 = "2026-09-05T00:00:00.000Z";
    const t3 = "2026-09-10T00:00:00.000Z";
    let v = nextVersions([], { landing_urls: [A], url_tags: null, destination: "website" }, t1);
    v = nextVersions(v, { landing_urls: [`https://${HOST.toUpperCase()}/en/a/?utm_source=ig`], url_tags: "utm_id={{campaign.id}}", destination: "website" }, t2);
    expect(v).toHaveLength(1);
    expect(v[0]!.tag_changes).toHaveLength(1);
    expect(v[0]!.last_seen_at).toBe(t2);
    v = nextVersions(v, { landing_urls: [B], url_tags: null, destination: "website" }, t3);
    expect(v.map((x) => [x.v, x.first_seen_at])).toEqual([
      [1, null],
      [2, t3],
    ]);
  });

  it("a read with no link keeps the current version", () => {
    const v = nextVersions([version({})], { landing_urls: [], url_tags: null, destination: "website" }, "2026-09-25T00:00:00.000Z");
    expect(v).toHaveLength(1);
    expect(v[0]!.landing_urls).toEqual([A]);
  });

  it("catalogs from before versioning seed v1 lazily, then a new link becomes v2", () => {
    const catalog = emptyAdsSetup("meta");
    const old = ad([version({})]);
    delete old.versions;
    catalog.ads.ad1 = old;
    expect(adVersions(old)[0]).toMatchObject({ v: 1, first_seen_at: null, seeded_at: old.last_seen_at });
    mergeMetaAccountAds(catalog, "111", [creative([B])], "2026-09-22T00:00:00.000Z");
    expect(catalog.ads.ad1!.versions!.map((x) => x.v)).toEqual([1, 2]);
    expect(catalog.ads.ad1!.landing_urls).toEqual([B]);
  });
});

describe("adPageForDay", () => {
  const twoVersions = ad([
    version({ v: 1, first_seen_at: "2026-09-01T10:00:00.000Z", last_seen_at: "2026-09-14T10:00:00.000Z" }),
    version({ v: 2, landing_urls: [B], first_seen_at: "2026-09-15T10:00:00.000Z", last_seen_at: "2026-09-20T10:00:00.000Z" }),
  ]);

  it("inside one version: that version's link", () => {
    const before = adPageForDay({ ad: twoVersions, date: "2026-09-10", timeZone: "UTC", votes: undefined, samePage });
    const after = adPageForDay({ ad: twoVersions, date: "2026-09-18", timeZone: "UTC", votes: undefined, samePage });
    expect(before.splits).toEqual([{ target: expect.objectContaining({ path: "/en/a" }), share: 1 }]);
    expect(after.splits).toEqual([{ target: expect.objectContaining({ path: "/en/b" }), share: 1 }]);
    expect(before.change).toBeUndefined();
  });

  it("changeover day with GA4 visits: split by where they landed", () => {
    const votes = new Map([
      [`${HOST}|/en/a`, 3],
      [`${HOST}|/en/b`, 1],
    ]);
    const day = adPageForDay({ ad: twoVersions, date: "2026-09-14", timeZone: "UTC", votes, samePage });
    expect(day.change).toMatchObject({ basis: "ga4", inferred: false });
    expect(day.splits.map((s) => [s.target?.kind === "link" ? s.target.path : null, s.share])).toEqual([
      ["/en/a", 0.75],
      ["/en/b", 0.25],
    ]);
  });

  it("changeover day without GA4 visits: all to the new page, still tagged", () => {
    const day = adPageForDay({ ad: twoVersions, date: "2026-09-15", timeZone: "UTC", votes: undefined, samePage });
    expect(day.change).toMatchObject({ basis: "whole_day_new" });
    expect(day.splits).toEqual([{ target: expect.objectContaining({ path: "/en/b" }), share: 1 }]);
  });

  it("missed syncs: every day between the last old sighting and the first new one is a changeover", () => {
    for (const date of ["2026-09-14", "2026-09-15"]) {
      expect(adPageForDay({ ad: twoVersions, date, timeZone: "UTC", votes: undefined, samePage }).change).toBeDefined();
    }
    expect(Array.from(adChangeoverDays(twoVersions, "UTC"))).toEqual(["2026-09-14", "2026-09-15"]);
  });

  it("raw link change that reaches the same final page: no split, no tag", () => {
    const sameFinal = ad([
      version({ v: 1, landing_urls: [`https://${HOST}/en/old-a`], first_seen_at: "2026-09-01T10:00:00.000Z", last_seen_at: "2026-09-14T10:00:00.000Z" }),
      version({ v: 2, first_seen_at: "2026-09-14T12:00:00.000Z", last_seen_at: "2026-09-20T10:00:00.000Z" }),
    ]);
    const day = adPageForDay({ ad: sameFinal, date: "2026-09-14", timeZone: "UTC", votes: undefined, samePage });
    expect(day.change).toBeUndefined();
    expect(day.splits).toHaveLength(1);
  });

  it("uses the ad account time zone at the day boundary", () => {
    // 03:00 UTC on Sep 15 is still Sep 14 in Los Angeles.
    expect(dayInTimeZone("2026-09-15T03:00:00.000Z", "America/Los_Angeles")).toBe("2026-09-14");
    const tzAd = ad([
      version({ v: 1, first_seen_at: "2026-09-01T10:00:00.000Z", last_seen_at: "2026-09-13T20:00:00.000Z" }),
      version({ v: 2, landing_urls: [B], first_seen_at: "2026-09-15T03:00:00.000Z", last_seen_at: "2026-09-20T10:00:00.000Z" }),
    ]);
    expect(adPageForDay({ ad: tzAd, date: "2026-09-15", timeZone: "America/Los_Angeles", votes: undefined, samePage }).change).toBeUndefined();
    expect(adPageForDay({ ad: tzAd, date: "2026-09-14", timeZone: "America/Los_Angeles", votes: undefined, samePage }).change).toBeDefined();
  });

  describe("before URL history", () => {
    const seeded = ad([version({ v: 1, first_seen_at: null, seeded_at: "2026-09-10T10:00:00.000Z", landing_urls: [B] })]);

    it("enough GA4 sessions decide the page", () => {
      const votes = new Map([[`${HOST}|/en/a`, 5]]);
      const day = adPageForDay({ ad: seeded, date: "2026-09-05", timeZone: "UTC", votes, samePage });
      expect(day.splits).toEqual([{ target: expect.objectContaining({ path: "/en/a" }), share: 1 }]);
      expect(day.unconfirmed).toBeUndefined();
    });

    it("two pages above the share threshold: inferred changeover", () => {
      const votes = new Map([
        [`${HOST}|/en/a`, 4],
        [`${HOST}|/en/b`, 4],
      ]);
      const day = adPageForDay({ ad: seeded, date: "2026-09-05", timeZone: "UTC", votes, samePage });
      expect(day.change).toMatchObject({ inferred: true, basis: "ga4" });
      expect(day.splits).toHaveLength(2);
    });

    it("below the threshold (untagged ads): earliest known link, marked unconfirmed", () => {
      const day = adPageForDay({ ad: seeded, date: "2026-09-05", timeZone: "UTC", votes: new Map([[`${HOST}|/en/a`, 2]]), samePage });
      expect(day.unconfirmed).toBe(true);
      expect(day.splits).toEqual([{ target: expect.objectContaining({ path: "/en/b" }), share: 1 }]);
    });

    it("on or after the seed day: the current version, confirmed", () => {
      const day = adPageForDay({ ad: seeded, date: "2026-09-12", timeZone: "UTC", votes: undefined, samePage });
      expect(day.unconfirmed).toBeUndefined();
    });
  });
});

describe("evidence helpers", () => {
  const history = ad([
    version({ v: 1, first_seen_at: null, seeded_at: "2026-08-01T00:00:00.000Z", last_seen_at: "2026-09-14T10:00:00.000Z" }),
    version({ v: 2, landing_urls: [B], first_seen_at: "2026-09-15T10:00:00.000Z", last_seen_at: "2026-09-20T10:00:00.000Z" }),
  ]);

  it("previousUrls: newest first, empty with one version", () => {
    expect(previousUrls(history).map((u) => [u.v, u.from, u.to])).toEqual([
      [2, "2026-09-15", "2026-09-20"],
      [1, null, "2026-09-14"],
    ]);
    expect(previousUrls(ad([version({})]))).toEqual([]);
  });

  it("adTargetsInWindow: every link live in the window", () => {
    expect(adTargetsInWindow(history, "2026-09-10", "2026-09-20", "UTC").map((t) => (t.kind === "link" ? t.path : t.kind))).toEqual(["/en/a", "/en/b"]);
    expect(adTargetsInWindow(history, "2026-09-16", "2026-09-20", "UTC").map((t) => (t.kind === "link" ? t.path : t.kind))).toEqual(["/en/b"]);
  });

  it("buildAdLandingByDay: per ad, per day, known ads only", () => {
    const days = [
      {
        date: "2026-09-14",
        candidates: [
          { utm_content: "ad1", host: HOST, path: "/en/a", sessions: 2 },
          { utm_content: "ad1", host: HOST, path: "/en/a", sessions: 1 },
          { utm_content: "other", host: HOST, path: "/en/a", sessions: 9 },
        ],
      },
    ] as never;
    const m = buildAdLandingByDay(days, new Set(["ad1"]));
    expect(m.get("ad1")?.get("2026-09-14")?.get(`${HOST}|/en/a`)).toBe(3);
    expect(m.has("other")).toBe(false);
  });
});
