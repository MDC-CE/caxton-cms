/**
 * Where each theme background is used, which section backgrounds are
 * off-theme, and site-wide "replace everywhere" for the Theme editor.
 * Scans section-level `background` in every content YAML of a site
 * (pages, drafts, templates, registry examples).
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { classifyThemeValue, themeIdForValue, type ThemePaletteEntry } from "@shared/theme-palette";
import { escapeTemplateVars, unescapeObjectVars } from "@shared/templateVars";
import { rewriteSectionBackgroundLines } from "@shared/section-background-lines";

const SKIP_DIRS = new Set(["node_modules", ".git", "images", "media", "db", ".cache"]);
const MAX_FILES_PER_VALUE = 25;

export interface ThemeBackgroundUsage {
  /** Palette ID → sections using it (as the ID or as its legacy CSS). */
  by_id: Record<string, { count: number; legacy_css: number; files: string[] }>;
  off_theme: Array<{ value: string; count: number; files: string[] }>;
  scanned_files: number;
}

function walkYaml(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkYaml(full, out);
    } else if (/\.ya?ml$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function sectionBackgrounds(raw: string): string[] {
  let doc: unknown;
  try {
    const { escaped, map } = escapeTemplateVars(raw);
    doc = unescapeObjectVars(yaml.load(escaped), map);
  } catch {
    return [];
  }
  const out: string[] = [];
  const visit = (sections: unknown) => {
    if (!Array.isArray(sections)) return;
    for (const s of sections) {
      const bg = s && typeof s === "object" ? (s as Record<string, unknown>).background : undefined;
      if (typeof bg === "string" && bg.trim()) out.push(bg);
    }
  };
  if (Array.isArray(doc)) visit(doc);
  else if (doc && typeof doc === "object") {
    const d = doc as Record<string, unknown>;
    visit(d.sections);
    if (typeof d.yaml === "string") {
      try {
        visit(yaml.load(d.yaml));
      } catch {
        /* example with template vars only */
      }
    }
  }
  return out;
}

function siteRoot(contentRoot: string): string {
  return path.isAbsolute(contentRoot) ? contentRoot : path.join(process.cwd(), contentRoot);
}

function siteFiles(contentRoot: string): string[] {
  const files: string[] = [];
  walkYaml(siteRoot(contentRoot), files);
  return files;
}

export function scanThemeBackgroundUsage(contentRoot: string, backgrounds: ThemePaletteEntry[]): ThemeBackgroundUsage {
  const byId: ThemeBackgroundUsage["by_id"] = {};
  for (const e of backgrounds) byId[e.id] = { count: 0, legacy_css: 0, files: [] };
  const off = new Map<string, { count: number; files: Set<string> }>();
  const files = siteFiles(contentRoot);
  for (const file of files) {
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    if (!raw.includes("background:")) continue;
    const rel = path.relative(process.cwd(), file);
    for (const bg of sectionBackgrounds(raw)) {
      const cls = classifyThemeValue(bg, backgrounds);
      if (cls.kind === "theme_id" || cls.kind === "theme_css") {
        const slot = byId[cls.id] ?? (byId[cls.id] = { count: 0, legacy_css: 0, files: [] });
        slot.count++;
        if (cls.kind === "theme_css") slot.legacy_css++;
        if (slot.files.length < MAX_FILES_PER_VALUE && !slot.files.includes(rel)) slot.files.push(rel);
      } else if (cls.kind === "off_theme") {
        const hit = off.get(bg) ?? { count: 0, files: new Set<string>() };
        hit.count++;
        hit.files.add(rel);
        off.set(bg, hit);
      }
    }
  }
  return {
    by_id: byId,
    off_theme: Array.from(off.entries())
      .map(([value, hit]) => ({ value, count: hit.count, files: Array.from(hit.files).slice(0, MAX_FILES_PER_VALUE) }))
      .sort((a, b) => b.count - a.count),
    scanned_files: files.length,
  };
}

/**
 * Rewrite every section background equal to `from` (exact value, or — when
 * `from` is a palette ID — the ID and its legacy CSS forms) to palette ID `to`.
 * Returns changed file paths relative to the app root.
 */
export function replaceSectionBackgroundEverywhere(
  contentRoot: string,
  from: string,
  to: string,
  backgrounds: ThemePaletteEntry[],
): { files: string[]; replaced: number } {
  const fromIsId = backgrounds.some((e) => e.id === from);
  const matches = (value: string) =>
    value === from || (fromIsId && themeIdForValue(value, backgrounds) === from);
  const changed: string[] = [];
  let replaced = 0;
  for (const file of siteFiles(contentRoot)) {
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    if (!raw.includes("background:")) continue;
    const { text, changes } = rewriteSectionBackgroundLines(raw, (v) => (matches(v) ? to : null));
    if (changes.length === 0) continue;
    fs.writeFileSync(file, text, "utf-8");
    changed.push(path.relative(process.cwd(), file));
    replaced += changes.length;
  }
  return { files: changed, replaced };
}
