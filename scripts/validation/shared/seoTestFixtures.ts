/**
 * Temp content-root fixtures for SEO validator tests (content-types.yml,
 * variables.yml, entry folders with _common.yml + {locale}.yml).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import type { ContentFile, ValidationContext } from "./types";

export function makeSeoContentRoot(
  fieldMapping: Record<string, string> = { title: "title" },
  extraTypeConfig: Record<string, unknown> = {},
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seo-validators-"));
  const types = {
    landing: {
      directory: "landings",
      field_mapping: { _slug: "slug", ...fieldMapping },
      url_pattern: { default: "/landing/:slug" },
      ...extraTypeConfig,
    },
  };
  fs.writeFileSync(path.join(root, "content-types.yml"), yaml.dump(types), "utf-8");
  fs.writeFileSync(
    path.join(root, "variables.yml"),
    ["global.brand_suffix:", '  default: "4Geeks"'].join("\n"),
    "utf-8",
  );
  return root;
}

type Layer = Record<string, unknown>;

/** Writes `landings/<slug>/_common.yml` + locale files; returns merged ContentFiles. */
export function writeSeoEntry(
  root: string,
  slug: string,
  layers: { common?: Layer; locales: Record<string, Layer> },
): ContentFile[] {
  const dir = path.join(root, "landings", slug);
  fs.mkdirSync(dir, { recursive: true });
  if (layers.common) {
    fs.writeFileSync(path.join(dir, "_common.yml"), yaml.dump(layers.common), "utf-8");
  }
  return Object.entries(layers.locales).map(([locale, data]) => {
    fs.writeFileSync(path.join(dir, `${locale}.yml`), yaml.dump(data), "utf-8");
    const common = layers.common ?? {};
    const meta = {
      ...((common.meta as Layer) ?? {}),
      ...((data.meta as Layer) ?? {}),
    };
    const entryFields: Layer = { ...common, ...data, meta };
    return {
      slug,
      title: typeof entryFields.title === "string" ? entryFields.title : slug,
      type: "landing",
      locale,
      filePath: `landings/${slug}/${locale}.yml`,
      url: `/landing/${slug}`,
      meta: meta as ContentFile["meta"],
      entryFields,
    };
  });
}

export function makeSeoContext(root: string, files: ContentFile[]): ValidationContext {
  return {
    contentFiles: files,
    redirectMap: new Map(),
    availableSchemas: new Set(),
    sitemapEntries: [],
    contentRoot: root,
  };
}
