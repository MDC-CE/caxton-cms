import { describe, expect, it } from "vitest";
import {
  buildKeywordMetricsResearchNextAction,
  isWeakKeywordMetricsForResearch,
} from "./entry-seo-research-hints.js";

describe("isWeakKeywordMetricsForResearch", () => {
  it("false when research off", () => {
    expect(
      isWeakKeywordMetricsForResearch("bootcamp", {
        openrush_configured: false,
        source: "none",
      }),
    ).toBe(false);
  });

  it("false when no main keyword", () => {
    expect(
      isWeakKeywordMetricsForResearch("", {
        openrush_configured: true,
        source: "none",
      }),
    ).toBe(false);
    expect(
      isWeakKeywordMetricsForResearch(null, {
        openrush_configured: true,
        source: "yaml_fallback",
      }),
    ).toBe(false);
  });

  it("true for yaml_fallback / none / stale / missing volume or difficulty", () => {
    expect(
      isWeakKeywordMetricsForResearch("bootcamp", {
        openrush_configured: true,
        source: "yaml_fallback",
        kw_monthly_volume: 100,
        kw_difficulty: 20,
      }),
    ).toBe(true);
    expect(
      isWeakKeywordMetricsForResearch("bootcamp", {
        openrush_configured: true,
        source: "none",
      }),
    ).toBe(true);
    expect(
      isWeakKeywordMetricsForResearch("bootcamp", {
        openrush_configured: true,
        source: "openrush_cache",
        stale: true,
        kw_monthly_volume: 100,
        kw_difficulty: 20,
      }),
    ).toBe(true);
    expect(
      isWeakKeywordMetricsForResearch("bootcamp", {
        openrush_configured: true,
        source: "openrush_cache",
        kw_monthly_volume: null,
        kw_difficulty: 20,
      }),
    ).toBe(true);
  });

  it("false when fresh cache metrics present", () => {
    expect(
      isWeakKeywordMetricsForResearch("bootcamp", {
        openrush_configured: true,
        source: "openrush_cache",
        stale: false,
        kw_monthly_volume: 100,
        kw_difficulty: 20,
      }),
    ).toBe(false);
  });
});

describe("buildKeywordMetricsResearchNextAction", () => {
  it("hints get_or_refresh_seo_research action keyword_metrics", () => {
    const a = buildKeywordMetricsResearchNextAction({
      contentType: "blog",
      slug: "example",
      locale: "en",
      site: "4geeks-com",
    });
    expect(a.tool).toBe("get_or_refresh_seo_research");
    expect(a.priority).toBe("recommended");
    expect(a.args_hint).toMatchObject({
      action: "keyword_metrics",
      contentType: "blog",
      slug: "example",
      locale: "en",
      site: "4geeks-com",
    });
  });
});
