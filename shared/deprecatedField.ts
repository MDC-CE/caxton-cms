/**
 * editor.<field>.deprecated — retire a content-type field.
 * Entries whose live files already store a value keep it (and may edit it);
 * new entries and entries without a value cannot set it. Clearing is always allowed.
 */

export type DeprecatedFieldConfig = {
  /** Field agents/staff should use instead; null = no replacement. */
  replaced_by: string | null;
  reason?: string;
  since?: string;
};

export const DEPRECATED_FIELD_CODE = "deprecated_field";

type EditorLike = Record<string, { deprecated?: unknown; required?: unknown } | null | undefined>;

/**
 * Normalize an editor hint's `deprecated` value. `true` is accepted as shorthand
 * for "deprecated with no replacement". Returns null when the field is not deprecated.
 */
export function parseDeprecated(
  hint: { deprecated?: unknown } | null | undefined,
): DeprecatedFieldConfig | null {
  const raw = hint?.deprecated;
  if (raw === true) return { replaced_by: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const replaced =
    typeof obj.replaced_by === "string" && obj.replaced_by.trim() ? obj.replaced_by.trim() : null;
  const out: DeprecatedFieldConfig = { replaced_by: replaced };
  if (typeof obj.reason === "string" && obj.reason.trim()) out.reason = obj.reason.trim();
  if (typeof obj.since === "string" && obj.since.trim()) out.since = obj.since.trim();
  return out;
}

export function isDeprecatedHint(hint: { deprecated?: unknown } | null | undefined): boolean {
  return parseDeprecated(hint) !== null;
}

/** Map of deprecated field → config for an editor block. */
export function listDeprecatedFields(
  editor: EditorLike | null | undefined,
): Record<string, DeprecatedFieldConfig> {
  const out: Record<string, DeprecatedFieldConfig> = {};
  if (!editor) return out;
  for (const [field, hint] of Object.entries(editor)) {
    const cfg = parseDeprecated(hint);
    if (cfg) out[field] = cfg;
  }
  return out;
}

export type DeprecationValidationFailure = {
  ok: false;
  code: "deprecated_config_invalid";
  error: string;
  field: string;
};

/**
 * Config rules:
 * - replaced_by must exist in field_mapping (or editor), not be itself, not be deprecated
 * - a deprecated field cannot be required
 */
export function validateDeprecations(
  editor: EditorLike | null | undefined,
  fieldMapping: Record<string, unknown> | null | undefined,
): { ok: true } | DeprecationValidationFailure {
  const deprecated = listDeprecatedFields(editor);
  const known = new Set<string>([
    ...Object.keys(fieldMapping || {}),
    ...Object.keys(editor || {}),
  ]);
  for (const [field, cfg] of Object.entries(deprecated)) {
    const req = editor?.[field]?.required;
    if (req === true || req === "attached") {
      return {
        ok: false,
        code: "deprecated_config_invalid",
        field,
        error: `Field "${field}" cannot be both deprecated and required. Turn off required first.`,
      };
    }
    const target = cfg.replaced_by;
    if (!target) continue;
    if (target === field) {
      return {
        ok: false,
        code: "deprecated_config_invalid",
        field,
        error: `Field "${field}" cannot name itself as its replacement.`,
      };
    }
    if (target.startsWith("_")) {
      return {
        ok: false,
        code: "deprecated_config_invalid",
        field,
        error: `Field "${field}" cannot be replaced by system field "${target}".`,
      };
    }
    if (!known.has(target)) {
      return {
        ok: false,
        code: "deprecated_config_invalid",
        field,
        error: `Replacement "${target}" for deprecated field "${field}" is not a field on this content type.`,
      };
    }
    if (deprecated[target]) {
      return {
        ok: false,
        code: "deprecated_config_invalid",
        field,
        error: `Replacement "${target}" for "${field}" is itself deprecated. Point "${field}" at a non-deprecated field.`,
      };
    }
  }
  return { ok: true };
}

/** Deprecated fields that name `field` as their replacement. */
export function listReplacementReferrers(
  editor: EditorLike | null | undefined,
  field: string,
): string[] {
  return Object.entries(listDeprecatedFields(editor))
    .filter(([name, cfg]) => name !== field && cfg.replaced_by === field)
    .map(([name]) => name);
}

/**
 * Block removing (or deprecating) a field while another deprecated field points at it.
 */
export function assertNotReplacementTarget(
  editor: EditorLike | null | undefined,
  field: string,
): { ok: true } | { ok: false; code: "deprecated_replacement_target"; error: string; referrers: string[] } {
  const referrers = listReplacementReferrers(editor, field);
  if (referrers.length === 0) return { ok: true };
  return {
    ok: false,
    code: "deprecated_replacement_target",
    referrers,
    error:
      `"${field}" is the replacement for deprecated field(s): ${referrers.join(", ")}. ` +
      "Change their replacement first.",
  };
}

/** One message for staff toasts and agent errors. */
export function deprecatedFieldMessage(field: string, cfg: DeprecatedFieldConfig): string {
  const base = cfg.replaced_by
    ? `Field "${field}" is deprecated — use "${cfg.replaced_by}" instead.`
    : `Field "${field}" is deprecated with no replacement — leave it empty.`;
  const reason = cfg.reason ? ` Reason: ${cfg.reason}` : "";
  return (
    base +
    reason +
    " Entries that already store a value keep it and may edit it; new entries and entries without a value cannot set it."
  );
}

/** Short generated system hint for MCP rows. */
export function deprecatedSystemHint(field: string, cfg: DeprecatedFieldConfig): string {
  return cfg.replaced_by
    ? `Deprecated: do not write "${field}" on new entries — use "${cfg.replaced_by}". Old entries keep their value.`
    : `Deprecated (no replacement): do not write "${field}" on new entries. Old entries keep their value.`;
}

/** Non-empty stored value (null / undefined / "" / [] / {} count as empty). */
export function isNonEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}
