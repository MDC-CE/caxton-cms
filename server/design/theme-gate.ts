/**
 * Theme color checks for a page: section wrapper backgrounds must be palette
 * IDs, and rich text must not hardcode colors / font sizes / letter spacing.
 *
 * Callers decide severity: validators warn; agent (MCP) writes and agent
 * publishes are rejected for values the agent wrote or changed; staff only
 * get warnings. Values already on the page before the edit never block.
 */
import type { EditOperation } from "@shared/schema";
import {
  classifyThemeValue,
  paletteIds,
  THEME_COLORS_CODE,
  type ThemePaletteEntry,
} from "@shared/theme-palette";
import {
  findOffThemeInlineStyles,
  hasInlineStyle,
  type InlineStyleFinding,
  type ThemeTypography,
} from "@shared/rich-text-inline-styles";
import type { ContentIndex } from "../content-index";
import { getContentForEdit, simulateEditOperations } from "../content-editor";
import { loadEntry } from "../entry-layer";
import { loadSiteTheme, type SiteThemeConfig } from "../theme-config";

export { THEME_COLORS_CODE };

export type ThemeViolationCode = "off_theme_background" | "legacy_background_css" | "off_theme_inline_style";

export interface ThemeViolation {
  code: ThemeViolationCode;
  section_path: string;
  property_path: string;
  value: string;
  suggested_id?: string;
  findings?: InlineStyleFinding[];
}

type Section = Record<string, unknown>;

function sectionsOf(page: Record<string, unknown> | null | undefined): Section[] {
  const s = page?.sections;
  return Array.isArray(s) ? (s.filter((x) => x && typeof x === "object") as Section[]) : [];
}

function collectStrings(
  value: unknown,
  path: string,
  out: Array<{ path: string; value: string }>,
  depth = 0,
): void {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") {
    if (hasInlineStyle(value)) out.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out, depth + 1));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(v, path ? `${path}.${k}` : k, out, depth + 1);
    }
  }
}

function typographyOf(theme: SiteThemeConfig | null): ThemeTypography {
  return {
    text: theme?.text,
    fontSizes: theme?.fontSizes as ThemeTypography["fontSizes"],
    letterSpacings: theme?.letterSpacings as ThemeTypography["letterSpacings"],
  };
}

/**
 * All theme violations on a page. With `before`, values that already existed
 * on the saved page (same background on a same-type section, identical rich
 * text anywhere) are skipped, so only what the edit wrote is reported.
 */
export function evaluatePageThemeColors(
  page: Record<string, unknown> | null | undefined,
  opts: { theme: SiteThemeConfig | null; before?: Record<string, unknown> | null },
): ThemeViolation[] {
  const theme = opts.theme;
  if (!theme) return [];
  const backgrounds: ThemePaletteEntry[] = theme.backgrounds ?? [];
  const typography = typographyOf(theme);
  const beforeSections = opts.before ? sectionsOf(opts.before) : null;
  const beforeBackgrounds = new Set(
    (beforeSections ?? []).map((s) => `${String(s.type ?? "")}|${String(s.background ?? "")}`),
  );
  const beforeStrings = new Set<string>();
  if (beforeSections) {
    const acc: Array<{ path: string; value: string }> = [];
    beforeSections.forEach((s, i) => collectStrings(s, `sections[${i}]`, acc));
    for (const a of acc) beforeStrings.add(a.value);
  }

  const out: ThemeViolation[] = [];
  sectionsOf(page).forEach((section, i) => {
    const sectionPath = `sections[${i}]`;
    const bg = section.background;
    const cls = classifyThemeValue(bg, backgrounds);
    if (cls.kind === "off_theme" || cls.kind === "theme_css") {
      const unchanged = beforeSections && beforeBackgrounds.has(`${String(section.type ?? "")}|${String(bg)}`);
      if (!unchanged) {
        out.push({
          code: cls.kind === "off_theme" ? "off_theme_background" : "legacy_background_css",
          section_path: sectionPath,
          property_path: `${sectionPath}.background`,
          value: String(bg),
          ...(cls.kind === "theme_css" ? { suggested_id: cls.id } : {}),
        });
      }
    }
    const strings: Array<{ path: string; value: string }> = [];
    const { background: _bg, ...rest } = section;
    collectStrings(rest, sectionPath, strings);
    for (const s of strings) {
      if (beforeSections && beforeStrings.has(s.value)) continue;
      const findings = findOffThemeInlineStyles(s.value, typography);
      if (findings.length === 0) continue;
      out.push({
        code: "off_theme_inline_style",
        section_path: sectionPath,
        property_path: s.path,
        value: findings.map((f) => `${f.property}: ${f.value}`).join("; "),
        findings,
      });
    }
  });
  return out;
}

export function allowedBackgroundIds(theme: SiteThemeConfig | null): string[] {
  return paletteIds(theme?.backgrounds);
}

export function summarizeThemeViolations(violations: ThemeViolation[], max = 4): string {
  const parts = violations.slice(0, max).map((v) => {
    if (v.code === "legacy_background_css") return `${v.property_path} uses CSS "${v.value}" (use theme ID "${v.suggested_id}")`;
    if (v.code === "off_theme_background") return `${v.property_path} "${v.value}" is not a theme background`;
    return `${v.property_path} has inline ${v.value}`;
  });
  const more = violations.length > max ? ` (+${violations.length - max} more)` : "";
  return parts.join("; ") + more;
}

/** Agent-facing details payload for a rejected write / publish. */
export function themeViolationDetails(violations: ThemeViolation[], theme: SiteThemeConfig | null) {
  return {
    violations,
    allowed_background_ids: allowedBackgroundIds(theme),
    allowed_text_colors: (theme?.text ?? []).map((t) => t.id),
    non_effects: [
      "Values already on the page before this edit are not blocked (staff overrides are kept).",
      "Staff edits only warn; agents must use theme IDs.",
    ],
  };
}

/**
 * Theme violations an edit (POST /api/content/edit-sections) would introduce:
 * simulates the operations on the merged page and compares with the saved page.
 */
export function evaluateEditThemeColors(opts: {
  ci: ContentIndex;
  contentType: string;
  slug: string;
  locale: string;
  variant?: string;
  operations: EditOperation[];
  contentRoot?: string;
}): { violations: ThemeViolation[]; theme: SiteThemeConfig | null } {
  const { ci, contentType, slug, locale, variant, operations, contentRoot } = opts;
  const theme = loadSiteTheme(contentRoot);
  if (!theme) return { violations: [], theme };
  let before: Record<string, unknown> | null = null;
  try {
    before = loadEntry(ci, contentType, slug, locale, undefined, { entryVariant: variant })?.data ?? null;
  } catch {
    before = null;
  }
  if (!before) {
    before = getContentForEdit(contentType, slug, locale, variant, undefined, ci).content;
  }
  const base = before ?? { sections: [] };
  const after = simulateEditOperations(base, operations, { contentRoot, locale });
  if (!after) return { violations: [], theme };
  return { violations: evaluatePageThemeColors(after, { theme, before: base }), theme };
}
