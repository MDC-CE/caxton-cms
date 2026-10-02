/**
 * GA4 default channel group rules for manual (UTM) traffic. Pure and not configurable:
 * the UTM convention in ads-config.yml must stay inside these rules.
 *
 * Source: https://support.google.com/analytics/answer/9756891 ("Channels for manual traffic")
 * and Google's "GA4 default-channel-group sources and categories" list (bare names only;
 * GA4 also lists domains like `l.facebook.com`, which never appear as a utm_source we write).
 */

import type { AdPlatform } from "./paid-traffic";

export const GA4_PAID_MEDIUM_RE = /^(.*cp.*|ppc|retargeting|paid.*)$/i;
export const GA4_DISPLAY_MEDIUMS: readonly string[] = ["display", "banner", "expandable", "interstitial", "cpm"];
export const GA4_CHANNEL_DOC_URL = "https://support.google.com/analytics/answer/9756891";

export const GA4_SEARCH_SOURCES: ReadonlySet<string> = new Set([
  "alice", "aol", "ask", "auone", "avg", "babylon", "baidu", "biglobe", "bing", "cnn", "comcast", "conduit",
  "daum", "dogpile", "duckduckgo", "eniro", "globo", "google", "google-play", "incredimail", "kvasir", "lycos",
  "msn", "najdi", "naver", "onet", "qwant", "rakuten", "rambler", "search-results", "seznam", "sogou",
  "startsiden", "terra", "ukr", "virgilio", "yahoo", "yandex",
]);

export const GA4_VIDEO_SOURCES: ReadonlySet<string> = new Set([
  "crackle", "curiositystream", "dailymotion", "disneyplus", "hulu", "iqiyi", "netflix", "ted", "twitch",
  "utreon", "veoh", "vimeo", "wistia", "youku", "youtube",
]);

export const GA4_SOCIAL_SOURCES: ReadonlySet<string> = new Set([
  "43things", "activerain", "activeworlds", "addthis", "alumniclass", "americantowns", "anobii", "answerbag",
  "aolanswers", "askubuntu", "athlinks", "baby-gaga", "badoo", "bebo", "beforeitsnews", "bharatstudent",
  "blackplanet", "blogger", "blogher", "bloglines", "blogsome", "blogspot", "blogster", "blurtit", "brightkite",
  "brizzly", "buzzfeed", "buzznet", "cafemom", "camospace", "care2", "catster", "cellufun", "chicagonow",
  "classmates", "classquest", "cocolog-nifty", "cozycot", "crunchyroll", "cyworld", "deviantart", "dianping",
  "digg", "diigo", "disqus", "dogster", "dol2day", "doostang", "dopplr", "douban", "drugs-forum", "dzone",
  "elftown", "extole", "facebook", "faceparty", "fanpop", "fark", "fb", "fc2", "feedspot", "feministing",
  "filmaffinity", "flickr", "flipboard", "folkdirect", "foodservice", "fotki", "fotolog", "foursquare",
  "friendfeed", "fubar", "gaiaonline", "gamerdna", "glassboard", "glassdoor", "godtube", "goldstar", "gooblog",
  "goodreads", "google+", "googleplus", "govloop", "gowalla", "habbo", "hatena", "hi5", "hootsuite", "houzz",
  "hoverspot", "hubculture", "ibibo", "ig", "imageshack", "imvu", "insanejournal", "instagram", "instapaper",
  "intherooms", "italki", "jammerdirect", "kakao", "kaneva", "librarything", "line", "linkedin", "listal",
  "listography", "livedoorblog", "livejournal", "meetup", "messenger", "mocospace", "mouthshut", "movabletype",
  "mubi", "myheritage", "mylife", "mymodernmet", "myspace", "netvibes", "newsshowcase", "nexopia", "niconico",
  "nightlifelink", "ning", "onstartups", "opendiary", "photobucket", "pinboard", "pingsta", "pinterest", "plurk",
  "posterous", "qapacity", "quechup", "quora", "ravelry", "reddit", "redux", "renren", "reunion", "reverbnation",
  "ryze", "salespider", "screenrant", "scribd", "scvngr", "secondlife", "serverfault", "shareit", "sharethis",
  "skype", "skyrock", "snapchat", "social", "socialvibe", "spoke", "spruz", "stackapps", "stackexchange",
  "stackoverflow", "stickam", "superuser", "sweeva", "tagged", "taggedmail", "talkbiznow", "techmeme", "tencent",
  "tiktok", "tinyurl", "toolbox", "travellerspoint", "tripadvisor", "trombi", "trustpilot", "tudou", "tuenti",
  "tumblr", "tweetdeck", "twitter", "typepad", "vampirefreaks", "vampirerave", "wakoopa", "wattpad", "webshots",
  "wechat", "weebly", "weibo", "weread", "whatsapp", "wordpress", "xanga", "xing", "yammer", "yelp", "zalo",
  "zooppa",
]);

