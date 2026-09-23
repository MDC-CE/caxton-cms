import { describe, expect, it } from "vitest";
import {
  matchesPage,
  pathnameMatchesEntry,
  overlayBlockingSaveError,
  overlayHasLabeledButton,
  validateOverlaysConfig,
  isPrivateStaffPath,
  matchesGeoForOverlay,
  overlayUsesAutoRedirect,
  resolveOverlayRedirectUrl,
  type Overlay,
  type OverlayContent,
} from "./useOverlays";

describe("pathnameMatchesEntry", () => {
  it("matches exact path and prefix", () => {
    expect(pathnameMatchesEntry("/us/courses", "/us/courses")).toBe(true);
    expect(pathnameMatchesEntry("/us/courses/foo", "/us/courses")).toBe(true);
    expect(pathnameMatchesEntry("/us/other", "/us/courses")).toBe(false);
  });

  it("treats / as homepage only", () => {
    expect(pathnameMatchesEntry("/", "/")).toBe(true);
    expect(pathnameMatchesEntry("/us", "/")).toBe(false);
  });

  it("supports regex-style entries", () => {
    expect(pathnameMatchesEntry("/us/blog/hello", ".*/blog/.*")).toBe(true);
    expect(pathnameMatchesEntry("/us/courses", ".*/blog/.*")).toBe(false);
  });
});

describe("matchesPage", () => {
  it("includes all pages when pages is \"all\"", () => {
    expect(matchesPage({ pages: "all" }, "/us/courses")).toBe(true);
  });

  it("treats empty include + excludes as all pages minus exclusions", () => {
    const targeting = {
      pages: [] as string[],
      exclude_pages: [".*/blog/.*", ".*/landing/.*"],
    };
    expect(matchesPage(targeting, "/us/courses")).toBe(true);
    expect(matchesPage(targeting, "/us/blog/post")).toBe(false);
    expect(matchesPage(targeting, "/es/landing/foo")).toBe(false);
  });

  it("does not match when include is empty and there are no excludes", () => {
    expect(matchesPage({ pages: [] }, "/us/courses")).toBe(false);
  });

  it("requires a matching include when includes are listed", () => {
    const targeting = {
      pages: ["/us/courses"],
      exclude_pages: [".*/blog/.*"],
    };
    expect(matchesPage(targeting, "/us/courses")).toBe(true);
    expect(matchesPage(targeting, "/us/other")).toBe(false);
  });

  it("applies excludes over includes", () => {
    const targeting = {
      pages: "all" as const,
      exclude_pages: [".*/how-to/.*"],
    };
    expect(matchesPage(targeting, "/us/how-to/setup")).toBe(false);
    expect(matchesPage(targeting, "/us/home")).toBe(true);
  });
});

describe("isPrivateStaffPath", () => {
  it("matches /private and nested staff routes", () => {
    expect(isPrivateStaffPath("/private")).toBe(true);
    expect(isPrivateStaffPath("/private/overlays")).toBe(true);
    expect(isPrivateStaffPath("/private/preview/landing/foo")).toBe(true);
  });

  it("does not match public paths", () => {
    expect(isPrivateStaffPath("/")).toBe(false);
    expect(isPrivateStaffPath("/us")).toBe(false);
    expect(isPrivateStaffPath("/en/privacy")).toBe(false);
  });
});

describe("overlay blocking save validation", () => {
  it("allows soft-dismiss overlays without buttons", () => {
    expect(overlayBlockingSaveError({ id: "a", dismissible: true, content: { buttons: [] } })).toBeNull();
    expect(overlayBlockingSaveError({ id: "a", content: { buttons: [] } })).toBeNull();
  });

  it("allows disabled blocking overlays without labeled buttons", () => {
    expect(
      overlayBlockingSaveError({
        id: "a",
        enabled: false,
        dismissible: false,
        content: { buttons: [{ label: "  " }] },
      }),
    ).toBeNull();
  });

  it("rejects enabled blocking overlays with no labeled button", () => {
    expect(
      overlayBlockingSaveError({
        id: "a",
        enabled: true,
        dismissible: false,
        content: { buttons: [{ label: "  " }] },
      }),
    ).toMatch(/before it can be enabled/i);
    expect(overlayHasLabeledButton({ content: { buttons: [{ label: "OK" }] } })).toBe(true);
  });

  it("validateOverlaysConfig scans the array", () => {
    expect(
      validateOverlaysConfig({
        overlays: [{ id: "x", enabled: true, dismissible: false, content: { buttons: [] } }],
      }),
    ).toMatch(/before it can be enabled/i);
    expect(
      validateOverlaysConfig({
        overlays: [{ id: "x", enabled: false, dismissible: false, content: { buttons: [] } }],
      }),
    ).toBeNull();
    expect(validateOverlaysConfig({ overlays: [] })).toBeNull();
  });
});

