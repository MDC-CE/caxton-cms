/**
 * Resolve the absolute canonical href for a page: non-empty meta.canonical_url
 * wins (path-only values get the site base URL); otherwise derive from the
 * content-type URL pattern. Listing ?page=N is applied via buildListingCanonicalHref.
 */

import { buildListingCanonicalHref } from "../shared/listing-canonical";
import { resolveContentTypeUrl } from "./content-types";
import { getBaseUrl } from "./hreflang";

export function normalizeCanonicalHref(raw: string, baseUrl: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("{{")) return "";
  const origin = baseUrl.replace(/\/$/, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return `${u.origin}${u.pathname}${u.search}`;
    } catch {
      return trimmed;
    }
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${origin}${path}`;
}

export function resolveEffectiveCanonical(opts: {
  meta?: Record<string, unknown> | null;
  contentType: string;
  record: Record<string, unknown>;
  locale: string;
  requestUrl?: string | null;
  contentRoot?: string;
  baseUrl?: string;
}): string | null {
  const baseUrl = (opts.baseUrl ?? getBaseUrl()).replace(/\/$/, "");
  const manual =
    typeof opts.meta?.canonical_url === "string" ? opts.meta.canonical_url : "";

  let baseCanonical = "";
  if (manual.trim() && !manual.includes("{{")) {
    baseCanonical = normalizeCanonicalHref(manual, baseUrl);
  } else {
    const urlPath = resolveContentTypeUrl(
      opts.contentType,
      opts.record,
      opts.locale,
      opts.contentRoot,
    );
    if (!urlPath || urlPath.includes(":") || urlPath.includes("undefined")) {
      return null;
    }
    baseCanonical = `${baseUrl}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
  }

  if (!baseCanonical) return null;
  return buildListingCanonicalHref(baseCanonical, opts.requestUrl);
}
