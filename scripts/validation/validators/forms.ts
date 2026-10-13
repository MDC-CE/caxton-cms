/**
 * Forms Validator
 *
 * Scans the entry folders of the pages in the validation context (all locale
 * files, including unpublished draft.*.yml overlays) and reports:
 * - conversion_name values that are set but not in the known conversion events list
 * - missing conversion_name when a bound form-settings object is present
 *   (absent nested forms, e.g. CTA-only heroes, are allowed)
 * - form fields.*.source.related_field issues (empty/missing/broken/slugs combo)
 *
 * Settings (conversion events, auth) come from the context's site, not the
 * default site.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { Validator, ValidatorResult, ValidationContext, ValidationIssue } from "../shared/types";
import {
  validateFormSection,
  validateRequiredConversionName,
} from "../../../shared/validateFormSection";
import { validateSignupFormFields } from "../../../shared/authSignupFieldMap";
import { validateFormFieldSources } from "../../../shared/validateFormFieldSources";
import { resolveBoundFormSettingsPath } from "../../../shared/wipeOnDuplicate";
import { getContentTypeConfig } from "../../../server/content-types";
import { getTrackingSettings, getAuthSettings, getAuthConversionEventConfig } from "../../../server/settings";
import { loadAllFieldEditors } from "../../../server/component-registry";
import { escapeTemplateVars, unescapeObjectVars } from "../../../shared/templateVars";
import { getDefaultContentRoot } from "../../../server/site-config";
import { FORMS_ISSUE_CODES } from "./forms.issueCodes";

function isYamlFile(name: string): boolean {
  return name.endsWith(".yml") || name.endsWith(".yaml");
}

/**
 * Folders (absolute) → content type to scan: each context file's entry folder
 * plus its content-type folder (shared template.*.yml files live there).
 * Folders outside the site root are ignored so one site's run never reports
 * another site's files.
 */
function collectEntryDirs(context: ValidationContext, root: string): Map<string, string> {
  const rootAbs = path.resolve(root);
  const dirs = new Map<string, string>();
  for (const file of context.contentFiles) {
    if (!file.filePath) continue;
    const dir = path.dirname(path.resolve(file.filePath));
    if (!dir.startsWith(rootAbs + path.sep)) continue;
    const typeDir = path.join(rootAbs, path.relative(rootAbs, dir).split(path.sep)[0]);
    for (const d of [dir, typeDir]) {
      if (!dirs.has(d)) dirs.set(d, file.type);
    }
  }
  return dirs;
}

function safeLoadYaml(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { escaped, map } = escapeTemplateVars(raw);
    const loaded = yaml.load(escaped);
    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) return null;
    return unescapeObjectVars(loaded, map) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const formsValidator: Validator = {
  name: "forms",
  issueCodes: FORMS_ISSUE_CODES,
  description:
    "Validates form conversion_name and fields.*.source.related_field (publish rules)",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "forms",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const root = context.contentRoot ?? getDefaultContentRoot();
    const conversionNames = getTrackingSettings(root).conversion_events.map((e) => e.name);
    const authConversion = getAuthConversionEventConfig(root);
    const signupFieldMap = getAuthSettings(root).signup?.field_map;
    const allFieldEditors = loadAllFieldEditors();

    for (const [entryDir, ct] of Array.from(collectEntryDirs(context, root))) {
      if (!fs.existsSync(entryDir)) continue;
      const yamlFiles = fs
        .readdirSync(entryDir, { withFileTypes: true })
        .filter((d) => d.isFile() && isYamlFile(d.name))
        .map((d) => path.join(entryDir, d.name));
      const common = safeLoadYaml(path.join(entryDir, "_common.yml")) || {};
      const config = getContentTypeConfig(ct, root);

      for (const filePath of yamlFiles) {
        const base = path.basename(filePath);
        const isCommon = base === "_common.yml" || base === "_common.yaml";
        if (isCommon) continue;

        const parsed = safeLoadYaml(filePath);
        if (!parsed) continue;

        const relativePath = path.relative(process.cwd(), filePath);
        const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
        const singleEntry = { ...common, ...parsed };
        const editor = config?.editor as Record<string, { type?: string }> | undefined;
        const isDraft = base.startsWith("draft.");

        if (sections.length > 0 && editor) {
          const sourceIssues = validateFormFieldSources({
            singleEntry,
            editor,
            sections,
            mode: isDraft ? "draft" : "publish",
          });
          for (const issue of sourceIssues) {
            const target = issue.severity === "error" ? errors : warnings;
            target.push({
              type: issue.severity === "error" ? "error" : "warning",
              code: `FORM_SOURCE_${issue.code.toUpperCase()}`,
              message: `sections[${issue.sectionIndex ?? "?"}].${issue.formPath}: ${issue.message}. File: ${relativePath}`,
              file: relativePath,
              suggestion: issue.staffMessage,
            });
          }
        }

        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          if (!section || typeof section !== "object" || Array.isArray(section)) continue;
          const sec = section as Record<string, unknown>;

          const err = validateFormSection(sec, conversionNames, authConversion);
          if (err) {
            errors.push({
              type: "error",
              code: "FORM_INVALID_CONVERSION_NAME",
              message: `sections[${i}].form conversion_name is invalid. File: ${relativePath}`,
              file: relativePath,
              suggestion: err,
            });
          }

          const sectionType = String(sec.type ?? "");
          const editors = allFieldEditors[sectionType] ?? {};
          const variant = typeof sec.variant === "string" ? sec.variant : undefined;
          const formSettingsPath = resolveBoundFormSettingsPath(editors, variant);
          const requiredErr = validateRequiredConversionName(sec, formSettingsPath);
          if (requiredErr) {
            errors.push({
              type: "error",
              code: "FORM_MISSING_CONVERSION_NAME",
              message: `sections[${i}]: ${requiredErr}. File: ${relativePath}`,
              file: relativePath,
              suggestion: requiredErr,
            });
          }

          if (formSettingsPath != null) {
            const formObj = (() => {
              if (!formSettingsPath) return sec;
              const parts = formSettingsPath.split(".").filter(Boolean);
              let current: unknown = sec;
              for (const part of parts) {
                if (!current || typeof current !== "object" || Array.isArray(current)) return null;
                current = (current as Record<string, unknown>)[part];
              }
              if (!current || typeof current !== "object" || Array.isArray(current)) return null;
              return current as Record<string, unknown>;
            })();
            const formLabel = formSettingsPath || "form";
            const signupErr = validateSignupFormFields(formObj, signupFieldMap, formLabel);
            if (signupErr) {
              errors.push({
                type: "error",
                code: "FORM_SIGNUP_FIELD_MAP",
                message: `sections[${i}]: ${signupErr}. File: ${relativePath}`,
                file: relativePath,
                suggestion: signupErr,
              });
            }
          }
        }
      }
    }

    return {
      name: this.name,
      description: this.description,
      status: errors.length > 0 ? "failed" : "passed",
      errors,
      warnings,
      duration: Date.now() - startTime,
    };
  },
};
