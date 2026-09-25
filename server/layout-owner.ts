/**
 * Who owns an entry's layout (the `sections` array): the type's shared template, or the entry.
 * Database-backed is a separate axis (where data lives / creatability) and never changes this.
 */

import { isTemplateVersioningSlug } from "@shared/sharedLayoutPaths";
import { getContentTypeConfig } from "./content-types";
import { isEntryDetached } from "./shared-layout-entry";

export type LayoutOwner = "shared_template" | "entry";

export type EntryLayoutInfo = {
  layout_owner: LayoutOwner;
  /** Entry of a shared-layout type that owns its sections because it was detached. */
  detached?: true;
  /** The draft/file is the shared template itself (slug `template`), not an entry using it. */
  is_shared_template?: true;
};

export function layoutOwnerForType(
  config: { single_template?: boolean; database?: { slug?: string } | null } | null | undefined,
): LayoutOwner {
  return config?.database?.slug || config?.single_template ? "shared_template" : "entry";
}

export function layoutInfoForEntry(
  contentType: string,
  slug: string,
  contentRoot?: string,
): EntryLayoutInfo {
  const owner = layoutOwnerForType(getContentTypeConfig(contentType, contentRoot));
  if (owner === "entry") return { layout_owner: "entry" };
  if (isTemplateVersioningSlug(slug)) return { layout_owner: "shared_template", is_shared_template: true };
  if (isEntryDetached(contentType, slug, contentRoot)) return { layout_owner: "entry", detached: true };
  return { layout_owner: "shared_template" };
}

export function layoutOwnerForEntry(contentType: string, slug: string, contentRoot?: string): LayoutOwner {
  return layoutInfoForEntry(contentType, slug, contentRoot).layout_owner;
}

export const LAYOUT_OWNER_NOTE =
  "layout_owner is per entry: shared_template = the entry uses template.{locale}.yml (drafts carry fields only); " +
  "entry = the entry owns its sections (types without a shared layout, or detached entries). " +
  "Detached entries of shared_template types report entry. Wins over body_model. Database-backed is a separate axis (creatability).";
