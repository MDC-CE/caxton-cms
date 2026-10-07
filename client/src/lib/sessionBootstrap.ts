import type { Session } from '@shared/session';
import { defaultSession, stripMarketingFields } from '@shared/session';
import { hasTrackingConsent } from './consent';
import {
  getSessionFromCookie,
  setSessionCookie,
  migrateLegacySessionFromLocalStorage,
  getParentCookieDomain,
  COOKIE_MAX_AGE_SECONDS,
} from './sessionCookie';

export function getCachedSession(): Session | null {
  if (typeof window === 'undefined') return null;

  const fromCookie = getSessionFromCookie();
  if (fromCookie) return fromCookie;

  return migrateLegacySessionFromLocalStorage();
}

/**
 * Persist the session to `4g_ctx`. Without tracking consent, campaign fields
 * (UTMs, click ids, landing pages) stay in memory only and are left out of the cookie.
 */
export function saveSession(session: Session, trackingGranted: boolean = hasTrackingConsent()): void {
  if (typeof window === 'undefined') return;
  setSessionCookie(trackingGranted ? session : stripMarketingFields(session));
}

export function getLanguageFromCache(): 'en' | 'es' {
  const session = getCachedSession();
  return session?.language || 'en';
}

export function getPathLanguage(path: string): 'en' | 'es' | null {
  const segment = path.split('/').filter(Boolean)[0];
  if (segment === 'es') return 'es';
  if (segment === 'en') return 'en';
  return null;
}

export function getNavigatorInfo(): string {
  if (typeof navigator === 'undefined') {
    return JSON.stringify({ languages: ['en'] });
  }

  return JSON.stringify({
    languages: navigator.languages || [],
    language: navigator.language,
    userLanguage: (navigator as { userLanguage?: string }).userLanguage,
  });
}

export function getDeviceInfo(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return JSON.stringify({});
  }

  return JSON.stringify({
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    devicePixelRatio: window.devicePixelRatio || 1,
  });
}

export function createDefaultSession(): Session {
  return { ...defaultSession };
}

const USER_COOKIE_NAME = '4g_user_id';
const LEGACY_USER_COOKIE_NAME = '4g_visitor_id';

export function setUserIdCookie(userId: string): void {
  if (typeof document === 'undefined') return;
  const parts = [
    `${USER_COOKIE_NAME}=${userId}`,
    `max-age=${COOKIE_MAX_AGE_SECONDS}`,
    'path=/',
    'samesite=lax',
  ];
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('secure');
  }
  const domain = getParentCookieDomain();
  if (domain) parts.push(`domain=${domain}`);
  document.cookie = parts.join('; ');
}

export function getUserIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split('; ');
  const newCookie = cookies.find((row) => row.startsWith(`${USER_COOKIE_NAME}=`));
  if (newCookie) return newCookie.split('=')[1];
  const legacyCookie = cookies.find((row) =>
    row.startsWith(`${LEGACY_USER_COOKIE_NAME}=`),
  );
  return legacyCookie ? legacyCookie.split('=')[1] : null;
}
