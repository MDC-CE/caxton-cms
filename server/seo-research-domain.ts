/**
 * Resolve “our” research domain: Search Console property → sites.yml domain.
 * Never use tunnel SITE_URL.
 */

import { getSearchConsoleSettings } from "./settings";
import { getSiteConfigs } from "./site-config";
import { normalizePageUrl } from "./gsc-keep-filter";

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Prefer search_console.site_url (https or sc-domain:), else sites.yml domain for content folder.
 */
export function resolveSeoResearchDomain(opts: {
  contentRoot?: string;
  contentFolder?: string;
  override?: string;
}): string | null {
  const override = typeof opts.override === "string" ? opts.override.trim() : "";
  if (override) {
    try {
      const withProto = /^https?:\/\//i.test(override) ? override : `https://${override}`;
      const host = new URL(withProto).hostname;
      return host ? stripWww(host) : stripWww(override);
    } catch {
      return stripWww(override);
    }
  }

  const sc = getSearchConsoleSettings(opts.contentRoot).site_url;
  if (sc) {
    const trimmed = sc.trim();
    if (trimmed.toLowerCase().startsWith("sc-domain:")) {
      return stripWww(trimmed.slice("sc-domain:".length));
    }
    const loc = normalizePageUrl(trimmed);
    if (loc?.host) return stripWww(loc.host);
  }

  const folder = opts.contentFolder?.trim();
  if (folder) {
    const match = getSiteConfigs().find((c) => c.contentFolder === folder);
    if (match?.domain) return stripWww(match.domain);
  }

  const first = getSiteConfigs()[0];
  return first?.domain ? stripWww(first.domain) : null;
}
