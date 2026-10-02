/**
 * Tests for Cloudflare screenshot pacing (shared 429 cooldown) and html|url body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

vi.mock("./settings", () => ({
  DEFAULT_ENTRY_PREVIEW_SETTINGS: {
    min_interval_ms: 0,
    max_concurrency: 1,
    max_retries: 3,
  },
  getEntryPreviewSettings: () => ({
    min_interval_ms: 0,
    max_concurrency: 1,
    max_retries: 3,
  }),
}));

vi.mock("sharp", () => ({
  default: (buf: Buffer) => ({
    webp: () => ({
      toBuffer: async () => Buffer.from(`webp:${buf.length}`),
    }),
  }),
}));

import {
  __resetScreenshotThrottleForTests,
  acquireScreenshotSlot,
  captureScreenshotToWebp,
  getRateLimitCoolUntilMs,
} from "./cloudflare-browser";

function pngish(): ArrayBuffer {
  // >100 bytes so empty-png guard passes
  return new Uint8Array(120).fill(1).buffer;
}

describe("cloudflare-browser cooldown + html", () => {
  beforeEach(() => {
    __resetScreenshotThrottleForTests();
    fetchMock.mockReset();
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    process.env.SITE_URL = "https://example.4geeks.com";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("extends shared cooldown on 429 then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(pngish(), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );

    const promise = captureScreenshotToWebp({
      html: "<html><body>hi</body></html>",
      waitForSelector: "body",
      waitForTimeoutMs: 10,
    });

    // First attempt gets 429 → cooldown 2s; second acquire waits
    await vi.advanceTimersByTimeAsync(50);
    expect(getRateLimitCoolUntilMs()).toBeGreaterThan(Date.now());
    await vi.advanceTimersByTimeAsync(2500);
    const result = await promise;
    expect(result.webp.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(firstBody.html).toContain("<html>");
    expect(firstBody.url).toBeUndefined();
  });

  it("sends html body (not url) when html option set", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(pngish(), { status: 200, headers: { "Content-Type": "image/png" } }),
    );
    await captureScreenshotToWebp({
      html: "<!DOCTYPE html><html><body data-x>card</body></html>",
      waitForSelector: "[data-screenshot-root]",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.html).toContain("card");
    expect(body.url).toBeUndefined();
    expect(body.waitForSelector.selector).toBe("[data-screenshot-root]");
  });

  it("concurrent acquireScreenshotSlot waits on shared gate after cooldown", async () => {
    vi.useFakeTimers();
    // Manually set cooldown via a 429 path
    fetchMock.mockResolvedValueOnce(
      new Response("no", { status: 429, headers: { "Retry-After": "5" } }),
    );
    // Will fail after max retries if we keep 429 — use max by exhausting? Better: call extend via one failed then reset retries.
    // Direct: one capture that 429s once then we check second slot waits.
    fetchMock.mockResolvedValueOnce(
      new Response(pngish(), { status: 200 }),
    );

    const p1 = captureScreenshotToWebp({ html: "<html/>", waitForSelector: null });
    await vi.advanceTimersByTimeAsync(10);
    const cool = getRateLimitCoolUntilMs();
    expect(cool).toBeGreaterThan(Date.now());

    const order: string[] = [];
    const slotA = acquireScreenshotSlot().then(() => {
      order.push("a");
    });
    const slotB = acquireScreenshotSlot().then(() => {
      order.push("b");
    });

    await vi.advanceTimersByTimeAsync(6000);
    await Promise.all([p1, slotA, slotB]);
    expect(order).toEqual(["a", "b"]);
  });
});
