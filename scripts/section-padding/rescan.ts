/**
 * Read-only post-deploy check: sections of types whose outer padding moved into `paddingY`
 * that look like they are missing it (saved with the old value, added later, or reverted).
 *
 *   npx tsx scripts/section-padding/rescan.ts
 *
 * Fix by hand in the editor, or re-run the move on just the listed files:
 *   npx tsx scripts/section-padding/move-padding.ts --files <file,file>
 * (that only adds padding to sections not already at their recorded "after" value).
 */
import fs from "fs";
import { parseDocument } from "yaml";
import { buildVariantIndex, contentFiles, effectivePadding, findSections, maskBindings, movedPaddingFor } from "./lib";
import type { LedgerRow } from "./move-padding";

const LEDGER_PATH = "reports/section-padding-move-ledger.json";

const sorted = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : v;
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));

const index = buildVariantIndex();
const ledger: LedgerRow[] = fs.existsSync(LEDGER_PATH) ? JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")) : [];
const byKey = new Map(ledger.map((r) => [`${r.file}#${r.section}`, r]));

type Finding = { file: string; section: string; type: string; variant: string; paddingY: unknown; reason: string };
const findings: Finding[] = [];
let checked = 0;

for (const file of contentFiles()) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("type:")) continue;
  const doc = parseDocument(maskBindings(text).masked);
  if (doc.errors.length) continue;
  for (const ref of findSections(doc, file)) {
    const section = ref.node.toJSON() as Record<string, unknown>;
    const moved = movedPaddingFor(section, index);
    if (!moved) continue;
    checked++;
    const row = byKey.get(`${file}#${ref.label}`);
    const base = { file, section: ref.label, type: String(section.type), variant: String(section.variant ?? "default"), paddingY: section.paddingY ?? null };
    if (row && same(section.paddingY, row.after)) {
      if (row.background_after && section.background !== row.background_after) {
        findings.push({ ...base, reason: `background is ${JSON.stringify(section.background ?? null)}, expected ${row.background_after}` });
      }
      continue;
    }
    if (row && !same(row.before, row.after) && same(section.paddingY, row.before)) {
      findings.push({ ...base, reason: "back to its value from before the move (saved or pulled with the old value)" });
      continue;
    }
    const eff = effectivePadding(section.paddingY);
    if (!eff) {
      findings.push({ ...base, reason: "paddingY not understood" });
      continue;
    }
    const short =
      eff.mobile.top < moved.mobile.top || eff.mobile.bottom < moved.mobile.bottom ||
      eff.desktop.top < moved.desktop.top || eff.desktop.bottom < moved.desktop.bottom;
    if (short) {
      findings.push({
        ...base,
        reason: row
          ? "edited after the move and now below the padding the component used to add"
          : "not in the move ledger (new or unmigrated) and below the padding the component used to add",
      });
    }
  }
}

console.log("sections checked", checked);
console.log("findings", findings.length);
for (const f of findings) {
  console.log(`- ${f.file} ${f.section} [${f.type}/${f.variant}] paddingY=${JSON.stringify(f.paddingY)}: ${f.reason}`);
}
const files = [...new Set(findings.map((f) => f.file))];
if (files.length) {
  console.log("\nTo re-apply the move on these files (review each first; intentional smaller spacing should stay):");
  console.log(`npx tsx scripts/section-padding/move-padding.ts --dry-run --files ${files.join(",")}`);
}
