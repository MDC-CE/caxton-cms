import { describe, expect, it } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS as T } from "./ads-settings";
import {
  clicksVisitsIssue,
  consentRateDrop,
  currenciesMissingFloor,
  droppedParams,
  ga4LedgerGapIssue,
  hasNonPaidMedium,
  leadGapPct,
  missingTemplateParams,
  parseTrackingParams,
  severityForSpend,
  unclearShareIssue,
} from "./ads-diagnostics-rules";

describe("severityForSpend", () => {
  it("is an error at ≥5% of spend or ≥ the currency floor", () => {
    expect(severityForSpend({ USD: 60 }, { USD: 10_000 }, T)).toBe("error");
    expect(severityForSpend({ USD: 10 }, { USD: 100 }, T)).toBe("error");
    expect(severityForSpend({ USD: 10 }, { USD: 10_000 }, T)).toBe("warning");
  });
  it("falls back to the share rule when a currency has no floor", () => {
    expect(severityForSpend({ MXN: 900 }, { MXN: 100_000 }, T)).toBe("warning");
    expect(currenciesMissingFloor({ MXN: 5, USD: 1 }, T)).toEqual(["MXN"]);
  });
});

describe("ratio rules", () => {
  it("clicks → visits floor, drop and volume guard", () => {
    expect(clicksVisitsIssue({ clicks: 50, visits: 1 }, 0.8, T)).toBeNull();
    expect(clicksVisitsIssue({ clicks: 200, visits: 40 }, null, T)?.reason).toBe("floor");
    expect(clicksVisitsIssue({ clicks: 200, visits: 100 }, 0.9, T)?.reason).toBe("drop");
    expect(clicksVisitsIssue({ clicks: 200, visits: 160 }, 0.9, T)).toBeNull();
  });
  it("unclear share needs 100 sessions and > 20%", () => {
    expect(unclearShareIssue(50, 40, T)).toBeNull();
    expect(unclearShareIssue(70, 30, T)).toBeCloseTo(30);
    expect(unclearShareIssue(90, 10, T)).toBeNull();
  });
  it("GA4 vs ledger gap: bootstrap 35%, then widening 15 pts", () => {
    expect(leadGapPct(100, 60)).toBe(40);
    expect(ga4LedgerGapIssue(40, null, 10, T)).toBe(true);
    expect(ga4LedgerGapIssue(40, 30, 60, T)).toBe(false);
    expect(ga4LedgerGapIssue(50, 30, 60, T)).toBe(true);
  });
  it("consent drop needs 100 impressions", () => {
    expect(consentRateDrop({ shown: 50, granted: 1, decided: 10 }, 0.8)).toBeNull();
    expect(consentRateDrop({ shown: 200, granted: 40, decided: 100 }, 0.8)).toBeCloseTo(50);
  });
});

describe("tracking params", () => {
  it("flags missing template params and non-paid mediums", () => {
    const p = parseTrackingParams("utm_source=facebook&utm_medium=social");
    expect(missingTemplateParams(p)).toEqual(["utm_id", "utm_content"]);
    expect(hasNonPaidMedium(p)).toBe(true);
    expect(hasNonPaidMedium(parseTrackingParams("utm_medium=paid_social"))).toBe(false);
  });
  it("detects params dropped by redirects", () => {
    expect(droppedParams("https://a.com/x?utm_source=fb&fbclid=1", "https://a.com/y")).toEqual(["utm_source", "fbclid"]);
    expect(droppedParams("https://a.com/x?utm_source=fb", "https://a.com/y?utm_source=fb")).toEqual([]);
  });
});
