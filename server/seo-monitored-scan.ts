/**
 * Shared scan of SEO-monitoring-enabled pages (same universe as seo-index rebuild).
 */

import * as fs from "fs";
import { applyListingOverrides } from "./entry-layer";
import * as path from "path";
import {
  getAllConfigs,
  getDatabaseName,
  getFolder,
} from "./content-types";
import { databaseManager, DatabaseManager } from "./database";
import { getDefaultContentRoot } from "./site-config";
import {
  hasEffectiveSeoSignal,
  itemLocale,
  resolveEffectiveSeo,
} from "./seo-effective-seo";
import { isSeoMonitoringEnabled } from "./seo-monitoring";

const LIVE_LOCALE_FILE = /^[a-z]{2}\.ya?ml$/i;

export type LiveLocaleFile = {
  contentType: string;
  slug: string;
  locale: string;
  absPath: string;
  relFile: string;
};

export type MonitoredSeoGap = {
  contentType: string;
  slug: string;
  locale: string;
};

function contentRootAbs(contentRoot?: string): string {
  const raw = contentRoot ?? getDefaultContentRoot();
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function dbItemKey(slug: string, locale: string): string {
  return `${slug}:${locale}`;
}

function slugFromDbItem(item: Record<string, unknown>): string | null {
  const slug = item.slug ?? item._slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

/** Live locale YAML files for content types with seo_monitoring.enabled. */
export function scanLiveLocaleFiles(contentRoot?: string): LiveLocaleFile[] {
  const root = contentRootAbs(contentRoot);
  const out: LiveLocaleFile[] = [];
  const configs = getAllConfigs(contentRoot);
  for (const [contentType, cfg] of Object.entries(configs)) {
    if (!isSeoMonitoringEnabled(contentType, contentRoot)) continue;
    const dirName = cfg.directory || getFolder(contentType, contentRoot);
    const typeDir = path.join(root, dirName);
    if (!fs.existsSync(typeDir)) continue;
    for (const slugEnt of fs.readdirSync(typeDir, { withFileTypes: true })) {
      if (!slugEnt.isDirectory() || slugEnt.name.startsWith("_")) continue;
      const slugDir = path.join(typeDir, slugEnt.name);
      for (const file of fs.readdirSync(slugDir)) {
        if (!LIVE_LOCALE_FILE.test(file)) continue;
        const locale = file.replace(/\.ya?ml$/i, "").toLowerCase();
        const absPath = path.join(slugDir, file);
        const relFile = path.relative(root, absPath).split(path.sep).join("/");
        out.push({
          contentType,
          slug: slugEnt.name,
          locale,
          absPath,
          relFile,
        });
      }
    }
  }
  return out;
}

function loadMonitoredDbItemsByType(
  contentRoot?: string,
): Map<string, Map<string, Record<string, unknown>>> {
  const root = contentRootAbs(contentRoot);
  const dbm = contentRoot ? new DatabaseManager(contentRoot) : databaseManager;
  const dbItemsByType = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [contentType] of Object.entries(getAllConfigs(contentRoot))) {
    if (!isSeoMonitoringEnabled(contentType, contentRoot)) continue;
    const listing = dbm.getListingItems(contentType);
    if (!listing) continue;
    const items = applyListingOverrides({ contentRoot: root }, contentType, listing.items);
    const byKey = new Map<string, Record<string, unknown>>();
    for (const item of items) {
      const slug = slugFromDbItem(item);
      if (!slug) continue;
      const locale = itemLocale(item, contentType, root);
      byKey.set(dbItemKey(slug, locale), item);
    }
    if (byKey.size) dbItemsByType.set(contentType, byKey);
  }
  return dbItemsByType;
}

/**
 * Monitored pages (YAML + DB-only) with no effective SEO signal — the Unclustered gap
 * that never appears in seo-index.json entries.
 */
export function listMonitoredNoSeoSignalGaps(contentRoot?: string): MonitoredSeoGap[] {
  const root = contentRootAbs(contentRoot);
  const dbItemsByType = loadMonitoredDbItemsByType(contentRoot);
  const seen = new Set<string>();
  const gaps: MonitoredSeoGap[] = [];

  const pushIfGap = (
    contentType: string,
    slug: string,
    locale: string,
    dbItem: Record<string, unknown> | null,
  ) => {
    const id = `${contentType}/${slug}/${locale}`;
    if (seen.has(id)) return;
    seen.add(id);
    const seo = resolveEffectiveSeo({
      contentType,
      slug,
      locale,
      contentRoot: root,
      dbItem,
    });
    if (hasEffectiveSeoSignal(seo)) return;
    gaps.push({ contentType, slug, locale });
  };

  for (const f of scanLiveLocaleFiles(contentRoot)) {
    if (!isSeoMonitoringEnabled(f.contentType, contentRoot)) continue;
    const dbItem = dbItemsByType.get(f.contentType)?.get(dbItemKey(f.slug, f.locale)) ?? null;
    pushIfGap(f.contentType, f.slug, f.locale, dbItem);
  }

  for (const [contentType, byKey] of dbItemsByType) {
    for (const [, item] of byKey) {
      const slug = slugFromDbItem(item);
      if (!slug) continue;
      const locale = itemLocale(item, contentType, root);
      pushIfGap(contentType, slug, locale, item);
    }
  }

  return gaps;
}

/** DB cache map used by seo-index rebuild (same keying as gaps scan). */
export function loadMonitoredDbItemsForRebuild(
  contentRoot?: string,
): Map<string, Map<string, Record<string, unknown>>> {
  return loadMonitoredDbItemsByType(contentRoot);
}

export { dbItemKey, slugFromDbItem, contentRootAbs };
