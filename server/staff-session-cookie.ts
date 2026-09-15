/**
 * HttpOnly cookie so /private document navigations can authenticate.
 * Staff tokens also live in localStorage for Authorization on APIs; this cookie
 * is only for HTML GETs (browsers do not send Authorization on typed URLs).
 */

import type { Request, Response } from "express";
import { STAFF_SESSION_TTL_MS } from "./staff-session";

export const STAFF_SESSION_COOKIE_NAME = "4g_staff";

/** Narrow path so the token is only sent on staff HTML routes. */
export const STAFF_SESSION_COOKIE_PATH = "/private";

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: STAFF_SESSION_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

export function mintStaffSessionCookie(
  res: Response,
  token: string,
  opts?: { expiresAt?: number },
): void {
  const trimmed = token.trim();
  if (!trimmed) return;
  const maxAgeMs =
    typeof opts?.expiresAt === "number" && Number.isFinite(opts.expiresAt)
      ? Math.max(0, opts.expiresAt - Date.now())
      : STAFF_SESSION_TTL_MS;
  if (maxAgeMs <= 0) {
    clearStaffSessionCookie(res);
    return;
  }
  res.cookie(STAFF_SESSION_COOKIE_NAME, trimmed, cookieOptions(maxAgeMs));
}

export function clearStaffSessionCookie(res: Response): void {
  res.clearCookie(STAFF_SESSION_COOKIE_NAME, {
    path: STAFF_SESSION_COOKIE_PATH,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

/** Token from the staff HTML cookie only (not Authorization). */
export function extractStaffSessionCookieToken(req: Request): string | null {
  const raw = req.cookies?.[STAFF_SESSION_COOKIE_NAME];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}
