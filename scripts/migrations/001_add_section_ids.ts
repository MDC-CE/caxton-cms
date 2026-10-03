/**
 * @migration 001_add_section_ids
 * @description Adds a stable `section_id` to every section in 4geeks-com that is missing one. Idempotent — safe to re-run, existing IDs are never overwritten.
 * @scope all
 *
 * IMPORTANT: This migration uses pure text injection — it never does a full YAML round-trip.
 * This preserves template variables like {{ global.x | default }} which would otherwise be
 * corrupted by yaml.load() / yaml.dump() (YAML parses {{ }} as flow mappings).
 */

import fs from "fs";
import path from "path";

function generateSectionId(componentType: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${componentType}-${suffix}`;
}

function walkDir(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Check if a section block (starting at lineIndex) already has a section_id
 * before the next top-level section starts.
 */
function sectionHasId(lines: string[], startLine: number): boolean {
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^  - type:/.test(lines[i])) break;
    if (/^    section_id:/.test(lines[i])) return true;
  }
  return false;
}

/**
 * Check if the file has any sections at all (contains `  - type:` pattern).
 */
function hasSections(rawText: string): boolean {
  return /^  - type:\s*\S+/m.test(rawText);
}

/**
 * Pure text injection: find each `  - type: <name>` line and insert
 * `    section_id: <id>` immediately after it, if no section_id already exists
 * in that section block.
 *
 * Never parses or dumps YAML — template vars are completely untouched.
 */
function addMissingSectionIds(rawText: string): { patched: string; idsAdded: number } {
  const lines = rawText.split("\n");
  const result: string[] = [];
  let idsAdded = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    const typeMatch = line.match(/^  - type:\s*(\S+)/);
    if (typeMatch) {
      if (!sectionHasId(lines, i)) {
        const sectionType = typeMatch[1];
        const id = generateSectionId(sectionType);
        result.push(`    section_id: ${id}`);
        idsAdded++;
      }
    }
  }

  return { patched: result.join("\n"), idsAdded };
}

const MARKETING_CONTENT = path.join(process.cwd(), "4geeks-com");
const files = walkDir(MARKETING_CONTENT).filter(f => !f.includes("/component-registry/"));

let totalFilesChanged = 0;
let totalIdsAdded = 0;

for (const filePath of files) {
  const rawContent = fs.readFileSync(filePath, "utf-8");

  if (!hasSections(rawContent)) continue;

  const { patched, idsAdded } = addMissingSectionIds(rawContent);

  if (idsAdded > 0) {
    fs.writeFileSync(filePath, patched, "utf-8");
    totalFilesChanged++;
    totalIdsAdded += idsAdded;
    console.log(`  Updated: ${path.relative(process.cwd(), filePath)} (+${idsAdded} ids)`);
  }
}

console.log(`\nMigration complete:`);
console.log(`  Files changed: ${totalFilesChanged}`);
console.log(`  Section IDs added: ${totalIdsAdded}`);
if (totalIdsAdded === 0) {
  console.log(`  (All sections already have IDs — nothing to do.)`);
}
