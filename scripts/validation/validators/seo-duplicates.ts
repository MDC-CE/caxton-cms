import type { ContentFile, Validator, ValidatorResult, ValidationContext } from "../shared/types";
import { liveFilesForSeo } from "../shared/seoValidationScope";
import { getResolvedMeta, hasTemplate } from "../shared/resolvedMeta";
import { SEO_DUPLICATES_ISSUE_CODES } from "./seo-duplicates.issueCodes";

/**
 * Cross-entry SEO duplicate title/description checks on the filled-in meta,
 * site-wide across languages (titles must differ per language).
 * Must not run in entry-scoped / on-save slices (false clear or false all-clear).
 */

function usableValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || hasTemplate(trimmed)) return null;
  return trimmed;
}

function otherFilesSuggestion(files: ContentFile[], field: string): string {
  const others = files
    .slice(1)
    .map((f) => `${f.filePath} (${f.locale})`)
    .join(", ");
  const locales = Array.from(new Set(files.map((f) => `${f.locale}.yml`))).join(" / ");
  return `Also used in: ${others}. ${field} must differ per page and per language; save a translated value in each ${locales}`;
}

export const seoDuplicatesValidator: Validator = {
  name: "seo-duplicates",
  issueCodes: SEO_DUPLICATES_ISSUE_CODES,
  description: "Detects duplicate page_title and meta description across live pages",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "seo",
  runClass: "cross-entry",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const errors: ValidatorResult["errors"] = [];
    const warnings: ValidatorResult["warnings"] = [];

    const titleMap = new Map<string, ContentFile[]>();
    const descriptionMap = new Map<string, ContentFile[]>();
    const liveFiles = liveFilesForSeo(context);

    for (const file of liveFiles) {
      const resolved = getResolvedMeta(file, context);
      if (!resolved.ok) continue;

      const pageTitle = usableValue(resolved.meta.page_title);
      if (pageTitle) {
        const existing = titleMap.get(pageTitle) || [];
        existing.push(file);
        titleMap.set(pageTitle, existing);
      }

      const description = usableValue(resolved.meta.description);
      if (description) {
        const existing = descriptionMap.get(description) || [];
        existing.push(file);
        descriptionMap.set(description, existing);
      }
    }

    let duplicateTitles = 0;
    titleMap.forEach((files, title) => {
      if (files.length > 1) {
        duplicateTitles++;
        errors.push({
          type: "error",
          code: "DUPLICATE_TITLE",
          message: `Duplicate page_title "${title}" used by ${files.length} files`,
          file: files[0].filePath,
          suggestion: otherFilesSuggestion(files, "Titles"),
        });
      }
    });

    let duplicateDescriptions = 0;
    descriptionMap.forEach((files, desc) => {
      if (files.length > 1) {
        duplicateDescriptions++;
        errors.push({
          type: "error",
          code: "DUPLICATE_DESCRIPTION",
          message: `Duplicate description used by ${files.length} files: "${desc.substring(0, 60)}..."`,
          file: files[0].filePath,
          suggestion: otherFilesSuggestion(files, "Descriptions"),
        });
      }
    });

    return {
      name: this.name,
      description: this.description,
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      errors,
      warnings,
      duration: Date.now() - startTime,
      artifacts: {
        pagesChecked: liveFiles.length,
        duplicateTitles,
        duplicateDescriptions,
      },
    };
  },
};
