/**
 * All-or-nothing swap of staged cache entries (files or directories) into a live cache folder.
 * Used by "Download from production" so local ad data is never half old, half new.
 */

import fs from "fs";
import path from "path";

export const STAGING_PREFIX = ".pull-staging-";
const OLD_MARKER = ".pull-old-";

export function makeStagingDir(liveRoot: string, stamp = Date.now()): string {
  const d = path.join(liveRoot, `${STAGING_PREFIX}${stamp}-${process.pid}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function rm(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

/** Removes staging folders and `*.pull-old-*` backups left by an interrupted swap. */
export function cleanupPullArtifacts(liveRoot: string): number {
  if (!fs.existsSync(liveRoot)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(liveRoot)) {
    if (name.startsWith(STAGING_PREFIX) || name.includes(OLD_MARKER)) {
      rm(path.join(liveRoot, name));
      removed++;
    }
  }
  return removed;
}

/**
 * Moves each `entries` name from `stagingRoot` into `liveRoot`, in order. Live entries are
 * set aside first; any failure puts every swapped entry back and leaves live data as it was.
 * Entries missing from staging are removed from live (the snapshot had none).
 */
export function swapStagedEntries(
  liveRoot: string,
  stagingRoot: string,
  entries: string[],
  rename: (from: string, to: string) => void = fs.renameSync,
): void {
  fs.mkdirSync(liveRoot, { recursive: true });
  const stamp = `${OLD_MARKER}${Date.now()}`;
  const done: Array<{ live: string; old: string | null }> = [];
  try {
    for (const name of entries) {
      const live = path.join(liveRoot, name);
      const staged = path.join(stagingRoot, name);
      const old = fs.existsSync(live) ? `${live}${stamp}` : null;
      if (old) rename(live, old);
      done.push({ live, old });
      if (fs.existsSync(staged)) rename(staged, live);
    }
  } catch (err) {
    for (const { live, old } of done.reverse()) {
      try {
        rm(live);
        if (old) fs.renameSync(old, live);
      } catch {
        /* best effort; cleanupPullArtifacts removes leftovers on the next pull */
      }
    }
    rm(stagingRoot);
    throw err;
  }
  for (const { old } of done) if (old) rm(old);
  rm(stagingRoot);
}
