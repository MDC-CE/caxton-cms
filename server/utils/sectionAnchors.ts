/**
 * Atomic read/write helpers for `_section_anchors.json` sidecar files.
 *
 * Each DB content type can have a sidecar file at:
 *   4geeks-com/db/{contentType}/_section_anchors.json
 *
 * Shape:
 * {
 *   "aliases": {
 *     "deleted-section-id": "predecessor-section-id" | null
 *   },
 *   "dependants": {
 *     "template-section-id": ["slug1", "slug2"]
 *   }
 * }
 *
 * - aliases: forward alias map for deleted template sections
 * - dependants: reverse index of per-entry slugs that anchor to each template section ID
 */

import * as fs from "fs";
import { getDefaultContentFolder } from "../site-config";
import * as path from "path";
import * as os from "os";
import { getFolder } from "../content-types";
import { markFileAsModified } from "../sync-state";

export interface SectionAnchors {
  aliases: Record<string, string | null>;
  dependants: Record<string, string[]>;
}

function getSidecarPath(contentType: string): string {
  const folder = getFolder(contentType);
  let contentFolder: string;
  try {
    const { getDefaultSite } = require("../site-manager") as typeof import("../site-manager");
    contentFolder = getDefaultSite().contentRootName;
  } catch {
    contentFolder = getDefaultContentFolder();
  }
  return path.join(process.cwd(), contentFolder, folder, "_section_anchors.json");
}

/**
 * Read `_section_anchors.json` for the given content type.
 * Returns a default empty structure if the file does not exist.
 */
export function readSectionAnchors(contentType: string): SectionAnchors {
  const filePath = getSidecarPath(contentType);
  if (!fs.existsSync(filePath)) {
    return { aliases: {}, dependants: {} };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      aliases: parsed.aliases && typeof parsed.aliases === "object" ? parsed.aliases : {},
      dependants: parsed.dependants && typeof parsed.dependants === "object" ? parsed.dependants : {},
    };
  } catch {
    return { aliases: {}, dependants: {} };
  }
}

/**
 * Atomically write `_section_anchors.json` for the given content type.
 * Writes to a temp file in the same directory, then renames over the target.
 */
export function writeSectionAnchors(contentType: string, data: SectionAnchors): void {
  const filePath = getSidecarPath(contentType);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const json = JSON.stringify(data, null, 2) + "\n";
  const tmpPath = path.join(dir, `_section_anchors_${process.pid}_${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, json, "utf-8");
    fs.renameSync(tmpPath, filePath);
    markFileAsModified(filePath, "System");
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Record that a template section was deleted.
 * Appends `deletedId → predecessorId` (or null) to aliases.
 * Also removes any existing alias whose key IS predecessorId — that alias is now stale
 * relative to the new deletion event.
 */
export function recordSectionDeleted(
  contentType: string,
  deletedId: string,
  predecessorId: string | null,
): void {
  const data = readSectionAnchors(contentType);
  data.aliases[deletedId] = predecessorId;
  writeSectionAnchors(contentType, data);
}

/**
 * Remove a stale alias when its key (previously deleted) section is re-added
 * to the shared template with the same ID.
 */
export function clearStaleSectionAlias(contentType: string, restoredId: string): void {
  const data = readSectionAnchors(contentType);
  if (!(restoredId in data.aliases)) return; // nothing to do
  delete data.aliases[restoredId];
  writeSectionAnchors(contentType, data);
}

/**
 * Add a slug to dependants[anchorId].
 * Only called when anchorId is a non-null string (i.e. an actual template section ID).
 */
export function addDependant(contentType: string, anchorId: string, slug: string): void {
  const data = readSectionAnchors(contentType);
  if (!Array.isArray(data.dependants[anchorId])) {
    data.dependants[anchorId] = [];
  }
  if (!data.dependants[anchorId].includes(slug)) {
    data.dependants[anchorId].push(slug);
  }
  writeSectionAnchors(contentType, data);
}

/**
 * Remove a slug from dependants[anchorId].
 */
export function removeDependant(contentType: string, anchorId: string, slug: string): void {
  const data = readSectionAnchors(contentType);
  if (!Array.isArray(data.dependants[anchorId])) return;
  data.dependants[anchorId] = data.dependants[anchorId].filter((s) => s !== slug);
  if (data.dependants[anchorId].length === 0) {
    delete data.dependants[anchorId];
  }
  writeSectionAnchors(contentType, data);
}

/**
 * Remove a slug from all dependant lists (called when an entry is deleted).
 */
export function removeSlugFromAllDependants(contentType: string, slug: string): void {
  const data = readSectionAnchors(contentType);
  let changed = false;
  for (const anchorId of Object.keys(data.dependants)) {
    const before = data.dependants[anchorId];
    const after = before.filter((s) => s !== slug);
    if (after.length !== before.length) {
      changed = true;
      if (after.length === 0) {
        delete data.dependants[anchorId];
      } else {
        data.dependants[anchorId] = after;
      }
    }
  }
  if (changed) {
    writeSectionAnchors(contentType, data);
  }
}

/**
 * Resolve an `_insertAfterSectionId` through the alias chain.
 *
 * Algorithm (capped at 10 hops):
 * 1. If the ID exists in the current base section ID set → return it as-is (section is live).
 * 2. If the ID is in `aliases` → follow the chain to the next predecessor.
 * 3. If the resolved predecessor is present in base sections → return it.
 * 4. If the chain hits null (was the first section) → return null (insert-before-all).
 * 5. If the chain cannot be resolved (unknown id, no alias) → return the original id
 *    so the existing fallback (append-at-end) takes effect unchanged.
 *
 * @param id - The `_insertAfterSectionId` value from a per-entry section
 * @param baseSectionIds - Set of IDs present in the current base sections
 * @param aliases - The aliases map from _section_anchors.json
 * @returns The resolved ID (string | null | undefined). undefined = unchanged/no alias.
 */
export function resolveAnchorAlias(
  id: string,
  baseSectionIds: Set<string>,
  aliases: Record<string, string | null>,
): string | null | undefined {
  // If the section still exists in the template, no aliasing needed
  if (baseSectionIds.has(id)) return id;

  // Walk the alias chain
  const MAX_HOPS = 10;
  let current: string | null = id;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!(current! in aliases)) {
      // No alias for this id — leave unchanged (will fall back to append-at-end)
      return undefined;
    }
    const next: string | null = aliases[current!];
    if (next === null) {
      // Predecessor was the very first section → insert before all
      return null;
    }
    if (baseSectionIds.has(next)) {
      // Found a live predecessor
      return next;
    }
    current = next;
  }
  // Exceeded max hops — leave unchanged
  return undefined;
}
