import { getOptimizationSettings } from "./settings";

/** Placeholder in client/index.html — replaced per-request from settings.yml. */
export const GTM_WEB_CONTAINER_ID_PLACEHOLDER = "__GTM_WEB_CONTAINER_ID__";

/**
 * Inject the configured web GTM container ID into the HTML shell.
 * Safe to call on every response (including HTML cache HITs) so settings
 * changes apply without busting the page cache. Does not change deferred
 * GTM load timing.
 */
export function injectGtmWebContainerId(html: string, contentRoot?: string): string {
  const id = getOptimizationSettings(contentRoot).tagmanager.web_container_id?.trim() || "";
  // Only GTM-XXXX or empty — never allow arbitrary injection into HTML.
  const safeId = /^GTM-[A-Z0-9]+$/.test(id) ? id : "";

  if (html.includes(GTM_WEB_CONTAINER_ID_PLACEHOLDER)) {
    return html.split(GTM_WEB_CONTAINER_ID_PLACEHOLDER).join(safeId);
  }

  // Fallback for HTML that already had a concrete ID baked in (e.g. older cache entries).
  let out = html.replace(
    /window\.__GTM_CONTAINER_ID__\s*=\s*"[^"]*"/,
    () => `window.__GTM_CONTAINER_ID__ = "${safeId}"`,
  );
  out = out.replace(
    /(https:\/\/www\.googletagmanager\.com\/ns\.html\?id=)[^"&\s]*/g,
    (_m, prefix: string) => prefix + safeId,
  );
  return out;
}
