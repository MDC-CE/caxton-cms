/**
 * Schema.org fragment for a public page. The visitor middleware and Sidequest
 * both call this so the stored HTML matches a live render.
 */

import { getLocaleKey } from "./content-types";
import type { ContentIndex } from "./content-index";
import type { DatabaseManager } from "./database";
import { child } from "./logger";
import { queryEntries } from "./query-entries";
import { getDefaultLocale } from "./settings";
import {
  generateDatabaseSsrHtml,
  generateListingSsrHtml,
  generateSsrSchemaHtml,
  resolvePageRobots,
} from "./ssr-schema";

const log = child({ module: "public-page-schema" });

export type PublicPageHead = {
  schemaHtml: string;
  robotsDirective: string;
  isBlogRoute: boolean;
};

export async function publicPageHead(
  url: string,
  ci: ContentIndex,
  db: DatabaseManager,
  contentRoot: string,
): Promise<PublicPageHead> {
  const cleanUrl = url.split("?")[0].split("#")[0];
  const resolved = ci.resolveUrl(cleanUrl);
  const isDatabaseRoute = !!(resolved && resolved.fromDatabase);
  const listingResolved = !isDatabaseRoute ? ci.resolveListingUrl(cleanUrl) : null;
  const isListingRoute = !!listingResolved;
  const blogUrlMatch = !isDatabaseRoute
    ? cleanUrl.match(/^\/(en|es)\/blog\/[^/]+\/([^/?#]+)$/)
    : null;

  let schemaHtml = "";
  let robotsDirective = "index, follow";

  if (isDatabaseRoute && resolved) {
    try {
      const locale =
        resolved.patternLocale && resolved.patternLocale !== "default"
          ? resolved.patternLocale
          : getDefaultLocale();
      const { items: posts } = await queryEntries(
        {
          from: { contentType: resolved.contentType },
          locale,
          filters: [{ field: "slug", value: resolved.slug }],
          limit: 5,
        },
        { db, contentIndex: ci, contentRoot },
      );
      const localeKey = getLocaleKey(resolved.contentType, contentRoot) || "lang";
      const post =
        posts.find((p) => p.slug === resolved.slug && (p as Record<string, unknown>)[localeKey] === locale) ||
        posts.find((p) => p.slug === resolved.slug);
      if (post) {
        schemaHtml = await generateDatabaseSsrHtml(
          resolved.contentType,
          post as Record<string, unknown>,
          locale,
          ci,
          contentRoot,
        );
        if (typeof (post as { robots?: unknown }).robots === "string") {
          robotsDirective = (post as { robots: string }).robots;
        }
      }
    } catch (err) {
      log.error({ err, url }, "schema for database route failed");
    }
  } else if (isListingRoute && listingResolved) {
    schemaHtml = generateListingSsrHtml(listingResolved.contentType, listingResolved.locale, contentRoot);
  } else if (blogUrlMatch) {
    try {
      const locale = blogUrlMatch[1];
      const slug = blogUrlMatch[2];
      const { items: posts } = await queryEntries(
        {
          from: { contentType: "blog" },
          locale,
          filters: [{ field: "slug", value: slug }],
          limit: 5,
        },
        { db, contentIndex: ci, contentRoot },
      );
      const localeKey = getLocaleKey("blog", contentRoot) || "lang";
      const post =
        posts.find((p) => p.slug === slug && (p as Record<string, unknown>)[localeKey] === locale) ||
        posts.find((p) => p.slug === slug);
      if (post) {
        schemaHtml = await generateDatabaseSsrHtml("blog", post as Record<string, unknown>, locale, ci, contentRoot);
        if (typeof (post as { robots?: unknown }).robots === "string") {
          robotsDirective = (post as { robots: string }).robots;
        }
      }
    } catch (err) {
      log.error({ err, url }, "schema for blog route failed");
    }
  } else {
    schemaHtml = await generateSsrSchemaHtml(url, ci, contentRoot);
    robotsDirective = resolvePageRobots(url, ci, contentRoot);
  }

  return {
    schemaHtml,
    robotsDirective,
    isBlogRoute: isDatabaseRoute || isListingRoute || !!blogUrlMatch,
  };
}
