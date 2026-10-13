/**
 * Fails when a section component sets its own outer vertical padding / margin.
 * See lib.ts for the rule and the marker comments that exempt a variant.
 *
 *   npx tsx scripts/section-spacing/check.ts                 # every variant file
 *   npx tsx scripts/section-spacing/check.ts --files a,b     # only these (pre-commit)
 */
import fs from "fs";
import { FIX_HINT, checkFile, formatHit, isVariantPath, markerSchemaMismatches, variantFiles } from "./lib";

const args = process.argv.slice(2);
const filesArg = args.find((a) => a.startsWith("--files="))?.slice("--files=".length)
  ?? (args.includes("--files") ? args[args.indexOf("--files") + 1] : undefined);

const files = filesArg !== undefined
  ? filesArg.split(",").map((f) => f.trim()).filter((f) => f && isVariantPath(f) && fs.existsSync(f))
  : variantFiles();

const results = files.map((f) => checkFile(f));
const hits = results.flatMap((r) => r.hits);

for (const w of markerSchemaMismatches(results)) console.warn(`warning: ${w}`);

if (hits.length > 0) {
  console.error(`\nSection spacing check failed (${hits.length} element${hits.length === 1 ? "" : "s"}):\n`);
  for (const h of hits) console.error(`  ${formatHit(h)}`);
  console.error(`\n${FIX_HINT}\n`);
  process.exit(1);
}

const exempt = results.filter((r) => r.marker).length;
console.log(`✓ Section spacing OK (${results.length} variant files, ${exempt} marked self-padded/overlay)`);
