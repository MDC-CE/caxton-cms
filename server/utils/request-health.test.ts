import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const warn = vi.fn();
const info = vi.fn();

vi.mock("../logger", () => ({
  child: () => ({ warn, info }),
}));

describe("logSlowHtmlIfNeeded", () => {
  const prev = process.env.SLOW_HTML_MS;

  beforeEach(() => {
    process.env.SLOW_HTML_MS = "500";
    warn.mockClear();
    info.mockClear();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.SLOW_HTML_MS;
    else process.env.SLOW_HTML_MS = prev;
  });

  it("does not log under threshold", async () => {
    const { logSlowHtmlIfNeeded } = await import("./request-health");
    logSlowHtmlIfNeeded({
      url: "/en/home?x=1",
      ms: 200,
      cache: "HIT",
      outcome: "cache_hit",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns on slow HTML and strips querystring", async () => {
    const { logSlowHtmlIfNeeded } = await import("./request-health");
    logSlowHtmlIfNeeded({
      url: "/landing/foo?fbclid=abc",
      ms: 4200,
      status: 200,
      cache: "MISS",
      outcome: "ssr_ok",
      appHtmlLength: 1000,
    });

    expect(warn).toHaveBeenCalled();
    const [fields, msg] = warn.mock.calls[0];
    expect(msg).toBe("slow HTML response");
    expect(fields.url).toBe("/landing/foo");
    expect(fields.ms).toBe(4200);
    expect(fields.cache).toBe("MISS");
    expect(fields.outcome).toBe("ssr_ok");
  });
});
