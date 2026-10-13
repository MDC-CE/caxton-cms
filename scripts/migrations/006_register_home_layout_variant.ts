#!/usr/bin/env tsx
/**
 * @migration 006_register_home_layout_variant
 * @description Registers the bilingual home-layout preview on home (0% traffic) and pulls its
 *   YAML plus Media Gallery images onto this server. Live Default home (en.yml / es.yml) is not
 *   changed. After this runs, staff can open Versions and see home-layout, and preview with
 *   ?force_variant=home-layout. Use when soft Pull skipped those files and Versions still shows
 *   only Default.
 * @scope site
 * @dry-run
 * @production-only
 * @timeout 300
 *
 * Usage: MIGRATION_SITE=site_learning-mdc-edu npx tsx scripts/migrations/006_register_home_layout_variant.ts [--dry-run]
 */

import { config as loadDotenv } from "dotenv";
import fs from "fs";
import path from "path";

loadDotenv({ quiet: true });
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

const dryRun = process.argv.includes("--dry-run");
const site = process.env.MIGRATION_SITE?.trim() || "site_learning-mdc-edu";

const VERSIONING = `en:
  variants:
    - slug: home-layout
      allocation: 0
es:
  variants:
    - slug: home-layout
      allocation: 0
`;

const PULL_FILES = [
  `${site}/pages/home/home-layout.en.yml`,
  `${site}/pages/home/home-layout.es.yml`,
  `${site}/pages/home/versioning.yml`,
  `${site}/image-registry.json`,
  `${site}/images/cna-circle-care.png`,
  `${site}/images/cna-hero-portrait.png`,
  `${site}/images/cna-two-nurses.png`,
  `${site}/images/ce-advisors-tablet.webp`,
  `${site}/images/ce-auto-technician.webp`,
  `${site}/images/ce-bakery-owners.webp`,
  `${site}/images/ce-childcare-classroom.webp`,
  `${site}/images/ce-cna-program.webp`,
  `${site}/images/ce-comptia.webp`,
  `${site}/images/ce-culinary-class.webp`,
  `${site}/images/ce-culinary-kitchen.webp`,
  `${site}/images/ce-culinary-skills.webp`,
  `${site}/images/ce-hvac.webp`,
  `${site}/images/ce-pastry-prep.webp`,
  `${site}/images/ce-patient-care.webp`,
  `${site}/images/ce-tech-server.webp`,
];

async function main() {
  if (site !== "site_learning-mdc-edu") {
    console.log(`Skip: this migration only applies to site_learning-mdc-edu (got ${site}).`);
    process.exit(0);
  }

  console.log(dryRun ? "DRY RUN: nothing is written." : "APPLY");

  const { pullSingleFile, getBranchHeadSha, getGitHubConfig } = await import("../../server/github");
  const { updateFileAfterCommit, updateFileAfterPull, markFileAsModified } = await import(
    "../../server/sync-state.ts"
  );
  const { getVersioningManager } = await import("../../server/versioning/VersioningManager");

  const config = getGitHubConfig();
  if (!config) {
    console.error("GitHub not configured; cannot pull home-layout files.");
    process.exit(1);
  }

  const headSha = await getBranchHeadSha(config);
  if (!headSha) {
    console.error("Could not resolve content repo HEAD.");
    process.exit(1);
  }
  console.log(`content HEAD ${headSha}`);

  let failed = false;
  const pulled: string[] = [];

  for (const filePath of PULL_FILES) {
    if (dryRun) {
      console.log(`would pull ${filePath}`);
      continue;
    }
    const result = await pullSingleFile(filePath, {
      contentRoot: site,
      remoteCommitSha: headSha,
      skipCommitDate: true,
    });
    if (!result.success) {
      console.error(`pull failed: ${filePath}: ${result.error ?? "unknown"}`);
      failed = true;
      continue;
    }
    pulled.push(filePath);
    console.log(`pulled ${filePath}`);
  }

  const versioningPath = path.join(process.cwd(), site, "pages/home/versioning.yml");
  if (dryRun) {
    console.log(`would write ${versioningPath}`);
  } else {
    fs.mkdirSync(path.dirname(versioningPath), { recursive: true });
    fs.writeFileSync(versioningPath, VERSIONING, "utf8");
    markFileAsModified(`${site}/pages/home/versioning.yml`, "migration", undefined, site);
    updateFileAfterPull(`${site}/pages/home/versioning.yml`, headSha, undefined, site);
    updateFileAfterCommit(`${site}/pages/home/versioning.yml`, headSha, site);
    console.log(`wrote ${site}/pages/home/versioning.yml (home-layout @ 0%)`);
  }

  // Drop stale draft.* if still present locally (variant renamed to home-layout)
  for (const stale of [`${site}/pages/home/draft.en.yml`, `${site}/pages/home/draft.es.yml`]) {
    const full = path.join(process.cwd(), stale);
    if (!fs.existsSync(full)) continue;
    if (dryRun) {
      console.log(`would delete ${stale}`);
      continue;
    }
    fs.unlinkSync(full);
    console.log(`deleted ${stale}`);
  }

  if (!dryRun) {
    try {
      getVersioningManager().clearCache();
      console.log("cleared versioning cache");
    } catch (err) {
      console.warn("versioning cache clear skipped:", err instanceof Error ? err.message : err);
    }
  }

  console.log(
    dryRun
      ? "Dry run complete. Preview URL after apply: /en/home?force_variant=home-layout"
      : `Done. pulled=${pulled.length} failed=${failed ? "yes" : "no"}. Preview: /en/home?force_variant=home-layout`,
  );

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
