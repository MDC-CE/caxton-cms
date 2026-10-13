import fs from "fs";
import path from "path";
import { isMap, isScalar, isSeq, parseDocument, type Document, type YAMLMap } from "yaml";
import { CLASS_BG_TO_WRAPPER, PADDING_INVENTORY, RE_EXPORTS, type Box, type PaddingInventoryEntry } from "./inventory";

export const SITE_ROOTS = ["site_4geeks-com", "site_4geeks-florida", "site_business-4geeks"];
export const SHARED_REGISTRY = "shared/component-registry";

const PRESET_PX: Record<string, number> = { none: 0, sm: 16, md: 32, lg: 64, xl: 96 };
const PX_PRESET: Record<number, string> = { 0: "none", 16: "sm", 32: "md", 64: "lg", 96: "xl" };

const normVariant = (v: string) => v.replace(/[-_]/g, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
const snakeToPascal = (s: string) =>
  s.split("_").map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join("");

/** type -> normalized variant -> "type/FileBase" (same rules as client/src/components/sectionRegistry.ts). */
export function buildVariantIndex(root = process.cwd()): Record<string, Record<string, string>> {
  const index: Record<string, Record<string, string>> = {};
  const base = path.join(root, "client/src/components");
  for (const type of fs.readdirSync(base)) {
    const dir = path.join(base, type, "variants");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".tsx") || f.endsWith(".test.tsx")) continue;
      const fileBase = f.replace(/\.tsx$/, "");
      const rest = fileBase.slice(snakeToPascal(type).length);
      const variant = rest ? rest.charAt(0).toLowerCase() + rest.slice(1) : "default";
      (index[type] ??= {})[normVariant(variant)] = `${type}/${fileBase}`;
    }
  }
  return index;
}

const entryByFile = new Map<string, PaddingInventoryEntry>();
for (const e of PADDING_INVENTORY) {
  const m = e.file.match(/components\/([^/]+)\/variants\/([^/]+)\.tsx$/);
  if (m) entryByFile.set(`${m[1]}/${m[2]}`, e);
}

export type MovedPadding = { entry: PaddingInventoryEntry; mobile: Box; desktop: Box };

export function movedPaddingFor(
  section: Record<string, unknown>,
  index: Record<string, Record<string, string>>,
): MovedPadding | null {
  const type = section.type;
  if (typeof type !== "string") return null;
  const variant = normVariant(String(section.variant ?? "default"));
  let file = index[type]?.[variant] ?? index[type]?.default;
  if (!file) return null;
  file = RE_EXPORTS[file] ?? file;
  const entry = entryByFile.get(file);
  if (!entry) return null;
  if (entry.when && !entry.when(section)) {
    return entry.otherwise ? { entry, ...entry.otherwise } : null;
  }
  return { entry, mobile: entry.mobile, desktop: entry.desktop };
}

function tokenPx(token: string): number | null {
  if (token in PRESET_PX) return PRESET_PX[token];
  const m = token.match(/^(-?\d+(?:\.\d+)?)(px)?$/);
  return m ? Number(m[1]) : null;
}

function parseSide(value: unknown): Box | null {
  if (value === undefined || value === null || value === "") return { top: 0, bottom: 0 };
  const parts = String(value).trim().split(/\s+/);
  const top = tokenPx(parts[0]);
  const bottom = tokenPx(parts[1] ?? parts[0]);
  if (top === null || bottom === null) return null;
  return { top, bottom };
}

/** Effective px per breakpoint, with the wrapper's inheritance (missing breakpoint uses the other). */
export function effectivePadding(paddingY: unknown): { mobile: Box; desktop: Box } | null {
  if (paddingY === undefined || paddingY === null) return { mobile: { top: 0, bottom: 0 }, desktop: { top: 0, bottom: 0 } };
  if (typeof paddingY !== "object" || Array.isArray(paddingY)) return null;
  const p = paddingY as Record<string, unknown>;
  const mobile = parseSide(p.mobile ?? p.desktop);
  const desktop = parseSide(p.desktop ?? p.mobile);
  if (!mobile || !desktop) return null;
  return { mobile, desktop };
}

const tokenFor = (px: number) => PX_PRESET[px] ?? `${px}px`;

export function formatSide(b: Box): string {
  return b.top === b.bottom ? tokenFor(b.top) : `${tokenFor(b.top)} ${tokenFor(b.bottom)}`;
}

export const usesExactPx = (value: string) => /\dpx\b/.test(value);

