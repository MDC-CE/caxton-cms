import { contentIndex } from "./content-index";
import {
  getContentTypeConfig,
  getHreflangsSource,
  resolveHreflangsFromRecord,
  resolveUrlPatternWithMapping,
  getFullFieldMapping,
} from "./content-types";
import { getSupportedLocales, getDefaultLocale, getHomePage } from "./settings";

function toBcp47(locale: string): string {
  const parts = locale.split("-");
  if (parts.length === 2) {
    return `${parts[0]}-${parts[1].toUpperCase()}`;
  }
  return locale;
}

export function getBaseUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:5000";
}

function tagsFromLocaleUrls(
  localeUrls: Record<string, string>,
  currentLocale: string,
  baseUrl: string,
): string[] {
  if (Object.keys(localeUrls).length < 2) return [];
  const tags: string[] = [];
  for (const [locale, urlPath] of Object.entries(localeUrls)) {
    tags.push(`<link rel="alternate" hreflang="${toBcp47(locale)}" href="${baseUrl}${urlPath}" />`);
  }
  const defaultUrl = localeUrls["en"] || localeUrls[currentLocale] || Object.values(localeUrls)[0];
  if (defaultUrl) {
    tags.push(`<link rel="alternate" hreflang="x-default" href="${baseUrl}${defaultUrl}" />`);
  }
  return tags;
}

export function generateHreflangTags(
  contentType: string,
  slug: string,
  currentLocale: string,
  record?: Record<string, unknown>,
  params?: Record<string, string>,
  ci: typeof contentIndex = contentIndex,
): string[] {
  try {
    const baseUrl = getBaseUrl();
    const hreflangsConfigured = !!getHreflangsSource(contentType);

    // Prefer resolver (YAML folder or DB _hreflangs)
    const localeUrls = ci.getLocaleUrls(slug, contentType);
    const fromResolver = tagsFromLocaleUrls(localeUrls, currentLocale, baseUrl);
    if (fromResolver.length > 0) return fromResolver;

    // When record is present and _hreflangs is configured, build from the record map
    // (avoids inventing same-slug alternates for DB items with a partial/empty map).
    if (record && hreflangsConfigured) {
      const map = resolveHreflangsFromRecord(record, contentType);
      if (!map || Object.keys(map).length < 2) return [];

      const config = getContentTypeConfig(contentType);
      if (!config?.url_pattern) return [];
      const fieldMapping = getFullFieldMapping(contentType);
      const urls: Record<string, string> = {};
      for (const [locale, localeSlug] of Object.entries(map)) {
        const pattern = config.url_pattern[locale] || config.url_pattern["default"];
        if (!pattern) continue;
        const synthetic = { ...record, slug: localeSlug };
        const resolved = resolveUrlPatternWithMapping(pattern, synthetic, locale, fieldMapping);
        if (resolved) urls[locale] = resolved;
      }
      return tagsFromLocaleUrls(urls, currentLocale, baseUrl);
    }

    // Same-slug fallback only when _hreflangs is NOT configured (legacy / simple types)
    if (hreflangsConfigured) return [];

    const config = getContentTypeConfig(contentType);
    if (!config?.url_pattern) return [];

    const localeKeys = Object.keys(config.url_pattern).filter(k => k !== "default");
    if (localeKeys.length < 2) return [];

    const tags: string[] = [];
    const urls: Record<string, string> = {};

    for (const locale of localeKeys) {
      const pattern = config.url_pattern[locale];
      if (!pattern) continue;

      let resolvedUrl: string;
      if (record) {
        resolvedUrl = resolveUrlPatternWithMapping(pattern, record, locale, null);
      } else if (params) {
        resolvedUrl = pattern.replace(/:([a-zA-Z_]+)/g, (_m, paramName) => {
          if (paramName === "slug") return slug;
          return params[paramName] || "";
        }).replace(/\/+/g, "/");
      } else {
        resolvedUrl = pattern.replace(/:slug/, slug).replace(/\/+/g, "/");
      }

      urls[locale] = resolvedUrl;
      tags.push(`<link rel="alternate" hreflang="${toBcp47(locale)}" href="${baseUrl}${resolvedUrl}" />`);
    }

    const defaultUrl = urls["en"] || urls[currentLocale] || Object.values(urls)[0];
    if (defaultUrl) {
      tags.push(`<link rel="alternate" hreflang="x-default" href="${baseUrl}${defaultUrl}" />`);
    }

    return tags;
  } catch {
    return [];
  }
}

export function generateListingHreflangTags(
  contentType: string,
  currentLocale: string,
): string[] {
  try {
    const config = getContentTypeConfig(contentType);
    if (!config?.url_pattern) return [];
    const baseUrl = getBaseUrl();
    const localeKeys = Object.keys(config.url_pattern).filter(k => k !== "default");
    if (localeKeys.length < 2) return [];

    const tags: string[] = [];
    const urls: Record<string, string> = {};

    for (const locale of localeKeys) {
      const pattern = config.url_pattern[locale];
      if (!pattern) continue;
      const listingUrl = pattern.replace(/\/:[a-zA-Z_]+/g, "").replace(/\/+$/, "") || "/";
      urls[locale] = listingUrl;
      tags.push(`<link rel="alternate" hreflang="${toBcp47(locale)}" href="${baseUrl}${listingUrl}" />`);
    }

    const defaultUrl = urls["en"] || urls[currentLocale] || Object.values(urls)[0];
    if (defaultUrl) {
      tags.push(`<link rel="alternate" hreflang="x-default" href="${baseUrl}${defaultUrl}" />`);
    }
    return tags;
  } catch {
    return [];
  }
}

export function generateHomepageHreflangTags(
  ci: typeof contentIndex = contentIndex,
): string[] {
  try {
    const baseUrl = getBaseUrl();
    const supportedLocales = getSupportedLocales();
    const defaultLocale = getDefaultLocale();
    const homePage = getHomePage();
    const contentType = homePage?.type || "page";
    const homeSlug = homePage?.slug || "home";

    const localeUrls = ci.getLocaleUrls(homeSlug, contentType);
    const tags: string[] = [];
    for (const locale of supportedLocales) {
      const path =
        localeUrls[locale] ||
        ci.buildUrl(contentType, locale, homeSlug) ||
        `/${locale}/${homeSlug}`;
      tags.push(
        `<link rel="alternate" hreflang="${toBcp47(locale)}" href="${baseUrl}${path}" />`,
      );
    }
    const defaultPath =
      localeUrls[defaultLocale] ||
      ci.buildUrl(contentType, defaultLocale, homeSlug) ||
      `/${defaultLocale}/${homeSlug}`;
    tags.push(
      `<link rel="alternate" hreflang="x-default" href="${baseUrl}${defaultPath}" />`,
    );
    return tags;
  } catch {
    return [];
  }
}
