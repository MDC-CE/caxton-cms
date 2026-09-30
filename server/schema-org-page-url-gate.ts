/**
 * Publish-time check: page-identity schema_org sections must not carry a typed
 * url / @id that names a different page on this site.
 */

import {
  findSchemaOrgPageUrlMismatches,
  formatSchemaOrgPageUrlMismatch,
  homeAliasPaths,
  type SchemaOrgPageUrlMismatch,
} from "@shared/schema-org-page-url";
import { resolveContentTypeUrl } from "./content-types";
import { contentIndex } from "./content-index";
import { getDefaultContentRoot } from "./site-config";
import { getSiteHosts } from "./site-urls";
import path from "path";

export const SCHEMA_ORG_PAGE_URL_MISMATCH_CODE = "schema_org_page_url_mismatch" as const;

function isDefaultRoot(contentRoot?: string): boolean {
  if (!contentRoot) return true;
  try {
    return path.basename(path.resolve(contentRoot)) === path.basename(path.resolve(getDefaultContentRoot()));
  } catch {
    return false;
  }
}

/** Own address(es) for the page being published: from the content itself, then the live index. */
export function resolveExpectedPagePaths(opts: {
  contentType: string;
  slug: string;
  locale: string;
  pageData: Record<string, unknown>;
  canonicalUrl?: unknown;
  contentRoot?: string;
}): string[] {
  const out: string[] = [];
  const pageSlug =
    typeof opts.pageData.slug === "string" && opts.pageData.slug.trim() ? opts.pageData.slug.trim() : opts.slug;
  try {
    const fromDraft = resolveContentTypeUrl(
      opts.contentType,
      { ...opts.pageData, slug: pageSlug },
      opts.locale,
      opts.contentRoot,
    );
    if (fromDraft && !fromDraft.includes(":") && !fromDraft.includes("//")) out.push(fromDraft);
  } catch {
    /* unresolvable pattern → rely on index */
  }
  if (isDefaultRoot(opts.contentRoot)) {
    try {
      const live = contentIndex.getLocaleUrls(opts.slug, opts.contentType, { includeEmptyLocales: true })[
        opts.locale
      ];
      if (live) out.push(live);
    } catch {
      /* index not ready */
    }
  }
  if (out.length === 0) return out;
  if (typeof opts.canonicalUrl === "string" && opts.canonicalUrl.trim()) out.push(opts.canonicalUrl.trim());
  if (opts.slug === "home") out.push(...homeAliasPaths(opts.locale));
  return out;
}

export function findSchemaOrgPageUrlGateMismatches(opts: {
  sections: unknown;
  contentType: string;
  slug: string;
  locale: string;
  pageData: Record<string, unknown>;
  canonicalUrl?: unknown;
  contentRoot?: string;
}): SchemaOrgPageUrlMismatch[] {
  const expectedPaths = resolveExpectedPagePaths(opts);
  if (expectedPaths.length === 0) return [];
  return findSchemaOrgPageUrlMismatches({
    sections: opts.sections,
    expectedPaths,
    siteHosts: getSiteHosts(),
    locale: opts.locale,
  });
}

/** Plain-English gate message, or null when every page-type url matches (or none is typed). */
export function formatSchemaOrgPageUrlGateError(mismatches: SchemaOrgPageUrlMismatch[]): string | null {
  if (mismatches.length === 0) return null;
  const lines = mismatches.map(formatSchemaOrgPageUrlMismatch).join("; ");
  return (
    `SCHEMA_ORG_PAGE_URL_MISMATCH: this page's structured data points to a different address (${lines}). ` +
    "Remove the url from the Schema.org section; the page address is filled in automatically."
  );
}
