/**
 * Cloudflare Browser Run (Browser Rendering) REST client — screenshot Quick Action.
 * Used for entry-preview / OG captures.
 *
 * Credentials: environment variables only (never settings.yml).
 * Rate pacing: settings.yml → entry_preview (SEO/GEO → OG Image tab).
 *
 * Workers Free REST is ~6 req/min (≈1 / 10s). We pace starts process-wide,
 * share a 429 cooldown across all callers, and retry using Retry-After
 * (or exponential backoff).
 */

import sharp from "sharp";
import { child } from "./logger";
import {
  DEFAULT_ENTRY_PREVIEW_SETTINGS,
  getEntryPreviewSettings,
} from "./settings";

const log = child({ module: "cloudflare-browser" });

const RETRY_BACKOFF_BASE_MS = 2_000;
const RETRY_BACKOFF_MAX_MS = 60_000;

export type CloudflareGotoWaitUntil =
  | "load"
  | "domcontentloaded"
  | "networkidle0"
  | "networkidle2";

export type CloudflareScreenshotOptions = {
  /** Live page URL (mutually exclusive with `html`). */
  url?: string;
  /** Full HTML document body for CF html mode (mutually exclusive with `url`). */
  html?: string;
  width?: number;
  height?: number;
  /**
   * Selector to wait for. Pass `null` to omit waitForSelector.
   * Default for URL captures: data-capture-ready on the staff frame.
   * HTML captures should pass an explicit selector (or null) — no frame ready attr.
   */
  waitForSelector?: string | null;
  /** Puppeteer-style navigation wait; default networkidle0 for URL captures. */
  waitUntil?: CloudflareGotoWaitUntil;
  /** Extra settle time after navigation / selector (ms). */
  waitForTimeoutMs?: number;
  timeoutMs?: number;
  /** Site content root — used to load entry_preview rate settings. */
  contentRoot?: string;
};

export type CloudflareScreenshotResult = {
  webp: Buffer;
  browserMsUsed: number | null;
  pngBytes: number;
};

export type CredentialSource = "env" | "none";

export function resolveCloudflareAccountId(): {
  value: string;
  source: CredentialSource;
} {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: "", source: "none" };
}

export function resolveCloudflareApiToken(): {
  value: string;
  source: CredentialSource;
} {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: "", source: "none" };
}

export function resolveEntryPreviewCaptureSecret(): {
  value: string;
  source: CredentialSource | "session";
} {
  const fromEnv = process.env.ENTRY_PREVIEW_CAPTURE_SECRET?.trim() || "";
  if (fromEnv) return { value: fromEnv, source: "env" };
  const session = process.env.SESSION_SECRET?.trim() || "";
  if (session) return { value: session, source: "session" };
  return { value: "", source: "none" };
}

export function isCloudflareBrowserConfigured(): boolean {
  const accountId = resolveCloudflareAccountId().value;
  const token = resolveCloudflareApiToken().value;
  return !!(accountId && token);
}

