/**
 * Text limits for section edits (POST /api/content/edit-sections): simulate
 * the operations on the merged page, then report only limited text the edit
 * changed. The route decides: draft writes and staff live edits warn; agent
 * (MCP) live edits are rejected.
 */
import type { EditOperation } from "@shared/schema";
import type { TextLimitViolation } from "@shared/component-text-limits";
import type { ContentIndex } from "./content-index";
import { getContentForEdit, simulateEditOperations } from "./content-editor";
import { isDraftEntry } from "./draft-entry";
import { loadEntry } from "./entry-layer";
import { evaluatePageTextLimitsForSite } from "./text-limits";

export interface EditTextLimitsResult {
  violations: TextLimitViolation[];
  /** True when the write lands in a draft/variant file or the entry has no live locale yet. */
  isDraftWrite: boolean;
}

export function evaluateEditTextLimits(opts: {
  ci: ContentIndex;
  contentType: string;
  slug: string;
  locale: string;
  variant?: string;
  operations: EditOperation[];
  contentRoot?: string;
}): EditTextLimitsResult {
  const { ci, contentType, slug, locale, variant, operations, contentRoot } = opts;
  const isDraftWrite = !!variant || isDraftEntry(contentType, slug, contentRoot);
  let before: Record<string, unknown> | null = null;
  try {
    before = loadEntry(ci, contentType, slug, locale, undefined, { entryVariant: variant })?.data ?? null;
  } catch {
    before = null;
  }
  if (!before) {
    before = getContentForEdit(contentType, slug, locale, variant, undefined, ci).content;
  }
  if (!before) return { violations: [], isDraftWrite };
  const after = simulateEditOperations(before, operations, { contentRoot, locale });
  if (!after) return { violations: [], isDraftWrite };
  return {
    violations: evaluatePageTextLimitsForSite(after, { before, contentRoot }),
    isDraftWrite,
  };
}
