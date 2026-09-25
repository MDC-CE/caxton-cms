import { describe, it, expect } from "vitest";
import {
  buildErrorLogContext,
  ERROR_LOG_CONTEXT_MAX_BYTES,
  ERROR_LOG_CONTEXT_MAX_STRING,
  REDACTED,
} from "./error-log-context";

function parse(json: string | null): Record<string, unknown> {
  expect(json).not.toBeNull();
  return JSON.parse(json as string);
}

describe("buildErrorLogContext", () => {
  it("returns null when only standard pino fields are present", () => {
    expect(
      buildErrorLogContext({
        level: 50,
        time: 1,
        pid: 2,
        hostname: "h",
        module: "m",
        msg: "boom",
        err: { type: "Error", message: "boom", stack: "Error: boom" },
      }),
    ).toBeNull();
  });

  it("drops standard keys and keeps extra fields", () => {
    const ctx = parse(
      buildErrorLogContext({
        level: 50,
        time: 1,
        module: "unknown",
        msg: "unhandled route error",
        method: "POST",
        url: "/api/content/edit",
        status: 413,
      }),
    );
    expect(ctx).toEqual({ method: "POST", url: "/api/content/edit", status: 413 });
  });

  it("keeps non-standard serialized error props as err_props", () => {
    const ctx = parse(
      buildErrorLogContext({
        msg: "unhandled route error",
        err: {
          type: "PayloadTooLargeError",
          message: "request entity too large",
          stack: "PayloadTooLargeError: …",
          expected: 250_000,
          limit: 102_400,
        },
      }),
    );
    expect(ctx.err_props).toEqual({ expected: 250_000, limit: 102_400 });
  });

  it("keeps a string err as context.error", () => {
    const ctx = parse(
      buildErrorLogContext({
        msg: "[entry-preview-capture-queue] failed",
        key: "site:blog:post:en:1200",
        err: "Entry not found: blog/post@en",
      }),
    );
    expect(ctx.error).toBe("Entry not found: blog/post@en");
    expect(ctx.key).toBe("site:blog:post:en:1200");
  });

  it("redacts sensitive keys at any nesting level", () => {
    const ctx = parse(
      buildErrorLogContext({
        msg: "x",
        email: "a@b.com",
        lead: { phone: "555", name: "Ana", meta: { authToken: "abc" } },
        headers: { Authorization: "Bearer xyz", cookie: "sid=1", accept: "json" },
        requestBody: { anything: true },
      }),
    );
    expect(ctx.email).toBe(REDACTED);
    expect(ctx.requestBody).toBe(REDACTED);
    expect(ctx.lead).toEqual({ phone: REDACTED, name: "Ana", meta: { authToken: REDACTED } });
    expect(ctx.headers).toEqual({ Authorization: REDACTED, cookie: REDACTED, accept: "json" });
  });

  it("masks bearer tokens inside string values", () => {
    const ctx = parse(buildErrorLogContext({ msg: "x", detail: "sent Bearer abc.def-123 upstream" }));
    expect(ctx.detail).toBe(`sent Bearer ${REDACTED} upstream`);
  });

  it("truncates long strings", () => {
    const ctx = parse(buildErrorLogContext({ msg: "x", detail: "a".repeat(2000) }));
    const detail = ctx.detail as string;
    expect(detail.startsWith("a".repeat(ERROR_LOG_CONTEXT_MAX_STRING))).toBe(true);
    expect(detail).toContain("+1500 chars");
  });

  it("caps total size and marks _truncated", () => {
    const line: Record<string, unknown> = { msg: "x", url: "/api/first" };
    for (let i = 0; i < 40; i++) line[`field${i}`] = "b".repeat(400);
    const json = buildErrorLogContext(line) as string;
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(ERROR_LOG_CONTEXT_MAX_BYTES);
    const ctx = JSON.parse(json);
    expect(ctx._truncated).toBe(true);
    expect(ctx.url).toBe("/api/first");
  });

  it("limits nesting depth", () => {
    const ctx = parse(
      buildErrorLogContext({ msg: "x", a: { b: { c: { d: { e: 1 } } } } }),
    );
    expect(ctx.a).toEqual({ b: { c: { d: "[object]" } } });
  });
});
