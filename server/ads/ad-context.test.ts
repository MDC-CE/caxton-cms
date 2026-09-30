import { describe, expect, it } from "vitest";
import { mergeAdContext, parseAdContextCookie, serializeAdContext } from "./ad-context";

const NOW = 1_800_000_000_000;

describe("mergeAdContext", () => {
  it("keeps first paid landing and first touch write-once; last paid landing newest wins", () => {
    const first = mergeAdContext(
      null,
      {
        utm: { utm_source: "facebook", utm_medium: "paid_social", email: "x@y.com" },
        first_touch: { utm_source: "facebook" },
        paid_landing: { last: { host: "4geeks.com", path: "/en/a/", at: NOW - 1000, platform: "meta" } },
      },
      NOW,
    );
    expect(first.first_paid?.path).toBe("/en/a");
    expect(first.last_paid?.path).toBe("/en/a");
    expect((first.utm as Record<string, unknown>).email).toBeUndefined();

    const second = mergeAdContext(
      first,
      {
        utm: { utm_source: "google", utm_medium: "cpc" },
        first_touch: { utm_source: "google" },
        paid_landing: { last: { host: "4geeks.com", path: "/es/b", at: NOW - 10, platform: "google" } },
      },
      NOW,
    );
    expect(second.first_paid?.path).toBe("/en/a");
    expect(second.last_paid?.path).toBe("/es/b");
    expect(second.first_touch).toEqual({ utm_source: "facebook" });
    expect(second.utm.utm_source).toBe("google");
  });

  it("drops landings outside the 30-day lookback or in the future", () => {
    const ctx = mergeAdContext(
      null,
      { paid_landing: { last: { host: "h.com", path: "/", at: NOW - 31 * 86_400_000 } } },
      NOW,
    );
    expect(ctx.last_paid).toBeUndefined();
    const future = mergeAdContext(null, { paid_landing: { last: { host: "h.com", path: "/", at: NOW + 86_400_000 } } }, NOW);
    expect(future.last_paid).toBeUndefined();
  });
});

describe("cookie round trip", () => {
  it("serializes and parses", () => {
    const ctx = mergeAdContext(null, { utm: { gclid: "G1" } }, NOW);
    const raw = serializeAdContext(ctx);
    expect(raw).toBeTruthy();
    expect(parseAdContextCookie(raw)?.utm.gclid).toBe("G1");
    expect(parseAdContextCookie("garbage")).toBeNull();
  });
});
