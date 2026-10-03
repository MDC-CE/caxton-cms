#!/usr/bin/env tsx
/**
 * @migration 003_migrate_proposals_v1
 * @description Moves this site's open edit proposals to the new draft-based proposals and
 *   closes the ones that can no longer apply. Their drafts are pushed to the content repo.
 * @scope site
 * @dry-run
 * @production-only
 * @timeout 900
 *
 * Steps:
 *   1. Recovery: pushes draft files left unpushed by an earlier interrupted run
 *      (proposals already converted by `system:proposals-v1-cutover`).
 *   2. Converts open/partial legacy proposals (no system_version) and closes the rest.
 *   3. Pushes the drafts it wrote and prints the commitSha.
 * Exits non-zero when a push fails, so the run is never recorded as completed.
 * Idempotent: converted proposals are skipped on the next run.
 *
 * Usage: MIGRATION_SITE=site_4geeks-com npx tsx scripts/migrations/003_migrate_proposals_v1.ts [--dry-run]
 *        (without MIGRATION_SITE every site runs)
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

const dryRun = process.argv.includes("--dry-run");
const site = process.env.MIGRATION_SITE?.trim() || undefined;

console.log(dryRun ? "DRY RUN: nothing is written or pushed." : "APPLY");
const { runProposalsCutover } = await import("../../server/content-proposals/cutover");
const { failed } = await runProposalsCutover({ site, dryRun, push: true });
process.exit(failed ? 1 : 0);
