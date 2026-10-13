import type { TrafficChannel } from './traffic-channel';

export interface Location {
  slug: string;
  name: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  region: 'usa-canada' | 'latam' | 'europe' | 'online';
  default_language: 'en' | 'es';
  timezone: string;
  visibility: 'listed' | 'unlisted';
  phone?: string;
  address?: string;
  reliable?: boolean;
}

export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_url?: string;
  utm_placement?: string;
  utm_plan?: string;
  /** Campaign id from the Meta URL template (`utm_id={{campaign.id}}`). */
  utm_id?: string;
  // Normalized PPC tracking ID (captures gclid, fbclid, msclkid, ttclid, etc.)
  ppc_tracking_id?: string;
  // Per-platform click ids (first one found also fills ppc_tracking_id)
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  dclid?: string;
  fbclid?: string;
  msclkid?: string;
  ttclid?: string;
  li_fat_id?: string;
  twclid?: string;
  sclid?: string;
  epik?: string;
  /** Meta browser id (`_fbp` cookie) and click id (`_fbc`, or derived from fbclid). */
  fbp?: string;
  fbc?: string;
  // Referral tracking
  ref?: string;
  referral?: string;
  referral_key?: string;
  coupon?: string;
}

export interface GeoData {
  city?: string;
  country?: string;
  country_code?: string;
  region?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
}

export interface DeviceData {
  deviceCategory: 'mobile' | 'tablet' | 'desktop';
  osFamily: string;
  browserFamily: string;
  viewportWidth: number;
  viewportHeight: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  orientation: 'portrait' | 'landscape';
}

export interface Session {
  version: number;
  initialized: boolean;
  userId?: string;
  location: Location | null;
  language: 'en' | 'es';
  browserLang: string | null;
  geo: GeoData | null;
  utm: UTMParams;
  device?: DeviceData;
  /** First-touch pathname; write-once. */
  landing_page?: string;
  /** Pathname of the latest successful conversion. */
  conversion_page?: string;
  /** Write-once first campaign set seen in this browser. */
  first_touch?: UTMParams;
  /** First (write-once) and most recent paid landing in this browser. */
  paid_landing?: {
    first?: PaidLandingRef;
    last?: PaidLandingRef;
  };
  /** Traffic channel of the first visit (write-once) and the latest non-direct visit. */
  entry_channel?: {
    first?: ChannelTouch;
    last?: ChannelTouch;
  };
  consent: {
    geolocation: boolean | null;
    /** Tracking banner choice mirrored from the `4g_consent` cookie. */
    tracking?: 'granted' | 'denied' | 'unset';
  };
  timestamp: number;
}

export interface PaidLandingRef {
  host: string;
  path: string;
  /** Epoch milliseconds. */
  at: number;
  platform?: string | null;
  /** Numeric ad ids from the landing's utm_id / utm_term / utm_content (both Meta and Google templates). */
  campaign_id?: string | null;
  adset_id?: string | null;
  ad_id?: string | null;
}

export interface ChannelTouch {
  channel: TrafficChannel;
  /** Referrer host only, never the full URL. */
  referrer_host?: string;
  /** Normalized pathname this visit landed on. */
  path: string;
  /** Epoch milliseconds. */
  at: number;
}

/**
 * Keys in `utm` that are marketing data (gated by tracking consent). Referral and
 * coupon keys are functional (they change price/offer) and are always kept.
 */
export const MARKETING_UTM_KEYS: readonly (keyof UTMParams)[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_url',
  'utm_placement',
  'utm_plan',
  'utm_id',
  'ppc_tracking_id',
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'li_fat_id',
  'twclid',
  'sclid',
  'epik',
  'fbp',
  'fbc',
];

/** Copy of the session without marketing fields — what may be stored in `4g_ctx` before consent. */
export function stripMarketingFields(session: Session): Session {
  const utm: UTMParams = { ...session.utm };
  for (const key of MARKETING_UTM_KEYS) delete utm[key];
  const {
    first_touch: _ft,
    paid_landing: _pl,
    entry_channel: _ec,
    landing_page: _lp,
    conversion_page: _cp,
    ...rest
  } = session;
  return { ...rest, utm };
}

/** @deprecated Legacy localStorage key; consumer session now lives in cookie `4g_ctx`. */
export const SESSION_STORAGE_KEY = '4geeks_session';
export const SESSION_COOKIE_NAME = '4g_ctx';
export const CONSUMER_TOKEN_COOKIE_NAME = '4g_tok';
export const SESSION_VERSION = 4;

export const defaultSession: Session = {
  version: SESSION_VERSION,
  initialized: false,
  userId: undefined,
  location: null,
  language: 'en',
  browserLang: null,
  geo: null,
  utm: {},
  landing_page: undefined,
  conversion_page: undefined,
  consent: {
    geolocation: null,
  },
  timestamp: Date.now(),
};

export interface WorkerMessage {
  type: 'INIT_SESSION';
  payload: {
    cachedSession: Session | null;
    path: string;
    search: string;
    navigator: string;
    device: string; // JSON stringified device info from main thread
    existingUserId?: string; // 4g_user_id cookie value read by main thread
    host?: string; // window.location.hostname (for paid landing host)
    fbp?: string; // `_fbp` cookie read by main thread
    fbc?: string; // `_fbc` cookie read by main thread
    /** `document.referrer` on page load; omitted on re-inits (geo refresh) so no channel is recorded. */
    referrer?: string;
    /** Current hostname + parent cookie domain (self-referrals and internal UTMs). */
    ownHosts?: string[];
  };
}

export interface WorkerResponse {
  type: 'SESSION_READY';
  payload: Session;
}
