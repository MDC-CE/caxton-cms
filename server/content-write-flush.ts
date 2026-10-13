/**
 * Shared post-write flush for content edits (single-edit and bulk-meta).
 * Call immediately after one successful edit, or once at end of a bulk batch.
 *
 * Default path is non-blocking: scanFast + coalesced background scanSlow,
 * path-scoped HTML bust (no full HTML cache clear). Pass syncSlow when the
 * written file(s) change redirects.
 */

import type { ContentIndex } from "./content-index";
import { clearRedirectCache, toPublicUrlPath } from "./redirects";
import {
  refreshSitemapEntry,
  refreshSitemapEntriesForContentKey,
} from "./sitemap";
import { invalidateContentCachesWithoutHtml } from "./routes/_helpers";
import { getSupportedLocales } from "./settings";
import { listAttachedEntries } from "./shared-layout-entry";
import { isSharedTemplateBasename } from "./shared-layout-paths";
import { localeFromYamlFilename } from "./raw-file-explain";
import * as fs from "fs";
import * as path from "path";

export type SitemapFlushEntry = {
  contentType: string;
  slug: string;
  locale: string;
};

export type FlushAfterContentWritesOpts = {
  ci: ContentIndex;
  /** Distinct content types touched (cache invalidation). */
  contentTypes: Iterable<string>;
  /** Entries that need sitemap refresh. */
  sitemapEntries: SitemapFlushEntry[];
  /**
   * When true (common-meta / _common.yml touched), refresh all locales per
   * content key instead of a single locale row.
   */
  commonMetaTouched?: boolean;
  /**
   * Site id for HTML cache keys (contentRootName — same as render-hub-html).
   * Required for path-scoped HTML bust.
   */
  siteId?: string;
  /** Public pathnames to rebuild in the HTML page cache (all hot variants per path). */
  htmlPaths?: string[];
  /**
   * `paths` (default) keeps each saved URL and rebuilds it in the background.
   * `hot` rebuilds every URL already in memory (menu, theme).
   */
  htmlScope?: "paths" | "hot";
  /** When true, run sync slow scan (redirect-critical writes). */
  syncSlow?: boolean;
  /** Relative or absolute paths written — triggers single-entry upsert (no full scan). */
  savedFilePaths?: string[];
  /**
   * Files from a pull or another batch. Entries rebuild their URL and the pages
   * that list that type. `db/<name>/…` rebuilds pages that read that database.
   * A shared template file is not an entry: the caller passes those public paths.
   */
  touchedFiles?: string[];
  /** Database slugs whose readers should rebuild, when the caller already knows them. */
  databaseNames?: string[];
  /** Row slugs whose cached public URL should rebuild like a normal page save. */
  htmlSlugs?: string[];
};

export type ClassifiedContentTouch = {
  contentTypes: string[];
  htmlPaths: string[];
  databaseNames: string[];
};

/** Turn pulled or written paths into the content types, public URLs, and databases they affect. */
export function classifyTouchedContentFiles(
  ci: ContentIndex,
  files: string[],
): ClassifiedContentTouch {
  const rootName = path.basename(ci.contentRoot);
  const types = new Set<string>();
  const dbs = new Set<string>();
  const htmlPaths: string[] = [];
  for (const file of files) {
    let rel = file.split("\\").join("/");
    const prefix = `${rootName}/`;
    if (rel.startsWith(prefix)) rel = rel.slice(prefix.length);
    else if (path.isAbsolute(rel)) rel = path.relative(ci.contentRoot, rel).split("\\").join("/");
    const parts = rel.split("/").filter(Boolean);
    if (parts[0] === "db" && parts[1]) {
      dbs.add(parts[1]);
      continue;
    }
    if (parts.length < 2) continue;
    if (!ci.getContentTypeConfig(parts[0])) continue;
    const fileName = parts[parts.length - 1];
    if (parts.length === 2 && isSharedTemplateBasename(fileName)) continue;
    const slugPart = parts[1];
    if (
      slugPart.startsWith("_") ||
      slugPart === "single" ||
      slugPart === "template" ||
      slugPart === "versioning.yml"
    ) {
      continue;
    }
    const slug = slugPart.replace(/\.(yml|yaml)$/i, "");
    if (!slug || slug.startsWith("_")) continue;
    const contentType = ci.normalizeType(parts[0]);
    types.add(contentType);
    htmlPaths.push(
      ...collectEntryHtmlPaths(ci, contentType, slug, localeFromYamlFilename(fileName) ?? undefined),
    );
  }
  return {
    contentTypes: [...types],
    htmlPaths: [...new Set(htmlPaths)],
    databaseNames: [...dbs],
  };
}

/**
 * Coalesce expensive post-write side effects: redirect cache, CI refresh,
 * content caches, sitemap, path-scoped HTML. Does not mark files modified
 * or enqueue previews.
 */
