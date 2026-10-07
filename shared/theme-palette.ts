/**
 * Theme palette helpers shared by the renderer, editors, validators and the
 * agent write gate. Section backgrounds are stored as theme IDs (e.g.
 * `muted`, `light-blue-5`); the renderer resolves an ID to the CSS variable
 * `--theme-bg-<id>` emitted from the site's theme.json.
 */

export interface ThemePaletteEntry {
  id: string;
  label?: string;
  cssVar?: string;
  value?: string;
  lightValue?: string;
  darkValue?: string;
}

export interface ThemePalettes {
  backgrounds?: ThemePaletteEntry[];
  text?: ThemePaletteEntry[];
  accents?: ThemePaletteEntry[];
}

export type ThemePaletteKind = "backgrounds" | "text" | "accents";

/** Names the renderer understood before backgrounds were theme-driven; still valid fallbacks. */
export const LEGACY_BACKGROUND_TOKENS: Record<string, string> = {
  background: "hsl(var(--background))",
  muted: "hsl(var(--muted))",
  card: "hsl(var(--card))",
  accent: "hsl(var(--accent))",
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  sidebar: "hsl(var(--sidebar-background))",
  destructive: "hsl(var(--destructive))",
};

const THEME_ID_SHAPE = /^[a-z][a-z0-9-]*$/;

/** True for strings shaped like a palette ID (not CSS, not a Tailwind class). */
export function isThemeIdShape(value: string): boolean {
  return THEME_ID_SHAPE.test(value) && !value.startsWith("bg-") && value !== "inherit" && value !== "none";
}

export function themeBgVarName(id: string): string {
  return `--theme-bg-${id}`;
}

/** CSS for a palette entry in light (default) or dark mode. */
export function paletteEntryCss(entry: ThemePaletteEntry, mode: "light" | "dark" = "light"): string {
  if (entry.cssVar) return `hsl(var(${entry.cssVar}))`;
  if (mode === "dark" && entry.darkValue) return entry.darkValue;
  if (mode === "light" && entry.lightValue) return entry.lightValue;
  return entry.value || entry.lightValue || entry.darkValue || "";
}

/** Every CSS string a palette entry has ever been saved as (picker used to store CSS). */
function entryCssForms(entry: ThemePaletteEntry): string[] {
  const forms = new Set<string>();
  if (entry.cssVar) forms.add(`hsl(var(${entry.cssVar}))`);
  for (const v of [entry.value, entry.lightValue, entry.darkValue]) {
    if (v) forms.add(v);
  }
  return Array.from(forms);
}

function normalizeCss(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}

export function paletteIds(entries: ThemePaletteEntry[] | undefined): string[] {
  return (entries ?? []).map((e) => e.id).filter(Boolean);
}

/** Palette ID for a value that is either the ID itself or a CSS form of that entry. */
export function themeIdForValue(value: string, entries: ThemePaletteEntry[] | undefined): string | null {
  if (!value) return null;
  const list = entries ?? [];
  const direct = list.find((e) => e.id === value);
  if (direct) return direct.id;
  const norm = normalizeCss(value);
  for (const e of list) {
    if (entryCssForms(e).some((f) => normalizeCss(f) === norm)) return e.id;
  }
  return null;
}

export type BackgroundClass =
  | { kind: "empty" }
  | { kind: "theme_id"; id: string }
  | { kind: "theme_css"; id: string }
  | { kind: "off_theme" };

/**
 * Classify a stored background:
 * - `theme_id` — a palette ID (the only form agents may write)
 * - `theme_css` — legacy CSS that equals a palette entry (migrate to the ID)
 * - `off_theme` — anything else (staff override; agents blocked)
 */
export function classifyThemeValue(value: unknown, entries: ThemePaletteEntry[] | undefined): BackgroundClass {
  if (typeof value !== "string" || value.trim() === "" || value === "inherit" || value === "none") {
    return { kind: "empty" };
  }
  const list = entries ?? [];
  if (list.some((e) => e.id === value)) return { kind: "theme_id", id: value };
  const id = themeIdForValue(value, list);
  if (id) return { kind: "theme_css", id };
  return { kind: "off_theme" };
}

/**
 * Wrapper background CSS for a section. IDs resolve through the theme CSS
 * variable (falling back to the legacy token map); anything else renders as-is.
 */
export function resolveSectionBackgroundCss(value: string | undefined): string | undefined {
  if (!value || value === "inherit" || value === "none") return undefined;
  if (isThemeIdShape(value)) {
    const fallback = LEGACY_BACKGROUND_TOKENS[value];
    return fallback ? `var(${themeBgVarName(value)}, ${fallback})` : `var(${themeBgVarName(value)})`;
  }
  return value;
}

