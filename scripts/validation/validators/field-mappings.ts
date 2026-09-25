import path from "path";
import type { Validator, ValidatorResult, ValidationContext, ValidationIssue } from "../shared/types";
import { getAllConfigs } from "../../../server/content-types";
import { getDefaultContentFolder } from "../../../server/site-config";
import { scanTypeDirForDeprecatedFields } from "../../../server/deprecated-field-guard";
import { listDeprecatedFields, validateDeprecations } from "../../../shared/deprecatedField";
import {
  effectiveRequiredMode,
  type EditorRequiredHint,
} from "../../../shared/validateRequiredFields";
import { validateFieldMapping } from "../shared/fieldMappingValidator";
import { FIELD_MAPPINGS_ISSUE_CODES } from "./field-mappings.issueCodes";

/** editor.required true | "attached" — optional / unset fields never raise integrity issues. */
function isEditorRequiredField(
  editor: Record<string, EditorRequiredHint> | undefined,
  fieldKey: string,
): boolean {
  return effectiveRequiredMode(editor?.[fieldKey]) != null;
}

export const fieldMappingsValidator: Validator = {
  name: "field-mappings",
  issueCodes: FIELD_MAPPINGS_ISSUE_CODES,
  description:
    "Validates that required (editor.required) field mapping sources exist in non-database content entries (optional fields are ignored), and checks deprecated fields: config, leftover template refs, and draft-only values that publish would reject",
  apiExposed: true,
  estimatedDuration: "medium",
  category: "integrity",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    const configs = getAllConfigs();
    let totalChecked = 0;
    let issuesFound = 0;

    const contentRootRel = context.contentRoot || getDefaultContentFolder();
    const contentRootAbs = path.isAbsolute(contentRootRel)
      ? contentRootRel
      : path.join(process.cwd(), contentRootRel);

    for (const [typeName, config] of Object.entries(configs)) {
      const depEditor = config.editor as Record<string, { deprecated?: unknown; required?: unknown }> | undefined;
      const depCheck = validateDeprecations(depEditor, config.field_mapping);
      if (!depCheck.ok) {
        issuesFound++;
        errors.push({
          type: "error",
          code: "DEPRECATED_CONFIG_INVALID",
          message: `${typeName}: ${depCheck.error}`,
          suggestion: `Fix editor.${depCheck.field}.deprecated in content-types.yml (Content Type manage → Fields → Retire).`,
        });
      }
      const deprecated = listDeprecatedFields(depEditor);
      const deprecatedKeys = Object.keys(deprecated);
      if (deprecatedKeys.length > 0 && config.directory) {
        const scan = scanTypeDirForDeprecatedFields(
          path.join(contentRootAbs, config.directory),
          deprecatedKeys,
          { isDbBacked: !!config.database },
        );
        for (const field of deprecatedKeys) {
          const replacement = deprecated[field].replaced_by;
          const refs = scan.templateRefs[field] ?? [];
          if (refs.length > 0) {
            issuesFound++;
            warnings.push({
              type: "warning",
              code: "DEPRECATED_FIELD_TEMPLATE_REF",
              message: `${typeName}: deprecated field "${field}" is still referenced in ${refs.length} file(s); new entries render empty/default there`,
              suggestion: replacement
                ? `Switch {{ entry.${field} }} to {{ entry.${replacement} }} in: ${refs.slice(0, 10).join(", ")}`
                : `Remove {{ entry.${field} }} from: ${refs.slice(0, 10).join(", ")}`,
            });
          }
          const drafts = scan.draftOnlyValues[field] ?? [];
          if (drafts.length > 0) {
            issuesFound++;
            warnings.push({
              type: "warning",
              code: "DEPRECATED_FIELD_ON_NEW_ENTRY",
              message: `${typeName}: deprecated field "${field}" is set only in drafts/variants of ${drafts.length} entr${drafts.length === 1 ? "y" : "ies"}; publish will reject it`,
              suggestion: replacement
                ? `Move the value to "${replacement}" in: ${drafts.slice(0, 10).join(", ")}`
                : `Clear "${field}" in: ${drafts.slice(0, 10).join(", ")}`,
            });
          }
        }
      }

      if (config.database) continue;
      if (!config.field_mapping) continue;

      const rawMapping = config.field_mapping;
      const editor = config.editor as Record<string, EditorRequiredHint> | undefined;

      const normalizedMapping: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawMapping)) {
        if (key.startsWith("_")) continue;
        if (typeof value === "string") {
          normalizedMapping[key] = value;
        } else if (value && typeof value === "object" && typeof value.source === "string") {
          normalizedMapping[key] = value.source;
        }
      }

      if (Object.keys(normalizedMapping).length === 0) continue;

      const result = validateFieldMapping(typeName, normalizedMapping);

      for (const [fieldKey, fieldResult] of Object.entries(result.results)) {
        totalChecked++;
        if (!isEditorRequiredField(editor, fieldKey)) continue;

        const source = normalizedMapping[fieldKey];

        if (fieldResult.found === 0 && fieldResult.total > 0) {
          issuesFound++;
          const missingFiles = fieldResult.missing.flatMap((m) => m.files);
          errors.push({
            type: "error",
            code: "FIELD_MAPPING_MISSING",
            message: `${typeName}: field "${fieldKey}" source "${source}" present in 0/${fieldResult.total} entries`,
            suggestion: `Add "${source}" to: ${missingFiles.join(", ")}`,
          });
        } else if (fieldResult.found > 0 && fieldResult.found < fieldResult.total) {
          issuesFound++;
          const missingFiles = fieldResult.missing.flatMap((m) => m.files);
          warnings.push({
            type: "warning",
            code: "FIELD_MAPPING_PARTIAL",
            message: `${typeName}: field "${fieldKey}" source "${source}" present in ${fieldResult.found}/${fieldResult.total} entries`,
            suggestion: `Add "${source}" to: ${missingFiles.join(", ")}`,
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    return {
      name: this.name,
      description: this.description,
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      errors,
      warnings,
      duration,
      artifacts: {
        totalChecked,
        issuesFound,
      },
    };
  },
};
