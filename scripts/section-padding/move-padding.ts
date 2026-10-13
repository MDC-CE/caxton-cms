/**
 * One-off: add the outer padding removed from variant files to each section's `paddingY`
 * so live pages render the same. See scripts/section-padding/inventory.ts.
 *
 *   npx tsx scripts/section-padding/move-padding.ts --dry-run            # print changes, write nothing
 *   npx tsx scripts/section-padding/move-padding.ts                      # write YAML + ledger
 *   npx tsx scripts/section-padding/move-padding.ts --files a.yml,b.yml  # only these files
 *
 * Edits are surgical (only the paddingY / background lines change). Sections already in
 * the ledger with their "after" value are skipped, so a re-run never adds the padding twice.
 */
import fs from "fs";
import path from "path";
import { isMap, isScalar, parseDocument, type Document, type Pair, type YAMLMap } from "yaml";
import {
  addPadding,
  buildVariantIndex,
  contentFiles,
  findSections,
  maskBindings,
  movedPaddingFor,
  siteOf,
  usesExactPx,
  wrapperBackgroundFor,
} from "./lib";

export const LEDGER_PATH = "reports/section-padding-move-ledger.json";

export type LedgerRow = {
  site: string;
  file: string;
  section: string;
  section_id?: string;
  type: string;
  variant: string;
  component: string;
  before: unknown;
  after: Record<string, unknown>;
  background_before?: unknown;
  background_after?: string;
  exact_px: boolean;
  note?: string;
  flags: string[];
};

type Edit = { start: number; end: number; text: string };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filesArg = args.find((a) => a.startsWith("--files="))?.slice("--files=".length)
  ?? (args.includes("--files") ? args[args.indexOf("--files") + 1] : undefined);
const onlyFiles = filesArg ? new Set(filesArg.split(",").map((f) => f.trim()).filter(Boolean)) : null;

const sorted = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : v;
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const columnAt = (src: string, offset: number) => offset - src.lastIndexOf("\n", offset - 1) - 1;
const scalarText = (v: unknown) => {
  const s = String(v);
  return /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(s) && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) ? s : JSON.stringify(s);
};

function pairOf(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((p) => isScalar(p.key) && String(p.key.value) === key) as Pair | undefined;
}

function renderMap(obj: Record<string, unknown>, indent: number, keyOrder: string[]): string {
  const keys = [...keyOrder.filter((k) => k in obj), ...Object.keys(obj).filter((k) => !keyOrder.includes(k))];
  return keys.map((k, i) => `${i === 0 ? "" : " ".repeat(indent)}${k}: ${scalarText(obj[k])}`).join("\n");
}

