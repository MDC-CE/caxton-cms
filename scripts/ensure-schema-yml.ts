#!/usr/bin/env tsx
/**
 * Ensure schema.yml stays in sync with schema.ts variant definitions.
 * Check first; on failure, run schema-sync and re-check.
 *
 * Usage: npm run ensure:schema-yml
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });

process.env.LOG_LEVEL = "silent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const syncScript = path.join(root, "scripts", "schema-sync", "sync-schemas.ts");

function runTsx(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const tsxBin = path.join(root, "node_modules", ".bin", "tsx");
    const child = spawn(tsxBin, [syncScript, ...args], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function reportVariantMetadataGaps(): Promise<void> {
  try {
    const { findVariantMetadataGaps } = await import("../server/design/variant-metadata");
    const gaps = findVariantMetadataGaps(root);
    if (gaps.length === 0) return;
    const empty = gaps.filter((g) => g.missing.includes("empty")).length;
    const noBestFor = gaps.filter((g) => g.missing.includes("best_for")).length;
    const noShape = gaps.filter((g) => g.missing.includes("content_shape")).length;
    console.warn(
      `\n⚠ Variant metadata gaps (advisory): ${gaps.length} variants — ` +
        `${empty} empty, ${noBestFor} without best_for, ${noShape} without content_shape.\n` +
        "  Agents pick variants from best_for / avoid_when / content_shape.\n" +
        "  Fill with: npm run variant-metadata:backfill -- --site <site_folder> (measure + draft), then approve in Component Registry.\n",
    );
  } catch (err) {
    console.warn("variant metadata check skipped:", err instanceof Error ? err.message : String(err));
  }
}

async function main(): Promise<void> {
  console.log("Checking schema.ts ↔ schema.yml variant drift...\n");

  let code = await runTsx(["--check"]);
  if (code === 0) {
    await reportVariantMetadataGaps();
    process.exit(0);
  }

  console.log("\nSchema drift detected — running schema:sync to heal schema.yml...\n");

  const syncCode = await runTsx([]);
  if (syncCode !== 0) {
    console.error("\nSchema sync failed — cannot ensure schema.yml.\n");
    process.exit(syncCode);
  }

  console.log("\nRe-checking schema.yml after sync...\n");
  code = await runTsx(["--check"]);
  if (code === 0) {
    console.log("\n✓ schema.yml synced after schema:sync");
    await reportVariantMetadataGaps();
    process.exit(0);
  }

  console.error(
    "\nStill drifting after schema:sync.\n" +
      "Inspect failing components under site_*/component-registry/**/schema.ts\n" +
      "and adjacent schema.yml, then re-run: npm run schema:sync -- --component=<type>\n",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
