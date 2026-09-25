/**
 * Generated MCP system_hints for content-type editor fields.
 * Relation + deprecation hints. Never concatenate into staff-editable description.
 */

import type { RelationEditorHint } from "./relation-field";
import { isRelationEditorHint } from "./relation-field";
import { deprecatedSystemHint, parseDeprecated } from "./deprecatedField";

/**
 * Build type-generic system_hints for a relation editor field.
 * Uses only `field` + hint shape — no product-specific labels.
 */
export function buildRelationSystemHints(
  field: string,
  hint: RelationEditorHint,
): string[] {
  const valueKey = hint.value?.trim() || "slug";
  const source = hint.source?.trim() || "(unset)";
  const multiple = !!hint.multiple;
  const required = !!hint.required;

  return [
    "Stores pointer slug(s) only (string | string[] when multiple). Never write related entry JSON.",
    `Related catalog source="${source}", value key="${valueKey}".`,
    `multiple=${multiple}; required=${required}; empty [] fails when required.`,
    `Forms may bind options via fields.*.source.related_field: "${field}" (reads this entry field / single.${field}).`,
    "Publish: if a form uses source.related_field pointing at this field, empty or unknown pointers fail live/publish.",
    `Write with update_fields / update_entry_field using path "${field}" (static types: _common.yml).`,
  ];
}

/**
 * Return system_hints for any editor hint, or undefined when not applicable (v1: relation only).
 */
export function buildEditorSystemHints(
  field: string,
  hint: { type?: string; deprecated?: unknown } & RelationEditorHint | undefined | null,
): string[] | undefined {
  if (!hint) return undefined;
  const deprecated = parseDeprecated(hint);
  const relation = isRelationEditorHint(hint) ? buildRelationSystemHints(field, hint) : [];
  const hints = deprecated ? [deprecatedSystemHint(field, deprecated), ...relation] : relation;
  return hints.length > 0 ? hints : undefined;
}
