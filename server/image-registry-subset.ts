/**
 * Builds the per-page image-registry subset used for SSR hydration and
 * edit-mode "visitor blank" detection.
 *
 * Must match runtime lookups in UniversalImage + LogoItem (fallbacks, both
 * menu locales, brand.logo / brand.logo_dark).
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { getDefaultLocale } from "./settings";
import { resolveAllTemplateVars } from "./resolve-template-vars";
import { getVariableManager } from "./variable-manager";
import { resolveLayout } from "./content-types";
import type { ContentIndex } from "./content-index";

/** Fallback used by LogoItem when menu YAML omits imageId (e.g. localized menus). */
export const DEFAULT_NAVBAR_LOGO_ID = "4geeks-devs-logo-1763162063433";

const IMAGE_URL_PATTERN = /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i;

/** Matches snake_case `image_id` / `*_image_id` and camelCase `imageId` / `imageIdDark`. */
const IMAGE_ID_KEY_PATTERN = /(?:^|_)image_id$|^imageId$|^imageIdDark$/;

export interface ImageRefs {
  ids: Map<string, string | undefined>;
  directUrls: Set<string>;
}

export function createEmptyImageRefs(): ImageRefs {
  return { ids: new Map(), directUrls: new Set() };
}

function addId(refs: ImageRefs, id: string | undefined | null, preset?: string): void {
  if (!id || typeof id !== "string") return;
  const trimmed = id.trim();
  if (!trimmed) return;
  if (!refs.ids.has(trimmed)) refs.ids.set(trimmed, preset);
}

/**
 * Collect image registry ids / direct URLs from an arbitrary content tree
 * (page data, menu payloads, variables).
 */
export function extractImageRefsFromValue(
  value: unknown,
  refs: ImageRefs,
  _parentKey?: string,
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) extractImageRefsFromValue(item, refs, _parentKey);
    return;
  }
  const obj = value as Record<string, unknown>;

  if (typeof obj.id === "string") {
    const hasImageContext =
      typeof obj.alt === "string" ||
      typeof obj.preset === "string" ||
      typeof obj.src === "string";
    if (hasImageContext) {
      const preset = typeof obj.preset === "string" ? obj.preset : undefined;
      addId(refs, obj.id, preset);
    }
  }

  if (typeof obj.image === "object" && obj.image !== null) {
    const img = obj.image as Record<string, unknown>;
    if (typeof img.id === "string") {
      const preset = typeof img.preset === "string" ? img.preset : undefined;
      addId(refs, img.id, preset);
    }
  }

  // Navbar Logo items — mirror LogoItem resolution so the subset includes
  // every id the header can look up at runtime.
  if (obj.component === "Logo") {
    const imageId =
      typeof obj.imageId === "string" && obj.imageId.trim()
        ? obj.imageId.trim()
        : undefined;
    const imageIdDark =
      typeof obj.imageIdDark === "string" && obj.imageIdDark.trim()
        ? obj.imageIdDark.trim()
        : undefined;
    addId(refs, imageId);
    addId(refs, imageIdDark);
    // Always seed the hardcoded fallback — LogoItem uses it when imageId is omitted
    addId(refs, DEFAULT_NAVBAR_LOGO_ID);
  }

  if (typeof obj.src === "string" && obj.src.startsWith("http") && IMAGE_URL_PATTERN.test(obj.src)) {
    refs.directUrls.add(obj.src);
  }

  for (const [key, v] of Object.entries(obj)) {
    if (typeof v === "string" && IMAGE_ID_KEY_PATTERN.test(key)) {
      addId(refs, v);
    } else {
      extractImageRefsFromValue(v, refs, key);
    }
  }
}

/**
 * Seed brand.logo / brand.logo_dark defaults from the variables definitions map
 * (same shape as `/api/variables`).
 */
export function extractBrandLogoRefsFromVariables(
  variables: unknown,
  refs: ImageRefs,
): void {
  if (!variables || typeof variables !== "object") return;
  const defs = variables as Record<string, { default?: string } | undefined>;
  for (const key of ["brand.logo", "brand.logo_dark"] as const) {
    const def = defs[key];
    if (typeof def?.default === "string" && def.default.trim()) {
      addId(refs, def.default);
    }
  }
  addId(refs, DEFAULT_NAVBAR_LOGO_ID);
}

export type ImageRegistryLike = {
  presets?: Record<string, unknown>;
  images: Record<string, unknown>;
  tagDefinitions?: unknown;
};

/**
 * Build a slim registry containing only images referenced by page + extras
 * (menus, variables). Presets are always kept (small; UniversalImage needs them).
 */