const autoContent = (partial: Partial<OverlayContent> = {}): OverlayContent => ({
  title: "Redirecting",
  body: "…",
  auto_redirect_after_ms: 1500,
  auto_redirect_base_host: "https://fl.4geeksacademy.com",
  buttons: [{ label: "Continue", variant: "default", href: "https://fl.4geeksacademy.com" }],
  ...partial,
});

const autoOverlay = (geoTargeting?: Overlay["targeting"]["geo"]): Overlay => ({
  id: "temp-fl",
  enabled: true,
  dismissible: false,
  trigger: { event: "time_delay", delay: 500 },
  targeting: {
    pages: ["/en/apply"],
    geo: geoTargeting ?? { countries: ["US"], regions: ["Florida"] },
  },
  frequency: "session",
  component: "modal",
  content: autoContent(),
});

describe("overlayUsesAutoRedirect / resolveOverlayRedirectUrl", () => {
  it("detects auto-redirect when ms + base host are set", () => {
    expect(overlayUsesAutoRedirect(autoContent())).toBe(true);
    expect(overlayUsesAutoRedirect({ title: "x", body: "" })).toBe(false);
    expect(
      overlayUsesAutoRedirect({
        title: "x",
        body: "",
        auto_redirect_after_ms: 1500,
      }),
    ).toBe(false);
  });

  it("path-preserves onto the FL host", () => {
    expect(resolveOverlayRedirectUrl(autoContent(), "/en/apply", "?x=1")).toBe(
      "https://fl.4geeksacademy.com/en/apply?x=1",
    );
    expect(resolveOverlayRedirectUrl(autoContent(), "/en/location/miami-usa")).toBe(
      "https://fl.4geeksacademy.com/en/location/miami-usa",
    );
  });

  it("rewrites AI Engineering paths to FL Full Stack", () => {
    expect(
      resolveOverlayRedirectUrl(autoContent(), "/en/career-programs/ai-engineering"),
    ).toBe("https://fl.4geeksacademy.com/en/programs/full-stack");
    expect(
      resolveOverlayRedirectUrl(autoContent(), "/es/programas/ai-engineering"),
    ).toBe("https://fl.4geeksacademy.com/es/programas/full-stack");
    expect(
      resolveOverlayRedirectUrl(
        autoContent(),
        "/en/landing/ai-engineering-coding-florida",
      ),
    ).toBe("https://fl.4geeksacademy.com/en/programs/full-stack");
  });
});

describe("matchesGeoForOverlay", () => {
  it("fail-closes auto-redirect when geo is missing or failed", () => {
    const o = autoOverlay();
    expect(matchesGeoForOverlay(o, null)).toBe(false);
    expect(matchesGeoForOverlay(o, { status: "fail" })).toBe(false);
  });

  it("requires Florida for auto-redirect when regions are set", () => {
    const o = autoOverlay();
    expect(
      matchesGeoForOverlay(o, {
        status: "success",
        countryCode: "US",
        regionName: "Florida",
      }),
    ).toBe(true);
    expect(
      matchesGeoForOverlay(o, {
        status: "success",
        countryCode: "US",
        regionName: "Texas",
      }),
    ).toBe(false);
  });

  it("fail-opens soft overlays when geo is missing", () => {
    const soft: Overlay = {
      ...autoOverlay(),
      content: { title: "Hi", body: "soft" },
    };
    expect(matchesGeoForOverlay(soft, null)).toBe(true);
  });
});
