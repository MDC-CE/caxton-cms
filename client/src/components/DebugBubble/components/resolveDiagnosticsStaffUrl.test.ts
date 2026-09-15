import { describe, expect, it } from "vitest";
import { resolveDiagnosticsStaffUrl } from "./PageErrorsModal";

describe("resolveDiagnosticsStaffUrl", () => {
  it("prefers publicPageUrl for display, open, and inspect", () => {
    const r = resolveDiagnosticsStaffUrl({
      publicPageUrl: "/en/location/newyork-usa",
      pageUrl: "/private/preview/location/newyork-usa?locale=en",
      diagnosticsUrl: "/private/preview/location/newyork-usa?locale=en",
    });
    expect(r).toEqual({
      displayUrl: "/en/location/newyork-usa",
      openUrl: "/en/location/newyork-usa",
      inspectLookupUrl: "/en/location/newyork-usa",
      isDraftNoPublic: false,
    });
  });

  it("marks draft when only preview paths are available", () => {
    const r = resolveDiagnosticsStaffUrl({
      publicPageUrl: null,
      pageUrl: "/private/preview/location/newyork-usa?locale=en",
      diagnosticsUrl: "/private/preview/location/newyork-usa?locale=en",
    });
    expect(r).toEqual({
      displayUrl: null,
      openUrl: null,
      inspectLookupUrl: "",
      isDraftNoPublic: true,
    });
  });

  it("uses public diagnostics url when not on preview", () => {
    const r = resolveDiagnosticsStaffUrl({
      publicPageUrl: null,
      diagnosticsUrl: "/en/location/newyork-usa",
    });
    expect(r).toEqual({
      displayUrl: "/en/location/newyork-usa",
      openUrl: "/en/location/newyork-usa",
      inspectLookupUrl: "/en/location/newyork-usa",
      isDraftNoPublic: false,
    });
  });

  it("rejects publicPageUrl that is still a preview path", () => {
    const r = resolveDiagnosticsStaffUrl({
      publicPageUrl: "/private/preview/location/x?locale=en",
      diagnosticsUrl: "/private/preview/location/x?locale=en",
    });
    expect(r.isDraftNoPublic).toBe(true);
    expect(r.displayUrl).toBeNull();
  });
});
