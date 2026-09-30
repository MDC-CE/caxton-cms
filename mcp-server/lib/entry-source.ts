/**
 * Per-site root for the shared entry layer (server/entry-layer.ts) inside MCP.
 * Reads the site's stored database copies; never fetches from the source.
 */

import path from "path";
import { DatabaseManager } from "../../server/database.js";
import type { EntrySourceRoot } from "../../server/entry-layer.js";

const roots = new Map<string, EntrySourceRoot>();

export function entrySourceRoot(contentPath: string): EntrySourceRoot {
  const contentRoot = path.resolve(contentPath);
  let root = roots.get(contentRoot);
  if (!root) {
    const db = new DatabaseManager(contentRoot);
    root = { contentRoot, getDatabase: () => db };
    roots.set(contentRoot, root);
  }
  return root;
}

/** Tests: drop cached managers so a new fixture root is re-read. */
export function resetEntrySourceRoots(): void {
  roots.clear();
}
