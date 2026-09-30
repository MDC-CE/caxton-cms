import { describe, expect, it } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS as T } from "./ads-settings";
import {
  clicksVisitsIssue,
  isClicksVisitsMismatch,
  consentRateDrop,
  currenciesMissingFloor,
  droppedParams,
  ga4LedgerGapIssue,
  hasNonPaidMedium,
  leadGapComparable,
  leadGapPct,
  ledgerNotRecordingIssue,
  missingTemplateParams,
  parseTrackingParams,
  resolveAdsDiagnosticsWindows,
  severityForSpend,
  sortAdsIssues,
  unclearShareIssue,
  unrecognizedCampaignKey,
  unrecognizedCampaignSeverity,
} from "./ads-diagnostics-rules";

describe("unrecognizedCampaignKey", () => {
  it("prefers a numeric utm_id and keeps the name as label", () => {
    expect(unrecognizedCampaignKey({ utm_id: "120249995075650344", campaign: "AI Fluency" })).toEqual({
      key: "120249995075650344",
      campaign_id: "120249995075650344",
      campaign_name: "AI Fluency",
    });
  });

  it("falls back to a numeric utm_campaign when utm_id isn't an id", () => {
    expect(unrecognizedCampaignKey({ utm_id: "120250_v2_s02_i1", campaign: "120249995075650344" })).toEqual({
      key: "120249995075650344",
      campaign_id: "120249995075650344",
      campaign_name: "120249995075650344",
    });
  });

  it("uses the campaign name, skipping GA4 placeholders", () => {
    expect(unrecognizedCampaignKey({ utm_id: null, campaign: " Spring promo " })).toEqual({ key: "Spring promo", campaign_id: null, campaign_name: "Spring promo" });
    expect(unrecognizedCampaignKey({ utm_id: null, campaign: "(not set)" })).toBeNull();
    expect(unrecognizedCampaignKey({ utm_id: "", campaign: "(direct)" })).toBeNull();
    expect(unrecognizedCampaignKey({ utm_id: null, campaign: null })).toBeNull();
  });
});

describe("unrecognizedCampaignSeverity", () => {
  const sev = (visits: number, paidMetaVisits: number, known = false) => unrecognizedCampaignSeverity({ visits, paidMetaVisits, known }, T);

  it("stays quiet below the minimum, warns at it, errors at the visit threshold", () => {
    expect(sev(2, 10_000)).toBeNull();
    expect(sev(3, 10_000)).toBe("warning");
    expect(sev(19, 10_000)).toBe("warning");
    expect(sev(20, 10_000)).toBe("error");
  });

  it("errors on share only with enough paid Meta visits", () => {
    expect(sev(5, 100)).toBe("error");
    expect(sev(4, 100)).toBe("warning");
    expect(sev(5, 99)).toBe("warning");
  });

  it("known external campaigns are info, and still need the minimum", () => {
    expect(sev(500, 1000, true)).toBe("info");
    expect(sev(2, 1000, true)).toBeNull();
  });
});

