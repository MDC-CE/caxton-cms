/**
 * Gate /private document requests: anonymous visitors get HTTP 401.
 * Embed/demo frames and OAuth return (?staff_session_code=) stay open.
 */

import type { NextFunction, Request, Response } from "express";
import { isPrivateHtmlAuthBypass } from "@shared/private-page-access";
import { extractToken } from "./routes/_helpers";
import { extractStaffSessionCookieToken } from "./staff-session-cookie";
import { resolveOwnedStaffSession } from "./staff-session-resolve";

function cleanPath(req: Request): string {
  return (req.path || "/").split("?")[0].split("#")[0];
}

function wantsJson(req: Request): boolean {
  const accept = req.headers.accept || "";
  return accept.includes("application/json") && !accept.includes("text/html");
}

function requestPublicOrigin(req: Request): string | null {
  const hostHeader =
    (typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"].split(",")[0]?.trim()
      : null) ||
    (typeof req.headers.host === "string" ? req.headers.host : null);
  if (!hostHeader) return null;
  const protoHeader =
    typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"].split(",")[0]?.trim()
      : null;
  const proto = protoHeader || req.protocol || "https";
  return `${proto}://${hostHeader}`;
}

function unauthorizedHtml(returnTo: string, origin: string | null): string {
  const path =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/private";
  // Absolute return so GitHub OAuth (callback on SITE_URL) lands back on this host.
  const safeReturn = origin ? `${origin}${path}` : path;
  const loginHref = `/api/staff/oauth/github/start?return_to=${encodeURIComponent(safeReturn)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>401 Unauthorized</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #fafafa; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    main { max-width: 28rem; padding: 1.5rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
    p { color: #a3a3a3; line-height: 1.5; margin: 0 0 1rem; }
    a { color: #93c5fd; }
  </style>
</head>
<body>
  <main>
    <h1>401 Unauthorized</h1>
    <p>Staff sign-in is required to open this page.</p>
    <p><a href="${loginHref}">Sign in with GitHub</a></p>
  </main>
  <script>
(function () {
  try {
    var token = localStorage.getItem("debug_token");
    if (!token) return;
    fetch("/api/debug/check-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token: token })
    }).then(function (res) { return res.json(); }).then(function (data) {
      if (data && data.valid) location.reload();
    }).catch(function () {});
  } catch (e) {}
})();
  </script>
</body>
</html>`;
}

/**
 * Express middleware: block unauthenticated GET/HEAD under /private.
 */
export async function privateHtmlAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const path = cleanPath(req);
  if (path !== "/private" && !path.startsWith("/private/")) {
    next();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  const search = typeof req.url === "string" && req.url.includes("?")
    ? req.url.slice(req.url.indexOf("?"))
    : "";
  if (isPrivateHtmlAuthBypass(path, search)) {
    next();
    return;
  }

  const headerToken = extractToken(req);
  const cookieToken = extractStaffSessionCookieToken(req);
  const token = headerToken || cookieToken;
  if (!token) {
    sendUnauthorized(req, res, path + search);
    return;
  }

  try {
    const session = await resolveOwnedStaffSession(token);
    if (!session) {
      sendUnauthorized(req, res, path + search);
      return;
    }
    next();
  } catch {
    sendUnauthorized(req, res, path + search);
  }
}

function sendUnauthorized(req: Request, res: Response, returnTo: string): void {
  if (wantsJson(req)) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  res
    .status(401)
    .set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
    .send(unauthorizedHtml(returnTo, requestPublicOrigin(req)));
}
