/**
 * Which pages must rebuild when a content type or a database changes.
 * Listings are pages whose sections use `dynamic_entries.content_type`.
 * Database readers come from getDatabaseUsage; this module only matches a page against that report.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { escapeTemplateVars } from "@shared/templateVars";
import { getAllConfigs } from "./content-types";

export type ContentTypeListingHit = {
  contentType: string;
  slug: string;
  locale: string;
};

export type DatabaseReaderQuery = {
  kind: string;
  content_type: string;
  slug?: string;
  locale?: string;
};

function listYamlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => (name.endsWith(".yml") || name.endsWith(".yaml")) && !name.startsWith("_") && name !== "versioning.yml")
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function localeFromFilename(fileName: string): string | undefined {
  const stem = fileName.replace(/\.(yml|yaml)$/i, "");
  if (/^[a-z]{2}(?:-[a-z]+)?$/i.test(stem)) return stem;
  return undefined;
}

function fileListsContentType(filePath: string, listedType: string): boolean {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return false;
  }
  if (!raw.includes(listedType)) return false;
  try {
    const { escaped } = escapeTemplateVars(raw);
    const parsed = yaml.load(escaped);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const sections = (parsed as { sections?: unknown }).sections;
    if (!Array.isArray(sections)) return false;
    for (const section of sections) {
      if (!section || typeof section !== "object") continue;
      const dyn = (section as { dynamic_entries?: { content_type?: unknown } }).dynamic_entries;
      if (dyn && dyn.content_type === listedType) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Entries that render a list of `listedType`. Shared templates without a slug are skipped. */
export function getContentTypeListingUsage(contentRoot: string, listedType: string): ContentTypeListingHit[] {
  if (!listedType) return [];
  const hits: ContentTypeListingHit[] = [];
  const seen = new Set<string>();
  for (const [contentType, config] of Object.entries(getAllConfigs(contentRoot))) {
    const typeDir = path.join(contentRoot, config.directory || contentType);
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(typeDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      if (slug === "single" || slug === "template" || slug.startsWith("_")) continue;
      for (const filePath of listYamlFiles(path.join(typeDir, slug))) {
        const locale = localeFromFilename(path.basename(filePath));
        if (!locale) continue;
        if (!fileListsContentType(filePath, listedType)) continue;
        const id = `${contentType}/${slug}/${locale}`;
        if (seen.has(id)) continue;
        seen.add(id);
        hits.push({ contentType, slug, locale });
      }
    }
  }
  return hits;
}

/**
 * Whether a page shows a database from a getDatabaseUsage report.
 * A section on a shared template has no slug, so every page of that type matches.
 * A section on one entry matches only that slug. A component picker with no page is ignored.
 */
export function pageReadsDatabase(
  page: { contentType: string; slug: string; locale: string },
  queries: DatabaseReaderQuery[],
): boolean {
  for (const query of queries) {
    if (query.kind === "field_editor" && !query.slug) continue;
    if (query.content_type !== page.contentType) continue;
    if (query.locale && query.locale !== page.locale) continue;
    if (!query.slug || query.slug === page.slug) return true;
  }
  return false;
}