describe("sortAdsIssues", () => {
  it("orders by severity, then spend affected, then id", () => {
    const i = (id: string, severity: "error" | "warning" | "info", spend: Record<string, number>) => ({ id, severity, spend_affected: spend });
    const sorted = sortAdsIssues([
      i("w-small", "warning", { USD: 5 }),
      i("info-big", "info", { USD: 900 }),
      i("w-big", "warning", { USD: 50, EUR: 10 }),
      i("e-none", "error", {}),
      i("w-b", "warning", { USD: 5 }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["e-none", "w-big", "w-b", "w-small", "info-big"]);
  });
});

describe("resolveAdsDiagnosticsWindows", () => {
  it("clamps the KPI window to whole days 1–90, default 28", () => {
    expect(resolveAdsDiagnosticsWindows(7).kpiDays).toBe(7);
    expect(resolveAdsDiagnosticsWindows("90").kpiDays).toBe(90);
    expect(resolveAdsDiagnosticsWindows(365).kpiDays).toBe(90);
    expect(resolveAdsDiagnosticsWindows(14.7).kpiDays).toBe(14);
    expect(resolveAdsDiagnosticsWindows(0).kpiDays).toBe(28);
    expect(resolveAdsDiagnosticsWindows(undefined).kpiDays).toBe(28);
    expect(resolveAdsDiagnosticsWindows("abc").kpiDays).toBe(28);
  });
  it("keeps the issue window at 28 days whatever KPI window is picked", () => {
    for (const d of [1, 7, 28, 90]) expect(resolveAdsDiagnosticsWindows(d).issueDays).toBe(28);
  });
});

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
  it("clicks → visits mismatch (> 110%) never warns and voids a mismatched baseline", () => {
    expect(clicksVisitsIssue({ clicks: 200, visits: 900 }, null, T)).toBeNull();
    expect(clicksVisitsIssue({ clicks: 200, visits: 200 }, 4.9, T)).toBeNull();
    expect(isClicksVisitsMismatch(1.11)).toBe(true);
    expect(isClicksVisitsMismatch(1.1)).toBe(false);
    expect(isClicksVisitsMismatch(null)).toBe(false);
  });
  it("unclear share needs 100 sessions and > 20%", () => {
    expect(unclearShareIssue(50, 40, T)).toBeNull();
    expect(unclearShareIssue(70, 30, T)).toBeCloseTo(30);
    expect(unclearShareIssue(90, 10, T)).toBeNull();
  });
  it("GA4 vs ledger gap: bootstrap 35%, then widening 15 pts", () => {
    const c = (ga4_leads: number, submissions: number, days = 20) => ({ days, ga4_leads, submissions });
    expect(leadGapPct(100, 60)).toBe(40);
    // baseline not comparable (too few days) → starter threshold
    expect(ga4LedgerGapIssue({ current: c(100, 60), baseline: c(100, 70, 3) }, T)).toBe(true);
    expect(ga4LedgerGapIssue({ current: c(100, 70), baseline: c(0, 0, 0) }, T)).toBe(false);
    // baseline comparable → widen rule (40 vs 30 = +10, 50 vs 30 = +20)
    expect(ga4LedgerGapIssue({ current: c(100, 60), baseline: c(100, 70) }, T)).toBe(false);
    expect(ga4LedgerGapIssue({ current: c(100, 50), baseline: c(100, 70) }, T)).toBe(true);
  });
  it("GA4 vs ledger gap is skipped without submissions or with fewer than 7 shared days", () => {
    expect(leadGapComparable({ days: 28, ga4_leads: 1083, submissions: 0 })).toBe(false);
    expect(leadGapComparable({ days: 6, ga4_leads: 100, submissions: 10 })).toBe(false);
    expect(leadGapComparable({ days: 7, ga4_leads: 100, submissions: 10 })).toBe(true);
    const empty = { days: 0, ga4_leads: 0, submissions: 0 };
    expect(ga4LedgerGapIssue({ current: { days: 28, ga4_leads: 1083, submissions: 0 }, baseline: empty }, T)).toBe(false);
    expect(ga4LedgerGapIssue({ current: { days: 6, ga4_leads: 100, submissions: 1 }, baseline: empty }, T)).toBe(false);
  });
  it("ledger not recording: info when never recorded, warning when it stopped", () => {
    const base = { ga4Configured: true, ga4Leads: 1083, submissions: 0 };
    expect(ledgerNotRecordingIssue({ ...base, lastRecordedAt: null })).toEqual({ severity: "info", lastRecordedAt: null });
    expect(ledgerNotRecordingIssue({ ...base, lastRecordedAt: 1_700_000_000_000 })).toEqual({ severity: "warning", lastRecordedAt: 1_700_000_000_000 });
    expect(ledgerNotRecordingIssue({ ...base, submissions: 1, lastRecordedAt: null })).toBeNull();
    expect(ledgerNotRecordingIssue({ ...base, ga4Leads: 0, lastRecordedAt: null })).toBeNull();
    expect(ledgerNotRecordingIssue({ ...base, ga4Configured: false, lastRecordedAt: null })).toBeNull();
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