export function getPublicSiteUrl(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** True when SITE_URL looks reachable from Cloudflare's network (not localhost). */
export function isSiteUrlPubliclyReachable(): boolean {
  const base = getPublicSiteUrl();
  if (!base) return false;
  try {
    const u = new URL(base);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (host.endsWith(".local")) return false;
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function cloudflareBrowserConfigError(_contentRoot?: string): string | null {
  if (!isCloudflareBrowserConfigured()) {
    return "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for entry-preview capture (set on the host environment)";
  }
  if (!getPublicSiteUrl()) {
    return "SITE_URL is required for Cloudflare entry-preview capture";
  }
  if (!isSiteUrlPubliclyReachable()) {
    return "SITE_URL must be publicly reachable by Cloudflare (not localhost). Use a tunnel or staging URL.";
  }
  return null;
}

/** Min ms between screenshot API starts (process-wide). From settings.yml entry_preview. */
export function getCloudflareScreenshotMinIntervalMs(contentRoot?: string): number {
  try {
    return getEntryPreviewSettings(contentRoot).min_interval_ms;
  } catch {
    return DEFAULT_ENTRY_PREVIEW_SETTINGS.min_interval_ms;
  }
}

export function getCloudflareScreenshotMaxRetries(contentRoot?: string): number {
  try {
    return getEntryPreviewSettings(contentRoot).max_retries;
  } catch {
    return DEFAULT_ENTRY_PREVIEW_SETTINGS.max_retries;
  }
}

let lastScreenshotStartMs = 0;
let screenshotSlotChain: Promise<void> = Promise.resolve();
/** Process-wide: do not start a new /screenshot until this timestamp (429 cooldown). */
let rateLimitCoolUntilMs = 0;

/** Test helper — clear pacing state between cases. */
export function __resetScreenshotThrottleForTests(): void {
  lastScreenshotStartMs = 0;
  screenshotSlotChain = Promise.resolve();
  rateLimitCoolUntilMs = 0;
}

export function getRateLimitCoolUntilMs(): number {
  return rateLimitCoolUntilMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extendRateLimitCooldown(retryAfterMs: number): void {
  const until = Date.now() + Math.max(0, retryAfterMs);
  if (until > rateLimitCoolUntilMs) {
    rateLimitCoolUntilMs = until;
    log.warn(
      { coolUntilMs: rateLimitCoolUntilMs, retryAfterMs },
      "[cloudflare-browser] rate-limit cooldown extended",
    );
  }
}

/**
 * Serialize screenshot starts and enforce min interval + shared 429 cooldown
 * so queue jobs and throwaway test screenshots share one account-wide budget.
 */
export async function acquireScreenshotSlot(contentRoot?: string): Promise<void> {
  const run = async () => {
    const minInterval = getCloudflareScreenshotMinIntervalMs(contentRoot);
    const intervalWait = Math.max(0, minInterval - (Date.now() - lastScreenshotStartMs));
    const coolWait = Math.max(0, rateLimitCoolUntilMs - Date.now());
    const wait = Math.max(intervalWait, coolWait);
    if (wait > 0) {
      log.info(
        {
          waitMs: wait,
          minIntervalMs: minInterval,
          coolWaitMs: coolWait,
          rateLimitCoolUntilMs,
        },
        "[cloudflare-browser] throttling screenshot start",
      );
      await sleep(wait);
    }
    lastScreenshotStartMs = Date.now();
  };
  const next = screenshotSlotChain.then(run, run);
  screenshotSlotChain = next.catch(() => {});
  await next;
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw) return null;
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(RETRY_BACKOFF_MAX_MS, asSeconds * 1000);
  }
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.min(RETRY_BACKOFF_MAX_MS, Math.max(0, asDate - Date.now()));
  }
  return null;
}

function backoffDelayMs(attempt: number): number {
  const delay = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
  return Math.min(RETRY_BACKOFF_MAX_MS, delay);
}

/**
 * Capture via Cloudflare Browser Run /screenshot and return WebP bytes.
 * Accepts either `html` (document body) or `url` (live page).
 * Paces requests process-wide and retries on HTTP 429 (rate limit).
 */
export async function captureScreenshotToWebp(
  opts: CloudflareScreenshotOptions,
): Promise<CloudflareScreenshotResult> {
  const configErr = cloudflareBrowserConfigError(opts.contentRoot);
  if (configErr) throw new Error(configErr);

  const html = typeof opts.html === "string" ? opts.html.trim() : "";
  const url = typeof opts.url === "string" ? opts.url.trim() : "";
  if (!html && !url) {
    throw new Error("captureScreenshotToWebp requires html or url");
  }
  if (html && url) {
    throw new Error("captureScreenshotToWebp accepts html or url, not both");
  }

  const accountId = resolveCloudflareAccountId().value;
  const token = resolveCloudflareApiToken().value;
  const width = opts.width ?? 1200;
  const height = opts.height ?? 630;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const waitUntil = opts.waitUntil ?? (html ? "load" : "networkidle0");
  const maxRetries = Math.max(1, getCloudflareScreenshotMaxRetries(opts.contentRoot));

  // URL path default: staff frame ready attr. HTML path must pass explicitly.
  let waitForSelector: string | null;
  if (opts.waitForSelector === null) {
    waitForSelector = null;
  } else if (typeof opts.waitForSelector === "string") {
    waitForSelector = opts.waitForSelector.trim() || null;
  } else if (html) {
    waitForSelector = "[data-screenshot-root]";
  } else {
    waitForSelector = "[data-screenshot-root][data-capture-ready='1']";
  }

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}` +
    `/browser-rendering/screenshot?cacheTTL=0`;

  const body: Record<string, unknown> = {
    viewport: {
      width,
      height,
      deviceScaleFactor: 1,
    },
    screenshotOptions: {
      type: "png",
      clip: { x: 0, y: 0, width, height },
      omitBackground: false,
    },
  };
  if (html) {
    body.html = html;
  } else {
    body.url = url;
    body.gotoOptions = {
      waitUntil,
      timeout: timeoutMs,
    };
  }
  if (waitForSelector) {
    body.waitForSelector = {
      selector: waitForSelector,
      visible: true,
      timeout: timeoutMs,
    };
  }
  if (opts.waitForTimeoutMs != null && opts.waitForTimeoutMs > 0) {
    body.waitForTimeout = opts.waitForTimeoutMs;
  }

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await acquireScreenshotSlot(opts.contentRoot);

    const res = await fetch(endpoint, requestInit);
    const browserMsHeader = res.headers.get("X-Browser-Ms-Used");
    const browserMsUsed = browserMsHeader ? Number(browserMsHeader) : null;

    if (res.status === 429) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      const retryAfterMs = parseRetryAfterMs(res) ?? backoffDelayMs(attempt);
      extendRateLimitCooldown(retryAfterMs);
      lastError = new Error(
        `Cloudflare screenshot failed (429)${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
      if (attempt >= maxRetries) {
        log.error(
          { status: 429, detail: detail.slice(0, 500), attempt, maxRetries, browserMsUsed },
          "[cloudflare-browser] screenshot rate limited, giving up",
        );
        throw lastError;
      }
      log.warn(
        {
          status: 429,
          detail: detail.slice(0, 500),
          attempt,
          maxRetries,
          retryAfterMs,
          browserMsUsed,
        },
        "[cloudflare-browser] screenshot rate limited, retrying",
      );
      // Shared cooldown is honored on the next acquireScreenshotSlot — no extra sleep.
      continue;
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      log.error(
        {
          status: res.status,
          detail: detail.slice(0, 500),
          browserMsUsed,
          attempt,
          mode: html ? "html" : "url",
        },
        "[cloudflare-browser] screenshot failed",
      );
      throw new Error(
        `Cloudflare screenshot failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }

    const png = Buffer.from(await res.arrayBuffer());
    if (png.length < 100) {
      throw new Error("Cloudflare screenshot returned empty or tiny PNG");
    }

    const webp = await sharp(png).webp({ quality: 85 }).toBuffer();
    log.info(
      {
        pngBytes: png.length,
        webpBytes: webp.length,
        browserMsUsed,
        mode: html ? "html" : "url",
        url: html ? undefined : url,
        attempt,
      },
      "[cloudflare-browser] screenshot ok",
    );

    return {
      webp,
      browserMsUsed: Number.isFinite(browserMsUsed) ? browserMsUsed : null,
      pngBytes: png.length,
    };
  }

  throw lastError ?? new Error("Cloudflare screenshot failed after retries");
}
