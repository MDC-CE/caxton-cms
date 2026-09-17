import type { ImageEntry, ImageRegistry } from "@shared/schema";
import type { SiteContext } from "./site-manager";
import { getDefaultSite, getSiteContextMap } from "./site-manager";

function normalizeFolder(folder: string): string {
  return folder.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Resolve which site's registry should be used when an image_id is missing
 * on the current site. Uses `fallback_content_folder` when set; otherwise
 * the default (first) site. Returns null when there is no distinct fallback
 * (e.g. current site is already the default / same folder).
 */
export function getFallbackSiteContext(site: SiteContext): SiteContext | null {
  const explicit = site.config.fallbackContentFolder?.trim();
  let fallback: SiteContext | null = null;

  if (explicit) {
    const want = normalizeFolder(explicit);
    for (const ctx of getSiteContextMap().values()) {
      if (normalizeFolder(ctx.config.contentFolder) === want) {
        fallback = ctx;
        break;
      }
    }
  } else {
    try {
      fallback = getDefaultSite();
    } catch {
      return null;
    }
  }

  if (!fallback) return null;
  if (fallback.contentRoot === site.contentRoot) return null;
  if (normalizeFolder(fallback.config.contentFolder) === normalizeFolder(site.config.contentFolder)) {
    return null;
  }
  return fallback;
}

/** Coerce registry maps; empty arrays (bad scaffold) become {}. */
function asRecord<T>(value: unknown): Record<string, T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, T>;
}

/** Shallow-merge registries: primary overlays fallback (primary wins on ID collision). */
export function mergeImageRegistries(
  fallback: ImageRegistry,
  primary: ImageRegistry,
): ImageRegistry {
  const merged: ImageRegistry = {
    presets: { ...asRecord(fallback.presets), ...asRecord(primary.presets) },
    images: { ...asRecord(fallback.images), ...asRecord(primary.images) },
  };

  const fallbackTags = asRecord(fallback.tagDefinitions);
  const primaryTags = asRecord(primary.tagDefinitions);
  if (Object.keys(fallbackTags).length > 0 || Object.keys(primaryTags).length > 0) {
    merged.tagDefinitions = { ...fallbackTags, ...primaryTags } as typeof merged.tagDefinitions;
  }

  return merged;
}

/**
 * Registry for rendering: current site entries overlay the fallback site's
 * registry when configured. Write/admin paths should keep using
 * `site.mediaGallery.getRegistry()` only.
 */
export function getMergedImageRegistry(site: SiteContext): ImageRegistry | null {
  const primary = site.mediaGallery.getRegistry();
  const emptyPrimary: ImageRegistry = primary ?? { presets: {}, images: {} };

  const fallbackSite = getFallbackSiteContext(site);
  if (!fallbackSite) {
    return primary;
  }

  const fallback = fallbackSite.mediaGallery.getRegistry();
  if (!fallback) {
    return primary;
  }

  if (!primary) {
    return mergeImageRegistries(fallback, emptyPrimary);
  }

  return mergeImageRegistries(fallback, primary);
}

export function resolveImageEntry(site: SiteContext, id: string): ImageEntry | null {
  const registry = getMergedImageRegistry(site);
  if (!registry) return null;
  return registry.images[id] ?? null;
}
