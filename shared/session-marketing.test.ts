import { describe, expect, it } from "vitest";
import {
  mergeUtmSets,
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
});

describe("stripMarketingFields", () => {
  it("removes campaign data but keeps functional fields", () => {
    const session: Session = {
      ...defaultSession,
      utm: { utm_source: "facebook", gclid: "G", coupon: "SAVE", referral: "abc" },
      landing_page: "/en/x",
      first_touch: { utm_source: "google" },
      paid_landing: { last: { host: "h", path: "/", at: 1 } },
    };
    const stripped = stripMarketingFields(session);
    expect(stripped.utm).toEqual({ coupon: "SAVE", referral: "abc" });
    expect(stripped.landing_page).toBeUndefined();
    expect(stripped.first_touch).toBeUndefined();
    expect(stripped.paid_landing).toBeUndefined();
    expect(stripped.language).toBe(session.language);
  });
});
