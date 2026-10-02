/**
 * Finds inline `style="..."` declarations in rich-text HTML that bypass the
 * theme (hardcoded colors, font sizes, letter spacing). Values that match a
 * theme entry (e.g. `color: hsl(var(--primary))`, a theme font size) pass.
 */
import { paletteEntryCss, type ThemePaletteEntry } from "./theme-palette";

export interface ThemeTypography {
  text?: ThemePaletteEntry[];
  fontSizes?: Array<{ id: string; value: string }>;
  letterSpacings?: Array<{ id: string; value: string }>;
}

export type InlineStyleProperty = "color" | "font-size" | "letter-spacing";

export interface InlineStyleFinding {
  property: InlineStyleProperty;
  value: string;
}

const CHECKED: InlineStyleProperty[] = ["color", "font-size", "letter-spacing"];
const STYLE_ATTR = /style\s*=\s*(?:"([^"]*)"|'([^']*)'|\\"((?:[^"\\]|\\.)*)\\")/gi;

function norm(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ");
}

function allowedValues(theme: ThemeTypography): Record<InlineStyleProperty, Set<string>> {
  const color = new Set<string>();
  for (const e of theme.text ?? []) {
    for (const mode of ["light", "dark"] as const) {
      const css = paletteEntryCss(e, mode);
      if (css) color.add(norm(css));
    }
  }
  color.add("inherit");
  color.add("currentcolor");
  return {
    color,
    "font-size": new Set((theme.fontSizes ?? []).map((f) => norm(f.value))),
    "letter-spacing": new Set((theme.letterSpacings ?? []).map((l) => norm(l.value))),
  };
}

/** True when the string looks like it carries inline styles worth checking. */
export function hasInlineStyle(value: string): boolean {
  return value.includes("style=");
}

/** Off-theme inline declarations in one HTML string (deduplicated). */
export function findOffThemeInlineStyles(html: string, theme: ThemeTypography): InlineStyleFinding[] {
  if (!hasInlineStyle(html)) return [];
  const allowed = allowedValues(theme);
  const seen = new Set<string>();
  const out: InlineStyleFinding[] = [];
  STYLE_ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STYLE_ATTR.exec(html))) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    for (const decl of body.split(";")) {
      const idx = decl.indexOf(":");
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase() as InlineStyleProperty;
      if (!CHECKED.includes(prop)) continue;
      const value = decl.slice(idx + 1).trim();
      if (!value) continue;
      if (allowed[prop].has(norm(value))) continue;
      const key = `${prop}:${norm(value)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ property: prop, value });
    }
  }
  return out;
}
