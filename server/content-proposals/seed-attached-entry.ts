/**
 * Create one locale of a file-based attached entry (shared template stays untouched).
 * Rollback deletes only a folder this apply created.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { getFolder } from "../content-types";
import { markFileAsModified, removeFileFromState } from "../sync-state";

export function attachedEntryDir(
  contentType: string,
  slug: string,
  contentRoot: string,
): string {
  return path.join(contentRoot, getFolder(contentType, contentRoot), slug);
}

export function seedAttachedLocaleFiles(opts: {
  contentType: string;
  slug: string;
  locale: string;
  contentRoot: string;
  author?: string;
}): { commonPath: string; localePath: string } {
  const dir = attachedEntryDir(opts.contentType, opts.slug, opts.contentRoot);
  fs.mkdirSync(dir, { recursive: true });
  const commonPath = path.join(dir, "_common.yml");
  const localePath = path.join(dir, `${opts.locale}.yml`);
  const dump = (data: Record<string, unknown>) =>
    yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false });
  if (!fs.existsSync(commonPath)) {
    fs.writeFileSync(commonPath, dump({ slug: opts.slug }), "utf-8");
    markFileAsModified(commonPath, opts.author, undefined, opts.contentRoot);
  }
  if (!fs.existsSync(localePath)) {
    fs.writeFileSync(localePath, dump({ slug: opts.slug, sections: [] }), "utf-8");
    markFileAsModified(localePath, opts.author, undefined, opts.contentRoot);
  }
  return { commonPath, localePath };
}

/** Remove a folder this apply created, and drop those paths from sync state. */
export function discardSeededAttachedEntry(opts: {
  contentType: string;
  slug: string;
  locale: string;
  contentRoot: string;
}): void {
  const dir = attachedEntryDir(opts.contentType, opts.slug, opts.contentRoot);
  const commonPath = path.join(dir, "_common.yml");
  const localePath = path.join(dir, `${opts.locale}.yml`);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  removeFileFromState(commonPath, opts.contentRoot);
  removeFileFromState(localePath, opts.contentRoot);
}
