#!/usr/bin/env tsx
/**
 * @migration 004_move_ads_settings_to_ads_config
 * @description Moves this site's Ads settings (Meta and Google accounts, alert thresholds, lead
 *   conversions, test emails) out of settings.yml into their own file, ads-config.yml. The values
 *   stay the same, and nothing changes in Meta or Google. If ads-config.yml already exists, it
 *   wins and the old copy in settings.yml is removed. Both files are pushed to the content repo.
 * @scope site
 * @dry-run
 * @production-only
 *
 * Steps:
 *   1. Recovery: when the move already happened but a file is still unpushed, pushes it.
 *   2. No ads: block in settings.yml: nothing to do.
 *   3. Only the old block: copies it as-is to ads-config.yml, then removes it from settings.yml.
 *   4. Both exist: ads-config.yml wins and the old block is removed (Dry run says whether they differed).
 *   5. Pushes the changed files in one commit and prints the commitSha.
 * Exits non-zero when a push fails or a file can't be moved safely, so the run is never
 * recorded as completed. Idempotent: a second run finds nothing to do.
 *
 * Usage: MIGRATION_SITE=site_4geeks-com npx tsx scripts/migrations/004_move_ads_settings_to_ads_config.ts [--dry-run]
 *        (without MIGRATION_SITE every site runs)
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

const dryRun = process.argv.includes("--dry-run");
const site = process.env.MIGRATION_SITE?.trim() || undefined;

console.log(dryRun ? "DRY RUN: nothing is written or pushed." : "APPLY");
const { runAdsConfigMigration } = await import("../../server/ads-config-migration");
const { failed } = await runAdsConfigMigration({ site, dryRun });
process.exit(failed ? 1 : 0);
