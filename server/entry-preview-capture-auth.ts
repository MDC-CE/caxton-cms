/**
 * HMAC-signed capture URLs for Cloudflare Browser Run to open EntryPreviewFrame
 * without a staff session cookie.
 */

import * as crypto from "crypto";
import { getPublicSiteUrl, resolveEntryPreviewCaptureSecret } from "./cloudflare-browser";

const DEFAULT_TTL_SEC = 10 * 60;

function captureSecret(): string {
  return resolveEntryPreviewCaptureSecret().value;
}

export function stripOgCacheBust(url: string): string {
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const u = new URL(url);
      u.searchParams.delete("t");
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return url.replace(/([?&])t=\d+(&|$)/, (_, sep, end) => (end === "&" ? sep : "")).replace(/\?$/, "");
}

function signPayload(payload: string): string {
  const secret = captureSecret();
  if (!secret) {
    throw new Error(
      "ENTRY_PREVIEW_CAPTURE_SECRET or SESSION_SECRET required for signed capture URLs (set on the host environment)",
    );
  }
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export type CaptureTokenParts = {
  contentType: string;
  slug: string;
  locale: string;
  exp: number;
};

export function signEntryPreviewCaptureToken(parts: CaptureTokenParts): string {
  const payload = `${parts.contentType}|${parts.slug}|${parts.locale}|${parts.exp}`;
  return signPayload(payload);
}

export function verifyEntryPreviewCaptureToken(
  parts: CaptureTokenParts & { token: string },
): { ok: true } | { ok: false; error: string } {
  if (!captureSecret()) {
    return { ok: false, error: "Capture signing secret not configured" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(parts.exp) || parts.exp < now) {
    return { ok: false, error: "Capture token expired" };
  }
  const expected = signEntryPreviewCaptureToken({
    contentType: parts.contentType,
    slug: parts.slug,
    locale: parts.locale,
    exp: parts.exp,
  });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parts.token, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Invalid capture token" };
  }
  return { ok: true };
}

// ─── Full-page preview (render review) ─────────────────────────────────────

export type PagePreviewSource =
  | { source: "entry"; contentType: string; slug: string; locale: string; variant?: string }
  | { source: "demo"; hash: string };

export type PagePreviewViewport = "desktop" | "mobile";

function pagePreviewPayload(p: PagePreviewSource, viewport: PagePreviewViewport, exp: number): string {
  const key =
    p.source === "entry"
      ? `entry|${p.contentType}|${p.slug}|${p.locale}|${p.variant ?? ""}`
      : `demo|${p.hash}`;
  return `page|${key}|${viewport}|${exp}`;
}

export function signPagePreviewToken(p: PagePreviewSource, viewport: PagePreviewViewport, exp: number): string {
  return signPayload(pagePreviewPayload(p, viewport, exp));
}

export function verifyPagePreviewToken(
  p: PagePreviewSource,
  viewport: PagePreviewViewport,
  exp: number,
  token: string,
): { ok: true } | { ok: false; error: string } {
  if (!captureSecret()) return { ok: false, error: "Capture signing secret not configured" };
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Capture token expired" };
  }
  const a = Buffer.from(signPagePreviewToken(p, viewport, exp), "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Invalid capture token" };
  }
  return { ok: true };
}

/** Query string for /private/page-preview (no host). */
export function pagePreviewQuery(p: PagePreviewSource, extra?: Record<string, string>): URLSearchParams {
  const qs = new URLSearchParams(
    p.source === "entry"
      ? { source: "entry", content_type: p.contentType, slug: p.slug, locale: p.locale, ...(p.variant ? { variant: p.variant } : {}) }
      : { source: "demo", hash: p.hash },
  );
  for (const [k, v] of Object.entries(extra ?? {})) qs.set(k, v);
  return qs;
}

/** Absolute signed URL Cloudflare opens to capture + measure a full page. */
export function buildSignedPagePreviewUrl(
  p: PagePreviewSource,
  viewport: PagePreviewViewport,
  opts?: { ttlSec?: number; theme?: "dark" | "light" },
): string {
  const base = getPublicSiteUrl();
  if (!base) throw new Error("SITE_URL is required to build capture frame URLs");
  const exp = Math.floor(Date.now() / 1000) + (opts?.ttlSec ?? DEFAULT_TTL_SEC);
  const qs = pagePreviewQuery(p, {
    viewport,
    capture: "1",
    capture_token: signPagePreviewToken(p, viewport, exp),
    exp: String(exp),
    _: String(Date.now()),
    ...(opts?.theme ? { theme: opts.theme } : {}),
  });
  return `${base}/private/page-preview?${qs}`;
}

/**
 * Absolute URL to the SPA frame with capture=1 and HMAC token.
 */
export function buildSignedEntryPreviewFrameUrl(opts: {
  contentType: string;
  slug: string;
  locale: string;
  theme?: "dark" | "light";
  ttlSec?: number;
}): string {
  const base = getPublicSiteUrl();
  if (!base) throw new Error("SITE_URL is required to build capture frame URLs");

  const exp = Math.floor(Date.now() / 1000) + (opts.ttlSec ?? DEFAULT_TTL_SEC);
  const token = signEntryPreviewCaptureToken({
    contentType: opts.contentType,
    slug: opts.slug,
    locale: opts.locale,
    exp,
  });

  const qs = new URLSearchParams({
    locale: opts.locale,
    capture: "1",
    capture_token: token,
    exp: String(exp),
    _: String(Date.now()),
  });
  if (opts.theme === "light" || opts.theme === "dark") {
    qs.set("theme", opts.theme);
  }

  return (
    `${base}/private/entry-preview-frame/` +
    `${encodeURIComponent(opts.contentType)}/${encodeURIComponent(opts.slug)}?${qs}`
  );
}
