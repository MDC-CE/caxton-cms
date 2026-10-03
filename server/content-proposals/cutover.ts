/**
 * Proposals 1.0 cutover: migrate open/partial legacy proposals to draft-first, close the rest,
 * and push the drafts it writes to the content repo. A re-run first pushes drafts left unpushed
 * by an interrupted run, so nothing converted earlier stays local.
 */

import path from "path";
import type Database from "better-sqlite3";
import { readDraftMeta } from "../versioning/draft-meta";

export const CUTOVER_AUTHOR = "system:proposals-v1-cutover";

type Log = (...args: unknown[]) => void;

/** Proposal ids the cutover already converted (from `proposal_migrated_v1` events; kept 7 days). */
export function cutoverMigratedIds(db: Database.Database, site: string): Set<string> {
  const rows = db
    .prepare(`SELECT payload_json, attribution_json FROM events WHERE type = 'proposal_migrated_v1' AND site = ?`)
    .all(site) as Array<{ payload_json: string; attribution_json: string | null }>;
  const ids = new Set<string>();
  for (const row of rows) {
    try {
      const attribution = JSON.parse(row.attribution_json || "[]") as Array<{ author?: string }>;
      if (!attribution.some((a) => a?.author === CUTOVER_AUTHOR)) continue;
      const id = (JSON.parse(row.payload_json) as { proposal_id?: unknown }).proposal_id;
      if (typeof id === "string") ids.add(id);
    } catch {
      /* malformed event row */
    }
  }
  return ids;
}

/**
 * Pending local files to push for recovery: every file in an entry folder holding a draft
 * linked to one of `migratedIds` (drafts plus that folder's versioning.yml).
 */
export function selectRecoveryFiles(
  pendingFiles: string[],
  migratedIds: Set<string>,
  proposalIdOf: (file: string) => string | null,
): string[] {
  if (migratedIds.size === 0) return [];
  const dirs = new Set<string>();
  for (const file of pendingFiles) {
    if (!/\.ya?ml$/.test(file)) continue;
    const id = proposalIdOf(file);
    if (id && migratedIds.has(id)) dirs.add(path.dirname(file));
  }
  return pendingFiles.filter((f) => dirs.has(path.dirname(f)));
}

function draftProposalId(file: string): string | null {
  try {
    return readDraftMeta(path.join(process.cwd(), file))?.proposal?.id ?? null;
  } catch {
    return null;
  }
}

export async function runProposalsCutover(opts: {
  site?: string;
  dryRun: boolean;
  push: boolean;
  log?: Log;
  error?: Log;
}): Promise<{ failed: boolean }> {
  const log = opts.log ?? console.log;
  const error = opts.error ?? console.error;
  const { getSiteContextMap } = await import("../site-manager");
  const { ensurePipelineDb } = await import("../pipeline-db/runner");
  const { getSiteSqlite } = await import("../db");
  const { proposalServiceForSite } = await import("./service");
  const { detectPendingChanges } = await import("../sync-state");
  const { commitAndPush } = await import("../github");

  const pendingLocal = (site: string) =>
    detectPendingChanges(site)
      .filter((c) => c.source === "local")
      .map((c) => c.file);

  const pushFiles = async (site: string, files: string[], message: string): Promise<boolean> => {
    if (files.length === 0) return true;
    const res = await commitAndPush(message, { files, contentRoot: site });
    if (!res.success || !res.commitHash) {
      error("push_failed", res.error);
      error("files", files);
      return false;
    }
    log("commitSha", res.commitHash);
    return true;
  };

  let failed = false;
  let matched = false;
  for (const ctx of Array.from(getSiteContextMap().values())) {
    const site = ctx.contentRootName;
    if (opts.site && site !== opts.site) continue;
    matched = true;
    ensurePipelineDb(site);
    log("site", site);

    if (opts.push) {
      const recovery = selectRecoveryFiles(pendingLocal(site), cutoverMigratedIds(getSiteSqlite(site), site), draftProposalId);
      if (recovery.length) {
        log("recovery", recovery.length, "unpushed draft files from an earlier run", JSON.stringify(recovery, null, 2));
        if (!opts.dryRun) {
          const ok = await pushFiles(site, recovery, "Proposals 1.0 cutover: push drafts left by an interrupted run");
          if (!ok) {
            failed = true;
            continue;
          }
        }
      }
    }

    const svc = proposalServiceForSite(ctx);
    const report = await svc.migrateLegacy({ author: CUTOVER_AUTHOR, dry_run: opts.dryRun });
    log("migrated", report.migrated.length, JSON.stringify(report.migrated, null, 2));
    log("closed", report.closed.length, JSON.stringify(report.closed, null, 2));
    if (opts.dryRun || !opts.push || report.touched_entry_dirs.length === 0) continue;

    const files = pendingLocal(site).filter((f) =>
      report.touched_entry_dirs.some((d) => f === d || f.startsWith(`${d}/`)),
    );
    const ok = await pushFiles(site, files, "Proposals 1.0 cutover: drafts for migrated legacy proposals");
    if (!ok) failed = true;
  }
  if (opts.site && !matched) {
    error("unknown_site", opts.site);
    failed = true;
  }
  return { failed };
}