/** New paddingY object: existing + moved, keeping unrelated keys (e.g. a stray section_id). */
export function addPadding(
  paddingY: unknown,
  moved: { mobile: Box; desktop: Box },
): Record<string, unknown> | null {
  const eff = effectivePadding(paddingY);
  if (!eff) return null;
  const mobile = formatSide({ top: eff.mobile.top + moved.mobile.top, bottom: eff.mobile.bottom + moved.mobile.bottom });
  const desktop = formatSide({ top: eff.desktop.top + moved.desktop.top, bottom: eff.desktop.bottom + moved.desktop.bottom });
  const original = paddingY && typeof paddingY === "object" ? (paddingY as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  const hadMobile = original.mobile !== undefined;
  for (const [k, v] of Object.entries(original)) {
    if (k === "mobile" || k === "desktop") continue;
    out[k] = v;
  }
  if (hadMobile || mobile !== desktop) out.mobile = mobile;
  out.desktop = desktop;
  return out;
}

/** Wrapper background needed so the moved padding keeps the color the variant root painted. */
export function wrapperBackgroundFor(
  section: Record<string, unknown>,
  entry: PaddingInventoryEntry,
): { value: string } | { unknownClass: string } | null {
  if (entry.bg !== "class") return null;
  const current = typeof section.background === "string" ? section.background.trim() : undefined;
  const painted = current === undefined || current === "" ? entry.defaultBg : current;
  if (!painted || !painted.startsWith("bg-")) return null;
  if (!(painted in CLASS_BG_TO_WRAPPER)) return { unknownClass: painted };
  const mapped = CLASS_BG_TO_WRAPPER[painted];
  return mapped ? { value: mapped } : null;
}

export function walkYamlFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkYamlFiles(p, out);
    else if (/\.ya?ml$/.test(e.name)) out.push(p);
  }
  return out;
}

export function contentFiles(root = process.cwd()): string[] {
  const files: string[] = [];
  for (const r of SITE_ROOTS) walkYamlFiles(path.join(root, r), files);
  for (const f of walkYamlFiles(path.join(root, SHARED_REGISTRY))) {
    if (f.includes(`${path.sep}examples${path.sep}`)) files.push(f);
  }
  return files.map((f) => path.relative(root, f));
}

export type SectionRef = {
  /** Path inside the document that holds the section map. */
  node: YAMLMap;
  doc: Document;
  /** Set when the section lives inside an example's `yaml: |` string. */
  innerOf?: { outer: Document; key: string };
  label: string;
};

/** Every section map in a content or example file. */
export function findSections(doc: Document, file: string): SectionRef[] {
  const out: SectionRef[] = [];
  const visit = (node: unknown, trail: string) => {
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = isScalar(pair.key) ? String(pair.key.value) : "";
        if (key === "sections" && isSeq(pair.value)) {
          pair.value.items.forEach((item, i) => {
            if (isMap(item) && item.has("type")) out.push({ node: item, doc, label: `${trail}sections[${i}]` });
            visit(item, `${trail}sections[${i}].`);
          });
        } else {
          visit(pair.value, `${trail}${key}.`);
        }
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => visit(item, `${trail}[${i}].`));
    }
  };
  const isExample = file.includes("/examples/");
  const root = doc.contents;
  if (isExample && isMap(root) && root.has("type")) out.push({ node: root, doc, label: "(example)" });
  if (isExample && isMap(root) && typeof root.get("yaml") === "string") {
    const inner = parseDocument(String(root.get("yaml")));
    const ic = inner.contents;
    if (isSeq(ic)) {
      ic.items.forEach((item, i) => {
        if (isMap(item) && item.has("type")) out.push({ node: item, doc: inner, innerOf: { outer: doc, key: "yaml" }, label: `yaml[${i}]` });
      });
    } else if (isMap(ic) && ic.has("type")) {
      out.push({ node: ic, doc: inner, innerOf: { outer: doc, key: "yaml" }, label: "yaml" });
    } else {
      for (const s of findSections(inner, "")) out.push({ ...s, innerOf: { outer: doc, key: "yaml" }, label: `yaml.${s.label}` });
    }
  }
  visit(root, "");
  return out;
}

/**
 * Template files hold unquoted `{{ ... }}` bindings, which are not valid YAML.
 * Swap each line's binding span for a plain token before parsing and put it back after.
 */
export function maskBindings(text: string): { masked: string; unmask: (s: string) => string } {
  const spans: string[] = [];
  const masked = text
    .split("\n")
    .map((line) => {
      const start = line.indexOf("{{");
      const end = line.lastIndexOf("}}");
      if (start < 0 || end < start) return line;
      spans.push(line.slice(start, end + 2));
      return `${line.slice(0, start)}__SPBIND_${spans.length - 1}__${line.slice(end + 2)}`;
    })
    .join("\n");
  const unmask = (s: string) => s.replace(/__SPBIND_(\d+)__/g, (_, i) => spans[Number(i)]);
  return { masked, unmask };
}

export function siteOf(file: string): string {
  return file.split("/")[0] === "shared" ? SHARED_REGISTRY : file.split("/")[0];
}
