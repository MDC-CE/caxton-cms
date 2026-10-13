import { describe, expect, it } from "vitest";
import {
  channelTouchFor,
  mergeUtmSets,
  nextEntryChannel,
  nextFirstTouch,
  nextPaidLanding,
  paidLandingFor,
  parseMarketingParams,
} from "./session-marketing";
import { stripMarketingFields, defaultSession, type Session } from "./session";

describe("parseMarketingParams", () => {
  it("captures per-platform click ids, ppc_tracking_id and derives fbc", () => {
    const utm = parseMarketingParams("?utm_source=facebook&utm_medium=paid_social&utm_id=123&fbclid=FB1", {
      now: 1700000000000,
      fbp: "fb.1.1.2",
    });
    expect(utm).toMatchObject({
      utm_source: "facebook",
      utm_medium: "paid_social",
      utm_id: "123",
      fbclid: "FB1",
      ppc_tracking_id: "FB1",
      fbp: "fb.1.1.2",
      fbc: "fb.1.1700000000000.FB1",
    });
  });

  it("keeps an existing _fbc cookie over a derived value", () => {
    expect(parseMarketingParams("?fbclid=FB1", { fbc: "fb.1.5.OLD" }).fbc).toBe("fb.1.5.OLD");
  });
});

describe("mergeUtmSets", () => {
  it("replaces the whole campaign set when new campaign params arrive", () => {
    const prev = { utm_source: "google", utm_campaign: "old", gclid: "G", coupon: "SAVE", fbp: "fb.1" };
    const merged = mergeUtmSets(prev, { utm_source: "facebook", utm_medium: "paid_social" });
    expect(merged).toEqual({ utm_source: "facebook", utm_medium: "paid_social", coupon: "SAVE", fbp: "fb.1" });
  });

  it("keeps the previous set on a visit without campaign params", () => {
    const prev = { utm_source: "google", utm_campaign: "old" };
    expect(mergeUtmSets(prev, { coupon: "X" })).toEqual({ ...prev, coupon: "X" });
  });
});

describe("first touch and paid landing", () => {
  it("writes first touch once", () => {
    const first = nextFirstTouch(undefined, { utm_source: "google", utm_medium: "cpc", coupon: "X" });
    expect(first).toEqual({ utm_source: "google", utm_medium: "cpc" });
    expect(nextFirstTouch(first, { utm_source: "facebook", utm_medium: "paid_social" })).toBe(first);
    expect(nextFirstTouch(undefined, { coupon: "X" })).toBeUndefined();
  });

  it("records paid landings only for paid visits; first is write-once", () => {
    const organic = paidLandingFor({ fbclid: "F" }, { host: "4geeks.com", path: "/en/x", now: 1 });
    expect(organic).toBeNull();
    const paid = paidLandingFor(
      { utm_source: "facebook", utm_medium: "paid_social" },
      { host: "4Geeks.com", path: "/en/bootcamp/?a=1", now: 10 },
    );
    expect(paid).toEqual({ host: "4geeks.com", path: "/en/bootcamp", at: 10, platform: "meta" });
    const one = nextPaidLanding(undefined, paid);
    const later = { host: "4geeks.com", path: "/es/aplica", at: 20, platform: "google" };
    const two = nextPaidLanding(one, later);
    expect(two).toEqual({ first: paid, last: later });
    expect(nextPaidLanding(two, null)).toBe(two);
  });

  it("keeps numeric ad ids from the URL template / suffix on the paid landing", () => {
    const g = paidLandingFor(
      { utm_source: "google", utm_medium: "cpc", utm_id: "2233445566", utm_term: "998877665544", utm_content: "{creative}" },
      { host: "4geeks.com", path: "/en/x", now: 5 },
    );
    expect(g).toEqual({ host: "4geeks.com", path: "/en/x", at: 5, platform: "google", campaign_id: "2233445566", adset_id: "998877665544" });
  });
});

describe("internal UTMs", () => {
  const ownHosts = ["4geeks.com", ".4geeks.com"];

  it("an internal UTM link keeps the earlier gclid and campaign", () => {
    const prev = mergeUtmSets(undefined, parseMarketingParams("?utm_source=google&utm_medium=cpc&gclid=G1", { ownHosts }));
    const incoming = parseMarketingParams("?utm_source=4geeks.com&utm_medium=dropdown&coupon=X", { ownHosts });
    expect(incoming).toEqual({ coupon: "X" });
    const merged = mergeUtmSets(prev, incoming);
    expect(merged).toMatchObject({ utm_source: "google", utm_medium: "cpc", gclid: "G1", coupon: "X" });
    expect(nextFirstTouch(undefined, incoming)).toBeUndefined();
    expect(paidLandingFor(incoming, { host: "4geeks.com", path: "/en/x", now: 1 })).toBeNull();
  });

  it("utm_source of another site is kept", () => {
    const fl = ["fl.4geeksacademy.com", ".4geeksacademy.com"];
    expect(parseMarketingParams("?utm_source=4geeks.com&utm_medium=dropdown", { ownHosts: fl })).toEqual({
      utm_source: "4geeks.com",
      utm_medium: "dropdown",
    });
  });
});

describe("entry channel", () => {
  const ownHosts = ["4geeks.com", ".4geeks.com"];

  it("records channel, landing path and referrer host", () => {
    const touch = channelTouchFor({}, { referrer: "https://www.google.com/", ownHosts, path: "/en/blog/x/?q=1", now: 5 });
    expect(touch).toEqual({ channel: "organic_search", referrer_host: "google.com", path: "/en/blog/x", at: 5 });
    expect(channelTouchFor({}, { referrer: "https://4geeks.com/en", ownHosts, path: "/en/x", now: 5 })).toBeNull();
    expect(channelTouchFor({}, { referrer: "", ownHosts, path: "/", now: 5 })?.channel).toBe("direct");
  });

  it("first is write-once; last is the latest non-direct touch", () => {
    const direct = { channel: "direct" as const, path: "/", at: 1 };
    const search = { channel: "organic_search" as const, path: "/en/blog/x", at: 2, referrer_host: "google.com" };
    const one = nextEntryChannel(undefined, direct);
    expect(one).toEqual({ first: direct });
    const two = nextEntryChannel(one, search);
    expect(two).toEqual({ first: direct, last: search });
    const three = nextEntryChannel(two, { channel: "direct", path: "/apply", at: 3 });
    expect(three).toEqual({ first: direct, last: search });
    expect(nextEntryChannel(three, null)).toBe(three);
  });
});

describe("stripMarketingFields", () => {
  it("removes campaign data but keeps functional fields", () => {
    const session: Session = {
      ...defaultSession,
      utm: { utm_source: "facebook", gclid: "G", coupon: "SAVE", referral: "abc" },
      landing_page: "/en/x",
      first_touch: { utm_source: "google" },
      paid_landing: { last: { host: "h", path: "/", at: 1 } },
      entry_channel: { first: { channel: "organic_search", path: "/en/x", at: 1 } },
    };
    const stripped = stripMarketingFields(session);
    expect(stripped.entry_channel).toBeUndefined();
    expect(stripped.utm).toEqual({ coupon: "SAVE", referral: "abc" });
    expect(stripped.landing_page).toBeUndefined();
    expect(stripped.first_touch).toBeUndefined();
    expect(stripped.paid_landing).toBeUndefined();
    expect(stripped.language).toBe(session.language);
  });
});
