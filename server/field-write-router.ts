/**
 * Route field updates to the correct YAML layer (_common / locale / seo:)
 * regardless of caller (proposal apply, MCP update_fields, etc.).
 */

import * as path from "path";
import type { ContentIndex } from "./content-index";
import { editCommonContent, editContent, getContentForEdit } from "./content-editor";
import {
  applyFunnelFieldUpdates,
  commonYmlPath,
  isFunnelFieldPath,
  prepareAndWriteFunnelMerge,
  readFunnelBlockFromFile,
  stripFunnelFromAllLocaleYamls,
  type FunnelFieldUpdate,
} from "./funnel-fields";
import { META_COMMON_KEYS } from "./bulk-update-meta";
import { assertFunnelAudienceGates } from "./product/funnel-audience-gates";
import { isKnownSeoFieldPath, SEO_YAML_KEY } from "./seo-field-defs";
import { LEGACY_SEO_PILLAR_KEY } from "./content-types";
import { writeSeoFields } from "./seo-index";
import { markFileAsModified } from "./sync-state";

export type FieldWriteScope = "funnel" | "seo" | "meta_common" | "locale";

export type FieldUpdateItem = {
  field_path: string;
  value?: unknown;
  reset?: boolean;
  /** Unknown meta.* only — ignored for funnel/seo/known common meta. */
  meta_target?: "locale" | "common";
};

export type FieldWriteWarning = {
  code: string;
  message: string;
};

export type ApplyFieldUpdatesResult =
  | {
      ok: true;
      warnings: FieldWriteWarning[];
      wrote: string[];
    }
  | {
      ok: false;
      error: string;
      code?: string;
      warnings: FieldWriteWarning[];
      wrote: string[];
      details?: unknown;
    };