/** Edits that set `key` on a block section map without touching anything else. */
function setKeyEdits(src: string, map: YAMLMap, key: string, value: unknown): Edit[] | string {
  if (map.flow) return "section is a flow map";
  const pair = pairOf(map, key);
  if (pair && pair.value && (pair.value as { range?: number[] }).range) {
    const node = pair.value as { range: [number, number, number]; flow?: boolean };
    const start = node.range[0];
    const raw = src.slice(start, node.range[1]);
    const end = start + raw.trimEnd().length;
    if (typeof value === "object" && value) {
      const original = isMap(pair.value) ? (pair.value.toJSON() as Record<string, unknown>) : {};
      const order = Object.keys(original);
      if (!order.includes("mobile") && "mobile" in (value as object)) order.splice(Math.max(0, order.indexOf("desktop")), 0, "mobile");
      if (isMap(pair.value) && !node.flow) {
        return [{ start, end, text: renderMap(value as Record<string, unknown>, columnAt(src, start), order) }];
      }
      const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${scalarText(v)}`);
      return [{ start, end, text: `{ ${entries.join(", ")} }` }];
    }
    return [{ start, end, text: scalarText(value) }];
  }
  const typePair = pairOf(map, "type");
  const keyNode = typePair?.key as { range?: number[] } | undefined;
  if (!keyNode?.range) return "no type key to anchor the new field";
  const at = keyNode.range[0];
  const col = columnAt(src, at);
  const pad = " ".repeat(col);
  const body = typeof value === "object" && value
    ? `${key}:\n${pad}  ${renderMap(value as Record<string, unknown>, col + 2, ["mobile", "desktop"])}`
    : `${key}: ${scalarText(value)}`;
  return [{ start: at, end: at, text: `${body}\n${pad}` }];
}

function applyEdits(src: string, edits: Edit[]): string {
  let out = src;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Re-indent an edited `yaml: |` block body back into the outer file. */
function blockLiteralEdit(outerSrc: string, outer: Document, key: string, newInner: string): Edit | string {
  const pair = isMap(outer.contents) ? pairOf(outer.contents, key) : undefined;
  const node = pair?.value as { range?: [number, number, number] } | undefined;
  if (!node?.range) return "example yaml block not found";
  const [start, end] = node.range;
  const original = outerSrc.slice(start, end);
  const headerEnd = original.indexOf("\n");
  if (!original.startsWith("|") || headerEnd < 0) return "example yaml is not a literal block";
  const firstLine = original.slice(headerEnd + 1).split("\n").find((l) => l.trim() !== "") ?? "";
  const indent = firstLine.length - firstLine.trimStart().length;
  const body = newInner.replace(/\n$/, "").split("\n").map((l) => (l ? " ".repeat(indent) + l : l)).join("\n");
  const trailing = original.endsWith("\n") ? "\n" : "";
  return { start, end, text: `${original.slice(0, headerEnd)}\n${body}${trailing}` };
}

const root = process.cwd();
const index = buildVariantIndex(root);
const ledger: LedgerRow[] = fs.existsSync(LEDGER_PATH) ? JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")) : [];
const doneKey = (file: string, section: string) => `${file}#${section}`;
const done = new Map(ledger.map((r) => [doneKey(r.file, r.section), r]));

const rows: LedgerRow[] = [];
const problems: string[] = [];
let filesChanged = 0;

for (const file of contentFiles(root)) {
  if (onlyFiles && !onlyFiles.has(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("type:")) continue;
  const { masked, unmask } = maskBindings(text);
  const doc = parseDocument(masked);
  if (doc.errors.length) {
    if (/\bsections:/.test(text) || file.includes("/examples/")) {
      problems.push(`${file}: YAML parse error ${doc.errors[0].message.split("\n")[0]} (file skipped)`);
    }
    continue;
  }

  const pageMaxWidth = isMap(doc.contents) && (doc.contents.has("maxWidth") || doc.getIn(["section_defaults", "maxWidth"]) !== undefined);
  const outerEdits: Edit[] = [];
  const innerEdits: Edit[] = [];
  let innerSrc: string | null = null;
  let innerExpected: Array<{ label: string; paddingY: unknown; background?: string }> = [];
  const expected: Array<{ label: string; paddingY: unknown; background?: string }> = [];
  const fileRows: LedgerRow[] = [];

  for (const ref of findSections(doc, file)) {
    const section = ref.node.toJSON() as Record<string, unknown>;
    const moved = movedPaddingFor(section, index);
    if (!moved) continue;
    const prior = done.get(doneKey(file, ref.label));
    if (prior && same(section.paddingY, prior.after)) continue;

    const after = addPadding(section.paddingY, moved);
    if (!after) {
      problems.push(`${file} ${ref.label}: paddingY not understood ${JSON.stringify(section.paddingY)} (left as is)`);
      continue;
    }
    const flags: string[] = [];
    const bg = wrapperBackgroundFor(section, moved.entry);
    if (bg && "unknownClass" in bg) {
      problems.push(`${file} ${ref.label}: background class ${bg.unknownClass} has no wrapper equivalent (left as is)`);
      continue;
    }
    const backgroundAfter = bg && "value" in bg ? bg.value : undefined;
    if (backgroundAfter && (section.maxWidth !== undefined || section.paddingX !== undefined || section.marginX !== undefined || pageMaxWidth)) {
      flags.push("background now spans the full section width (section has maxWidth/paddingX/marginX)");
    }

    const src = ref.innerOf ? (innerSrc ??= String((ref.innerOf.outer.contents as YAMLMap).get("yaml"))) : masked;
    const sink = ref.innerOf ? innerEdits : outerEdits;
    const padEdits = setKeyEdits(src, ref.node, "paddingY", after);
    const bgEdits = backgroundAfter ? setKeyEdits(src, ref.node, "background", backgroundAfter) : [];
    if (typeof padEdits === "string" || typeof bgEdits === "string") {
      problems.push(`${file} ${ref.label}: ${typeof padEdits === "string" ? padEdits : bgEdits} (left as is)`);
      continue;
    }
    sink.push(...padEdits, ...bgEdits);
    (ref.innerOf ? innerExpected : expected).push({ label: ref.label, paddingY: after, background: backgroundAfter });

    fileRows.push({
      site: siteOf(file),
      file,
      section: ref.label,
      section_id: typeof section.section_id === "string" ? section.section_id : undefined,
      type: String(section.type),
      variant: String(section.variant ?? "default"),
      component: moved.entry.file.split("/").pop()!.replace(/\.tsx$/, ""),
      before: section.paddingY ?? null,
      after,
      ...(backgroundAfter ? { background_before: section.background ?? null, background_after: backgroundAfter } : {}),
      exact_px: Object.values(after).some((v) => typeof v === "string" && usesExactPx(v)),
      note: moved.entry.note,
      flags,
    });
  }

  if (!fileRows.length) continue;

  if (innerEdits.length && innerSrc !== null) {
    const edit = blockLiteralEdit(masked, doc, "yaml", applyEdits(innerSrc, innerEdits));
    if (typeof edit === "string") {
      problems.push(`${file}: ${edit} (file skipped)`);
      continue;
    }
    outerEdits.push(edit);
  }

  const edited = applyEdits(masked, outerEdits);
  const check = parseDocument(edited);
  const verify = (d: Document, want: typeof expected) => {
    const got = new Map(findSections(d, file).map((s) => [s.label, s.node.toJSON() as Record<string, unknown>]));
    return want.every((w) => same(got.get(w.label)?.paddingY, w.paddingY) && (!w.background || got.get(w.label)?.background === w.background));
  };
  if (check.errors.length || !verify(check, [...expected, ...innerExpected])) {
    problems.push(`${file}: edit did not round-trip (file skipped)`);
    if (process.env.SP_DEBUG_DIR) {
      const out = path.join(process.env.SP_DEBUG_DIR, file.replace(/\//g, "__"));
      fs.mkdirSync(process.env.SP_DEBUG_DIR, { recursive: true });
      fs.writeFileSync(out, edited);
    }
    continue;
  }

  rows.push(...fileRows);
  filesChanged++;
  if (!dryRun) fs.writeFileSync(file, unmask(edited));
}

const show = (v: unknown) => (v === null || v === undefined ? "(unset)" : JSON.stringify(v));
for (const r of rows) {
  const bg = r.background_after ? `  background ${show(r.background_before)} -> ${r.background_after}` : "";
  console.log(`${r.file} ${r.section} [${r.type}/${r.variant}] ${show(r.before)} -> ${JSON.stringify(r.after)}${bg}${r.flags.length ? `  !! ${r.flags.join("; ")}` : ""}`);
}
const byComponent = new Map<string, number>();
for (const r of rows) byComponent.set(r.component, (byComponent.get(r.component) ?? 0) + 1);
console.log("\nsections", rows.length, "files", filesChanged);
console.log("per component", Object.fromEntries([...byComponent.entries()].sort()));
console.log("exact px", rows.filter((r) => r.exact_px).length, "background changes", rows.filter((r) => r.background_after).length, "flagged", rows.filter((r) => r.flags.length).length);
if (problems.length) {
  console.log("\nproblems");
  for (const p of problems) console.log(" ", p);
}

if (!dryRun && rows.length) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  const merged = new Map(ledger.map((r) => [doneKey(r.file, r.section), r]));
  for (const r of rows) merged.set(doneKey(r.file, r.section), r);
  fs.writeFileSync(LEDGER_PATH, JSON.stringify([...merged.values()], null, 2) + "\n");
  console.log("ledger", LEDGER_PATH);
}
if (problems.length) process.exitCode = 1;
