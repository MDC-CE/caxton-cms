#!/usr/bin/env tsx
/**
 * Proposals 1.0 cutover (terminal wrapper). Prefer Settings → General → Migrations
 * (003_migrate_proposals_v1), which records the run. Drafts it creates are site_* files:
 * `--push` commits them to the content repo and prints the SHA.
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

const { runProposalsCutover } = await import("../server/content-proposals/cutover");
const { failed } = await runProposalsCutover({ site: siteArg, dryRun: !apply, push });
process.exit(failed ? 1 : 0);