function getByPath(obj: Record<string, unknown>, pathStr: string): unknown {
  const parts = pathStr.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isSeoFieldPath(fieldPath: string): boolean {
  return (
    isKnownSeoFieldPath(fieldPath) ||
    fieldPath === `${SEO_YAML_KEY}.${LEGACY_SEO_PILLAR_KEY}` ||
    fieldPath === SEO_YAML_KEY ||
    fieldPath.startsWith(`${SEO_YAML_KEY}.`)
  );
}

function metaKeyFromPath(fieldPath: string): string | null {
  if (!fieldPath.startsWith("meta.")) return null;
  return fieldPath.slice("meta.".length).split(".")[0] || null;
}

/** Classify a field path into its write target scope. */
export function classifyFieldPath(
  fieldPath: string,
  metaTarget?: "locale" | "common",
): FieldWriteScope {
  if (isFunnelFieldPath(fieldPath)) return "funnel";
  if (isSeoFieldPath(fieldPath)) return "seo";
  const metaKey = metaKeyFromPath(fieldPath);
  if (metaKey) {
    if (META_COMMON_KEYS.has(metaKey)) return "meta_common";
    if (metaTarget === "common") return "meta_common";
    return "locale";
  }
  return "locale";
}

export function readFieldValueAtPath(opts: {
  contentType: string;
  slug: string;
  locale: string;
  variant?: string | null;
  field_path: string;
  contentRoot?: string;
  ci?: ContentIndex;
}): { value: unknown; error?: string } {
  const { field_path } = opts;
  if (isFunnelFieldPath(field_path)) {
    const filePath = commonYmlPath(opts.contentType, opts.slug, opts.contentRoot);
    const block = readFunnelBlockFromFile(filePath);
    if (field_path === "funnel") return { value: Object.keys(block).length ? block : undefined };
    return { value: getByPath(block as Record<string, unknown>, field_path.slice("funnel.".length)) };
  }
  const loaded = getContentForEdit(
    opts.contentType,
    opts.slug,
    opts.locale,
    opts.variant?.trim() || undefined,
    undefined,
    opts.ci,
  );
  if (!loaded.content) {
    return { value: undefined, error: loaded.error || "Content not found" };
  }
  return { value: getByPath(loaded.content, field_path) };
}

/**
 * Apply mixed field updates to the correct YAML layers.
 * Funnel always writes live `_common.yml` (ignores locale/variant for the write itself).
 */
export async function applyFieldUpdates(opts: {
  contentType: string;
  slug: string;
  locale: string;
  variant?: string | null;
  updates: FieldUpdateItem[];
  author: string;
  contentRoot?: string;
  contentRootName?: string;
  ci?: ContentIndex;
  skipSharedLayoutFanOut?: boolean;
}): Promise<ApplyFieldUpdatesResult> {
  const warnings: FieldWriteWarning[] = [];
  const wrote: string[] = [];
  const { contentType, slug, locale, author, contentRoot, ci } = opts;
  const contentRootName =
    opts.contentRootName ||
    (contentRoot ? path.basename(path.isAbsolute(contentRoot) ? contentRoot : path.join(process.cwd(), contentRoot)) : undefined);
  const variant = opts.variant?.trim() || undefined;
  const updates = opts.updates ?? [];
  if (!updates.length) return { ok: true, warnings, wrote };

  const funnelUpdates = updates.filter((u) => classifyFieldPath(u.field_path, u.meta_target) === "funnel");
  const seoUpdates = updates.filter((u) => classifyFieldPath(u.field_path, u.meta_target) === "seo");
  const commonMetaUpdates = updates.filter(
    (u) => classifyFieldPath(u.field_path, u.meta_target) === "meta_common",
  );
  const localeUpdates = updates.filter((u) => classifyFieldPath(u.field_path, u.meta_target) === "locale");

  // --- Funnel first (live common); validate gates before any write ---
  if (funnelUpdates.length > 0) {
    if (variant) {
      warnings.push({
        code: "funnel_live_despite_variant",
        message:
          "funnel.stage / funnel.products wrote live _common.yml (all languages). Draft/variant copy was not used for journey membership.",
      });
    }
    warnings.push({
      code: "funnel_locale_agnostic",
      message:
        "funnel.stage / funnel.products are page-level on _common.yml (all languages). locale and variant do not scope this write.",
    });

    const fieldUpdates: FunnelFieldUpdate[] = funnelUpdates.map((u) => ({
      field_path: u.field_path,
      value: u.value,
      reset: u.reset === true,
    }));

    // Pre-validate merge + gates (no write yet)
    const current = readFunnelBlockFromFile(commonYmlPath(contentType, slug, contentRoot));
    const mergedPreview = applyFunnelFieldUpdates(current, fieldUpdates);
    if (!mergedPreview.ok) {
      return {
        ok: false,
        error: mergedPreview.error,
        code: mergedPreview.code,
        warnings,
        wrote,
        details: mergedPreview.details,
      };
    }
    const gates = assertFunnelAudienceGates(mergedPreview.coerced, {
      contentType,
      contentSlug: slug,
      contentRoot,
    });
    if (!gates.ok) {
      return {
        ok: false,
        error: gates.error,
        code: gates.code,
        warnings,
        wrote,
        details: gates.details,
      };
    }

    // Build touch patch from updates for prepareAndWriteFunnelMerge
    const patch: {
      touchStage?: boolean;
      stage?: unknown;
      touchProducts?: boolean;
      products?: unknown;
    } = {};
    for (const u of fieldUpdates) {
      if (u.field_path === "funnel") {
        if (u.reset) {
          patch.touchStage = true;
          patch.stage = null;
          patch.touchProducts = true;
          patch.products = null;
        } else if (u.value && typeof u.value === "object" && !Array.isArray(u.value)) {
          const b = u.value as Record<string, unknown>;
          if ("stage" in b) {
            patch.touchStage = true;
            patch.stage = b.stage;
          }
          if ("products" in b) {
            patch.touchProducts = true;
            patch.products = b.products;
          }
        }
        continue;
      }
      if (u.field_path === "funnel.stage") {
        patch.touchStage = true;
        patch.stage = u.reset ? null : u.value;
      } else if (u.field_path === "funnel.products") {
        patch.touchProducts = true;
        patch.products = u.reset ? null : u.value;
      }
    }

    const funnelWrite = prepareAndWriteFunnelMerge(
      contentType,
      slug,
      patch,
      contentRoot,
      assertFunnelAudienceGates,
    );
    if (!funnelWrite.ok) {
      return {
        ok: false,
        error: funnelWrite.error,
        code: funnelWrite.code,
        warnings,
        wrote,
        details: funnelWrite.details,
      };
    }
    if (funnelWrite.relativePath) {
      markFileAsModified(funnelWrite.relativePath, author, undefined, contentRoot);
      wrote.push(funnelWrite.relativePath);
    }
    for (const w of funnelWrite.warnings) {
      warnings.push({ code: w.code, message: w.message });
    }

    const stripped = stripFunnelFromAllLocaleYamls(contentType, slug, contentRoot, author);
    if (stripped.strippedRelativePaths.length > 0) {
      wrote.push(...stripped.strippedRelativePaths);
      warnings.push({
        code: "funnel_stripped_from_locale_yamls",
        message: `Removed orphan funnel: from locale YAML (${stripped.strippedRelativePaths.join(", ")}). Journey membership stays on _common.yml only.`,
      });
    }
  }

  // --- SEO (locale seo:) ---
  if (seoUpdates.length > 0) {
    const seoPayload: Record<string, unknown> = {};
    for (const u of seoUpdates) {
      if (u.field_path === SEO_YAML_KEY || u.field_path.startsWith(`${SEO_YAML_KEY}.`)) {
        if (
          !isKnownSeoFieldPath(u.field_path) &&
          u.field_path !== `${SEO_YAML_KEY}.${LEGACY_SEO_PILLAR_KEY}`
        ) {
          return {
            ok: false,
            error:
              "Unknown seo.* field. Known: seo.main_keyword, seo.kw_monthly_volume, seo.kw_difficulty, seo.pillar_path, seo.is_pillar. seo.* always writes the locale file (not _common.yml).",
            code: "unknown_seo_field",
            warnings,
            wrote,
          };
        }
      }
      const field =
        u.field_path === `${SEO_YAML_KEY}.${LEGACY_SEO_PILLAR_KEY}`
          ? "pillar_path"
          : u.field_path.startsWith(`${SEO_YAML_KEY}.`)
            ? u.field_path.slice(SEO_YAML_KEY.length + 1)
            : u.field_path;
      seoPayload[field] = u.reset ? null : u.value;
    }
    const seoResult = writeSeoFields({
      contentType,
      slug,
      locale,
      updates: seoPayload,
      author,
      contentRoot,
      variant,
      ci,
    });
    if (!seoResult.success) {
      return {
        ok: false,
        error:
          wrote.length > 0
            ? `Journey/common fields were written but seo update failed: ${seoResult.error}. Retry seo.* only.`
            : seoResult.error || "SEO write failed",
        code: seoResult.code,
        warnings,
        wrote,
      };
    }
    wrote.push("seo");
  }

  // --- Common meta ---
  if (commonMetaUpdates.length > 0) {
    const ops = commonMetaUpdates.map((u) => ({
      action: "update_field" as const,
      path: u.field_path.startsWith("meta.") ? u.field_path : `meta.${u.field_path}`,
      value: u.reset ? undefined : u.value,
    }));
    const commonResult = editCommonContent({
      contentType,
      slug,
      operations: ops,
      author,
      contentRootName,
      ci,
    });
    if (!commonResult.success) {
      return {
        ok: false,
        error:
          wrote.length > 0
            ? `Earlier fields were written but _common.yml meta failed: ${commonResult.error}. Retry common meta only.`
            : commonResult.error || "Common meta write failed",
        code: commonResult.errorCode,
        warnings,
        wrote,
      };
    }
    wrote.push("_common.yml:meta");
  }

  // --- Locale / variant body ---
  if (localeUpdates.length > 0) {
    const operations = localeUpdates.map((u) =>
      u.reset
        ? { action: "update_field" as const, path: u.field_path, value: null }
        : { action: "update_field" as const, path: u.field_path, value: u.value },
    );
    const localeResult = await editContent({
      contentType,
      slug,
      locale,
      variant,
      operations,
      author,
      contentRoot,
      ci,
      skipSharedLayoutFanOut: opts.skipSharedLayoutFanOut,
    });
    if (!localeResult.success) {
      return {
        ok: false,
        error:
          wrote.length > 0
            ? `Journey/common fields were written but locale update failed: ${localeResult.error}. Retry locale/body fields only.`
            : localeResult.error || "Locale write failed",
        code: localeResult.errorCode,
        warnings,
        wrote,
      };
    }
    wrote.push(`locale:${locale}${variant ? `@${variant}` : ""}`);
  }

  return { ok: true, warnings, wrote };
}
