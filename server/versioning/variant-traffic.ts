/**
 * A draft is any variant at 0% traffic (or not registered in versioning.yml).
 * A variant with allocation > 0 is an experiment. Rules decide by traffic, never by
 * the variant name (`draft` is only the default name).
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { isTemplateVersioningSlug } from "@shared/sharedLayoutPaths";
import { getFolder } from "../content-types";
import { resolveRoot } from "./draft-meta";

export type VersioningShape = Record<string, { variants?: Array<{ slug: string; allocation?: number }> }>;

export function versioningFilePathFor(contentType: string, slug: string, contentRoot?: string): string {
  const root = resolveRoot(contentRoot);
  const folder = getFolder(contentType, root);
  return isTemplateVersioningSlug(slug)
    ? path.join(root, folder, "versioning.yml")
    : path.join(root, folder, slug, "versioning.yml");
}

export function readVersioningShape(
  contentType: string,
  slug: string,
  contentRoot?: string,
): VersioningShape | null {
  const filePath = versioningFilePathFor(contentType, slug, contentRoot);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as VersioningShape) : null;
  } catch {
    return null;
  }
}

/** Allocation of the variant, or null when it is not registered. */
export function readVariantAllocation(opts: {
  contentType: string;
  slug: string;
  locale: string;
  variant: string;
  contentRoot?: string;
}): number | null {
  const shape = readVersioningShape(opts.contentType, opts.slug, opts.contentRoot);
  const row = shape?.[opts.locale]?.variants?.find((v) => v.slug === opts.variant);
  if (!row) return null;
  const n = Number(row.allocation ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function variantHasTraffic(opts: {
  contentType: string;
  slug: string;
  locale: string;
  variant: string;
  contentRoot?: string;
}): boolean {
  return (readVariantAllocation(opts) ?? 0) > 0;
}
