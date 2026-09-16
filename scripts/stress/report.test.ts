import { describe, expect, it } from "vitest";
import {
  detectNotConfiguredPayload,
  notConfiguredKindForTool,
  notConfiguredTip,
} from "./report";

describe("detectNotConfiguredPayload", () => {
  it("flags GA not_configured and funnel unavailable", () => {
    expect(detectNotConfiguredPayload({ status: "not_configured" })).toBe(true);
    expect(detectNotConfiguredPayload({ status: "unavailable" })).toBe(true);
  });

  it("does not flag empty-but-ok", () => {
    expect(
      detectNotConfiguredPayload({
        status: "ok",
        warnings: [{ code: "empty_window", message: "No matching events" }],
      }),
    ).toBe(false);
  });

  it("flags organic setup gaps", () => {
    expect(detectNotConfiguredPayload({ configured: false, source: "none" })).toBe(true);
    expect(detectNotConfiguredPayload({ source: "none" })).toBe(true);
    expect(
      detectNotConfiguredPayload({
        configured: true,
        warnings: [{ code: "organic_not_configured", message: "no days" }],
      }),
    ).toBe(true);
  });

  it("ignores incomplete while configured", () => {
    expect(
      detectNotConfiguredPayload({
        configured: true,
        source: "day_cache",
        incomplete: true,
        warnings: [{ code: "organic_incomplete_window", message: "under-count" }],
      }),
    ).toBe(false);
  });
});

describe("notConfiguredKindForTool", () => {
  it("maps organic vs ga families", () => {
    expect(notConfiguredKindForTool("get_organic_traffic")).toBe("organic");
    expect(notConfiguredKindForTool("get_analytics_report")).toBe("ga");
    expect(notConfiguredKindForTool("get_product_funnel_analytics")).toBe("ga");
  });

  it("tips differ by family", () => {
    expect(notConfiguredTip("organic")).toMatch(/Organic/);
    expect(notConfiguredTip("ga")).toMatch(/ga4/i);
  });
});
