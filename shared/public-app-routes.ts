/**
 * Public app route allowlists shared by HTML status and redirect overwrite checks.
 *
 * - PUBLIC_HTML_STATIC: paths that return HTTP 200 without consulting the content index
 *   (not locale-home aliases — those 301 to canonical homes).
 * - LOCALE_HOME_ALIASES: bare locale / legacy home paths that must 301 to the
 *   canonical homepage per locale (e.g. /en/home, /es/inicio). Never treat as live content.
 */

/** Paths served as public HTML without a content-index lookup. */
export const PUBLIC_HTML_STATIC: readonly string[] = [
  "/en/apply",
  "/es/aplica",
  "/terms-conditions",
  "/terminos-condiciones",
  "/privacy-policy",
  "/politica-privacidad",
  "/preview-frame",
];

/**
 * Locale / legacy home aliases (exact paths after mild normalization).
 * Trailing-slash variants are accepted by {@link isLocaleHomeAlias}.
 * Includes `/es/home` (legacy ES path that must 301 to `/es/inicio`).
 */
export const LOCALE_HOME_ALIASES: readonly string[] = [
  "/",
  "/en",
  "/es",
  "/us",
  "/es/home",
];

/** Normalize for alias / static lookups: drop query/hash, lowercase, strip trailing slash (except `/`). */
export function normalizePublicPath(url: string): string {
  let path = url.split("?")[0].split("#")[0];
  path = path.startsWith("/") ? path : `/${path}`;
  path = path.toLowerCase();
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path || "/";
}

const localeHomeAliasSet = new Set(
  LOCALE_HOME_ALIASES.map((p) => normalizePublicPath(p)),
);

const publicHtmlStaticSet = new Set(
  PUBLIC_HTML_STATIC.map((p) => normalizePublicPath(p)),
);

/** True when this path is a locale-home alias (must not count as live overwrite content). */
export function isLocaleHomeAlias(url: string): boolean {
  return localeHomeAliasSet.has(normalizePublicPath(url));
}

/** True when this path is in the public HTML static allowlist. */
export function isPublicHtmlStaticPath(url: string): boolean {
  const path = url.split("?")[0].split("#")[0];
  if (publicHtmlStaticSet.has(normalizePublicPath(path))) return true;
  // Preserve exact trailing-slash forms that callers may pass before normalize
  // (e.g. historical STATIC_HTML_ROUTES had "/en/" — aliases handle those via isLocaleHomeAlias).
  return PUBLIC_HTML_STATIC.includes(path);
}

/** Set of static HTML paths including common trailing-slash duplicates for Set.has callers. */
export function buildStaticHtmlRoutesSet(): Set<string> {
  const set = new Set<string>();
  for (const p of PUBLIC_HTML_STATIC) {
    set.add(p);
    if (p.length > 1 && !p.endsWith("/")) set.add(`${p}/`);
  }
  return set;
}
