/**
 * Component layout traits (`layout:` in schema.yml) and variant metadata
 * (`variants.<name>`). Traits tell validators and agents how a section sits in
 * page flow; they are facts about the component, not spacing taste (spacing
 * rules are learned from approved pages by component insights).
 *
 * schema.yml:
 *   layout:
 *     flow: out              # in (default) | out — overlay/structured data, never adjacent to anything
 *     self_padded: [default] # true | false | [variant names] — paints its own vertical padding
 *     edge: top_of_page      # optional — designed to be the first visible section
 *   variants:
 *     default:
 *       description: ...
 *       best_for: ...        # staff-approved (AI-drafted from evidence)
 *       avoid_when: ...      # staff-approved
 *       content_shape:       # measured from live pages by the backfill script
 *         items: { min: 2, max: 4, typical: 3 }
 *         image: optional
 */

export type LayoutFlow = "in" | "out";

export interface ComponentLayoutBlock {
  flow?: LayoutFlow;
  self_padded?: boolean | string[];
  edge?: "top_of_page";
}

export interface ContentShapeRange {
  min?: number;
  max?: number;
  typical?: number;
  /** Hard limit from Zod (`.min` / `.max`) or `text_limits`; measured range is clamped inside it. */
  limit?: { min?: number; max?: number };
}

export interface VariantContentShape {
  /** Array fields → item count range seen on live pages (and Zod min/max when present). */
  items?: Record<string, ContentShapeRange>;
  /** Visible-character ranges for headline-like text fields. */
  text?: Record<string, ContentShapeRange>;
  /** Media presence across live uses. */
  image?: "required" | "optional" | "unused";
  icon?: "required" | "optional" | "unused";
  /** Pages the measurement came from (live, published). */
  sample_pages?: number;
  measured_at?: string;
}

export interface VariantMetadata {
  description?: string;
  best_for?: string;
  avoid_when?: string;
  content_shape?: VariantContentShape;
  /** `approved` once staff reviewed best_for / avoid_when (drafts stay `draft`). */
  metadata_status?: "draft" | "approved";
}

export interface ResolvedLayoutTraits {
  flow: LayoutFlow;
  self_padded: boolean;
  edge?: "top_of_page";
}

/** Traits for one section (variant-aware for `self_padded: [variants]`). */
export function resolveLayoutTraits(
  block: ComponentLayoutBlock | null | undefined,
  variant: string | null | undefined,
): ResolvedLayoutTraits {
  const sp = block?.self_padded;
  const selfPadded = Array.isArray(sp) ? sp.includes(variant || "default") : sp === true;
  return {
    flow: block?.flow === "out" ? "out" : "in",
    self_padded: selfPadded,
    ...(block?.edge ? { edge: block.edge } : {}),
  };
}

/** Missing fields for the registry metadata check (empty variant, no best_for / content_shape). */
export function variantMetadataGaps(meta: VariantMetadata | null | undefined): string[] {
  const gaps: string[] = [];
  if (!meta || Object.keys(meta).length === 0) return ["empty"];
  if (!meta.best_for?.trim()) gaps.push("best_for");
  if (!meta.content_shape || Object.keys(meta.content_shape).length === 0) gaps.push("content_shape");
  return gaps;
}
