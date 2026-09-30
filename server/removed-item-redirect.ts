/**
 * When a page's source item is gone (or a static entry is deleted), its entry
 * folder is kept and validation suggests a redirect. The same rules apply to
 * every source.
 */

import fs from "fs";
import path from "path";
import { normalizePublicPath } from "@shared/public-app-routes";
import type { ContentIndex } from "./content-index";
import { entryLocaleFilePath } from "./entry-layer";
import { resolveLocaleHomeAliasTarget } from "./locale-home-alias";
import {
  contentRelPath,
  parseRedirectItem,
  readPageYaml,
  writePageYaml,
} from "./redirect-destination";
import { readSeoIndexFile, seoEntryId, type SeoIndex } from "./seo-index";

export type RemovedItemRedirectReason = "cluster_main_page" | "listing_page" | "home_page";

export type RemovedItemRedirect = { to: string; reason: RemovedItemRedirectReason };

export type InboundRedirect = {
  from: string;
  status: number;
  /** Content-root-relative file the address is saved in. */
  source: string;
  /** `_common.yml` addresses apply to every language of the removed page. */
  all_languages: boolean;
};

function isRedirectSource(ci: ContentIndex, url: string): boolean {
  const target = normalizePublicPath(url);
  return ci.getRedirects().some((r) => typeof r.from === "string" && normalizePublicPath(r.from) === target);
}

function usableTarget(ci: ContentIndex, url: string | null | undefined, opts?: { listing?: boolean }): string | null {
  if (!url) return null;
  const clean = url.startsWith("/") ? url : `/${url}`;
  const live = ci.isKnownUrl(clean) || (opts?.listing === true && ci.resolveListingUrl(clean) !== null);
  return live && !isRedirectSource(ci, clean) ? clean : null;
}

/**
 * Redirect target for a removed page, same language: the cluster main page
 * (seo `pillar_path` when live), then the type's listing page, then that
 * language's home page. Targets that are not live or are themselves redirect
 * sources are skipped.
 */
export function suggestRemovedItemRedirect(
  ci: ContentIndex,
  contentType: string,
  slug: string,
  locale: string,
  opts?: { seoIndex?: SeoIndex | null },
): RemovedItemRedirect {
  const seoIndex = opts?.seoIndex !== undefined ? opts.seoIndex : readSeoIndexFile(ci.contentRoot);
  const seo = seoIndex?.entries[seoEntryId(contentType, slug, locale)];
  const pillar = seo?.pillar_live ? usableTarget(ci, seo.pillar_path) : null;
  if (pillar) return { to: pillar, reason: "cluster_main_page" };

  const pattern = ci.getContentTypeConfig(contentType)?.url_pattern;
  const localePattern = pattern?.[locale] || pattern?.default;
  const listing = usableTarget(ci, localePattern?.replace(/\/:[^/]+.*$/, ""), { listing: true });
  if (listing) return { to: listing, reason: "listing_page" };

  const home = resolveLocaleHomeAliasTarget(`/${locale}`, ci) ?? resolveLocaleHomeAliasTarget("/", ci) ?? "/";
  return { to: home, reason: "home_page" };
}

function removedPageFiles(ci: ContentIndex, contentType: string, slug: string, locale: string) {
  const localeFile = entryLocaleFilePath(ci, contentType, slug, locale);
  return [
    { abs: localeFile, allLanguages: false },
    { abs: path.join(path.dirname(localeFile), "_common.yml"), allLanguages: true },
  ].filter((f) => fs.existsSync(f.abs));
}

/** Old addresses saved on the removed page (`{locale}.yml` and `_common.yml` `meta.redirects`). */
export function listInboundRedirects(
  ci: ContentIndex,
  contentType: string,
  slug: string,
  locale: string,
): InboundRedirect[] {
  const out: InboundRedirect[] = [];
  for (const file of removedPageFiles(ci, contentType, slug, locale)) {
    let redirects: unknown;
    try {
      redirects = (readPageYaml(file.abs).meta as Record<string, unknown> | undefined)?.redirects;
    } catch {
      continue;
    }
    if (!Array.isArray(redirects)) continue;
    for (const r of redirects) {
      const parsed = parseRedirectItem(r);
      if (!parsed) continue;
      out.push({
        from: parsed.path,
        status: parsed.status,
        source: contentRelPath(ci, file.abs),
        all_languages: file.allLanguages,
      });
    }
  }
  return out;
}

/**
 * Remove the listed addresses from the removed page's files so they only live
 * on the new target. Returns the files changed (absolute paths).
 */
export function removeInboundRedirects(
  ci: ContentIndex,
  contentType: string,
  slug: string,
  locale: string,
  fromPaths: string[],
): string[] {
  const drop = new Set(fromPaths.map((p) => p.toLowerCase()));
  const changed: string[] = [];
  for (const file of removedPageFiles(ci, contentType, slug, locale)) {
    const data = readPageYaml(file.abs);
    const meta = data.meta as Record<string, unknown> | undefined;
    if (!meta || !Array.isArray(meta.redirects)) continue;
    const kept = meta.redirects.filter((r) => {
      const parsed = parseRedirectItem(r);
      return !parsed || !drop.has(parsed.path.toLowerCase());
    });
    if (kept.length === meta.redirects.length) continue;
    if (kept.length > 0) meta.redirects = kept;
    else delete meta.redirects;
    writePageYaml(file.abs, data);
    changed.push(file.abs);
  }
  return changed;
}

/** `removed_entry` request body: `{ content_type, slug, locale }`. */
export function parseRemovedEntry(
  raw: unknown,
): { contentType: string; slug: string; locale: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const contentType = typeof r.content_type === "string" ? r.content_type.trim() : "";
  const slug = typeof r.slug === "string" ? r.slug.trim() : "";
  const locale = typeof r.locale === "string" ? r.locale.trim() : "";
  return contentType && slug && locale ? { contentType, slug, locale } : null;
}
