#!/usr/bin/env tsx
/**
 * Proposals 1.0 cutover: migrate open/partial legacy proposals to draft-first, close the rest.
 *
 * Run once per environment against that environment's pipeline DB (drafts are linked
 * with that env's PIPELINE_ENV). Drafts it creates are site_* files: `--push` commits them
 * to the content repo and prints the SHA.
 *
 * Usage:
 *   npx tsx scripts/migrate-proposals-v1.ts --dry-run [--site site_4geeks-com]
 *   npx tsx scripts/migrate-proposals-v1.ts --apply --push [--site site_4geeks-com]
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const push = args.includes("--push");
const siteArg = args.includes("--site") ? args[args.indexOf("--site") + 1] : undefined;
if (apply && args.includes("--dry-run")) {
  console.error("Use only one of --dry-run or --apply");
  process.exit(1);
}

const { getSiteContextMap } = await import("../server/site-manager");
const { ensurePipelineDb } = await import("../server/pipeline-db/runner");
const { proposalServiceForSite } = await import("../server/content-proposals/service");
const { detectPendingChanges } = await import("../server/sync-state");
const { commitAndPush } = await import("../server/github");

let failed = false;
for (const ctx of Array.from(getSiteContextMap().values())) {
  if (siteArg && ctx.contentRootName !== siteArg) continue;
  ensurePipelineDb(ctx.contentRootName);
  const svc = proposalServiceForSite(ctx);
  const report = await svc.migrateLegacy({ author: "system:proposals-v1-cutover", dry_run: !apply });
  console.log("site", ctx.contentRootName);
  console.log("migrated", report.migrated.length, JSON.stringify(report.migrated, null, 2));
  console.log("closed", report.closed.length, JSON.stringify(report.closed, null, 2));
  if (!apply || !push || report.touched_entry_dirs.length === 0) continue;

  const files = detectPendingChanges(ctx.contentRootName)
    .filter((c) => c.source === "local")
    .map((c) => c.file)
    .filter((f) => report.touched_entry_dirs.some((d) => f === d || f.startsWith(`${d}/`)));
  const res = await commitAndPush("Proposals 1.0 cutover: drafts for migrated legacy proposals", {
    files,
    contentRoot: ctx.contentRootName,
  });
  if (!res.success || !res.commitHash) {
    failed = true;
    console.error("push_failed", res.error);
    console.error("files", files);
    continue;
  }
  console.log("commitSha", res.commitHash);
}
process.exit(failed ? 1 : 0);
