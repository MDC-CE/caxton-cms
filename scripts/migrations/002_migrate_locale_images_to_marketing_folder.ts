/**
 * @migration 002_migrate_locale_images_to_marketing_folder
 * @description Copies images referenced as /attached_assets/* in the image registry
 * and YAML content files to 4geeks-com/images/ and updates all paths.
 * Idempotent — safe to re-run; files already at the destination are skipped.
 * @scope all
 * @dry-run
 *
 * Usage:
 *   npx tsx scripts/migrations/002_migrate_locale_images_to_marketing_folder.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const ATTACHED_ASSETS_DIR = path.join(ROOT, "attached_assets");
const MARKETING_IMAGES_DIR = path.join(ROOT, "4geeks-com", "images");
const REGISTRY_PATH = path.join(ROOT, "4geeks-com", "image-registry.json");
const MARKETING_CONTENT_DIR = path.join(ROOT, "4geeks-com");

interface MigrationResult {
  copied: string[];
  alreadyExists: string[];
  missing: string[];
  registryUpdated: number;
  yamlUpdated: number;
}

function findYamlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findYamlFiles(fullPath));
    } else if (/\.(yml|yaml)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function run(dryRun: boolean): MigrationResult {
  const result: MigrationResult = {
    copied: [],
    alreadyExists: [],
    missing: [],
    registryUpdated: 0,
    yamlUpdated: 0,
  };

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  let registryChanged = false;

  for (const [id, entry] of Object.entries(registry.images)) {
    const src = (entry as any).src as string;
    if (!src || !src.startsWith("/attached_assets/")) continue;

    const filename = src.replace("/attached_assets/", "");
    const sourcePath = path.join(ATTACHED_ASSETS_DIR, filename);
    const destPath = path.join(MARKETING_IMAGES_DIR, filename);
    const newSrc = `/4geeks-com/images/${filename}`;

    if (!fs.existsSync(sourcePath)) {
      const destExists = fs.existsSync(destPath);
      if (destExists) {
        (entry as any).src = newSrc;
        registryChanged = true;
        result.registryUpdated++;
        result.alreadyExists.push(filename);
      } else {
        result.missing.push(`${id}: ${src}`);
      }
      continue;
    }

    if (fs.existsSync(destPath)) {
      result.alreadyExists.push(filename);
    } else {
      if (!dryRun) {
        const destDir = path.dirname(destPath);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(sourcePath, destPath);
      }
      result.copied.push(filename);
    }

    (entry as any).src = newSrc;
    registryChanged = true;
    result.registryUpdated++;
  }

  if (!dryRun && registryChanged) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
  }

  const yamlFiles = findYamlFiles(MARKETING_CONTENT_DIR);
  for (const yamlPath of yamlFiles) {
    let content = fs.readFileSync(yamlPath, "utf8");
    const matches = content.match(/\/attached_assets\/[^\s"',\])}]+/g);
    if (!matches) continue;

    let changed = false;
    for (const match of matches) {
      const filename = match.replace("/attached_assets/", "");
      const destPath = path.join(MARKETING_IMAGES_DIR, filename);
      const sourcePath = path.join(ATTACHED_ASSETS_DIR, filename);

      const existsInDest = fs.existsSync(destPath);
      const existsInSrc = fs.existsSync(sourcePath);

      if (existsInDest || existsInSrc) {
        if (!existsInDest && existsInSrc && !dryRun) {
          const destDir = path.dirname(destPath);
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(sourcePath, destPath);
          if (!result.copied.includes(filename)) {
            result.copied.push(filename);
          }
        }

        const newPath = `/4geeks-com/images/${filename}`;
        content = content.split(match).join(newPath);
        changed = true;
      }
    }

    if (changed) {
      if (!dryRun) {
        fs.writeFileSync(yamlPath, content);
      }
      result.yamlUpdated++;
    }
  }

  return result;
}

const dryRun = process.argv.includes("--dry-run");
const mode = dryRun ? "DRY RUN" : "LIVE";

console.log(`\n=== [Migration 002] Image Migration (${mode}) ===\n`);
console.log(`Source:      attached_assets/`);
console.log(`Destination: 4geeks-com/images/\n`);

const result = run(dryRun);

console.log(`Files copied:             ${result.copied.length}`);
console.log(`Already in destination:   ${result.alreadyExists.length}`);
console.log(`Missing from source:      ${result.missing.length}`);
console.log(`Registry entries updated: ${result.registryUpdated}`);
console.log(`YAML files updated:       ${result.yamlUpdated}`);

if (result.missing.length > 0) {
  console.log(`\nMissing files (not found in either location):`);
  result.missing.forEach((m) => console.log(`  - ${m}`));
}

if (result.copied.length > 0 && dryRun) {
  console.log(`\nFiles that would be copied:`);
  result.copied.slice(0, 20).forEach((f) => console.log(`  - ${f}`));
  if (result.copied.length > 20) console.log(`  ... and ${result.copied.length - 20} more`);
}

if (result.alreadyExists.length > 0 && dryRun) {
  console.log(`\nFiles already in destination (registry refs would be updated):`);
  result.alreadyExists.slice(0, 20).forEach((f) => console.log(`  - ${f}`));
  if (result.alreadyExists.length > 20) console.log(`  ... and ${result.alreadyExists.length - 20} more`);
}

if (dryRun) {
  console.log(`\nRun without --dry-run to apply changes.`);
} else {
  console.log(`\nMigration complete.`);
}
