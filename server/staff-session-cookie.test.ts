import { describe, expect, it } from "vitest";
import type { Response } from "express";
import {
  STAFF_SESSION_COOKIE_NAME,
  STAFF_SESSION_COOKIE_PATH,
  clearStaffSessionCookie,
  mintStaffSessionCookie,
} from "./staff-session-cookie";

function mockRes() {
  const cookies: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
  const cleared: Array<{ name: string; opts: Record<string, unknown> }> = [];
  const res = {
    cookie(name: string, value: string, opts: Record<string, unknown>) {
      cookies.push({ name, value, opts });
    },
    clearCookie(name: string, opts: Record<string, unknown>) {
      cleared.push({ name, opts });
    },
    _cookies: cookies,
    _cleared: cleared,
  };
  return res as unknown as Response & {
    _cookies: typeof cookies;
    _cleared: typeof cleared;
  };
}

describe("staff-session-cookie", () => {
  it("mints an HttpOnly cookie scoped to /private", () => {
    const res = mockRes();
    mintStaffSessionCookie(res, "tok-1", { expiresAt: Date.now() + 60_000 });
    expect(res._cookies).toHaveLength(1);
    expect(res._cookies[0]).toMatchObject({
      name: STAFF_SESSION_COOKIE_NAME,
      value: "tok-1",
      opts: expect.objectContaining({
        httpOnly: true,
        path: STAFF_SESSION_COOKIE_PATH,
        sameSite: "lax",
      }),
    });
  });

  it("clears with the same path", () => {
    const res = mockRes();
    clearStaffSessionCookie(res);
    expect(res._cleared[0]).toMatchObject({
      name: STAFF_SESSION_COOKIE_NAME,
      opts: expect.objectContaining({ path: STAFF_SESSION_COOKIE_PATH }),
    });
  });

  it("clears instead of minting when already expired", () => {
    const res = mockRes();
    mintStaffSessionCookie(res, "tok-1", { expiresAt: Date.now() - 1 });
    expect(res._cookies).toHaveLength(0);
    expect(res._cleared).toHaveLength(1);
  });
});
