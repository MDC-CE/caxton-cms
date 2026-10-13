/**
 * Section spacing rule: a section component's outermost element (and its first
 * child, unless that child is a card) must not set vertical padding or margin.
 * The section wrapper owns it through `paddingY` / `marginY` in YAML.
 *
 * Exceptions are marker comments in the variant file:
 *   // section-spacing: self-padded   (design needs its own vertical padding)
 *   // section-spacing: overlay       (modal / sticky / structured data, not in page flow)
 */
import fs from "fs";
import path from "path";
import ts from "typescript";
import { parse as parseYaml } from "yaml";
import { resolveLayoutTraits, type ComponentLayoutBlock } from "../../shared/component-layout-traits";

export type SpacingMarker = "self-padded" | "overlay";

export interface SpacingHit {
  file: string;
  line: number;
  element: "root" | "first child";
  tag: string;
  found: string[];
}

export interface FileResult {
  file: string;
  marker: SpacingMarker | null;
  hits: SpacingHit[];
}

const MARKER_RE = /\/\/\s*section-spacing:\s*(self-padded|overlay)\b/;

/** `py-12`, `md:pt-[40px]`, `-mt-16`, `!pb-8`, `py-section`; zero and `auto` are fine. */
const SPACING_CLASS_RE = /^!?(?:[\w[\]&:>*-]+:)*!?-?(?:py|pt|pb|my|mt|mb)-(.+)$/;
const CARD_CLASS_RE = /^!?(?:[\w[\]&:>*-]+:)*(?:border|rounded|shadow|bg-)/;
/** A visible box edge; a background alone is not enough (bg + py-16 is exactly the old section padding pattern). */
const BOX_EDGE_CLASS_RE = /^!?(?:[\w[\]&:>*-]+:)*(?:border|rounded|shadow)/;
const SPACING_STYLE_KEYS = new Set([
  "padding",
  "paddingTop",
  "paddingBottom",
  "paddingBlock",
  "paddingBlockStart",
  "paddingBlockEnd",
  "margin",
  "marginTop",
  "marginBottom",
  "marginBlock",
  "marginBlockStart",
  "marginBlockEnd",
]);

export function spacingClasses(tokens: string[]): string[] {
  return tokens.filter((t) => {
    const m = SPACING_CLASS_RE.exec(t);
    return !!m && m[1] !== "0" && m[1] !== "auto";
  });
}

export function isCardLike(tokens: string[]): boolean {
  return tokens.some((t) => CARD_CLASS_RE.test(t));
}

/** Outermost element drawn as a box (border / rounded / shadow): its padding sits inside its own edge. */
export function hasBoxEdge(tokens: string[]): boolean {
  return tokens.some((t) => BOX_EDGE_CLASS_RE.test(t) && !/^(?:[\w-]+:)*border-(?:0|none|transparent)$/.test(t));
}

export function markerOf(source: string): SpacingMarker | null {
  return (MARKER_RE.exec(source)?.[1] as SpacingMarker | undefined) ?? null;
}

/** Every section variant file the registry can load (same globs as client/src/components/sectionRegistry.ts). */
export function variantFiles(root = process.cwd()): string[] {
  const out: string[] = [];
  const addVariantsOf = (typeDir: string) => {
    const dir = path.join(typeDir, "variants");
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith(".tsx") && !f.endsWith(".test.tsx")) out.push(path.relative(root, path.join(dir, f)));
    }
  };
  const clientBase = path.join(root, "client/src/components");
  for (const t of fs.readdirSync(clientBase).sort()) addVariantsOf(path.join(clientBase, t));
  for (const site of fs.readdirSync(root).sort()) {
    if (!site.startsWith("site_")) continue;
    const reg = path.join(root, site, "component-registry");
    if (!fs.existsSync(reg)) continue;
    for (const t of fs.readdirSync(reg).sort()) addVariantsOf(path.join(reg, t));
  }
  return out;
}

export function isVariantPath(file: string): boolean {
  const p = file.split(path.sep).join("/");
  return /(^|\/)client\/src\/components\/[^/]+\/variants\/[^/]+\.tsx$/.test(p)
    || /(^|\/)site_[^/]+\/component-registry\/[^/]+\/variants\/[^/]+\.tsx$/.test(p);
}

type FnLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) {
    e = e.expression;
  }
  return e;
}

