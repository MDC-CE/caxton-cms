import { describe, it, expect } from "vitest";
import { isDiagnosticsSeoOrganic, resolveDiagnosticsTab } from "@/lib/diagnostics-tab";

describe("resolveDiagnosticsTab", () => {
  it("keeps /private/diagnostics/seo/organic on the SEO tab", () => {
    expect(resolveDiagnosticsTab("/private/diagnostics/seo/organic")).toBe("seo");
    expect(resolveDiagnosticsTab("/private/diagnostics/seo")).toBe("seo");
    expect(isDiagnosticsSeoOrganic("/private/diagnostics/seo/organic")).toBe(true);
    expect(isDiagnosticsSeoOrganic("/private/diagnostics/seo")).toBe(false);
  });

  it("resolves /private/diagnostics/legal to the Legal tab", () => {
    expect(resolveDiagnosticsTab("/private/diagnostics/legal")).toBe("legal");
    expect(resolveDiagnosticsTab("/private/diagnostics/ads")).toBe("ads");
  });

  it("keeps the Meta and Google ads sub-pages on the Ads tab", () => {
    expect(resolveDiagnosticsTab("/private/diagnostics/ads/meta")).toBe("ads");
    expect(resolveDiagnosticsTab("/private/diagnostics/ads/google")).toBe("ads");
    expect(resolveDiagnosticsTab("/private/diagnostics/adsense")).not.toBe("ads");
  });
});
