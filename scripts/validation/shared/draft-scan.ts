/**
 * Filesystem scan of entry folders for draft / versioning / field-scope checks.
 * Type-root template files (`template.*`, `_common.template.yml`) are not scanned.
 */

import fs from "fs";
import path from "path";
import { getAllConfigs, getFolder } from "../../../server/content-types";
import { getDefaultContentRoot } from "../../../server/site-config";

const LIVE_RE = /^([a-z]{2}(?:-[a-z]{2})?)\.ya?ml$/i;
const VARIANT_RE = /^([a-z0-9][a-z0-9_-]*)\.([a-z]{2}(?:-[a-z]{2})?)\.ya?ml$/i;

export type ScannedEntry = {
  contentType: string;
  slug: string;
  dir: string;
  commonPath: string | null;
  versioningPath: string | null;
  live: Array<{ locale: string; filePath: string }>;
  variants: Array<{ variant: string; locale: string; filePath: string }>;
};

export function resolveScanRoot(contentRoot?: string): string {
  return contentRoot ?? getDefaultContentRoot();
}

export function scanEntries(contentRoot?: string): ScannedEntry[] {
  const root = resolveScanRoot(contentRoot);
  if (!fs.existsSync(root)) return [];
  const out: ScannedEntry[] = [];
  const seenDirs = new Set<string>();
  for (const contentType of Object.keys(getAllConfigs(root))) {
    let folder: string;
    try {
      folder = getFolder(contentType, root);
    } catch {
      continue;
    }
    const typeDir = path.join(root, folder);
    if (!fs.existsSync(typeDir) || seenDirs.has(typeDir)) continue;
    seenDirs.add(typeDir);
    for (const d of fs.readdirSync(typeDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith(".") || d.name.startsWith("_")) continue;
      const dir = path.join(typeDir, d.name);
      const entry: ScannedEntry = {
        contentType,
        slug: d.name,
        dir,
        commonPath: null,
        versioningPath: null,
        live: [],
        variants: [],
      };
      for (const name of fs.readdirSync(dir)) {
        const filePath = path.join(dir, name);
        if (name === "_common.yml") entry.commonPath = filePath;
        else if (name === "versioning.yml") entry.versioningPath = filePath;
        else if (LIVE_RE.test(name)) entry.live.push({ locale: LIVE_RE.exec(name)![1]!, filePath });
        else if (VARIANT_RE.test(name)) {
          const m = VARIANT_RE.exec(name)!;
          entry.variants.push({ variant: m[1]!, locale: m[2]!, filePath });
        }
      }
      if (entry.commonPath || entry.live.length || entry.variants.length || entry.versioningPath) out.push(entry);
    }
  }
  return out;
}

/** Top-level paths (and `meta.*`) whose value is `null`. */
export function nullFieldPaths(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === "meta" && v && typeof v === "object" && !Array.isArray(v)) {
      for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) if (mv === null) out.push(`meta.${mk}`);
    } else if (v === null) out.push(k);
  }
  return out;
}
