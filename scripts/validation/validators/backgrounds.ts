/**
 * Backgrounds Validator
 *
 * Section wrapper backgrounds (`sections[i].background`) must be theme
 * palette IDs from the site's theme.json. CSS strings that equal a palette
 * value warn with the ID to use; anything else is off-theme. Warning only:
 * staff may keep overrides; agent writes/publishes are gated separately.
 */

import * as fs from "fs";
import * as yaml from "js-yaml";
import type { Validator, ValidationContext, ValidatorResult, ValidationIssue } from "../shared/types";
import { classifyThemeValue, missingBasePaletteIds, paletteIds } from "../../../shared/theme-palette";
import { escapeTemplateVars, unescapeObjectVars } from "../../../shared/templateVars";
import { hasOwnSiteTheme, loadSiteTheme, siteThemePath } from "../../../server/theme-config";
import { getDefaultContentRoot } from "../../../server/site-config";
import { BACKGROUNDS_ISSUE_CODES } from "./backgrounds.issueCodes";

export const backgroundsValidator: Validator = {
  name: "backgrounds",
  issueCodes: BACKGROUNDS_ISSUE_CODES,
  description: "Section backgrounds must be theme palette IDs from the site's theme.json",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "design",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const warnings: ValidationIssue[] = [];
    const contentRoot = context.contentRoot ?? getDefaultContentRoot();
    const theme = loadSiteTheme(contentRoot);

    if (!theme) {
      warnings.push({
        type: "warning",
        code: "NO_THEME_CONFIG",
        message: `Theme configuration not found at ${siteThemePath(contentRoot)}`,
        suggestion: "Create theme.json (Theme editor) to define allowed background colors",
      });
      return {
        name: this.name,
        description: this.description,
        status: "warning",
        errors: [],
        warnings,
        duration: Date.now() - startTime,
      };
    }

    const entries = theme.backgrounds ?? [];
    const missingBase = hasOwnSiteTheme(contentRoot) ? missingBasePaletteIds(entries) : [];
    if (missingBase.length > 0) {
      warnings.push({
        type: "warning",
        code: "MISSING_BASE_PALETTE",
        message: `theme.json lacks shared base palette IDs: ${missingBase.join(", ")}. Components shared by every site use them.`,
        file: siteThemePath(contentRoot),
        suggestion: "Add these background entries in the Theme editor (values can differ per site); see SHARED_BASE_PALETTE in shared/theme-palette.ts",
      });
    }
    const allowed = paletteIds(entries);
    const allowedHint = allowed.slice(0, 8).join(", ");
    let totalBackgrounds = 0;
    let legacy = 0;
    let offTheme = 0;

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
        const bg = (section as Record<string, unknown>).background;
        const cls = classifyThemeValue(bg, entries);
        if (cls.kind === "empty") return;
        totalBackgrounds++;
        if (cls.kind === "theme_css") {
          legacy++;
          warnings.push({
            type: "warning",
            code: "LEGACY_BACKGROUND_CSS",
            message: `sections[${i}].background uses CSS "${String(bg)}" instead of theme ID "${cls.id}"`,
            file: file.filePath,
            suggestion: `Replace with background: ${cls.id} (same color, follows theme changes and dark mode).`,
          });
        } else if (cls.kind === "off_theme") {
          offTheme++;
          warnings.push({
            type: "warning",
            code: "OFF_THEME_BACKGROUND",
            message: `sections[${i}].background "${String(bg)}" is not a theme background`,
            file: file.filePath,
            suggestion: `Use a theme ID (${allowedHint}) or add the color to the theme. Staff may keep it; agents cannot write or publish it.`,
          });
        }
      });
    }

    return {
      name: this.name,
      description: this.description,
      status: warnings.length > 0 ? "warning" : "passed",
      errors: [],
      warnings,
      duration: Date.now() - startTime,
      artifacts: {
        totalBackgrounds,
        legacyCss: legacy,
        offTheme,
        allowedIds: allowed,
      },
    };
  },
};