/** Function behind an initializer: arrow / function expression, or the first function argument of memo() / forwardRef(). */
function fnFromExpression(e: ts.Expression | undefined): FnLike | null {
  if (!e) return null;
  e = unwrap(e);
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e;
  if (ts.isCallExpression(e)) {
    for (const a of e.arguments) {
      const f = fnFromExpression(a);
      if (f) return f;
    }
  }
  return null;
}

interface FileIndex {
  sf: ts.SourceFile;
  functions: Map<string, FnLike>;
  variables: Map<string, ts.Expression>;
}

function indexFile(sf: ts.SourceFile): FileIndex {
  const functions = new Map<string, FnLike>();
  const variables = new Map<string, ts.Expression>();
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && !functions.has(node.name.text)) {
      functions.set(node.name.text, node);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!variables.has(node.name.text)) variables.set(node.name.text, node.initializer);
      const f = fnFromExpression(node.initializer);
      if (f && !functions.has(node.name.text)) functions.set(node.name.text, f);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { sf, functions, variables };
}

/** The section component(s): default export, else the export named after the file, else every exported PascalCase function. */
function componentFunctions(idx: FileIndex, file: string): FnLike[] {
  const { sf, functions } = idx;
  const exported: Array<{ name: string; fn: FnLike }> = [];
  let defaultFn: FnLike | null = null;

  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) ?? [] : [];
    const isExport = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(st) && isExport) {
      if (isDefault) defaultFn = st;
      else if (st.name) exported.push({ name: st.name.text, fn: st });
    } else if (ts.isVariableStatement(st) && isExport) {
      for (const d of st.declarationList.declarations) {
        const f = fnFromExpression(d.initializer);
        if (f && ts.isIdentifier(d.name)) exported.push({ name: d.name.text, fn: f });
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const e = unwrap(st.expression);
      if (ts.isIdentifier(e)) defaultFn = functions.get(e.text) ?? null;
      else defaultFn = fnFromExpression(e);
    } else if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        const local = (el.propertyName ?? el.name).text;
        const fn = functions.get(local);
        if (!fn) continue;
        if (el.name.text === "default") defaultFn = fn;
        else exported.push({ name: el.name.text, fn });
      }
    }
  }
  if (defaultFn) return [defaultFn];
  const base = path.basename(file, ".tsx");
  const named = exported.find((x) => x.name === base);
  if (named) return [named.fn];
  return exported.filter((x) => /^[A-Z]/.test(x.name)).map((x) => x.fn);
}

/** Return expressions of a function, not descending into nested functions (map callbacks, helpers). */
function returnExpressions(fn: FnLike): ts.Expression[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isClassLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return out;
}

type JsxEl = ts.JsxElement | ts.JsxSelfClosingElement;

/** JSX elements a return expression can render as its outermost element. */
function rootElements(e: ts.Expression, idx: FileIndex, seen = new Set<string>()): JsxEl[] {
  e = unwrap(e);
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) return [e];
  if (ts.isJsxFragment(e)) return e.children.flatMap((c) => childRoots(c, idx, seen));
  if (ts.isConditionalExpression(e)) return [...rootElements(e.whenTrue, idx, seen), ...rootElements(e.whenFalse, idx, seen)];
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return rootElements(e.right, idx, seen);
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      return [...rootElements(e.left, idx, seen), ...rootElements(e.right, idx, seen)];
    }
  }
  if (ts.isIdentifier(e) && !seen.has(e.text)) {
    const init = idx.variables.get(e.text);
    if (init) {
      seen.add(e.text);
      return rootElements(init, idx, seen);
    }
  }
  return [];
}

function childRoots(c: ts.JsxChild, idx: FileIndex, seen: Set<string>): JsxEl[] {
  if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) return [c];
  if (ts.isJsxFragment(c)) return c.children.flatMap((x) => childRoots(x, idx, seen));
  return [];
}

function meaningfulChildren(children: ts.NodeArray<ts.JsxChild>): ts.JsxChild[] {
  return children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
}

