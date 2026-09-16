import { describe, expect, it, afterEach, vi } from "vitest";
import {
  resolvePageDetailPaths,
  clearAnalyticsReportCache,
  AnalyticsReportValidationError,
  getAnalyticsReport,
} from "./reports";
import * as bq from "../ecommerce/bigquery-client";

vi.mock("../content-index", () => ({
  contentIndex: {
    getAlternateUrls: (slug: string, contentType: string) => {
      if (contentType === "program" && slug === "ai-fluency") {
        return { en: "/us/coding-bootcamps/ai-fluency", es: "/es/bootcamps/ai-fluency" };
      }
      if (contentType === "blog" && slug === "hello") {
        return { en: "/en/blog/hello" };
      }
      return {};
    },
  },
}));

afterEach(() => {
  clearAnalyticsReportCache();
  vi.restoreAllMocks();
});

describe("resolvePageDetailPaths", () => {
  it("normalizes a raw path", () => {
    const r = resolvePageDetailPaths({ path: "https://example.com/en/blog/foo?x=1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.paths).toEqual(["/en/blog/foo"]);
  });

  it("rejects path combined with content_type", () => {
    const r = resolvePageDetailPaths({ path: "/en/x", content_type: "blog", slug: "x" });
    expect(r.ok).toBe(false);
  });

  it("resolves content_type+slug to primary en and warns on multiple locales", () => {
    const r = resolvePageDetailPaths({ content_type: "program", slug: "ai-fluency" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paths).toEqual(["/us/coding-bootcamps/ai-fluency"]);
      expect(r.warnings.some((w) => w.code === "primary_locale_chosen")).toBe(true);
    }
  });

  it("honors locale", () => {
    const r = resolvePageDetailPaths({
      content_type: "program",
      slug: "ai-fluency",
      locale: "es",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.paths).toEqual(["/es/bootcamps/ai-fluency"]);
  });

  it("fails when entry has no urls", () => {
    const r = resolvePageDetailPaths({ content_type: "blog", slug: "missing" });
    expect(r.ok).toBe(false);
  });
});

describe("getAnalyticsReport validation", () => {
  it("rejects bare slug for page_detail", async () => {
    await expect(
      getAnalyticsReport({ report: "page_detail", slug: "ai-fluency" }),
    ).rejects.toBeInstanceOf(AnalyticsReportValidationError);
  });

  it("rejects page_detail without path or identity", async () => {
    await expect(getAnalyticsReport({ report: "page_detail" })).rejects.toBeInstanceOf(
      AnalyticsReportValidationError,
    );
  });

  it("returns not_configured when BigQuery is disabled", async () => {
    vi.spyOn(bq, "getBigQueryConfigStatus").mockReturnValue({
      configured: false,
      enabled: false,
      settings: {
        enabled: false,
        project_id: "",
        dataset_id: "",
        location: "US",
        table_prefix: "events_",
      },
      credentials_hint: "",
      credentials_source: "none",
      warnings: ["BigQuery is disabled in tracking settings."],
    });

    const result = await getAnalyticsReport({ report: "site_summary", days: 7 });
    expect(result.status).toBe("not_configured");
    expect(result.rows).toEqual([]);
    expect(result.warnings.some((w) => w.code === "configure_at")).toBe(true);
  });
});