/**
 * Values Meta writes for `{{site_source_name}}` that GA4 does not list as social sources:
 * those visits land in Paid Other instead of Paid Social.
 */
export const META_SITE_SOURCES_OUTSIDE_GA4: readonly string[] = ["msg", "an"];

export type Ga4Channel =
  | "Paid Search"
  | "Paid Social"
  | "Paid Video"
  | "Display"
  | "Paid Other"
  | "Organic Search"
  | "Organic Social"
  | "Organic Video"
  | "Other";

export function isGa4PaidMedium(medium: string | null | undefined): boolean {
  return !!medium && GA4_PAID_MEDIUM_RE.test(medium.trim());
}

export function isGa4DisplayMedium(medium: string | null | undefined): boolean {
  return !!medium && GA4_DISPLAY_MEDIUMS.includes(medium.trim().toLowerCase());
}

/** GA4 counts this medium as paid (any paid channel, Display included). */
export function isGa4StandardPaidMedium(medium: string | null | undefined): boolean {
  return isGa4PaidMedium(medium) || isGa4DisplayMedium(medium);
}

/** Default channel GA4 assigns to a manual-tagged visit (shopping / campaign-name rules ignored). */
export function ga4ChannelFor(source: string | null | undefined, medium: string | null | undefined): Ga4Channel {
  const s = (source ?? "").trim().toLowerCase();
  const paid = isGa4PaidMedium(medium);
  if (paid && GA4_SEARCH_SOURCES.has(s)) return "Paid Search";
  if (paid && GA4_SOCIAL_SOURCES.has(s)) return "Paid Social";
  if (paid && GA4_VIDEO_SOURCES.has(s)) return "Paid Video";
  if (isGa4DisplayMedium(medium)) return "Display";
  if (paid) return "Paid Other";
  if (GA4_SOCIAL_SOURCES.has(s)) return "Organic Social";
  if (GA4_VIDEO_SOURCES.has(s)) return "Organic Video";
  if (GA4_SEARCH_SOURCES.has(s)) return "Organic Search";
  return "Other";
}

/** Channels GA4 should put each platform's paid traffic in. Platforms not listed accept any paid channel. */
export const EXPECTED_PAID_CHANNELS: Partial<Record<AdPlatform, readonly Ga4Channel[]>> = {
  meta: ["Paid Social"],
  google: ["Paid Search", "Display", "Paid Video"],
};

/** True when GA4 files this source + medium under one of the platform's expected paid channels. */
export function isStandardPaid(platform: AdPlatform | null, source: string | null | undefined, medium: string | null | undefined): boolean {
  const channel = ga4ChannelFor(source, medium);
  const expected = platform ? EXPECTED_PAID_CHANNELS[platform] : undefined;
  if (expected) return expected.includes(channel);
  return channel === "Paid Search" || channel === "Paid Social" || channel === "Paid Video" || channel === "Display" || channel === "Paid Other";
}

/** Plain-English rule for a platform, used in issue text and convention rejections. */
export function standardRuleFor(platform: AdPlatform): string {
  const expected = EXPECTED_PAID_CHANNELS[platform];
  const channels = expected ? expected.join(" / ") : "a paid channel";
  return `GA4 must file ${platform === "meta" ? "Meta" : platform === "google" ? "Google" : platform} traffic as ${channels}: the medium must match ${GA4_PAID_MEDIUM_RE.source}${
    platform === "google" ? ` (or be one of ${GA4_DISPLAY_MEDIUMS.join(", ")})` : ""
  } and the source must be on GA4's ${platform === "meta" ? "social" : platform === "google" ? "search or video" : ""} source list.`;
}
