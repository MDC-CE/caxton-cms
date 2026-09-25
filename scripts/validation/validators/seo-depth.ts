import type { Validator, ValidatorResult, ValidationContext, ValidationIssue } from "../shared/types";
import { getPreviewConfig, resolveContentTypeUrl } from "../../../server/content-types";
import { liveFilesForSeo } from "../shared/seoValidationScope";
import { getResolvedMeta, hasTemplate, resolveContentRoot } from "../shared/resolvedMeta";
import { findInheritedMetaSource, type InheritedMetaKey } from "../shared/metaSource";
import { SEO_DEPTH_ISSUE_CODES } from "./seo-depth.issueCodes";

/**
 * Entry-local SEO depth: title/description length, OG image, canonical URL,
 * and language-specific meta inherited from `_common.yml`.
 * Checks the filled-in meta (same resolution as live delivery), not raw templates.
 * Duplicate title/description checks live in seo-duplicates (cross-entry).
 */

const INHERITED_CHECKS: Array<{
  key: InheritedMetaKey;
  code: string;
  message: (value: string) => string;
}> = [
  {
    key: "page_title",
    code: "TITLE_INHERITED_FROM_COMMON",
    message: (value) => `Page title comes from _common.yml (shared by all languages): "${value}"`,
  },
  {
    key: "description",
    code: "DESCRIPTION_INHERITED_FROM_COMMON",
    message: () => "Description comes from _common.yml (shared by all languages)",
  },
  {
    key: "canonical_url",
    code: "CANONICAL_INHERITED_FROM_COMMON",
    message: (value) =>
      `Canonical URL comes from _common.yml, so every language points to the same page: "${value}"`,
  },
];

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const seoDepthValidator: Validator = {
  name: "seo-depth",
  issueCodes: SEO_DEPTH_ISSUE_CODES,
  description: "Validates SEO depth: title/description length, OG image, and canonical URL",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "seo",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    let pagesWithOptimalTitles = 0;
    let pagesWithOptimalDescriptions = 0;

    for (const file of liveFilesForSeo(context)) {
      const resolved = getResolvedMeta(file, context);
      if (!resolved.ok) {
        warnings.push({
          type: "warning",
          code: "META_RESOLVE_FAILED",
          message: `Could not fill in meta for this page: ${resolved.error}`,
          file: file.filePath,
          suggestion:
            "Check the content type's field mapping and this entry's YAML; title, description and og_image checks were skipped",
        });
        continue;
      }
      const meta = resolved.meta;

      const pageTitle = asText(meta.page_title);
      const description = asText(meta.description);

      if (pageTitle && !hasTemplate(pageTitle)) {
        if (pageTitle.length < 30) {
          warnings.push({
            type: "warning",
            code: "TITLE_TOO_SHORT",
            message: `Page title is too short (${pageTitle.length} chars): "${pageTitle}"`,
            file: file.filePath,
            suggestion: "Aim for a page title between 30-60 characters for optimal SEO",
          });
        } else if (pageTitle.length > 60) {
          warnings.push({
            type: "warning",
            code: "TITLE_TOO_LONG",
            message: `Page title is too long (${pageTitle.length} chars): "${pageTitle.substring(0, 60)}..."`,
            file: file.filePath,
            suggestion: "Keep page title under 60 characters to avoid truncation in search results",
          });
        } else {
          pagesWithOptimalTitles++;
        }
      }

      if (description && !hasTemplate(description)) {
        if (description.length < 70) {
          warnings.push({
            type: "warning",
            code: "DESCRIPTION_TOO_SHORT",
            message: `Description is too short (${description.length} chars)`,
            file: file.filePath,
            suggestion: "Aim for a meta description between 70-160 characters",
          });
        } else if (description.length > 160) {
          warnings.push({
            type: "warning",
            code: "DESCRIPTION_TOO_LONG",
            message: `Description is too long (${description.length} chars)`,
            file: file.filePath,
            suggestion: "Keep meta description under 160 characters to avoid truncation",
          });
        } else {
          pagesWithOptimalDescriptions++;
        }
      }

      const ogImage = asText(meta.og_image);
      const rawOgImage = asText(file.meta?.og_image);
      // Delivery fills an empty templated og_image with the generated preview (applyEntryPreviewOgImage).
      const previewFillsOgImage =
        !!rawOgImage && !!getPreviewConfig(file.type, resolveContentRoot(context));
      if ((!ogImage || hasTemplate(ogImage)) && !previewFillsOgImage) {
        warnings.push({
          type: "warning",
          code: "MISSING_OG_IMAGE",
          message: rawOgImage
            ? `og_image uses a variable that has no value: "${rawOgImage}"`
            : "Missing og_image in meta",
          file: file.filePath,
          suggestion:
            "Add meta.og_image, or call regenerate_entry_previews with this slug and locales when the content type has preview: / og_image_preview configured",
        });
      }

      if (!file.meta?.canonical_url) {
        const resolvedPath = resolveContentTypeUrl(
          file.type,
          { slug: file.slug },
          file.locale,
        );
        const isResolvable =
          resolvedPath !== null &&
          !resolvedPath.includes(":") &&
          !resolvedPath.includes("undefined");
        if (!isResolvable) {
          warnings.push({
            type: "warning",
            code: "MISSING_CANONICAL",
            message: "Missing canonical_url in meta",
            file: file.filePath,
            suggestion: "Add a canonical_url to avoid duplicate content issues",
          });
        }
      }

      for (const check of INHERITED_CHECKS) {
        const source = findInheritedMetaSource(file, check.key, context);
        if (!source) continue;
        const rawMeta = (file.meta ?? {}) as Record<string, unknown>;
        const shown = asText(meta[check.key]) || asText(rawMeta[check.key]);
        warnings.push({
          type: "warning",
          code: check.code,
          message: check.message(shown),
          file: file.filePath,
          suggestion:
            check.key === "canonical_url"
              ? `Remove meta.canonical_url from _common.yml; set it per language in ${file.locale}.yml or let it default to the page URL`
              : `Set a translated ${source.field} in ${file.locale}.yml`,
        });
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
        pagesChecked: context.contentFiles.length,
        pagesWithOptimalTitles,
        pagesWithOptimalDescriptions,
      },
    };
  },
};
