import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASK_COUNTRIES,
  DEFAULT_CONSENT_WINDOW,
  consentMaxAgeDays,
  isRejectDurationRisky,
  parseConsentCookie,
  parseConsentWindowSettings,
  resolveConsentMode,
  resolveCookieBannerCopy,
  serializeConsentCookie,
} from "./consent";

describe("parseConsentWindowSettings", () => {
  it("returns defaults for missing or invalid input", () => {
    expect(parseConsentWindowSettings(undefined)).toEqual(DEFAULT_CONSENT_WINDOW);
    expect(parseConsentWindowSettings("nope")).toEqual(DEFAULT_CONSENT_WINDOW);
  });

  it("normalizes a custom country list and clamps durations", () => {
    const parsed = parseConsentWindowSettings({
      ask_countries: ["de", "FR", "fr", "bad", 3],
      unknown_country_mode: "ask",
      accept_days: 99999,
      reject_days: 0,
    });
    expect(parsed.ask_countries).toEqual(["DE", "FR"]);
    expect(parsed.unknown_country_mode).toBe("ask");
    expect(parsed.accept_days).toBe(3650);
    expect(parsed.reject_days).toBe(1);
  });
});

describe("resolveConsentMode", () => {
  it("asks EU/UK visitors and notifies everyone else by default", () => {
    expect(resolveConsentMode("ES", DEFAULT_CONSENT_WINDOW)).toBe("ask");
    expect(resolveConsentMode("gb", DEFAULT_CONSENT_WINDOW)).toBe("ask");
    expect(resolveConsentMode("US", DEFAULT_CONSENT_WINDOW)).toBe("notice");
    expect(DEFAULT_ASK_COUNTRIES).toContain("CH");
  });

  it("uses the unknown-country mode when the country is missing", () => {
    expect(resolveConsentMode(null, DEFAULT_CONSENT_WINDOW)).toBe("notice");
    expect(resolveConsentMode(undefined, { ...DEFAULT_CONSENT_WINDOW, unknown_country_mode: "ask" })).toBe("ask");
  });

  it("honors a custom list", () => {
    const settings = { ...DEFAULT_CONSENT_WINDOW, ask_countries: ["US"] };
    expect(resolveConsentMode("US", settings)).toBe("ask");
    expect(resolveConsentMode("ES", settings)).toBe("notice");
  });
});

describe("consent cookie", () => {
  it("round-trips", () => {
    const raw = serializeConsentCookie({ decision: "granted_explicit", mode: "ask", at: 1700000000.9 });
    expect(raw).toBe("v1.granted_explicit.ask.1700000000");
    expect(parseConsentCookie(raw)).toEqual({ decision: "granted_explicit", mode: "ask", at: 1700000000 });
    expect(parseConsentCookie(encodeURIComponent(raw))).not.toBeNull();
  });

  it("rejects malformed values", () => {
    expect(parseConsentCookie("v2.denied.ask.1")).toBeNull();
    expect(parseConsentCookie("v1.maybe.ask.1")).toBeNull();
    expect(parseConsentCookie("v1.denied.sometimes.1")).toBeNull();
    expect(parseConsentCookie("")).toBeNull();
  });
});

describe("durations", () => {
  it("uses accept days for grants and reject days for denials", () => {
    expect(consentMaxAgeDays("granted_implied", DEFAULT_CONSENT_WINDOW)).toBe(365);
    expect(consentMaxAgeDays("denied", DEFAULT_CONSENT_WINDOW)).toBe(5);
  });

  it("flags reject durations under six months", () => {
    expect(isRejectDurationRisky(5)).toBe(true);
    expect(isRejectDurationRisky(180)).toBe(false);
  });
});

describe("resolveCookieBannerCopy", () => {
  it("prefers stored copy and falls back to built-in defaults", () => {
    const copy = resolveCookieBannerCopy({ cookie_banner_accept: { es: "Vale" } }, "es");
    expect(copy.cookie_banner_accept).toBe("Vale");
    expect(copy.cookie_banner_reject).toBe("Rechazar");
    expect(resolveCookieBannerCopy(undefined, "fr").cookie_banner_ok).toBe("OK");
  });
});