/** First child element, and whether it is the only child (its bottom spacing then also reaches the section edge). */
function firstChildElement(el: JsxEl): { child: JsxEl; only: boolean } | null {
  if (!ts.isJsxElement(el)) return null;
  const kids = meaningfulChildren(el.children);
  const first = kids[0];
  if (!first) return null;
  if (ts.isJsxElement(first) || ts.isJsxSelfClosingElement(first)) return { child: first, only: kids.length === 1 };
  if (ts.isJsxFragment(first)) {
    const inner = meaningfulChildren(first.children);
    const el0 = inner[0];
    if (el0 && (ts.isJsxElement(el0) || ts.isJsxSelfClosingElement(el0))) {
      return { child: el0, only: kids.length === 1 && inner.length === 1 };
    }
  }
  return null;
}

/** Spacing on the top side (py / pt / my / mt) reaches the section edge from a first child. */
const TOP_SIDE_RE = /(?:^|[:!-])(?:py|pt|my|mt)-/;

function attributesOf(el: JsxEl): ts.JsxAttributes {
  return ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
}

function tagName(el: JsxEl, sf: ts.SourceFile): string {
  return (ts.isJsxElement(el) ? el.openingElement.tagName : el.tagName).getText(sf);
}

function attr(el: JsxEl, name: string): ts.JsxAttribute | undefined {
  return attributesOf(el).properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

/** Every string a className expression can produce (literals, template parts, cn() args, local consts). */
function collectStrings(node: ts.Node | undefined, idx: FileIndex, seen: Set<string>, out: string[]): void {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) {
      collectStrings(span.expression, idx, seen, out);
      out.push(span.literal.text);
    }
    return;
  }
  if (ts.isFunctionLike(node)) return;
  if (ts.isPropertyAccessExpression(node)) {
    collectStrings(node.expression, idx, seen, out);
    return;
  }
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return;
    const init = idx.variables.get(node.text);
    if (init) {
      seen.add(node.text);
      collectStrings(init, idx, seen, out);
    }
    return;
  }
  if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken
      || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken) return;
  }
  if (ts.isConditionalExpression(node)) {
    collectStrings(node.whenTrue, idx, seen, out);
    collectStrings(node.whenFalse, idx, seen, out);
    return;
  }
  ts.forEachChild(node, (c) => collectStrings(c, idx, seen, out));
}

function classTokens(el: JsxEl, idx: FileIndex): string[] {
  const a = attr(el, "className") ?? attr(el, "class");
  if (!a?.initializer) return [];
  const strings: string[] = [];
  collectStrings(a.initializer, idx, new Set(), strings);
  return strings.join(" ").split(/\s+/).filter(Boolean);
}

function isZeroLiteral(e: ts.Expression): boolean {
  e = unwrap(e);
  if (ts.isNumericLiteral(e)) return Number(e.text) === 0;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return /^\s*0(px|rem|em)?\s*$/.test(e.text);
  return false;
}

function styleObject(e: ts.Expression | undefined, idx: FileIndex, seen = new Set<string>()): ts.ObjectLiteralExpression | null {
  if (!e) return null;
  e = unwrap(e);
  if (ts.isObjectLiteralExpression(e)) return e;
  if (ts.isIdentifier(e) && !seen.has(e.text)) {
    seen.add(e.text);
    return styleObject(idx.variables.get(e.text), idx, seen);
  }
  return null;
}

function styleSpacing(el: JsxEl, idx: FileIndex): string[] {
  const a = attr(el, "style");
  if (!a?.initializer || !ts.isJsxExpression(a.initializer)) return [];
  const obj = styleObject(a.initializer.expression, idx);
  if (!obj) return [];
  const out: string[] = [];
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
    if (!key || !SPACING_STYLE_KEYS.has(key) || isZeroLiteral(p.initializer)) continue;
    out.push(`style.${key}`);
  }
  return out;
}

function elementHit(
  el: JsxEl,
  idx: FileIndex,
  file: string,
  element: SpacingHit["element"],
  topSideOnly = false,
): SpacingHit | null {
  let found = [...spacingClasses(classTokens(el, idx)), ...styleSpacing(el, idx)];
  if (topSideOnly) {
    found = found.filter((f) =>
      f.startsWith("style.") ? !/Bottom|BlockEnd/.test(f) : TOP_SIDE_RE.test(f),
    );
  }
  if (found.length === 0) return null;
  const { line } = idx.sf.getLineAndCharacterOfPosition(el.getStart(idx.sf));
  return { file, line: line + 1, element, tag: tagName(el, idx.sf), found: [...new Set(found)] };
}

