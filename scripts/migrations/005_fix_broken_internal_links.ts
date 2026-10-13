#!/usr/bin/env tsx
/**
 * @migration 005_fix_broken_internal_links
 * @description Fixes internal links on live pages that lead to pages that do not exist, so the
 *   broken-link check can start blocking saves on this site. A link to a page that moved to another
 *   category is pointed at the live page; a link that redirects is pointed at its final address;
 *   any other broken link is removed and its text is kept. Links written as plain text and links
 *   inside database rows are only listed for a person to fix. Changed files are pushed to the
 *   content repo. Once this has run, saving a live page with a broken link is blocked.
 * @scope site
 * @dry-run
 * @production-only
 * @timeout 600
 *
 * Steps:
 *   1. Recovery: files an earlier run changed but did not push are pushed first.
 *   2. Every live YAML file (_common.yml and {locale}.yml) is checked link by link, using the same
 *      rules as Redirects → Test a URL.
 *   3. Fixes are applied as text edits (formatting kept); a file whose result would not parse is
 *      left untouched and the run fails.
 *   4. All changed files are pushed in one commit and the commitSha is printed.
 * Exits non-zero when a push fails or a fix would break a file, so the run is never recorded as
 * completed. Idempotent: a second run finds nothing to fix (it still lists the needs-a-human links).
 *
 * Usage: MIGRATION_SITE=site_4geeks-com npx tsx scripts/migrations/005_fix_broken_internal_links.ts [--dry-run]
 *        (without MIGRATION_SITE every site runs)
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

const dryRun = process.argv.includes("--dry-run");
const site = process.env.MIGRATION_SITE?.trim() || undefined;

console.log(dryRun ? "DRY RUN: nothing is written or pushed." : "APPLY");
const { runBrokenLinksMigration } = await import("../../server/broken-links-migration");
const { failed } = await runBrokenLinksMigration({ site, dryRun });
process.exit(failed ? 1 : 0);
