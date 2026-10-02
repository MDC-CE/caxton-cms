#!/usr/bin/env tsx
/**
 * Rewrites section backgrounds stored as CSS that equals a theme palette
 * entry (e.g. `hsl(var(--muted))`, `hsl(210 100% 50% / 0.05)`) to the
 * palette ID (`muted`, `light-blue-5`) and reports everything off-theme.
 *
 * Only `sections[i].background` lines are touched (surgical line edits, the
 * rest of each YAML file is left byte-for-byte). Off-theme values and
 * hardcoded rich-text inline styles are reported, never rewritten.
 *
 * Usage:
 *   npx tsx scripts/migrate-theme-backgrounds.ts [--site site_4geeks-com] [--write] [--legacy-safe] [--theme path/theme.json] [--report artifacts/theme-off-report.json] [--list]
 *
 * Without --write it is a dry run. Prints the changed file list (relative to
 * the app root) so the caller can push them to the content repo.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { classifyThemeValue, LEGACY_BACKGROUND_TOKENS, type ThemePaletteEntry } from "../shared/theme-palette";
import { findOffThemeInlineStyles, type ThemeTypography } from "../shared/rich-text-inline-styles";
import { escapeTemplateVars, unescapeObjectVars } from "../shared/templateVars";
import { rewriteSectionBackgroundLines, type BackgroundLineChange } from "../shared/section-background-lines";

function safeLoad(raw: string): unknown {
  const { escaped, map } = escapeTemplateVars(raw);
  return unescapeObjectVars(yaml.load(escaped), map);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "images", "media", "db", ".cache"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function walkYaml(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkYaml(full, out);
    } else if (/\.ya?ml$/.test(entry.name)) {
      out.push(full);
    }
  }
}

/** Replace legacy-CSS section backgrounds with their palette IDs. */
export function migrateBackgroundLines(
  source: string,
  backgrounds: ThemePaletteEntry[],
  opts: { onlyIds?: Set<string> } = {},
): { text: string; changes: BackgroundLineChange[] } {
  return rewriteSectionBackgroundLines(source, (value) => {
    const cls = classifyThemeValue(value, backgrounds);
    if (cls.kind !== "theme_css") return null;
    if (opts.onlyIds && !opts.onlyIds.has(cls.id)) return null;
    return cls.id;
  });
}

function sectionsOf(doc: unknown): Record<string, unknown>[] {
  if (Array.isArray(doc)) return doc.filter((s) => s && typeof s === "object");
  if (doc && typeof doc === "object") {
    const d = doc as Record<string, unknown>;
    if (Array.isArray(d.sections)) return d.sections.filter((s) => s && typeof s === "object") as Record<string, unknown>[];
    if (typeof d.yaml === "string") {
      try {
        return sectionsOf(safeLoad(d.yaml));
      } catch {
        return [];
      }
    }
  }
  return [];
}

function collectRichText(value: unknown, out: string[], depth = 0): void {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") {
    if (value.includes("style=")) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectRichText(v, out, depth + 1);
  } else if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectRichText(v, out, depth + 1);
  }
}

async function main() {
  const site = arg("--site") ?? "site_4geeks-com";
  const write = process.argv.includes("--write");
  const reportPath = arg("--report") ?? path.join("artifacts", `theme-off-report.${site}.json`);
  const root = path.resolve(process.cwd(), site);
  const themePath = arg("--theme") ? path.resolve(process.cwd(), arg("--theme")!) : path.join(root, "theme.json");
  if (!fs.existsSync(themePath)) {
    console.error("no theme.json", themePath);
    process.exit(1);
  }
  const theme = JSON.parse(fs.readFileSync(themePath, "utf-8")) as {
    backgrounds?: ThemePaletteEntry[];
  } & ThemeTypography;
  const backgrounds = theme.backgrounds ?? [];
  // --legacy-safe: only IDs the pre-theme renderer already understood, so the
  // rewrite is safe before the theme-var renderer is deployed.
  const onlyIds = process.argv.includes("--legacy-safe")
    ? new Set(Object.keys(LEGACY_BACKGROUND_TOKENS))
    : undefined;

  const files: string[] = [];
  walkYaml(root, files);

  const changedFiles: string[] = [];
  let replaced = 0;
  const offThemeBackgrounds = new Map<string, string[]>();
  const offThemeInline = new Map<string, { count: number; files: Set<string> }>();

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const source = fs.readFileSync(file, "utf-8");
    if (!source.includes("background:") && !source.includes("style=")) continue;

    const { text, changes } = migrateBackgroundLines(source, backgrounds, { onlyIds });
    if (changes.length > 0) {
      replaced += changes.length;
      changedFiles.push(rel);
      if (write) fs.writeFileSync(file, text, "utf-8");
    }

    let doc: unknown;
    try {
      doc = safeLoad(text);
    } catch {
      continue;
    }
    for (const section of sectionsOf(doc)) {
      const cls = classifyThemeValue(section.background, backgrounds);
      if (cls.kind === "off_theme") {
        const key = String(section.background);
        const list = offThemeBackgrounds.get(key) ?? [];
        list.push(rel);
        offThemeBackgrounds.set(key, list);
      }
      const strings: string[] = [];
      const { background: _bg, ...rest } = section;
      collectRichText(rest, strings);
      for (const s of strings) {
        for (const f of findOffThemeInlineStyles(s, theme)) {
          const key = `${f.property}: ${f.value}`;
          const hit = offThemeInline.get(key) ?? { count: 0, files: new Set<string>() };
          hit.count++;
          hit.files.add(rel);
          offThemeInline.set(key, hit);
        }
      }
    }
  }

  const report = {
    site,
    generatedAt: new Date().toISOString(),
    mode: write ? "write" : "dry-run",
    legacyCssReplaced: replaced,
    changedFiles,
    offThemeBackgrounds: Array.from(offThemeBackgrounds.entries())
      .map(([value, where]) => ({ value, count: where.length, files: Array.from(new Set(where)) }))
      .sort((a, b) => b.count - a.count),
    offThemeInlineStyles: Array.from(offThemeInline.entries())
      .map(([value, hit]) => ({ value, count: hit.count, files: Array.from(hit.files) }))
      .sort((a, b) => b.count - a.count),
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("mode", report.mode);
  console.log("legacyCssReplaced", replaced);
  console.log("changedFiles", changedFiles.length);
  console.log("offThemeBackgrounds", report.offThemeBackgrounds.length);
  console.log("offThemeInlineStyles", report.offThemeInlineStyles.length);
  console.log("report", reportPath);
  if (process.argv.includes("--list")) for (const f of changedFiles) console.log(f);
}

const invokedDirectly = process.argv[1] && /migrate-theme-backgrounds\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
