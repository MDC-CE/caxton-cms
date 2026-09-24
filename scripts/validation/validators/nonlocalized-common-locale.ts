/**
 * Content types with a non-localized url_pattern.default (e.g. /landing/:slug,
 * no :locale segment) must set locale on _common.yml so SSR can load the
 * correct xx.yml when the public URL does not encode language.
 *
 * contentFiles never includes _common rows (contentLoader skips locales
 * starting with _). Discover entries from live locale files, then read common
 * via ContentIndex.loadCommonData.
 *
 * Issues are fan-out onto live locale files (not _common.yml) so the validation
 * cache can map them to entry keys / page diagnostics — same as seo-cluster
 * SEO_BLOCK_ON_COMMON_YML.
 */

import type { Validator, ValidatorResult, ValidationContext, ValidationIssue } from "../shared/types";
import { contentIndex as defaultContentIndex } from "../../../server/content-index";
import { getContentTypeConfig } from "../../../server/content-types";
import {
  NONLOCALIZED_COMMON_LOCALE_ISSUE_CODES,
  NONLOCALIZED_COMMON_LOCALE_VALIDATOR_NAME,
} from "./nonlocalized-common-locale.issueCodes";

/** True when the type is routed via url_pattern.default without :locale in the
 * path (same public URL for all languages). Matches content-index
 * patternLocale === "default". */
export function hasNonlocalizedDefaultUrlPattern(
  urlPattern?: Record<string, string> | null,
): boolean {
  const def = urlPattern?.default;
  if (typeof def !== "string" || !def.trim()) return false;
  return !def.includes(":locale");
}

/** Same live-locale filter as locale-slug-uniqueness. */
function isLiveLocale(locale: string): boolean {
  return locale !== "_common" && !locale.startsWith("_") && !locale.includes(".");
}

function resolveIndex(context: ValidationContext) {
  return context.contentIndex ?? defaultContentIndex;
}

function getLiveLocalesForEntry(
  context: ValidationContext,
  contentType: string,
  folderSlug: string,
): string[] {
  const index = resolveIndex(context);
  if (index) {
    try {
      return index
        .getAvailableLocalesOrVariants(contentType, folderSlug)
        .filter(isLiveLocale)
        .sort();
    } catch {
      // fall through to contentFiles
    }
  }

  const locales = new Set<string>();
  for (const file of context.contentFiles) {
    if (file.type !== contentType || file.slug !== folderSlug || file.variant) continue;
    if (!isLiveLocale(file.locale)) continue;
    locales.add(file.locale);
  }
  return [...locales].sort();
}

function readCommonLocale(
  context: ValidationContext,
  contentType: string,
  folderSlug: string,
): string | null {
  const index = resolveIndex(context);
  if (index) {
    try {
      const common = index.loadCommonData(contentType, folderSlug);
      const loc = common?.locale;
      if (typeof loc === "string" && loc.trim()) return loc.trim();
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function suggestionForMissing(available: string[]): string {
  if (available.length === 1) {
    return `Add \`locale: ${available[0]}\` to _common.yml so SSR loads ${available[0]}.yml for this non-localized URL.`;
  }
  if (available.length > 1) {
    return `Add \`locale: <xx>\` to _common.yml choosing the primary language for this URL. Available locale files: ${available.join(", ")}.`;
  }
  return "Add \`locale: <xx>\` to _common.yml and ensure a matching xx.yml exists (e.g. es.yml).";
}

function liveFilesForEntry(
  context: ValidationContext,
  contentType: string,
  folderSlug: string,
) {
  return context.contentFiles.filter(
    (f) =>
      f.type === contentType &&
      f.slug === folderSlug &&
      !f.variant &&
      isLiveLocale(f.locale),
  );
}

export const nonlocalizedCommonLocaleValidator: Validator = {
  name: NONLOCALIZED_COMMON_LOCALE_VALIDATOR_NAME,
  issueCodes: NONLOCALIZED_COMMON_LOCALE_ISSUE_CODES,
  description:
    "Non-localized url_pattern.default entries (e.g. landings) must set locale on _common.yml for SSR",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "integrity",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    let checked = 0;

    // One check per type/slug — contentFiles only has live locales, not _common.
    const entryKeys = new Set<string>();
    for (const file of context.contentFiles) {
      if (file.variant || !isLiveLocale(file.locale)) continue;
      const config = getContentTypeConfig(file.type, context.contentRoot);
      if (!hasNonlocalizedDefaultUrlPattern(config?.url_pattern)) continue;
      entryKeys.add(`${file.type}/${file.slug}`);
    }

    for (const key of entryKeys) {
      const [type, slug] = key.split("/") as [string, string];
      checked++;
      const siblings = liveFilesForEntry(context, type, slug);
      if (siblings.length === 0) continue;

      const commonLocale = readCommonLocale(context, type, slug);
      const available = getLiveLocalesForEntry(context, type, slug);

      if (!commonLocale) {
        for (const sibling of siblings) {
          errors.push({
            type: "error",
            code: "NONLOCALIZED_COMMON_LOCALE_MISSING",
            message:
              `Content type "${type}" uses a non-localized URL (url_pattern.default) but _common.yml for "${slug}" has no locale. SSR defaults to en and may serve an empty page when only other locales exist.`,
            file: sibling.filePath,
            suggestion: suggestionForMissing(available),
          });
        }
        continue;
      }

      if (available.length > 0 && !available.includes(commonLocale)) {
        for (const sibling of siblings) {
          errors.push({
            type: "error",
            code: "NONLOCALIZED_COMMON_LOCALE_NO_FILE",
            message:
              `_common.yml locale is "${commonLocale}" but no live locale "${commonLocale}" exists for "${slug}". Available: ${available.join(", ") || "(none)"}.`,
            file: sibling.filePath,
            suggestion:
              available.length === 1
                ? `Change locale to "${available[0]}" or add ${commonLocale}.yml.`
                : `Set locale to one of: ${available.join(", ")}, or add ${commonLocale}.yml.`,
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    return {
      name: this.name,
      description: this.description,
      status: errors.length > 0 ? "failed" : "passed",
      errors,
      warnings,
      duration,
      artifacts: { checked },
    };
  },
};
