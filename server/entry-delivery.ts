/**
 * Delivery read for any entry (static or database item): refresh the source copy when
 * expired, merge through `loadEntry`, then the network steps a rendered page needs
 * (markdown body from `content_url` / `readme_url`, relations, live requests).
 */

import type { ContentIndex } from "./content-index";
import type { TemplatePage } from "@shared/schema";
import { buildSingleEntryFromContent } from "./build-single-entry";
import { applyComponentImageSizes, applyComponentSectionDefaults } from "./component-registry";
import { attachVariableFieldsToSections } from "./database-single-loader";
import { loadEntry, refreshEntrySource, type LoadEntryOptions } from "./entry-layer";
import { hydrateEntryForDelivery } from "./hydrate-entry-delivery";
import { layoutInfoForEntry, typeUsesSharedTemplate } from "./layout-owner";
import { getContentTypeConfig } from "./content-types";
import { fetchMarkdownContent } from "./markdown";
import type { PerEntryAccum } from "./section-merge";

export type DeliveredEntry = {
  /** Merged page data; sections carry variable-field hints, component defaults and image sizes. */
  data: Record<string, unknown>;
  /** Values for `{{ entry.* }}`: the source item (hydrated) or the mapped fields of a static entry. */
  singleEntry?: Record<string, unknown>;
  detached: boolean;
  perEntryRemovedSections?: PerEntryAccum["removedSections"];
  staleSourceAgeMs?: number;
};

async function withMarkdownBody(entry: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (entry.content) return entry;
  for (const key of ["content_url", "readme_url"] as const) {
    const url = entry[key];
    if (typeof url !== "string" || !url) continue;
    const content = await fetchMarkdownContent(url);
    if (content) return { ...entry, content };
  }
  return entry;
}

export async function loadEntryForDelivery(
  ci: ContentIndex,
  contentType: string,
  slug: string,
  locale: string,
  opts: Omit<LoadEntryOptions, "accum"> = {},
): Promise<DeliveredEntry | null> {
  await refreshEntrySource(ci, contentType);
  const accum: PerEntryAccum = { removedSections: [] };
  const loaded = loadEntry(ci, contentType, slug, locale, undefined, { ...opts, accum });
  if (!loaded) return null;

  const data = loaded.data;
  const contentRoot = ci.contentRoot;
  let entry = loaded.singleEntry
    ? await withMarkdownBody(loaded.singleEntry)
    : buildSingleEntryFromContent(contentType, data, { slug, locale, contentRoot });
  if (entry) {
    if ("content" in data && !data.content && entry.content) data.content = entry.content;
    entry = await hydrateEntryForDelivery(contentType, entry, {
      contentRoot,
      locale,
      db: ci.getDatabase(),
      contentIndex: ci,
    });
  }

  if (!data.title) data.title = (entry?.title as string) || slug;
  if (!data.slug) data.slug = slug;
  if (Array.isArray(data.sections)) {
    attachVariableFieldsToSections(data.sections);
    applyComponentSectionDefaults(data.sections);
    applyComponentImageSizes(data.sections);
  }

  return {
    data,
    singleEntry: entry,
    detached: !!layoutInfoForEntry(contentType, slug, contentRoot).detached,
    perEntryRemovedSections: accum.removedSections.length > 0 ? accum.removedSections : undefined,
    ...(loaded.staleSourceAgeMs !== undefined ? { staleSourceAgeMs: loaded.staleSourceAgeMs } : {}),
  };
}

/**
 * Merged page of an entry of a shared-template type, for per-entry section edits and previews.
 * Null when the type has no shared template or the page does not exist in that language.
 */
export async function loadMergedSinglePage(
  ci: ContentIndex,
  contentType: string,
  slug: string,
  locale: string,
): Promise<TemplatePage | null> {
  if (!typeUsesSharedTemplate(getContentTypeConfig(contentType, ci.contentRoot))) return null;
  const delivered = await loadEntryForDelivery(ci, contentType, slug, locale);
  if (!delivered) return null;
  const { data } = delivered;
  return {
    slug: (data.slug as string) || slug,
    title: (data.title as string) || slug,
    meta: (data.meta as TemplatePage["meta"]) || {},
    sections: (data.sections as TemplatePage["sections"]) || [],
    settings: (data.settings as TemplatePage["settings"]) || undefined,
    schema: (data.schema as TemplatePage["schema"]) || undefined,
    singleEntry: delivered.singleEntry,
    perEntryRemovedSections: delivered.perEntryRemovedSections,
  };
}
