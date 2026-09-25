/**
 * MCP envelopes for editor.<field>.deprecated (server code `deprecated_field`).
 */
import {
  DEPRECATED_FIELD_CODE,
  isNonEmptyFieldValue,
  listDeprecatedFields,
} from "../../shared/deprecatedField.js";
import {
  deprecatedTemplateRefWarning,
  type DeprecatedTemplateRef,
} from "../../server/deprecated-field-guard.js";
import { fail, type McpTextResult, type McpWarning, type NextAction } from "./respond.js";

export type DeprecatedFieldInfo = {
  field: string;
  replaced_by: string | null;
  reason?: string | null;
  field_path?: string;
};

export function isDeprecatedFieldInfo(value: unknown): value is DeprecatedFieldInfo {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { field?: unknown }).field === "string"
  );
}

export const DEPRECATED_FIELD_WARNINGS: McpWarning[] = [
  {
    code: "deprecated_field_no_write",
    message:
      "Nothing was written. Old entries that already store a value keep it; this entry has none, so the field cannot be set. " +
      "Clearing (null / empty) is always allowed. The value was not copied to the replacement field.",
  },
];

/** Suggested follow-up: write the replacement field with the same entry scope. */
export function deprecatedFieldNextActions(
  info: DeprecatedFieldInfo,
  entry: { slug: string; contentType: string; locale?: string; variant?: string },
): NextAction[] {
  if (!info.replaced_by) return [];
  return [
    {
      tool: "update_entry_field",
      priority: "recommended",
      reason: `"${info.field}" is deprecated — write the value to "${info.replaced_by}" instead.`,
      args_hint: {
        slug: entry.slug,
        contentType: entry.contentType,
        field: info.replaced_by,
        level: "content_type",
        ...(entry.locale ? { locale: entry.locale } : {}),
        ...(entry.variant ? { variant: entry.variant } : {}),
      },
    },
  ];
}

export function deprecatedFieldFail(
  message: string,
  info: DeprecatedFieldInfo,
  entry: { slug: string; contentType: string; locale?: string; variant?: string },
  nextActionsOverride?: NextAction[],
): McpTextResult {
  return fail(message, {
    code: DEPRECATED_FIELD_CODE,
    deprecated: {
      field: info.field,
      replaced_by: info.replaced_by,
      reason: info.reason ?? null,
      field_path: info.field_path ?? info.field,
    },
    warnings: DEPRECATED_FIELD_WARNINGS,
    side_effects: [],
    next_actions: nextActionsOverride ?? deprecatedFieldNextActions(info, entry),
  });
}

export type DeprecatedFieldPresent = {
  field: string;
  replaced_by: string | null;
  note: string;
};

/**
 * Deprecated fields that hold a non-empty value in this read payload (root key or field_overrides bag).
 * Always an array so agents can rely on the key.
 */
export function deprecatedFieldsPresent(
  config: { editor?: unknown } | null | undefined,
  data: Record<string, unknown>,
): DeprecatedFieldPresent[] {
  const deprecated = listDeprecatedFields(
    (config?.editor ?? undefined) as Record<string, { deprecated?: unknown }> | undefined,
  );
  const bag =
    data.field_overrides && typeof data.field_overrides === "object" && !Array.isArray(data.field_overrides)
      ? (data.field_overrides as Record<string, unknown>)
      : {};
  const out: DeprecatedFieldPresent[] = [];
  for (const [field, cfg] of Object.entries(deprecated)) {
    if (!isNonEmptyFieldValue(data[field]) && !isNonEmptyFieldValue(bag[field])) continue;
    out.push({
      field,
      replaced_by: cfg.replaced_by,
      note: cfg.replaced_by
        ? `Deprecated; kept on this entry. Prefer "${cfg.replaced_by}" for new values.`
        : "Deprecated (no replacement); kept on this entry.",
    });
  }
  return out;
}

/** `deprecated_template_ref` warnings from server `deprecated_template_refs` (write still saved). */
export function deprecatedTemplateRefWarnings(refs: unknown): McpWarning[] {
  if (!Array.isArray(refs)) return [];
  return (refs as DeprecatedTemplateRef[])
    .filter((r) => r && typeof r.field === "string" && typeof r.variable === "string")
    .map((r) => deprecatedTemplateRefWarning(r));
}
