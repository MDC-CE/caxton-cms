/**
 * SEO write-layer rules: live locale, or any draft (0% traffic).
 * A/B experiment variants cannot change seo:. Promote applies the draft's seo:.
 */

import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_DRAFT_VARIANT,
  getEntryContentDir,
  hasAnyLiveLocale,
} from "./draft-entry";
import { isTemplateVersioningSlug } from "./shared-layout-entry";
import {
  readSeoBlockFromYamlText,
  surgicalReplaceSeoBlock,
  yamlHasSeoKey,
  type SeoBlock,
} from "./seo-fields";
import { variantHasTraffic } from "./versioning/variant-traffic";

export const SEO_VARIANT_FORBIDDEN = "seo_variant_forbidden";

export type SeoWriteLayerOk = {
  ok: true;
  layer: "live" | "draft" | "draft_unpublished";
};

export type SeoWriteLayerErr = {
  ok: false;
  code: typeof SEO_VARIANT_FORBIDDEN;
  error: string;
  statusCode: 400;
};

export type SeoWriteLayerResult = SeoWriteLayerOk | SeoWriteLayerErr;

function normalizeVariant(variant?: string | null): string | null {
  if (typeof variant !== "string") return null;
  const v = variant.trim();
  if (!v || v === "default") return null;
  return v;
}

/** Whether this entry folder already has any live `{locale}.yml`. */
export function entryHasAnyLiveLocale(
  contentType: string,
  slug: string,
  contentRoot?: string,
): boolean {
  const dir = getEntryContentDir(contentType, slug, contentRoot);
  return hasAnyLiveLocale(dir, isTemplateVersioningSlug(slug));
}

/**
 * Cluster SEO may be written on live `{locale}.yml` or on any draft (a variant at 0%
 * traffic, registered or not), published locale or not. Experiments (traffic > 0)
 * cannot change seo:.
 */
export function assertSeoWriteLayerAllowed(opts: {
  contentType: string;
  slug: string;
  locale: string;
  variant?: string | null;
  contentRoot?: string;
}): SeoWriteLayerResult {
  const variant = normalizeVariant(opts.variant);
  if (!variant) {
    return { ok: true, layer: "live" };
  }

  const hasTraffic = variantHasTraffic({
    contentType: opts.contentType,
    slug: opts.slug,
    locale: opts.locale,
    variant,
    contentRoot: opts.contentRoot,
  });
  if (!hasTraffic) {
    const hasLive = entryHasAnyLiveLocale(opts.contentType, opts.slug, opts.contentRoot);
    return { ok: true, layer: hasLive ? "draft" : "draft_unpublished" };
  }

  return {
    ok: false,
    code: SEO_VARIANT_FORBIDDEN,
    statusCode: 400,
    error:
      "Cluster SEO cannot be edited on experiment variants (traffic > 0). Edit a draft (0% traffic) or the live locale.",
  };
}

/**
 * Promote: the draft's `seo:` replaces the live one. When the draft carries no
 * `seo:`, the live block is kept.
 */
export function yamlForPromotePreservingLiveSeo(
  variantContent: string,
  liveContent: string | null,
): { content: string; ignoredVariantSeo: boolean } {
  if (!liveContent || yamlHasSeoKey(variantContent) || !yamlHasSeoKey(liveContent)) {
    return { content: variantContent, ignoredVariantSeo: false };
  }
  const liveSeo = readSeoBlockFromYamlText(liveContent) as SeoBlock;
  return { content: surgicalReplaceSeoBlock(variantContent, liveSeo), ignoredVariantSeo: false };
}

/** Basename helpers for tests / UI. */
export function isDraftVariantName(variant?: string | null): boolean {
  return normalizeVariant(variant) === DEFAULT_DRAFT_VARIANT;
}

export function seoWriteLayerAllowedForUi(opts: {
  contentType: string;
  slug: string;
  isVariantLayer: boolean;
  resolvedVariant?: string | null;
  contentRoot?: string;
}): { allowed: boolean; reason?: string } {
  if (!opts.isVariantLayer) return { allowed: true };
  const gate = assertSeoWriteLayerAllowed({
    contentType: opts.contentType,
    slug: opts.slug,
    locale: "en",
    variant: opts.resolvedVariant ?? DEFAULT_DRAFT_VARIANT,
    contentRoot: opts.contentRoot,
  });
  if (gate.ok) return { allowed: true };
  return { allowed: false, reason: gate.error };
}

/** Resolve entry dir for tests without exporting draft-entry internals twice. */
export function entryDirForSeoWrite(
  contentType: string,
  slug: string,
  contentRoot?: string,
): string {
  return getEntryContentDir(contentType, slug, contentRoot);
}

export function liveLocalePathInEntry(entryDir: string, locale: string): string {
  return path.join(entryDir, `${locale}.yml`);
}

export function draftLocalePathInEntry(entryDir: string, locale: string): string {
  return path.join(entryDir, `${DEFAULT_DRAFT_VARIANT}.${locale}.yml`);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
