import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { privateHtmlAuthMiddleware } from "./private-html-auth";
import { STAFF_SESSION_COOKIE_NAME } from "./staff-session-cookie";

vi.mock("./staff-session-resolve", () => ({
  resolveOwnedStaffSession: vi.fn(async (token: string | null) => {
    if (token === "good-token") {
      return {
        token: "good-token",
        username: "alice",
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      };
    }
    return null;
  }),
}));

function mockReq(partial: Partial<Request> & { path: string; method?: string; url?: string }): Request {
  return {
    method: "GET",
    cookies: {},
    headers: {},
    url: partial.url ?? partial.path,
    ...partial,
  } as Request;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: "" as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(headers: Record<string, string>) {
      Object.assign(this.headers, headers);
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("privateHtmlAuthMiddleware", () => {
  it("passes through non-private paths", async () => {
    const next = vi.fn();
    await privateHtmlAuthMiddleware(mockReq({ path: "/en/about" }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 HTML for anonymous /private", async () => {
    const next = vi.fn();
    const res = mockRes();
    await privateHtmlAuthMiddleware(mockReq({ path: "/private/settings" }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(String(res.body)).toContain("401 Unauthorized");
  });

  it("401 GitHub login link uses absolute return_to for the request host", async () => {
    const next = vi.fn();
    const res = mockRes();
    await privateHtmlAuthMiddleware(
      mockReq({
        path: "/private/settings",
        headers: {
          host: "fl.4geeksacademy.com",
          "x-forwarded-proto": "https",
        },
      } as Partial<Request> & { path: string }),
      res,
      next,
    );
    expect(res.statusCode).toBe(401);
    const html = String(res.body);
    expect(html).toContain(
      encodeURIComponent("https://fl.4geeksacademy.com/private/settings"),
    );
  });

  it("allows embed preview frames without a session", async () => {
    const next = vi.fn();
    await privateHtmlAuthMiddleware(
      mockReq({ path: "/private/component-showcase/hero/preview" }),
      mockRes(),
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows OAuth return with staff_session_code", async () => {
    const next = vi.fn();
    await privateHtmlAuthMiddleware(
      mockReq({
        path: "/private/settings",
        url: "/private/settings?staff_session_code=abc123",
      }),
      mockRes(),
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows a valid staff cookie", async () => {
    const next = vi.fn();
    await privateHtmlAuthMiddleware(
      mockReq({
        path: "/private/diagnostics",
        cookies: { [STAFF_SESSION_COOKIE_NAME]: "good-token" },
      } as Partial<Request> & { path: string }),
      mockRes(),
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects an invalid staff cookie", async () => {
    const next = vi.fn();
    const res = mockRes();
    await privateHtmlAuthMiddleware(
      mockReq({
        path: "/private/diagnostics",
        cookies: { [STAFF_SESSION_COOKIE_NAME]: "bad-token" },
      } as Partial<Request> & { path: string }),
      res,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