export function flushAfterContentWrites(opts: FlushAfterContentWritesOpts): void {
  const classified = opts.touchedFiles?.length
    ? classifyTouchedContentFiles(opts.ci, opts.touchedFiles)
    : { contentTypes: [] as string[], htmlPaths: [] as string[], databaseNames: [] as string[] };
  const types = [...new Set([...opts.contentTypes, ...classified.contentTypes].filter(Boolean))];
  clearRedirectCache();

  if (opts.syncSlow === true) {
    opts.ci.refresh({ syncSlow: true });
  } else if (opts.savedFilePaths?.length) {
    for (const fp of opts.savedFilePaths) {
      try {
        opts.ci.upsertEntry(fp);
      } catch {
        /* non-fatal */
      }
    }
  }

  if (types.length === 0) {
    invalidateContentCachesWithoutHtml(undefined, opts.ci);
  } else {
    for (const contentType of types) {
      invalidateContentCachesWithoutHtml(contentType, opts.ci);
    }
  }

  const siteId = opts.siteId;
  const paths = [...new Set([...(opts.htmlPaths?.filter(Boolean) ?? []), ...classified.htmlPaths])];
  const databaseNames = [...new Set([...(opts.databaseNames ?? []), ...classified.databaseNames].filter(Boolean))];
  const htmlSlugs = [...new Set((opts.htmlSlugs ?? []).map((slug) => slug.trim()).filter(Boolean))];
  const contentRoot = opts.ci.contentRoot;
  if (siteId && opts.htmlScope === "hot") {
    void import("./html-rebuild")
      .then(({ scheduleHotHtmlRebuild }) => {
        scheduleHotHtmlRebuild("hot", contentRoot);
      })
      .catch(() => {});
  } else if (siteId) {
    void import("./html-rebuild")
      .then(({
        scheduleSavedHtmlPaths,
        scheduleContentTypeListingRebuild,
        scheduleDatabaseReaderRebuild,
        scheduleCachedSlugHtmlRebuild,
      }) => {
        if (paths.length > 0) scheduleSavedHtmlPaths(siteId, paths, contentRoot);
        for (const contentType of types) {
          scheduleContentTypeListingRebuild({ siteId, contentRoot, contentType });
        }
        for (const dbName of databaseNames) {
          scheduleDatabaseReaderRebuild({ siteId, contentRoot, dbName });
        }
        for (const slug of htmlSlugs) {
          scheduleCachedSlugHtmlRebuild(siteId, slug, contentRoot);
        }
      })
      .catch(() => {});
  }

  const locales = getSupportedLocales();
  const seenKeys = new Set<string>();
  for (const entry of opts.sitemapEntries) {
    if (opts.commonMetaTouched) {
      const key = `${entry.contentType}/${entry.slug}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      refreshSitemapEntriesForContentKey(entry.contentType, entry.slug, locales);
    } else {
      const key = `${entry.contentType}/${entry.slug}/${entry.locale}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      refreshSitemapEntry(entry.contentType, entry.slug, entry.locale);
    }
  }
}

/** True when YAML content likely defines redirects (meta or top-level). */
export function yamlMentionsRedirects(raw: string): boolean {
  return (
    /(^|\n)\s*redirects\s*:/.test(raw) ||
    /\nmeta:[\s\S]*?redirects\s*:/.test(raw)
  );
}

/** Read a content file and detect redirect keys (missing file → false). */
export function fileMentionsRedirects(absOrRelPath: string): boolean {
  try {
    const abs = path.isAbsolute(absOrRelPath)
      ? absOrRelPath
      : path.join(process.cwd(), absOrRelPath);
    if (!fs.existsSync(abs)) return false;
    return yamlMentionsRedirects(fs.readFileSync(abs, "utf-8"));
  } catch {
    return false;
  }
}

/** Public URLs of entries that still use this content type's shared template. */
export function collectAttachedHtmlPaths(
  ci: ContentIndex,
  contentType: string,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const locale of getSupportedLocales()) {
    for (const slug of listAttachedEntries(contentType, locale, ci.contentRoot)) {
      for (const pagePath of collectEntryHtmlPaths(ci, contentType, slug, locale)) {
        if (seen.has(pagePath)) continue;
        seen.add(pagePath);
        paths.push(pagePath);
      }
    }
  }
  return paths;
}

export function collectEntryHtmlPaths(
  ci: ContentIndex,
  contentType: string,
  slug: string,
  locale?: string,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw || typeof raw !== "string") return;
    const clean = toPublicUrlPath(raw);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    paths.push(clean);
  };

  try {
    const urls = ci.getAlternateUrls(slug, contentType);
    if (locale) {
      if (urls[locale]) add(urls[locale]);
    } else {
      for (const u of Object.values(urls)) add(u);
    }
  } catch {
    /* ignore */
  }

  if (paths.length === 0) {
    try {
      const loc = locale || "en";
      add(ci.buildUrl(contentType, loc, slug));
    } catch {
      /* ignore */
    }
  }

  // Home aliases when the canonical path is a locale home
  for (const p of [...paths]) {
    if (p === "/en" || p === "/en/" || p === "/en/home") {
      add("/");
      add("/en");
      add("/us");
    }
    if (p === "/es" || p === "/es/" || p === "/es/inicio") {
      add("/es");
      add("/es/home");
    }
  }

  return paths;
}
