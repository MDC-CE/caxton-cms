import { describe, expect, it } from "vitest";
import { ga4ChannelFor, isGa4PaidMedium, isGa4StandardPaidMedium, isStandardPaid } from "./utm-standards";

describe("GA4 paid medium rule", () => {
  it.each(["cpc", "ppc", "cpm", "cpv", "paid_social", "paid", "paidsearch", "retargeting", "CPC"])("%s is paid", (m) => {
    expect(isGa4PaidMedium(m)).toBe(true);
  });

  it.each(["social_paid", "sem", "ads", "ad", "social", "email", ""])("%s is not paid", (m) => {
    expect(isGa4PaidMedium(m)).toBe(false);
  });

  it("display mediums count as standard paid even without the paid regex", () => {
    expect(isGa4StandardPaidMedium("banner")).toBe(true);
    expect(isGa4StandardPaidMedium("display")).toBe(true);
    expect(isGa4StandardPaidMedium("sponsored")).toBe(false);
  });
});

describe("ga4ChannelFor", () => {
  it("maps Meta sources to Paid Social", () => {
    expect(ga4ChannelFor("fb", "paid_social")).toBe("Paid Social");
    expect(ga4ChannelFor("ig", "paid_social")).toBe("Paid Social");
    expect(ga4ChannelFor("facebook", "cpc")).toBe("Paid Social");
  });

  it("puts msg / an in Paid Other (not on Google's social list)", () => {
    expect(ga4ChannelFor("msg", "paid_social")).toBe("Paid Other");
    expect(ga4ChannelFor("an", "paid_social")).toBe("Paid Other");
  });

  it("maps Google search, video and display", () => {
    expect(ga4ChannelFor("google", "cpc")).toBe("Paid Search");
    expect(ga4ChannelFor("youtube", "cpc")).toBe("Paid Video");
    expect(ga4ChannelFor("google", "display")).toBe("Display");
  });

  it("non-paid medium is not a paid channel", () => {
    expect(ga4ChannelFor("fb", "social")).not.toMatch(/^Paid/);
  });
});

describe("isStandardPaid", () => {
  it("meta needs Paid Social; google accepts search / display / video", () => {
    expect(isStandardPaid("meta", "fb", "paid_social")).toBe(true);
    expect(isStandardPaid("meta", "fb", "social_paid")).toBe(false);
    expect(isStandardPaid("google", "google", "cpc")).toBe(true);
    expect(isStandardPaid("google", "google", "display")).toBe(true);
  });
});
