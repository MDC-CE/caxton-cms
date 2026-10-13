/**
 * Reads a site's theme.json (palettes + colors) with an mtime cache.
 *
 * A site without its own theme.json uses the theme of its
 * `inherit_components_from` parent in sites.yml (one hop, whole file, no merge).
 */
import fs from "fs";
import path from "path";
import type { ThemePalettes } from "@shared/theme-palette";
import { getProjectRoot } from "@shared/paths";
import { getInheritComponentsFrom, getSiteConfigs } from "./site-config";

export interface SiteThemeConfig extends ThemePalettes {
  colors?: { light?: Record<string, string>; dark?: Record<string, string> };
  typography?: { fontFamily?: string };
  breakpoints?: Record<string, { margin?: number; columns?: number; gutter?: number }>;
  [key: string]: unknown;
}

export interface ResolvedSiteTheme {
  theme: SiteThemeConfig;
  /** Absolute content root whose theme.json was read. */
  ownerRoot: string;
  /** Parent content folder name when the theme is inherited; null when the site has its own file. */
  inheritedFrom: string | null;
}

export interface ResolveThemeOptions {
  /** Override the parent lookup (tests): parent content root, or null for "no parent". */
  parentRoot?: string | null;
}

const cache = new Map<string, { mtimeMs: number; theme: SiteThemeConfig }>();

function absRoot(contentRoot: string): string {
  return path.isAbsolute(contentRoot) ? contentRoot : path.join(process.cwd(), contentRoot);
}

export function siteThemePath(contentRoot: string): string {
  return path.join(absRoot(contentRoot), "theme.json");
}

function readThemeFile(themePath: string): SiteThemeConfig | null {
  try {
    const stat = fs.statSync(themePath);
    const hit = cache.get(themePath);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.theme;
    const theme = JSON.parse(fs.readFileSync(themePath, "utf-8")) as SiteThemeConfig;
    cache.set(themePath, { mtimeMs: stat.mtimeMs, theme });
    return theme;
  } catch {
    return null;
  }
}

function contentFolderKey(contentRoot: string): string {
  const rel = path.relative(getProjectRoot(), absRoot(contentRoot));
  return rel && !rel.startsWith("..") ? rel.replace(/\\/g, "/") : path.basename(contentRoot);
}

/** Parent content folder from `inherit_components_from` (undefined when none or sites.yml is unavailable). */
export function themeParentFolder(contentRoot: string): string | undefined {
  try {
    return getInheritComponentsFrom(contentFolderKey(contentRoot));
  } catch {
    return undefined;
  }
}

function parentRootFor(contentRoot: string, opts?: ResolveThemeOptions): { root: string; folder: string } | null {
  if (opts && "parentRoot" in opts) {
    return opts.parentRoot ? { root: absRoot(opts.parentRoot), folder: path.basename(opts.parentRoot) } : null;
  }
  const folder = themeParentFolder(contentRoot);
  if (!folder) return null;
  return { root: path.isAbsolute(folder) ? folder : path.join(getProjectRoot(), folder), folder };
}

/** True when the site has its own theme.json (writes are allowed). */
export function hasOwnSiteTheme(contentRoot: string): boolean {
  return fs.existsSync(siteThemePath(contentRoot));
}

/** The site's own theme, or its parent's when it has none. */
export function resolveSiteTheme(
  contentRoot: string | undefined,
  opts?: ResolveThemeOptions,
): ResolvedSiteTheme | null {
  if (!contentRoot) return null;
  const own = readThemeFile(siteThemePath(contentRoot));
  if (own) return { theme: own, ownerRoot: absRoot(contentRoot), inheritedFrom: null };
  if (hasOwnSiteTheme(contentRoot)) return null;
  const parent = parentRootFor(contentRoot, opts);
  if (!parent) return null;
  const inherited = readThemeFile(siteThemePath(parent.root));
  if (!inherited) return null;
  return { theme: inherited, ownerRoot: parent.root, inheritedFrom: parent.folder };
}

export function loadSiteTheme(contentRoot: string | undefined, opts?: ResolveThemeOptions): SiteThemeConfig | null {
  return resolveSiteTheme(contentRoot, opts)?.theme ?? null;
}

export type ThemeRefusal = {
  ok: false;
  status: 404 | 409;
  body: { error: string; code?: "theme_inherited" | "theme_exists"; inherited_from?: string };
};

/**
 * Where a theme write goes: the site's own theme.json. Sites that inherit
 * their parent's theme are refused, so a child save can never edit the parent.
 */
export function checkThemeWrite(
  contentRoot: string,
  opts?: ResolveThemeOptions,
): { ok: true; themePath: string } | ThemeRefusal {
  const themePath = siteThemePath(contentRoot);
  if (fs.existsSync(themePath)) return { ok: true, themePath };
  const inheritedFrom = resolveSiteTheme(contentRoot, opts)?.inheritedFrom ?? parentRootFor(contentRoot, opts)?.folder;
  if (inheritedFrom) {
    return {
      ok: false,
      status: 409,
      body: {
        error: `This site uses the ${inheritedFrom} theme. Create a separate theme for this site before changing it.`,
        code: "theme_inherited",
        inherited_from: inheritedFrom,
      },
    };
  }
  return { ok: false, status: 404, body: { error: "Theme configuration not found" } };
}

/** Copy the parent's theme.json into an inheriting site (byte-for-byte, atomic rename). */
export function createOwnSiteTheme(
  contentRoot: string,
  opts?: ResolveThemeOptions,
): { ok: true; copiedFrom: string } | ThemeRefusal {
  const themePath = siteThemePath(contentRoot);
  if (fs.existsSync(themePath)) {
    return { ok: false, status: 409, body: { error: "This site already has its own theme.", code: "theme_exists" } };
  }
  const resolved = resolveSiteTheme(contentRoot, opts);
  if (!resolved?.inheritedFrom) {
    return { ok: false, status: 404, body: { error: "There is no parent theme to copy for this site." } };
  }
  const raw = fs.readFileSync(siteThemePath(resolved.ownerRoot), "utf-8");
  const tmpPath = path.join(path.dirname(themePath), `.theme.${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, raw);
  fs.renameSync(tmpPath, themePath);
  return { ok: true, copiedFrom: resolved.inheritedFrom };
}

/**
 * Absolute content roots of sites that currently use this site's theme
 * (they inherit from it and have no theme.json of their own).
 */
export function sitesInheritingThemeFrom(parentRoot: string): string[] {
  const parentKey = contentFolderKey(parentRoot);
  try {
    return getSiteConfigs()
      .filter((c) => c.inheritComponentsFrom?.trim().replace(/\/+$/, "") === parentKey)
      .map((c) => (path.isAbsolute(c.contentFolder) ? c.contentFolder : path.join(getProjectRoot(), c.contentFolder)))
      .filter((root) => !hasOwnSiteTheme(root));
  } catch {
    return [];
  }
}
