/**
 * Build the og_image_preview section payload from preview prop mappings.
 * Shared by the staff preview JSON API and the HTML capture path.
 */
import type { PreviewPropResolveContext } from "@shared/entry-preview-props";
import {
  applyPreviewPropMappings,
  collectMappablePropsFromSchema,
  materializeOgPreviewReadingTime,
} from "@shared/entry-preview-props";
import { RESERVED_IMAGE_FIELD, type ContentTypePreviewConfig } from "./content-types";
import { loadSchema } from "./component-registry";

export function buildPreviewSection(
  preview: ContentTypePreviewConfig,
  ctx: PreviewPropResolveContext,
): { section: Record<string, unknown>; missing: string[] } {
  const data: Record<string, unknown> = {};
  const { missing } = applyPreviewPropMappings(data, preview.props, ctx, RESERVED_IMAGE_FIELD);
  materializeOgPreviewReadingTime(data, preview.props, ctx.entry);

  // Only required component props block capture. Optional mappings (category, author,
  // content → reading_time, etc.) simply omit that part of the card when empty.
  const schema = loadSchema(preview.component, preview.version || "1.0");
  const mappable = collectMappablePropsFromSchema(schema, preview.variant || "default");
  const requiredKeys = new Set(mappable.filter((p) => p.required).map((p) => p.key));
  const missingVisible = missing.filter((k) => requiredKeys.has(k));

  return {
    section: {
      type: preview.component,
      version: preview.version || "1.0",
      variant: preview.variant || "default",
      ...data,
      section_id: `entry-preview-${preview.component}`,
    },
    missing: missingVisible,
  };
}
