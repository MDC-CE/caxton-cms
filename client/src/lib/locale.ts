import { isReservedContentSlug } from "@shared/safe-href";

export function normalizeLocale(locale: string | undefined | null): string {
  if (!locale) return "en";
  const normalized = locale.toLowerCase().split("-")[0].split("_")[0];
  if (normalized === "us") return "en";
  if (!/^[a-z]{2}$/.test(normalized)) return "en";
  return normalized;
}

export function listExtraUrlPatternParams(
  urlPattern: Record<string, string> | undefined | null,
): string[] {
  if (!urlPattern) return [];
  const keys = new Set<string>();
  for (const pattern of Object.values(urlPattern)) {
    if (!pattern) continue;
    const matches = pattern.match(/:([a-zA-Z_]+)/g) || [];
    for (const m of matches) {
      const key = m.slice(1);
      if (key !== "slug" && key !== "locale") keys.add(key);
    }
  }
  return [...keys];
}

export function buildContentUrlFromPattern(
  urlPattern: Record<string, string> | undefined,
  slug: string,
  locale: string,
  extraParams?: Record<string, string>,
): string {
  if (slug == null || isReservedContentSlug(String(slug))) {
    return "";
  }
  if (!urlPattern) return `/${locale}/${slug}`;
  const pattern = urlPattern[locale] || urlPattern["default"] || urlPattern["en"];
  if (!pattern) return `/${locale}/${slug}`;
  let result = pattern.replace(/:slug/g, slug).replace(/:locale/g, locale);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value == null || isReservedContentSlug(String(value))) continue;
      if (!value) continue;
      result = result.replace(new RegExp(`:${key}\\b`, "g"), value);
    }
  }
  return result;
}