/** Light channels plus background entries, from the theme.json read that builds the page. */
export type ThemePaint = {
  light: Record<string, string>;
  backgrounds: Pick<ThemePaletteEntry, "id" | "cssVar" | "value" | "lightValue">[];
};

let themePaint: ThemePaint | null = null;

export function setThemePaint(paint: ThemePaint | null): void {
  themePaint = paint;
}

const HSL_VAR_RE = /hsl\(\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*(?:\/\s*([\d.]+%?)\s*)?\)/gi;

function literalizeThemeVars(value: string): string {
  const light = themePaint?.light;
  if (!light) return value;
  HSL_VAR_RE.lastIndex = 0;
  return value.replace(HSL_VAR_RE, (full, name: string, alpha?: string) => {
    const channel = light[name];
    if (!channel) return full;
    return alpha ? `hsl(${channel} / ${alpha})` : `hsl(${channel})`;
  });
}

function isGradientCss(value: string): boolean {
  return (
    value.startsWith("linear-gradient") ||
    value.startsWith("radial-gradient") ||
    value.startsWith("repeating-linear-gradient") ||
    value.startsWith("repeating-radial-gradient") ||
    value.startsWith("conic-gradient")
  );
}

function isSolidColorCss(value: string): boolean {
  return (
    value.startsWith("hsl(") ||
    value.startsWith("hsla(") ||
    value.startsWith("rgb(") ||
    value.startsWith("rgba(") ||
    value.startsWith("#")
  );
}

/** A real color for a palette id, using colors.light. Null when the theme has no number for it. */
function literalForThemeId(id: string): string | null {
  if (!themePaint) return null;
  const entry = themePaint.backgrounds.find((item) => item.id === id);
  const written = entry?.lightValue || entry?.value;
  if (written && !written.includes("var(")) return written;
  if (entry?.cssVar) {
    const channel = themePaint.light[entry.cssVar];
    if (channel) return `hsl(${channel})`;
  }
  const source = written || LEGACY_BACKGROUND_TOKENS[id];
  if (!source) return null;
  const literal = literalizeThemeVars(source);
  return literal.includes("var(") ? null : literal;
}

/**
 * Inline background for a section. A resolved solid color uses background-color
 * so extensions can rewrite it. Gradients use background-image. Unresolved ids
 * stay on the background shorthand.
 */
export function sectionBackgroundPaint(value: string | undefined): {
  background?: string;
  backgroundColor?: string;
  backgroundImage?: string;
} {
  if (!value || value === "inherit" || value === "none") return {};
  const css = isThemeIdShape(value)
    ? (literalForThemeId(value) ?? resolveSectionBackgroundCss(value))
    : literalizeThemeVars(value);
  if (!css) return {};
  if (isGradientCss(css)) return { backgroundImage: css };
  if (isSolidColorCss(css) && !css.includes("var(")) return { backgroundColor: css };
  return { background: css };
}

/** Inline style for components that paint `data.background` themselves (IDs, colors, gradients). */
export function sectionBackgroundStyle(value: string | undefined): {
  background?: string;
  backgroundColor?: string;
  backgroundImage?: string;
} {
  return sectionBackgroundPaint(value);
}

/** `:root` / `.dark` blocks declaring `--theme-bg-<id>` for every background entry. */
export function buildThemeBackgroundCss(theme: ThemePalettes | null | undefined): string {
  const entries = theme?.backgrounds ?? [];
  if (entries.length === 0) return "";
  const light: string[] = [];
  const dark: string[] = [];
  for (const e of entries) {
    if (!e.id || !isThemeIdShape(e.id)) continue;
    const lightCss = paletteEntryCss(e, "light");
    if (lightCss) light.push(`  ${themeBgVarName(e.id)}: ${lightCss};`);
    if (!e.cssVar && e.darkValue && e.darkValue !== lightCss) {
      dark.push(`  ${themeBgVarName(e.id)}: ${e.darkValue};`);
    }
  }
  let css = light.length ? `:root {\n${light.join("\n")}\n}\n` : "";
  if (dark.length) css += `.dark {\n${dark.join("\n")}\n}\n`;
  return css;
}

export const THEME_BG_STYLE_ID = "__theme_bg_vars__";

/** Server/MCP code when an agent write or publish introduces off-theme colors. */
export const THEME_COLORS_CODE = "theme_colors_required";
