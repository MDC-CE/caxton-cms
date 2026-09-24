import { describe, expect, it } from "vitest";
import type { CachedValidationEntry } from "./types";
import {
  PAGE_VALIDATION_MAX_AGE_SECONDS,
  autoRunLoopGuardKey,
  cacheValidationStamp,
  isPageValidationStale,
  staleReason,
} from "./validationFreshness";

function entry(
  partial: Partial<CachedValidationEntry> & { lastRunAt: string },
): CachedValidationEntry {
  return {
    errors: [],
    warnings: [],
    ...partial,
  };
}

const NOW = Date.parse("2026-09-23T12:00:00.000Z");

describe("cacheValidationStamp", () => {
  it("prefers lastFullRunAt over lastRunAt", () => {
    expect(
      cacheValidationStamp(
        entry({
          lastRunAt: "2026-09-20T00:00:00.000Z",
          lastFullRunAt: "2026-09-22T00:00:00.000Z",
        }),
      ),
    ).toBe("2026-09-22T00:00:00.000Z");
  });

  it("falls back to lastRunAt", () => {
    expect(cacheValidationStamp(entry({ lastRunAt: "2026-09-22T00:00:00.000Z" }))).toBe(
      "2026-09-22T00:00:00.000Z",
    );
  });

  it("returns null when no cache", () => {
    expect(cacheValidationStamp(null)).toBeNull();
    expect(cacheValidationStamp(undefined)).toBeNull();
  });
});

describe("staleReason / isPageValidationStale", () => {
  it("missing when no cache", () => {
    expect(staleReason({ cached: null, nowMs: NOW })).toBe("missing");
    expect(isPageValidationStale({ cached: null, nowMs: NOW })).toBe(true);
  });

  it("dirty even when age is fresh", () => {
    expect(
      staleReason({
        cached: entry({ lastRunAt: "2026-09-23T11:00:00.000Z" }),
        dirty: true,
        nowMs: NOW,
      }),
    ).toBe("dirty");
    expect(
      isPageValidationStale({
        cached: entry({ lastRunAt: "2026-09-23T11:00:00.000Z" }),
        dirty: true,
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("fresh within TTL when not dirty", () => {
    expect(
      staleReason({
        cached: entry({ lastRunAt: "2026-09-23T11:00:00.000Z" }),
        dirty: false,
        nowMs: NOW,
      }),
    ).toBeNull();
    expect(
      isPageValidationStale({
        cached: entry({ lastRunAt: "2026-09-23T11:00:00.000Z" }),
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("expired when older than TTL", () => {
    const old = new Date(NOW - (PAGE_VALIDATION_MAX_AGE_SECONDS + 60) * 1000).toISOString();
    expect(
      staleReason({
        cached: entry({ lastRunAt: old }),
        nowMs: NOW,
      }),
    ).toBe("expired");
  });

  it("uses lastFullRunAt for age when present", () => {
    const freshFull = "2026-09-23T11:30:00.000Z";
    const expiredRun = new Date(
      NOW - (PAGE_VALIDATION_MAX_AGE_SECONDS + 3600) * 1000,
    ).toISOString();
    expect(
      staleReason({
        cached: entry({ lastRunAt: expiredRun, lastFullRunAt: freshFull }),
        nowMs: NOW,
      }),
    ).toBeNull();

    const expiredFull = new Date(
      NOW - (PAGE_VALIDATION_MAX_AGE_SECONDS + 60) * 1000,
    ).toISOString();
    expect(
      staleReason({
        cached: entry({ lastRunAt: freshFull, lastFullRunAt: expiredFull }),
        nowMs: NOW,
      }),
    ).toBe("expired");
  });

  it("treats invalid stamp as missing/expired", () => {
    expect(
      staleReason({
        cached: entry({ lastRunAt: "not-a-date" }),
        nowMs: NOW,
      }),
    ).toBe("expired");
  });
});

describe("autoRunLoopGuardKey", () => {
  it("includes url, variant, and stamp", () => {
    expect(autoRunLoopGuardKey("/en/blog/x", "draft", "2026-01-01T00:00:00.000Z")).toBe(
      "/en/blog/x@draft::2026-01-01T00:00:00.000Z",
    );
    expect(autoRunLoopGuardKey("/en/blog/x", null, null)).toBe("/en/blog/x::none");
  });
});
