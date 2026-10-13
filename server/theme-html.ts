/**
 * Site theme `<style>` for HTML that shows the site's pages (public pages,
 * page preview, section demos). Admin-only screens never get it.
 */
import { getDefaultContentRoot } from "./site-config";
import { loadSiteTheme } from "./theme-config";
import { insertBefore } from "./utils/html-inject";
import {
  buildThemeBackgroundCss,
  buildThemeColorVarsCss,
  THEME_OVERRIDES_STYLE_ID,
} from "@shared/theme-palette";

/** Site font stack and grid tokens from theme.json, scoped so admin chrome keeps platform fonts. */
function buildThemeTypographyAndGridCss(theme: NonNullable<ReturnType<typeof loadSiteTheme>>): string {
  let css = "";
  const fontFamily = theme.typography?.fontFamily?.trim();
  if (fontFamily) {
    const stack = `'${fontFamily.replace(/'/g, "")}', 'Plus Jakarta Sans Fallback', "Noto Color Emoji", sans-serif`;
    css += `.site-theme {\n  --font-heading: ${stack};\n  --font-sans: ${stack};\n}\n`;
  }
  const bp = theme.breakpoints;
  if (bp) {
    const order = ["sm", "md", "lg", "xl"] as const;
    const widths: Record<string, number> = { sm: 332, md: 679, lg: 1132, xl: 1468 };
    for (const key of order) {
      const entry = bp[key];
      if (!entry) continue;
      const rules: string[] = [];
      if (typeof entry.margin === "number") rules.push(`  --page-margin: ${entry.margin}px;`);
      if (typeof entry.gutter === "number") rules.push(`  --page-gutter: ${entry.gutter}px;`);
      if (typeof entry.columns === "number") rules.push(`  --grid-columns: ${entry.columns};`);
      if (rules.length) {
        css += `@media (min-width: ${widths[key]}px) {\n.site-theme {\n${rules.join("\n")}\n}\n}\n`;
      }
    }
  }
  return css;
}

export function buildThemeCssOverrides(contentRoot = getDefaultContentRoot()): string {
  try {
    const theme = loadSiteTheme(contentRoot);
    if (!theme) return "";
    const css =
      buildThemeColorVarsCss(theme.colors) +
      buildThemeTypographyAndGridCss(theme) +
      buildThemeBackgroundCss(theme);
    return css ? `<style id="${THEME_OVERRIDES_STYLE_ID}">\n${css}</style>` : "";
  } catch {
    return "";
  }
}

/** Adds the site theme `<style>` before `</head>` once (no-op when absent or already present). */
export function injectThemeOverrides(html: string, contentRoot: string): string {
  if (html.includes(`id="${THEME_OVERRIDES_STYLE_ID}"`)) return html;
  const themeStyle = buildThemeCssOverrides(contentRoot);
  return themeStyle ? insertBefore(html, "</head>", themeStyle) : html;
}
