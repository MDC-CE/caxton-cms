/**
 * Live (published) page YAML on disk for design measurement: one row per
 * entry locale file (`<slug>/<locale>.yml`), shared template, or `_common.yml`
 * with sections. Drafts, A/B variant files and the component registry are
 * excluded — measurements describe what visitors actually see.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { escapeTemplateVars, unescapeObjectVars } from "@shared/templateVars";

const SKIP_DIRS = new Set(["node_modules", ".git", "images", "media", "db", ".cache", "component-registry"]);
const LOCALE_FILE = /^([a-z]{2}(?:-[a-z]{2})?)\.ya?ml$/i;
const TEMPLATE_FILE = /^(?:template|single)\.([a-z]{2}(?:-[a-z]{2})?)\.ya?ml$/i;

export interface LivePageFile {
  /** Path relative to the site folder. */
  file: string;
  abs: string;
  /** Top-level content directory (e.g. `landings`, `pages`, `blog`). */
  dir: string;
  slug: string | null;
  locale: string | null;
  kind: "page" | "template" | "common";
}

export function safeLoadYaml(raw: string): unknown {
  try {
    const { escaped, map } = escapeTemplateVars(raw);
    return unescapeObjectVars(yaml.load(escaped), map);
  } catch {
    return null;
  }
}

export function siteRootPath(contentRoot: string): string {
  return path.isAbsolute(contentRoot) ? contentRoot : path.join(process.cwd(), contentRoot);
}

function classify(rel: string): LivePageFile["kind"] | null {
  const base = path.basename(rel);
  if (base === "_common.yml") return "common";
  if (TEMPLATE_FILE.test(base) || base === "_common.template.yml") return "template";
  if (LOCALE_FILE.test(base)) return "page";
  return null;
}

export function listLivePageFiles(contentRoot: string): LivePageFile[] {
  const root = siteRootPath(contentRoot);
  const out: LivePageFile[] = [];
  const walk = (dir: string, depth: number) => {
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
        if (!SKIP_DIRS.has(entry.name) && depth < 4) walk(full, depth + 1);
        continue;
      }
      if (depth === 0) continue;
      const rel = path.relative(root, full);
      const kind = classify(rel);
      if (!kind) continue;
      const parts = rel.split(path.sep);
      const base = parts[parts.length - 1]!;
      const locale =
        LOCALE_FILE.exec(base)?.[1]?.toLowerCase() ?? TEMPLATE_FILE.exec(base)?.[1]?.toLowerCase() ?? null;
      out.push({
        file: rel,
        abs: full,
        dir: parts[0]!,
        slug: kind === "template" || parts.length < 3 ? null : parts[parts.length - 2]!,
        locale,
        kind,
      });
    }
  };
  walk(root, 0);
  return out;
}

export function sectionsOf(doc: unknown): Record<string, unknown>[] {
  if (!doc || typeof doc !== "object") return [];
  const sections = (doc as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) return [];
  return sections.filter(
    (s): s is Record<string, unknown> =>
      !!s && typeof s === "object" && typeof (s as Record<string, unknown>).type === "string",
  );
}
