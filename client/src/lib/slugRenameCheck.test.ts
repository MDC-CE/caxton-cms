import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSlugRenameChecker,
  localSlugCheck,
  mapSlugCheckResponse,
  type SlugRenameCheckParams,
  type SlugRenameCheckResult,
} from "@/lib/slugRenameCheck";

const base: SlugRenameCheckParams = {
  contentType: "landing",
  folderSlug: "4geeks-pricing",
  locale: "en",
  newSlug: "ai-engineering",
  currentSlug: "4geeks-pricing",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("localSlugCheck", () => {
  it("is idle when the slug is empty or unchanged", () => {
    expect(localSlugCheck({ ...base, newSlug: "" })).toEqual({ status: "idle", reason: null });
    expect(localSlugCheck({ ...base, newSlug: "4geeks-pricing" })).toEqual({ status: "idle", reason: null });
  });

  it("rejects bad formats without a request", () => {
    expect(localSlugCheck({ ...base, newSlug: "bad--slug" })?.status).toBe("taken");
  });

  it("defers well-formed slugs to the server", () => {
    expect(localSlugCheck(base)).toBeNull();
  });
});

describe("mapSlugCheckResponse", () => {
  it("maps 200 available", () => {
    expect(mapSlugCheckResponse(200, { available: true }).status).toBe("available");
  });

  it("maps ownership conflicts to an 'Already used by' message", () => {
    const r = mapSlugCheckResponse(409, {
      code: "slug_already_owned_by_other_entry",
      conflictUrl: "/landing/ai-engineering",
      reason: "slug_already_owned_by_other_entry: ...",
    });
    expect(r).toEqual({ status: "taken", reason: "Already used by /landing/ai-engineering" });
  });

  it("maps redirect conflicts to taken with the code prefix stripped", () => {
    const r = mapSlugCheckResponse(409, {
      code: "redirect_conflict",
      reason: 'redirect_conflict: "/landing/x" currently redirects to /landing/y (set in the site redirects file).',
    });
    expect(r.status).toBe("taken");
    expect(r.reason).toMatch(/^"\/landing\/x" currently redirects/);
  });

  it("maps 403 to forbidden", () => {
    expect(mapSlugCheckResponse(403, { error: "Insufficient permissions" }).status).toBe("forbidden");
  });

  it("maps index_warming and other failures to error", () => {
    expect(mapSlugCheckResponse(503, { code: "index_warming" })).toEqual({
      status: "error",
      reason: "Still loading site content, try again in a moment.",
    });
    expect(mapSlugCheckResponse(401, {}).status).toBe("error");
    expect(mapSlugCheckResponse(500, {}).status).toBe("error");
  });
});

describe("createSlugRenameChecker", () => {
  let results: SlugRenameCheckResult[];

  beforeEach(() => {
    vi.useFakeTimers();
    results = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces: only the last slug typed within the window is sent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { available: true }));
    const checker = createSlugRenameChecker({ onResult: (r) => results.push(r), fetchImpl, delayMs: 300 });

    checker.update({ ...base, newSlug: "ai" });
    checker.update({ ...base, newSlug: "ai-eng" });
    checker.update({ ...base, newSlug: "ai-engineering-2" });
    await vi.advanceTimersByTimeAsync(300);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.newSlug).toBe("ai-engineering-2");
    expect(results.at(-1)?.status).toBe("available");
  });

  it("aborts the in-flight request so a stale answer cannot win", async () => {
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      const isFirst = signals.length === 1;
      return new Promise<Response>((resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        setTimeout(
          () => resolve(jsonResponse(isFirst ? 409 : 200, isFirst ? { code: "redirect_conflict", reason: "x" } : { available: true })),
          isFirst ? 1000 : 10,
        );
      });
    });
    const checker = createSlugRenameChecker({
      onResult: (r) => results.push(r),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delayMs: 300,
    });

    checker.update({ ...base, newSlug: "first-slug" });
    await vi.advanceTimersByTimeAsync(300);
    checker.update({ ...base, newSlug: "second-slug" });
    await vi.advanceTimersByTimeAsync(2000);

    expect(signals[0]!.aborted).toBe(true);
    expect(results.some((r) => r.status === "taken")).toBe(false);
    expect(results.at(-1)?.status).toBe("available");
  });

  it("reports error on network failure and retry re-runs the last check", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(jsonResponse(200, { available: true }));
    const checker = createSlugRenameChecker({ onResult: (r) => results.push(r), fetchImpl, delayMs: 300 });

    checker.update(base);
    await vi.advanceTimersByTimeAsync(300);
    expect(results.at(-1)).toEqual({ status: "error", reason: "Couldn't check this slug." });

    checker.retry();
    expect(results.at(-1)?.status).toBe("checking");
    await vi.advanceTimersByTimeAsync(300);
    expect(results.at(-1)?.status).toBe("available");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("short-circuits locally without calling the server", async () => {
    const fetchImpl = vi.fn();
    const checker = createSlugRenameChecker({ onResult: (r) => results.push(r), fetchImpl, delayMs: 300 });
    checker.update({ ...base, newSlug: "Bad Slug" });
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(results.at(-1)?.status).toBe("taken");
  });
});
