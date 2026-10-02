/**
 * Reads a site's theme.json (palettes + colors) with an mtime cache.
 */
import fs from "fs";
import path from "path";
import type { ThemePalettes } from "@shared/theme-palette";

export interface SiteThemeConfig extends ThemePalettes {
  colors?: { light?: Record<string, string>; dark?: Record<string, string> };
  [key: string]: unknown;
}

const cache = new Map<string, { mtimeMs: number; theme: SiteThemeConfig }>();

export function siteThemePath(contentRoot: string): string {
  const root = path.isAbsolute(contentRoot) ? contentRoot : path.join(process.cwd(), contentRoot);
  return path.join(root, "theme.json");
}

export function loadSiteTheme(contentRoot: string | undefined): SiteThemeConfig | null {
  if (!contentRoot) return null;
  const themePath = siteThemePath(contentRoot);
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
