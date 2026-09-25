/**
 * Versioning panel restore: folder history + per-file / whole-folder restore
 * from the site content repo on GitHub (never the app repo's local git).
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { escapeTemplateVars } from "@shared/templateVars";
import {
  commitAndPush,
  getConflictInfo,
  getGitHubConfig,
  listFileCommits,
  type FileCommitEntry,
} from "./github";
import {
  countSectionDiffStats,
  fetchCommitParent,
  fetchFolderTreeAtCommits,
  type FolderTreeFile,
} from "./github-graphql";
import { detectPendingChanges, markFileAsModified, shouldTrackFile } from "./sync-state";
import { isSeoIndexRelPath } from "./seo-index";

export type RestoreMode = "undo" | "restore";

export type RestoreDeps = {
  listCommits: typeof listFileCommits;
  fetchCommitParent: typeof fetchCommitParent;
  fetchFolderTrees: typeof fetchFolderTreeAtCommits;
  getConflictInfo: typeof getConflictInfo;
  commitAndPush: typeof commitAndPush;
  markFileAsModified: typeof markFileAsModified;
  detectPendingChanges: typeof detectPendingChanges;
  shouldTrackFile: typeof shouldTrackFile;
  isSeoIndexRelPath: typeof isSeoIndexRelPath;
  syncEnabled: () => boolean;
  hasGitHubConfig: (repoUrl?: string) => boolean;
};

export const defaultRestoreDeps: RestoreDeps = {
  listCommits: listFileCommits,
  fetchCommitParent,
  fetchFolderTrees: fetchFolderTreeAtCommits,
  getConflictInfo,
  commitAndPush,
  markFileAsModified,
  detectPendingChanges,
  shouldTrackFile,
  isSeoIndexRelPath,
  syncEnabled: () => process.env.GITHUB_SYNC_ENABLED === "true",
  hasGitHubConfig: (repoUrl) => getGitHubConfig(repoUrl) !== null,
};

type Failure = { ok: false; status: number; error: string; code?: string; files?: string[] };

export const VERSIONING_BASENAME = "versioning.yml";

export function parseRestoreMode(value: unknown): RestoreMode | null {
  return value === "undo" || value === "restore" ? value : null;
}

/** Folder must be a relative path inside this site's content root. */
export function validateRestoreFolder(folder: unknown, contentRootName: string): string | null {
  if (!folder || typeof folder !== "string") return "folder is required";
  if (/[;&|`$<>\\]/.test(folder) || folder.split("/").includes("..") || path.isAbsolute(folder)) {
    return "Invalid folder path";
  }
  const root = contentRootName.replace(/\/+$/, "");
  const rest = folder.startsWith(`${root}/`) ? folder.slice(root.length + 1).replace(/\/+$/, "") : "";
  // Entry folders are <contentRoot>/<typeFolder>/<slug>
  if (rest.split("/").filter(Boolean).length < 2) {
    return "Folder must be an entry folder inside this site's content";
  }
  return null;
}

function normalizeFolder(folder: string): string {
  return folder.replace(/\/+$/, "");
}

function listLocalFiles(cwd: string, folder: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  walk(folder);
  return out.sort();
}

function readLocalText(cwd: string, relPath: string): string | null {
  const abs = path.join(cwd, relPath);
  try {
    return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
  } catch {
    return null;
  }
}

function parseYamlText(text: string): unknown {
  const { escaped } = escapeTemplateVars(text);
  return yaml.load(escaped);
}

async function resolveCommitShas(
  sha: string,
  mode: RestoreMode,
  repoUrl: string | undefined,
  deps: RestoreDeps,
): Promise<{ ok: true; commitSha: string; parentSha: string | null; sourceSha: string } | Failure> {
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) return { ok: false, status: 400, error: "Invalid SHA format" };
  const resolved = await deps.fetchCommitParent({ repoUrl, sha });
  if (!resolved.success || !resolved.sha) {
    const status = resolved.error === "GitHub not configured" ? 503 : 502;
    return { ok: false, status, error: resolved.error || "Could not resolve commit" };
  }
  const parentSha = resolved.parentSha ?? null;
  if (mode === "undo" && !parentSha) {
    return {
      ok: false,
      status: 400,
      code: "no_parent",
      error: "This is the first version on GitHub, so there is nothing before it to undo to.",
    };
  }
  return {
    ok: true,
    commitSha: resolved.sha,
    parentSha,
    sourceSha: mode === "undo" ? parentSha! : resolved.sha,
  };
}

function unrestorableReason(file: FolderTreeFile | undefined, mode: RestoreMode): string | null {
  if (!file) {
    return mode === "undo"
      ? "Did not exist before this change (undo never deletes files)"
      : "Did not exist at this version";
  }
  if (file.isBinary) return "Binary file — restore it on GitHub";
  if (file.isTruncated || file.text == null) return "File too large to restore here";
  return null;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function listFolderHistory(
  opts: { folder: string; repoUrl?: string; limit?: number; page?: number },
  deps: RestoreDeps = defaultRestoreDeps,
): Promise<{ success: boolean; entries: FileCommitEntry[]; hasMore: boolean; repoUrl: string | null; error?: string }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50);
  const result = await deps.listCommits(normalizeFolder(opts.folder), {
    repoUrl: opts.repoUrl,
    limit,
    page: opts.page,
  });
  return {
    success: result.success,
    entries: result.entries,
    hasMore: result.success && result.entries.length >= limit,
    repoUrl: result.repoUrl ?? null,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// Files for one commit (dialog)
// ---------------------------------------------------------------------------

export type CommitFileRow = {
  path: string;
  status: "added" | "modified" | "removed";
  additions: number;
  deletions: number;
  restorable: boolean;
  reason?: string;
  /** Local file already matches the version that would be restored. */
  sameAsNow: boolean;
  isVersioningFile: boolean;
};

export type SourceFileRow = {
  path: string;
  restorable: boolean;
  reason?: string;
  sameAsNow: boolean;
  isVersioningFile: boolean;
};

export type FolderCommitFilesResult =
  | {
      ok: true;
      mode: RestoreMode;
      commitSha: string;
      parentSha: string | null;
      sourceSha: string;
      changedFiles: CommitFileRow[];
      filesAtSource: SourceFileRow[];
      extraFilesNow: string[];
      pendingFiles: string[];
      versioningFile: string | null;
      repoUrl: string | null;
    }
  | Failure;

export async function getFolderCommitFiles(
  opts: {
    folder: string;
    sha: string;
    mode: RestoreMode;
    contentRootName: string;
    repoUrl?: string;
    cwd?: string;
  },
  deps: RestoreDeps = defaultRestoreDeps,
): Promise<FolderCommitFilesResult> {
  const cwd = opts.cwd ?? process.cwd();
  const folder = normalizeFolder(opts.folder);
  const folderErr = validateRestoreFolder(folder, opts.contentRootName);
  if (folderErr) return { ok: false, status: 400, error: folderErr };

  const shas = await resolveCommitShas(opts.sha, opts.mode, opts.repoUrl, deps);
  if (!shas.ok) return shas;

  const treeShas = [shas.commitSha, ...(shas.parentSha ? [shas.parentSha] : [])];
  const trees = await deps.fetchFolderTrees({ repoUrl: opts.repoUrl, folder, shas: treeShas });
  if (!trees.success) {
    const status = trees.error === "GitHub not configured" ? 503 : 502;
    return { ok: false, status, error: trees.error || "Could not load files from GitHub" };
  }

  const afterFiles = trees.trees[shas.commitSha] ?? [];
  const beforeFiles = shas.parentSha ? trees.trees[shas.parentSha] ?? [] : [];
  const after = new Map(afterFiles.map((f) => [f.path, f]));
  const before = new Map(beforeFiles.map((f) => [f.path, f]));
  const source = opts.mode === "undo" ? before : after;
  const versioningPath = `${folder}/${VERSIONING_BASENAME}`;

  const changedFiles: CommitFileRow[] = [];
  const allPaths = [...new Set([...after.keys(), ...before.keys()])].sort();
  for (const p of allPaths) {
    const a = after.get(p);
    const b = before.get(p);
    if (a && b && a.oid === b.oid) continue;
    const status: CommitFileRow["status"] = !b ? "added" : !a ? "removed" : "modified";
    const stats = countSectionDiffStats(b?.text ?? "", a?.text ?? "");
    const reason = unrestorableReason(source.get(p), opts.mode);
    const src = source.get(p);
    changedFiles.push({
      path: p,
      status,
      additions: stats.additions,
      deletions: stats.deletions,
      restorable: reason === null,
      ...(reason ? { reason } : {}),
      sameAsNow: src?.text != null && readLocalText(cwd, p) === src.text,
      isVersioningFile: p === versioningPath,
    });
  }

  const filesAtSource: SourceFileRow[] = [...source.values()]
    .sort((x, y) => x.path.localeCompare(y.path))
    .map((f) => {
      const reason = unrestorableReason(f, opts.mode);
      return {
        path: f.path,
        restorable: reason === null,
        ...(reason ? { reason } : {}),
        sameAsNow: f.text != null && readLocalText(cwd, f.path) === f.text,
        isVersioningFile: f.path === versioningPath,
      };
    });

  const extraFilesNow = listLocalFiles(cwd, folder).filter((p) => !source.has(p));
  const pendingFiles = deps
    .detectPendingChanges(opts.contentRootName)
    .filter((c) => c.source !== "incoming" && c.file.startsWith(`${folder}/`))
    .map((c) => c.file)
    .sort();

  const hasVersioning =
    changedFiles.some((f) => f.isVersioningFile) || filesAtSource.some((f) => f.isVersioningFile);

  return {
    ok: true,
    mode: opts.mode,
    commitSha: shas.commitSha,
    parentSha: shas.parentSha,
    sourceSha: shas.sourceSha,
    changedFiles,
    filesAtSource,
    extraFilesNow,
    pendingFiles,
    versioningFile: hasVersioning ? versioningPath : null,
    repoUrl: trees.repoUrl ?? null,
  };
}

// ---------------------------------------------------------------------------
// Versioning reference check
// ---------------------------------------------------------------------------

/** Variant files referenced by versioning.yml that will not exist after the restore. */
export function findMissingVariantFiles(opts: {
  folder: string;
  versioningText: string;
  fileExistsAfter: (relPath: string) => boolean;
  listFilesAfter: () => string[];
}): { missing: string[]; parseError?: string } {
  let parsed: unknown;
  try {
    parsed = parseYamlText(opts.versioningText);
  } catch (err) {
    return { missing: [], parseError: err instanceof Error ? err.message : String(err) };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { missing: [] };

  const missing: string[] = [];
  let afterFiles: string[] | null = null;
  for (const [locale, cfg] of Object.entries(parsed as Record<string, unknown>)) {
    const variants = (cfg as { variants?: unknown })?.variants;
    if (!Array.isArray(variants)) continue;
    for (const v of variants) {
      const slug = (v as { slug?: unknown })?.slug;
      if (typeof slug !== "string" || !slug.trim()) continue;
      const expected = `${opts.folder}/${slug}.${locale}.yml`;
      if (opts.fileExistsAfter(expected)) continue;
      afterFiles ??= opts.listFilesAfter();
      const legacy = new RegExp(`^${escapeRegExp(`${opts.folder}/${slug}`)}\\.v\\d+\\.${escapeRegExp(locale)}\\.yml$`);
      if (afterFiles.some((f) => legacy.test(f))) continue;
      missing.push(expected);
    }
  }
  return { missing };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export type RestoreFolderResult =
  | {
      ok: true;
      pushed: boolean;
      commitHash?: string;
      pushError?: string;
      restoredFiles: string[];
      deletedFiles: string[];
      skippedBinary: string[];
      warnings: string[];
    }
  | Failure;

export async function restoreFolder(
  opts: {
    folder: string;
    sha: string;
    mode: RestoreMode;
    /** Per-file restore when present; whole folder when omitted. */
    files?: string[];
    /** Whole-folder only: delete local files that did not exist at the source version. */
    removeExtra?: boolean;
    author?: string;
    contentRootName: string;
    repoUrl?: string;
    cwd?: string;
  },
  deps: RestoreDeps = defaultRestoreDeps,
): Promise<RestoreFolderResult> {
  const cwd = opts.cwd ?? process.cwd();
  const folder = normalizeFolder(opts.folder);
  const folderErr = validateRestoreFolder(folder, opts.contentRootName);
  if (folderErr) return { ok: false, status: 400, error: folderErr };

  if (!deps.syncEnabled() || !deps.hasGitHubConfig(opts.repoUrl)) {
    return {
      ok: false,
      status: 503,
      code: "sync_off",
      error: "GitHub sync is off, so the restore can't be saved. Nothing was changed.",
    };
  }

  const perFile = Array.isArray(opts.files);
  if (perFile && opts.files!.length === 0) {
    return { ok: false, status: 400, error: "Select at least one file to restore" };
  }

  const shas = await resolveCommitShas(opts.sha, opts.mode, opts.repoUrl, deps);
  if (!shas.ok) return shas;

  const trees = await deps.fetchFolderTrees({ repoUrl: opts.repoUrl, folder, shas: [shas.sourceSha] });
  if (!trees.success) {
    const status = trees.error === "GitHub not configured" ? 503 : 502;
    return { ok: false, status, error: trees.error || "Could not load files from GitHub" };
  }
  const sourceFiles = trees.trees[shas.sourceSha] ?? [];
  const source = new Map(sourceFiles.map((f) => [f.path, f]));

  const toWrite: FolderTreeFile[] = [];
  const skippedBinary: string[] = [];
  if (perFile) {
    const invalid: string[] = [];
    for (const p of new Set(opts.files!)) {
      if (typeof p !== "string" || !p.startsWith(`${folder}/`) || p.split("/").includes("..")) {
        invalid.push(String(p));
        continue;
      }
      const f = source.get(p);
      if (unrestorableReason(f, opts.mode) !== null) {
        invalid.push(p);
        continue;
      }
      toWrite.push(f!);
    }
    if (invalid.length > 0) {
      return {
        ok: false,
        status: 400,
        code: "not_restorable",
        error: "Some selected files can't be restored from this version.",
        files: invalid,
      };
    }
  } else {
    for (const f of sourceFiles) {
      if (unrestorableReason(f, opts.mode) === null) toWrite.push(f);
      else skippedBinary.push(f.path);
    }
    if (toWrite.length === 0) {
      return { ok: false, status: 400, error: "No restorable files found at that version." };
    }
  }

  const toDelete =
    !perFile && opts.removeExtra === true
      ? listLocalFiles(cwd, folder).filter((p) => !source.has(p))
      : [];

  const writeSet = new Set(toWrite.map((f) => f.path));
  const deleteSet = new Set(toDelete);
  const targets = [...writeSet, ...deleteSet];

  const versioningPath = `${folder}/${VERSIONING_BASENAME}`;
  const versioningFile = toWrite.find((f) => f.path === versioningPath);
  if (versioningFile?.text != null) {
    const existsAfter = (p: string) =>
      writeSet.has(p) || (!deleteSet.has(p) && fs.existsSync(path.join(cwd, p)));
    const { missing, parseError } = findMissingVariantFiles({
      folder,
      versioningText: versioningFile.text,
      fileExistsAfter: existsAfter,
      listFilesAfter: () => [
        ...new Set([...writeSet, ...listLocalFiles(cwd, folder).filter((p) => !deleteSet.has(p))]),
      ],
    });
    if (parseError) {
      return {
        ok: false,
        status: 400,
        code: "versioning_invalid",
        error: `The traffic settings file at that version can't be read: ${parseError}`,
      };
    }
    if (missing.length > 0) {
      return {
        ok: false,
        status: 400,
        code: "versioning_missing_variants",
        error:
          "The traffic settings at that version send visitors to versions that won't exist. Also restore those files, or leave the traffic settings file unticked.",
        files: missing,
      };
    }
  }

  const conflicts = await deps.getConflictInfo({ repoUrl: opts.repoUrl, contentRoot: opts.contentRootName });
  if (conflicts.lastSyncedCommit) {
    const siteRemote = conflicts.changedFiles.filter(
      (f) =>
        deps.shouldTrackFile(f, undefined, opts.contentRootName) &&
        !deps.isSeoIndexRelPath(f, opts.contentRootName),
    );
    const overlap = siteRemote.filter((f) => writeSet.has(f) || deleteSet.has(f));
    if (overlap.length > 0) {
      return {
        ok: false,
        status: 409,
        code: "remote_overlap",
        error: "This page changed on GitHub since your last sync — pull first. Nothing was changed.",
        files: overlap,
      };
    }
    if (siteRemote.length > 0) {
      return {
        ok: false,
        status: 409,
        code: "remote_behind",
        error:
          "GitHub has newer changes for this site that haven't been pulled yet — pull first so the restore can be saved. Nothing was changed.",
        files: siteRemote.slice(0, 20),
      };
    }
  }

  for (const f of toWrite) {
    const abs = path.join(cwd, f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.text!, "utf-8");
  }
  for (const p of toDelete) {
    try {
      fs.unlinkSync(path.join(cwd, p));
    } catch {
      // Already gone locally.
    }
  }
  for (const p of targets) {
    deps.markFileAsModified(p, opts.author, undefined, opts.contentRootName);
  }

  const warnings: string[] = [];
  for (const f of toWrite) {
    if (!/\.ya?ml$/i.test(f.path)) continue;
    try {
      parseYamlText(f.text!);
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      warnings.push(`${path.basename(f.path)} does not parse as YAML: ${msg}`);
    }
  }
  if (skippedBinary.length > 0) {
    warnings.push(`Skipped ${skippedBinary.length} file(s) that can't be restored here (binary or too large).`);
  }

  const sha7 = shas.commitSha.slice(0, 7);
  const message =
    opts.mode === "undo" ? `Undo: ${folder} change ${sha7}` : `Restore: ${folder} to ${sha7}`;
  const push = await deps.commitAndPush(message, {
    files: targets,
    contentRoot: opts.contentRootName,
    repoUrl: opts.repoUrl,
  });

  const base = {
    ok: true as const,
    restoredFiles: [...writeSet],
    deletedFiles: [...deleteSet],
    skippedBinary,
    warnings,
  };
  if (push.success) return { ...base, pushed: true, commitHash: push.commitHash };
  // Local bytes already match GitHub (e.g. undoing something already undone).
  if (push.error === "No pending changes to commit") return { ...base, pushed: true };
  return { ...base, pushed: false, pushError: push.error || "Push failed" };
}
