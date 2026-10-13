/**
 * Traffic channel of a visit (paid, organic search, social, AI assistant, email, referral, direct).
 * Shared by the session worker and the lead ledger. Pure — no I/O.
 *
 * - UTM tags win; the referrer only classifies untagged visits.
 * - A known source counts with or without a medium (`utm_source=chatgpt.com` → ai_assistant).
 * - Self-referrals and internal UTMs (our own host / parent domain) return null: no new information.
 * - Only the referrer host is ever kept, never the full URL.
 */

import { CAMPAIGN_PARAMS, classifyTraffic, type ClickIdParam } from "./paid-traffic";

export const TRAFFIC_CHANNELS = [
  "paid",
  "meta_unclear",
  "organic_search",
  "organic_social",
  "ai_assistant",
  "email",
  "referral",
  "direct",
  "tagged_other",
] as const;
export type TrafficChannel = (typeof TRAFFIC_CHANNELS)[number];

export const TRAFFIC_CHANNEL_LABELS: Record<TrafficChannel, string> = {
  paid: "Paid ads",
  meta_unclear: "Meta, unclear",
  organic_search: "Organic search",
  organic_social: "Organic social",
  ai_assistant: "AI assistant",
  email: "Email",
  referral: "Referral",
  direct: "Direct",
  tagged_other: "Other tagged",
};

export function isTrafficChannel(v: unknown): v is TrafficChannel {
  return typeof v === "string" && (TRAFFIC_CHANNELS as readonly string[]).includes(v);
}

type HostChannel = "organic_search" | "organic_social" | "ai_assistant" | "email";

/** Checked in order: AI before search (gemini.google.com), webmail before search (mail.google.com). */
const HOST_RULES: Array<[RegExp, HostChannel]> = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|gemini\.google\.com|bard\.google\.com|you\.com|phind\.com)$/, "ai_assistant"],
  [/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.proton\.me)$/, "email"],
  [/^com\.google\.android\.gm$/, "email"],
  [/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/, "organic_search"],
  [/^com\.google\.android\.googlequicksearchbox$/, "organic_search"],
  [/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|baidu\.com|startpage\.com|qwant\.com|naver\.com|seznam\.cz)$/, "organic_search"],
  [/(^|\.)yandex\.[a-z]{2,3}$/, "organic_search"],
  [/(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|t\.co|twitter\.com|x\.com|youtube\.com|youtu\.be|tiktok\.com|reddit\.com|pinterest\.com|threads\.net|whatsapp\.com|wa\.me|discord\.com|quora\.com|telegram\.org|t\.me)$/, "organic_social"],
];

/** Bare `utm_source` keywords (no dot) → channel. */
const SOURCE_KEYWORDS: Record<string, HostChannel> = {
  google: "organic_search",
  bing: "organic_search",
  duckduckgo: "organic_search",
  yahoo: "organic_search",
  ecosia: "organic_search",
  brave: "organic_search",
  yandex: "organic_search",
  baidu: "organic_search",
  chatgpt: "ai_assistant",
  openai: "ai_assistant",
  perplexity: "ai_assistant",
  gemini: "ai_assistant",
  copilot: "ai_assistant",
  claude: "ai_assistant",
  facebook: "organic_social",
  fb: "organic_social",
  instagram: "organic_social",
  ig: "organic_social",
  linkedin: "organic_social",
  twitter: "organic_social",
  x: "organic_social",
  tiktok: "organic_social",
  youtube: "organic_social",
  reddit: "organic_social",
  pinterest: "organic_social",
  threads: "organic_social",
  whatsapp: "organic_social",
  discord: "organic_social",
  telegram: "organic_social",
};

const EMAIL_MEDIUMS = new Set(["email", "e-mail", "e_mail", "mail", "newsletter"]);
const SOCIAL_MEDIUMS = new Set(["social", "organic_social", "social-organic", "organic-social", "social_organic", "sm"]);
const SEARCH_MEDIUMS = new Set(["organic", "seo", "organic_search"]);
const REFERRAL_MEDIUMS = new Set(["referral", "ref"]);

function cleanHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#:]/)[0]
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

/** Host of a referrer URL (including `android-app://` package names), or null. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = cleanHost(new URL(referrer).hostname || "");
    return host || null;
  } catch {
    const host = cleanHost(referrer);
    return host && host.includes(".") ? host : null;
  }
}

function ownHostSet(ownHosts: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(ownHosts.map((h) => (h ? cleanHost(h.replace(/^\./, "")) : "")).filter(Boolean)));
}

function matchesOwnHost(host: string, own: string[]): boolean {
  return own.some((o) => host === o || host.endsWith(`.${o}`));
}

/** True when `utm_source` names our own host or parent domain (an internal link carrying UTMs). */
export function isInternalUtmSource(
  source: string | null | undefined,
  ownHosts: readonly (string | null | undefined)[],
): boolean {
  if (!source) return false;
  const host = cleanHost(source);
  if (!host || !host.includes(".")) return false;
  return matchesOwnHost(host, ownHostSet(ownHosts));
}

export function channelForHost(host: string | null | undefined): HostChannel | null {
  if (!host) return null;
  const h = cleanHost(host);
  for (const [re, channel] of HOST_RULES) {
    if (re.test(h)) return channel;
  }
  return null;
}

/** Channel of a `utm_source` value: a host (`chatgpt.com`) or a keyword (`google`, `ig`). */
export function channelForSource(source: string | null | undefined): HostChannel | null {
  if (!source) return null;
  const s = source.trim().toLowerCase();
  if (!s) return null;
  if (s.includes(".")) return channelForHost(s);
  return SOURCE_KEYWORDS[s] ?? null;
}

export type ChannelSignals = {
  utm?: Partial<Record<(typeof CAMPAIGN_PARAMS)[number], string | null | undefined>>;
  click_ids?: Partial<Record<ClickIdParam, string | null | undefined>>;
  referrer?: string | null;
  /** Current host plus its parent cookie domain. */
  ownHosts: readonly (string | null | undefined)[];
};

function taggedChannel(source: string | null | undefined, medium: string | null | undefined): TrafficChannel {
  const m = (medium ?? "").trim().toLowerCase();
  if (EMAIL_MEDIUMS.has(m)) return "email";
  const fromSource = channelForSource(source);
  if (SOCIAL_MEDIUMS.has(m)) return "organic_social";
  if (fromSource) return fromSource;
  if (SEARCH_MEDIUMS.has(m)) return "organic_search";
  if (REFERRAL_MEDIUMS.has(m)) return "referral";
  return "tagged_other";
}

/**
 * Channel of one landing. Returns null when the visit carries no new information
 * (self-referral or internal UTMs without an outside referrer).
 */
export function classifyChannel(signals: ChannelSignals): TrafficChannel | null {
  const own = ownHostSet(signals.ownHosts);
  const utm = signals.utm ?? {};
  const internal = isInternalUtmSource(utm.utm_source, own);
  const campaign = internal ? {} : utm;

  const cls = classifyTraffic({
    utm_source: campaign.utm_source ?? null,
    utm_medium: campaign.utm_medium ?? null,
    click_ids: signals.click_ids,
  });
  if (cls.status === "paid") return "paid";
  if (cls.status === "unclear") return "meta_unclear";

  const tagged = CAMPAIGN_PARAMS.some((k) => !!campaign[k]);
  if (tagged) return taggedChannel(campaign.utm_source, campaign.utm_medium);

  const host = referrerHost(signals.referrer);
  if (!host) return internal ? null : "direct";
  if (matchesOwnHost(host, own)) return null;
  return channelForHost(host) ?? "referral";
}
