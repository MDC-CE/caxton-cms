import type { Session, UTMParams } from '@shared/session';
import {
  SESSION_COOKIE_NAME,
  CONSUMER_TOKEN_COOKIE_NAME,
  SESSION_STORAGE_KEY,
  SESSION_VERSION,
} from '@shared/session';

/** Legacy localStorage key for consumer auth token (migrated to `4g_tok`). */
export const LEGACY_AUTH_TOKEN_KEY = '4g_auth_token';

export const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days
const CTX_COOKIE_SIZE_LIMIT = 3500;
const UTM_TRUNCATE_LEN = 200;

/**
 * Derive parent cookie Domain for sibling subdomain sharing.
 * `learn.4geeks.com` → `.4geeks.com`. Omit on localhost / IPs / single-label hosts.
 */
export function getParentCookieDomain(hostname?: string): string | undefined {
  const host =
    hostname ??
    (typeof window !== 'undefined' ? window.location?.hostname : undefined);
  if (!host || typeof host !== 'string') return undefined;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':') // IPv6
  ) {
    return undefined;
  }

  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return undefined;

  // Keep last two labels (e.g. 4geeks.com). Sufficient for our *.4geeks.com deployment.
  return `.${parts.slice(-2).join('.')}`;
}

function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
}

function buildCookieAttributes(maxAge = COOKIE_MAX_AGE_SECONDS): string {
  const parts = [`path=/`, `max-age=${maxAge}`, `samesite=lax`];
  if (isSecureContext()) parts.push('secure');
  const domain = getParentCookieDomain();
  if (domain) parts.push(`domain=${domain}`);
  return parts.join('; ');
}

/** True when document.cookie is a usable string (SSR often has document without cookies). */
function canUseDocumentCookie(): boolean {
  return typeof document !== 'undefined' && typeof document.cookie === 'string';
}

export function readRawCookie(name: string): string | null {
  if (!canUseDocumentCookie()) return null;
  const prefix = `${name}=`;
  const row = document.cookie.split('; ').find((c) => c.startsWith(prefix));
  if (!row) return null;
  return row.slice(prefix.length);
}

export function writeRawCookie(name: string, value: string, maxAge = COOKIE_MAX_AGE_SECONDS): void {
  if (!canUseDocumentCookie()) return;
  document.cookie = `${name}=${value}; ${buildCookieAttributes(maxAge)}`;
}

export function clearRawCookie(name: string): void {
  if (!canUseDocumentCookie()) return;
  // Clear host-only and parent-domain variants
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  const domain = getParentCookieDomain();
  if (domain) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax; domain=${domain}`;
  }
}

function truncateUtm(utm: UTMParams): UTMParams {
  const out: UTMParams = { ...utm };
  for (const key of Object.keys(out) as (keyof UTMParams)[]) {
    const val = out[key];
    if (typeof val === 'string' && val.length > UTM_TRUNCATE_LEN) {
      out[key] = val.slice(0, UTM_TRUNCATE_LEN) as never;
    }
  }
  return out;
}

function slimSessionForCookie(session: Session): Session {
  const location = session.location
    ? (() => {
        const { address: _a, phone: _p, ...rest } = session.location;
        return rest;
      })()
    : null;

  return {
    ...session,
    location,
    utm: truncateUtm(session.utm || {}),
  };
}

function encodeSessionCookieValue(session: Session): string | null {
  let candidate = session;
  let encoded = encodeURIComponent(JSON.stringify(candidate));

  if (encoded.length > CTX_COOKIE_SIZE_LIMIT) {
    candidate = slimSessionForCookie(session);
    encoded = encodeURIComponent(JSON.stringify(candidate));
  }

  if (encoded.length > CTX_COOKIE_SIZE_LIMIT) {
    console.warn(
      '4g_ctx cookie exceeds size limit after slimming',
      encoded.length,
    );
    return null;
  }

  return encoded;
}

export function getSessionFromCookie(): Session | null {
  if (!canUseDocumentCookie()) return null;
  try {
    const raw = readRawCookie(SESSION_COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(decodeURIComponent(raw)) as Session;
    if (session.version !== SESSION_VERSION) {
      clearRawCookie(SESSION_COOKIE_NAME);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setSessionCookie(session: Session): void {
  if (!canUseDocumentCookie()) return;
  const encoded = encodeSessionCookieValue(session);
  if (!encoded) return;
  writeRawCookie(SESSION_COOKIE_NAME, encoded);
}

export function clearSessionCookie(): void {
  clearRawCookie(SESSION_COOKIE_NAME);
}

export function getTokenFromCookie(): string | null {
  const raw = readRawCookie(CONSUMER_TOKEN_COOKIE_NAME);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function setTokenCookie(token: string): void {
  if (!canUseDocumentCookie()) return;
  writeRawCookie(CONSUMER_TOKEN_COOKIE_NAME, encodeURIComponent(token));
}

export function clearTokenCookie(): void {
  clearRawCookie(CONSUMER_TOKEN_COOKIE_NAME);
}

/**
 * One-time migrate legacy localStorage session → `4g_ctx`, then remove the key.
 */
function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function migrateLegacySessionFromLocalStorage(): Session | null {
  if (!canUseBrowserStorage()) return null;
  try {
    const existing = getSessionFromCookie();
    if (existing) {
      // Cookie already authoritative; drop leftover LS if present
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return existing;
    }

    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;

    const session = JSON.parse(stored) as Session;
    localStorage.removeItem(SESSION_STORAGE_KEY);

    // Accept prior versions and bump so cookie SoT is current
    const migrated: Session = {
      ...session,
      version: SESSION_VERSION,
      timestamp: session.timestamp || Date.now(),
    };
    setSessionCookie(migrated);
    return migrated;
  } catch {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * One-time migrate legacy `4g_auth_token` localStorage → `4g_tok`.
 */
export function migrateLegacyTokenFromLocalStorage(): string | null {
  if (!canUseBrowserStorage()) return null;
  try {
    const fromCookie = getTokenFromCookie();
    if (fromCookie) {
      localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
      return fromCookie;
    }

    const legacy = localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
    if (!legacy) return null;

    setTokenCookie(legacy);
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    return legacy;
  } catch {
    try {
      localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}
