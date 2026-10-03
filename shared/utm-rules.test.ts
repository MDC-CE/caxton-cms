import { describe, expect, it } from "vitest";
import { DEFAULT_ADS_ALERT_THRESHOLDS, DEFAULT_UTM_CONVENTION, metaUtmTemplate, parseUtmConvention } from "./ads-settings";
import { NO_UTM_GRACE, utmIssueSeverity, utmViolations, type UtmGrace } from "./ads-diagnostics-rules";

const c = DEFAULT_UTM_CONVENTION;
const t = DEFAULT_ADS_ALERT_THRESHOLDS;
const codes = (v: Array<{ code: string }>) => v.map((x) => x.code).sort();
const params = (q: string) => Object.fromEntries(new URLSearchParams(q));

describe("utmViolations", () => {
  it("the default Meta template is clean when declared", () => {
    expect(utmViolations({ params: params(metaUtmTemplate()), platform: "meta", convention: c, kind: "declared" })).toEqual([]);
  });

  it("filled Meta values are clean when observed", () => {
    const p = { utm_source: "ig", utm_medium: "paid_social", utm_campaign: "spring", utm_id: "1", utm_term: "2", utm_content: "3" };
    expect(utmViolations({ params: p, platform: "meta", convention: c, kind: "observed" })).toEqual([]);
  });

  it("no utm_* at all → nothing to check", () => {
    expect(utmViolations({ params: {}, platform: "meta", convention: c, kind: "observed" })).toEqual([]);
  });

  it("flags unfilled macros only on observed traffic", () => {
    const p = { utm_source: "{{site_source_name}}", utm_medium: "paid_social", utm_content: "{{ad.id}}" };
    expect(codes(utmViolations({ params: p, platform: "meta", convention: c, kind: "observed" }))).toEqual(["utm_unfilled_macro", "utm_unfilled_macro"]);
    expect(utmViolations({ params: p, platform: "meta", convention: c, kind: "declared" })).toEqual([]);
  });

  it("mixed case and odd characters", () => {
    const v = utmViolations({ params: { utm_source: "Facebook", utm_medium: "paid social" }, platform: "meta", convention: c, kind: "observed" });
    expect(codes(v)).toContain("utm_case_mixed");
    expect(codes(v)).toContain("utm_bad_chars");
    expect(v.find((x) => x.code === "utm_bad_chars")?.expected).toBe("paid_social");
  });

  it("case: any allows capitals", () => {
    const any = parseUtmConvention({ case: "any" }).convention;
    const v = utmViolations({ params: { utm_source: "FB", utm_medium: "paid_social" }, platform: "meta", convention: any, kind: "observed" });
    expect(codes(v)).not.toContain("utm_case_mixed");
  });

  it("medium we count as paid but GA4 doesn't → nonstandard (not off-convention)", () => {
    const v = utmViolations({ params: { utm_source: "fb", utm_medium: "social_paid" }, platform: "meta", convention: c, kind: "observed" });
    expect(codes(v)).toEqual(["utm_medium_nonstandard"]);
  });

  it("GA4-paid medium that isn't the convention's → off-convention", () => {
    const v = utmViolations({ params: { utm_source: "fb", utm_medium: "cpc" }, platform: "meta", convention: c, kind: "observed" });
    expect(codes(v)).toEqual(["utm_medium_off_convention"]);
    expect(v[0]!.expected).toBe("paid_social");
  });

  it("source aliases and unknown sources", () => {
    expect(codes(utmViolations({ params: { utm_source: "facebook", utm_medium: "paid_social" }, platform: "meta", convention: c, kind: "observed" }))).toEqual([
      "utm_source_alias",
    ]);
    const declared = utmViolations({ params: { utm_source: "facebook", utm_medium: "paid_social" }, platform: "meta", convention: c, kind: "declared" });
    expect(declared[0]?.expected).toBe("{{site_source_name}}");
  });

  it("platform rules don't apply to other platforms; universal rules do", () => {
    const v = utmViolations({ params: { utm_source: "TikTok", utm_medium: "sem" }, platform: "tiktok", convention: c, kind: "observed" });
    expect(codes(v)).toEqual(["utm_case_mixed", "utm_medium_nonstandard"]);
  });

  it("Google needs numeric utm_id / utm_term when require_ids", () => {
    const v = utmViolations({ params: { utm_source: "google", utm_medium: "cpc", utm_id: "abc" }, platform: "google", convention: c, kind: "observed" });
    expect(v.filter((x) => x.code === "utm_missing_ids").map((x) => x.param).sort()).toEqual(["utm_id", "utm_term"]);
    const ok = utmViolations({ params: { utm_source: "google", utm_medium: "cpc", utm_id: "1234567", utm_term: "7654321" }, platform: "google", convention: c, kind: "observed" });
    expect(ok).toEqual([]);
    const declared = utmViolations({ params: { utm_source: "google", utm_medium: "cpc", utm_id: "{campaignid}", utm_term: "{adgroupid}" }, platform: "google", convention: c, kind: "declared" });
    expect(declared).toEqual([]);
  });

  it("campaign pattern", () => {
    const withPattern = parseUtmConvention({ campaign_pattern: "^[a-z0-9_]+$" }).convention;
    const v = utmViolations({ params: { utm_source: "fb", utm_medium: "paid_social", utm_campaign: "Spring Sale" }, platform: "meta", convention: withPattern, kind: "observed" });
    expect(codes(v)).toEqual(["utm_campaign_pattern"]);
  });

  it("marks old values in grace", () => {
    const grace: UtmGrace = { ...NO_UTM_GRACE, active: true, ends_at: "2026-11-01T00:00:00.000Z", accepted: { meta: { sources: ["facebook"], mediums: ["cpc"] } } };
    const v = utmViolations({ params: { utm_source: "facebook", utm_medium: "cpc" }, platform: "meta", convention: c, grace, kind: "observed" });
    expect(v.every((x) => x.in_grace)).toBe(true);
    expect(codes(v)).toEqual(["utm_medium_off_convention", "utm_source_alias"]);
  });
});

describe("utmIssueSeverity", () => {
  const base = { spend: {}, totalSpend: { USD: 1000 }, visits: 0, inGrace: false, excepted: false };

  it("below the minimum visits with no spend → not raised", () => {
    expect(utmIssueSeverity("utm_source_alias", { ...base, visits: t.utm_issue_min_visits - 1 }, t)).toBeNull();
  });

  it("visits only: warning, error at the error threshold", () => {
    expect(utmIssueSeverity("utm_source_alias", { ...base, visits: t.utm_issue_min_visits }, t)).toBe("warning");
    expect(utmIssueSeverity("utm_source_alias", { ...base, visits: t.utm_issue_error_visits }, t)).toBe("error");
  });

  it("grace, exceptions and campaign pattern stay info", () => {
    expect(utmIssueSeverity("utm_source_alias", { ...base, visits: 500, inGrace: true }, t)).toBe("info");
    expect(utmIssueSeverity("utm_source_alias", { ...base, visits: 500, excepted: true }, t)).toBe("info");
    expect(utmIssueSeverity("utm_campaign_pattern", { ...base, visits: 500 }, t)).toBe("info");
  });

  it("unfilled macros are always errors once raised", () => {
    expect(utmIssueSeverity("utm_unfilled_macro", { ...base, visits: t.utm_issue_min_visits }, t)).toBe("error");
  });

  it("declared with spend is raised even without visits", () => {
    expect(utmIssueSeverity("utm_medium_off_convention", { ...base, spend: { USD: 400 } }, t)).not.toBeNull();
  });
});
