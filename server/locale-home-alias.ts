/**
 * Resolve 301 targets for locale-home aliases (`/`, `/en`, `/es`, `/us`, `/es/home`).
 */

import {
  isLocaleHomeAlias,
  normalizePublicPath,
} from "@shared/public-app-routes";
import type { ContentIndex } from "./content-index";
import { getDefaultLocale, getHomePage } from "./settings";

/**
 * Final homepage path for a locale-home alias, or null if the path is not an alias
 * / has no resolvable home URL. Never returns the same path as the request (no loops).
 */
export function resolveLocaleHomeAliasTarget(
  path: string,
  ci: ContentIndex,
  contentRoot?: string,
): string | null {
  const normalized = normalizePublicPath(path);
  if (!isLocaleHomeAlias(normalized)) return null;

  const home = getHomePage(contentRoot ?? ci.contentRoot);
  const contentType = home?.type || "page";
  const homeSlug = home?.slug || "home";
  const localeUrls = ci.getLocaleUrls(homeSlug, contentType);
  const defaultLocale = getDefaultLocale(contentRoot ?? ci.contentRoot);

  let target: string | null = null;

  if (normalized === "/" || normalized === "/us") {
    target =
      localeUrls[defaultLocale] ||
      localeUrls.en ||
      ci.buildUrl(contentType, defaultLocale, homeSlug);
  } else if (normalized === "/en") {
    target = localeUrls.en || ci.buildUrl(contentType, "en", homeSlug);
  } else if (normalized === "/es" || normalized === "/es/home") {
    target = localeUrls.es || ci.buildUrl(contentType, "es", homeSlug);
  } else {
    const m = normalized.match(/^\/([a-z]{2}(?:-[a-z0-9]+)?)$/i);
    if (m) {
      const loc = m[1].toLowerCase();
      target = localeUrls[loc] || ci.buildUrl(contentType, loc, homeSlug);
    }
  }

  if (!target || typeof target !== "string") return null;
  const targetNorm = normalizePublicPath(target);
  if (!targetNorm || targetNorm === normalized) return null;
  return target.startsWith("/") ? target.split("?")[0] : `/${target.split("?")[0]}`;
}