export function buildPageImageRegistrySubset(
  fullRegistry: ImageRegistryLike,
  pageData: unknown,
  extraData: unknown[],
  options?: { variables?: unknown },
): ImageRegistryLike {
  const refs = createEmptyImageRefs();
  extractImageRefsFromValue(pageData, refs);
  for (const extra of extraData) {
    extractImageRefsFromValue(extra, refs);
  }
  if (options?.variables !== undefined) {
    extractBrandLogoRefsFromVariables(options.variables, refs);
  } else {
    addId(refs, DEFAULT_NAVBAR_LOGO_ID);
  }

  const images: Record<string, unknown> = {};
  const srcToId = new Map<string, string>();
  for (const [id, entry] of Object.entries(fullRegistry.images || {})) {
    const src = (entry as { src?: string })?.src;
    if (src) srcToId.set(src, id);
  }

  for (const id of refs.ids.keys()) {
    if (fullRegistry.images[id]) images[id] = fullRegistry.images[id];
  }
  for (const url of refs.directUrls) {
    const id = srcToId.get(url);
    if (id && fullRegistry.images[id]) images[id] = fullRegistry.images[id];
  }

  return {
    presets: fullRegistry.presets ?? {},
    images: images as typeof fullRegistry.images,
    ...(fullRegistry.tagDefinitions
      ? { tagDefinitions: fullRegistry.tagDefinitions }
      : {}),
  };
}

/** Load a resolved menu payload for subset scanning (same shape as SSR menu query data). */
export function loadMenuDataForSubset(
  menuId: string,
  locale: string,
  contentRoot: string,
): unknown | null {
  try {
    const menusDir = path.join(contentRoot, "menus");
    let filePath: string | null = null;
    const defaultLocale = getDefaultLocale();

    if (locale && locale !== defaultLocale) {
      const localizedBase = `${menuId}.${locale}`;
      const localizedYml = path.join(menusDir, `${localizedBase}.yml`);
      const localizedYaml = path.join(menusDir, `${localizedBase}.yaml`);
      if (fs.existsSync(localizedYml)) filePath = localizedYml;
      else if (fs.existsSync(localizedYaml)) filePath = localizedYaml;
    }

    if (!filePath) {
      const baseYml = path.join(menusDir, `${menuId}.yml`);
      const baseYaml = path.join(menusDir, `${menuId}.yaml`);
      if (fs.existsSync(baseYml)) filePath = baseYml;
      else if (fs.existsSync(baseYaml)) filePath = baseYaml;
    }

    if (!filePath) return null;

    const content = fs.readFileSync(filePath, "utf-8");
    const data = yaml.load(content);
    const resolved = resolveAllTemplateVars(data, {
      contentRoot,
      context: { locale },
      skipSiteVars: false,
    });
    return { name: menuId, locale, data: resolved };
  } catch {
    return null;
  }
}

/**
 * Build the visitor-facing image registry subset for a content entry.
 * Used by GET /api/image-registry/visitor-subset and mirrors SSR subset rules.
 */
export function buildVisitorImageRegistrySubset(opts: {
  fullRegistry: ImageRegistryLike;
  contentType: string;
  slug: string;
  locale: string;
  contentRoot: string;
  contentIndex: ContentIndex;
  /** Extra URL-inferred locale when it differs from content locale (e.g. "en"). */
  urlLocale?: string;
}): ImageRegistryLike {
  const {
    fullRegistry,
    contentType,
    slug,
    locale,
    contentRoot,
    contentIndex,
    urlLocale,
  } = opts;

  let pageData: unknown = null;
  try {
    const result = contentIndex.loadContent({
      contentType: contentType as any,
      slug,
      localeOrVariant: locale,
    });
    if (result.success) {
      pageData = result.data;
      const raw = contentIndex.loadMergedContent(contentType as any, slug, locale);
      const layout = resolveLayout(
        contentType,
        raw.data || (pageData as Record<string, unknown>),
        contentRoot,
      );
      if (pageData && typeof pageData === "object") {
        (pageData as Record<string, unknown>).layout = layout;
        (pageData as Record<string, unknown>).locale = locale;
      }
    }
  } catch {
    pageData = null;
  }

  const layout = (pageData as { layout?: { menu?: { top?: string | null; bottom?: string | null } } } | null)
    ?.layout;
  const topMenuId = layout?.menu?.top ?? "main-navbar";
  const bottomMenuId = layout?.menu?.bottom ?? "main-footer";

  const locales = new Set<string>([locale]);
  if (urlLocale) locales.add(urlLocale);
  locales.add(getDefaultLocale());

  const menuDatas: unknown[] = [];
  for (const menuLocale of locales) {
    if (topMenuId) {
      const m = loadMenuDataForSubset(topMenuId, menuLocale, contentRoot);
      if (m) menuDatas.push(m);
    }
    if (bottomMenuId) {
      const m = loadMenuDataForSubset(bottomMenuId, menuLocale, contentRoot);
      if (m) menuDatas.push(m);
    }
  }

  const variables = getVariableManager(contentRoot).getDefinitions();

  return buildPageImageRegistrySubset(fullRegistry, pageData, menuDatas, { variables });
}