/** Check one variant source. `file` is only used for naming and the export-name fallback. */
export function checkSource(file: string, source: string): FileResult {
  const marker = markerOf(source);
  if (marker) return { file, marker, hits: [] };
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const idx = indexFile(sf);
  const hits: SpacingHit[] = [];
  const seenEl = new Set<ts.Node>();
  for (const fn of componentFunctions(idx, file)) {
    for (const ret of returnExpressions(fn)) {
      for (const root of rootElements(ret, idx)) {
        if (seenEl.has(root)) continue;
        seenEl.add(root);
        if (hasBoxEdge(classTokens(root, idx))) continue;
        const h = elementHit(root, idx, file, "root");
        if (h) hits.push(h);
        const first = firstChildElement(root);
        if (first && !seenEl.has(first.child) && !isCardLike(classTokens(first.child, idx))) {
          seenEl.add(first.child);
          const ch = elementHit(first.child, idx, file, "first child", !first.only);
          if (ch) hits.push(ch);
        }
      }
    }
  }
  return { file, marker: null, hits };
}

export function checkFile(file: string, root = process.cwd()): FileResult {
  return checkSource(file, fs.readFileSync(path.join(root, file), "utf8"));
}

const snakeToPascal = (s: string) =>
  s.split("_").map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join("");
const norm = (s: string) => s.replace(/[-_]/g, "").toLowerCase();

function latestSchema(regDir: string, type: string): string | null {
  const dir = path.join(regDir, type);
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir).filter((v) => /^v\d/.test(v)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  for (const v of versions.reverse()) {
    const p = path.join(dir, v, "schema.yml");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Markers vs `layout` in schema.yml (self_padded / flow: out). Warnings only:
 * schema.yml lives in site content and must never break a build.
 */
export function markerSchemaMismatches(results: FileResult[], root = process.cwd()): string[] {
  const registries = [path.join(root, "site_4geeks-com/component-registry"), path.join(root, "shared/component-registry")]
    .filter((d) => fs.existsSync(d));
  if (!registries.some((d) => d.includes("site_4geeks-com"))) return [];
  const warnings: string[] = [];
  for (const r of results) {
    const parts = r.file.split(path.sep).join("/").split("/");
    const vi = parts.lastIndexOf("variants");
    if (vi < 1) continue;
    const type = parts[vi - 1];
    const schemaPath = registries.map((d) => latestSchema(d, type)).find(Boolean);
    if (!schemaPath) continue;
    let layout: ComponentLayoutBlock | undefined;
    try {
      layout = (parseYaml(fs.readFileSync(schemaPath, "utf8")) as { layout?: ComponentLayoutBlock } | null)?.layout;
    } catch {
      continue;
    }
    const base = path.basename(r.file, ".tsx");
    const prefix = snakeToPascal(type);
    const variant = norm(base).startsWith(norm(prefix)) ? norm(base).slice(norm(prefix).length) || "default" : norm(base);
    const traits = resolveLayoutTraits(layout, variant);
    const rel = path.relative(root, schemaPath);
    if (traits.flow === "out" && r.marker !== "overlay") {
      warnings.push(`${r.file}: ${rel} says flow: out but the file has no "// section-spacing: overlay" marker`);
    } else if (traits.flow !== "out" && r.marker === "overlay") {
      warnings.push(`${r.file}: has an overlay marker but ${rel} does not say flow: out`);
    }
    if (traits.self_padded && r.marker !== "self-padded" && traits.flow !== "out") {
      warnings.push(`${r.file}: ${rel} lists this variant as self_padded but the file has no "// section-spacing: self-padded" marker`);
    } else if (!traits.self_padded && r.marker === "self-padded") {
      warnings.push(`${r.file}: has a self-padded marker but ${rel} does not list this variant under layout.self_padded`);
    }
  }
  return warnings;
}

export function formatHit(h: SpacingHit): string {
  return `${h.file}:${h.line}  <${h.tag}> (${h.element}) sets ${h.found.join(" ")}`;
}

export const FIX_HINT = [
  "Section components must not set their own outer vertical padding or margin; the section wrapper owns it.",
  "Fix: remove it and set the same amount on the section's paddingY / marginY in YAML",
  '(new sections of this type then start at 0), or add "// section-spacing: self-padded" to the file',
  "if the design really needs its own padding (and list the variant under layout.self_padded in schema.yml).",
].join("\n");
