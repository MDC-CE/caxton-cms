/**
 * Rich Text Styles Validator
 *
 * Inline `color`, `font-size` and `letter-spacing` in section rich text must
 * match the site theme (text palette, font sizes, letter spacings). Warning
 * only: staff may keep overrides; agent writes/publishes are gated separately
 * (server/design/theme-gate.ts).
 */

import * as fs from "fs";
import * as yaml from "js-yaml";
import type { Validator, ValidationContext, ValidatorResult, ValidationIssue } from "../shared/types";
import { findOffThemeInlineStyles, hasInlineStyle, type ThemeTypography } from "../../../shared/rich-text-inline-styles";
import { escapeTemplateVars, unescapeObjectVars } from "../../../shared/templateVars";
import { loadSiteTheme } from "../../../server/theme-config";
import { getDefaultContentRoot } from "../../../server/site-config";
import { RICH_TEXT_STYLES_ISSUE_CODES } from "./rich-text-styles.issueCodes";

function collectStyled(value: unknown, at: string, out: Array<{ path: string; value: string }>, depth = 0): void {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") {
    if (hasInlineStyle(value)) out.push({ path: at, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectStyled(v, `${at}[${i}]`, out, depth + 1));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) collectStyled(v, `${at}.${k}`, out, depth + 1);
  }
}

export const richTextStylesValidator: Validator = {
  name: "rich-text-styles",
  issueCodes: RICH_TEXT_STYLES_ISSUE_CODES,
  description: "Rich text inline colors / font sizes / letter spacing must come from the site theme",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "design",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const warnings: ValidationIssue[] = [];
    const theme = loadSiteTheme(context.contentRoot ?? getDefaultContentRoot());
    const typography: ThemeTypography = {
      text: theme?.text,
      fontSizes: theme?.fontSizes as ThemeTypography["fontSizes"],
      letterSpacings: theme?.letterSpacings as ThemeTypography["letterSpacings"],
    };
    let styledStrings = 0;

    if (theme) {
      for (const file of context.contentFiles) {
        let parsed: Record<string, unknown> | null = null;
        try {
          if (!fs.existsSync(file.filePath)) continue;
          const { escaped, map } = escapeTemplateVars(fs.readFileSync(file.filePath, "utf-8"));
          parsed = unescapeObjectVars(yaml.load(escaped), map) as Record<string, unknown> | null;
        } catch {
          continue;
        }
        if (!parsed || !Array.isArray(parsed.sections)) continue;
        parsed.sections.forEach((section, i) => {
          if (!section || typeof section !== "object") return;
          const strings: Array<{ path: string; value: string }> = [];
          collectStyled(section, `sections[${i}]`, strings);
          for (const s of strings) {
            styledStrings++;
            const findings = findOffThemeInlineStyles(s.value, typography);
            if (findings.length === 0) continue;
            const list = findings.map((f) => `${f.property}: ${f.value}`).join("; ");
            warnings.push({
              type: "warning",
              code: "OFF_THEME_INLINE_STYLE",
              message: `${s.path} has inline ${list} that is not in the theme`,
              file: file.filePath,
              suggestion:
                "Remove the inline style (the component already styles its text) or use a theme text color / size. Staff may keep it; agents cannot write or publish it.",
            });
          }
        });
      }
    }

    return {
      name: this.name,
      description: this.description,
      status: warnings.length > 0 ? "warning" : "passed",
      errors: [],
      warnings,
      duration: Date.now() - startTime,
      artifacts: { styledStrings, offTheme: warnings.length },
    };
  },
};
