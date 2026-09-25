/**
 * Validation orchestration for MCP content-type field patches.
 */
import { assertRequiredFieldsHaveFillIntent } from "../../shared/fillIntent.js";
import {
  assertEditorRequiredHasStrategy,
  parseContentTypeStrategy,
} from "../../shared/contentTypeStrategy.js";
import {
  assertNotReplacementTarget,
  parseDeprecated,
  validateDeprecations,
} from "../../shared/deprecatedField.js";
import { validateEditorHintsHaveJsonSchemas } from "../../server/json-field-validate.js";
import { validateEditorHintsHaveRelationSources } from "../../server/relation-field-validate.js";
import type { ContentTypeEditorHint } from "../../server/content-types.js";
import {
  applyFieldPatch,
  checkRelationSourceCollision,
  relationSourceFromEditor,
  validateStaticRemapForKey,
  type ApplyFieldPatchResult,
  type ContentTypeConfigSlice,
  type FieldPatchInput,
  type FieldMappingEntry,
} from "./content-type-field-patch.js";

export type FieldPatchValidationContext = {
  contentType: string;
  contentTypeNames: readonly string[];
  databaseNames: readonly string[];
};

export type ValidatedFieldPatch = Extract<ApplyFieldPatchResult, { ok: true }> & {
  isNewField?: boolean;
};

export type FieldPatchValidationFailure = {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function validateMergedEditor(
  editor: Record<string, ContentTypeEditorHint> | null,
  strategy: unknown,
): FieldPatchValidationFailure | { ok: true } {
  if (!editor) {
    return { ok: true };
  }

  const jsonCheck = validateEditorHintsHaveJsonSchemas(editor);
  if (!jsonCheck.ok) {
    return {
      ok: false,
      code: "invalid_json_schema",
      message: jsonCheck.error,
      details: jsonCheck.field ? { field: jsonCheck.field } : undefined,
    };
  }

  const relationCheck = validateEditorHintsHaveRelationSources(editor);
  if (!relationCheck.ok) {
    return {
      ok: false,
      code: "missing_relation_source",
      message: relationCheck.error,
      details: relationCheck.field ? { field: relationCheck.field } : undefined,
    };
  }

  const fillIntentCheck = assertRequiredFieldsHaveFillIntent(
    editor as Record<string, { required?: unknown; fill_intent?: unknown }>,
  );
  if (!fillIntentCheck.ok) {
    return {
      ok: false,
      code: "missing_fill_intent",
      message: fillIntentCheck.error,
      details: { fields: fillIntentCheck.fields },
    };
  }

  const strategyCheck = assertEditorRequiredHasStrategy(strategy, editor);
  if (!strategyCheck.ok) {
    return {
      ok: false,
      code: strategyCheck.code,
      message: strategyCheck.error,
    };
  }

  return { ok: true };
}

export function validateRelationCollisionsForEditor(
  editor: Record<string, ContentTypeEditorHint> | null,
  ctx: FieldPatchValidationContext,
): FieldPatchValidationFailure | { ok: true } {
  if (!editor) return { ok: true };
  for (const [field, hint] of Object.entries(editor)) {
    const source = relationSourceFromEditor(hint);
    if (!source) continue;
    const collision = checkRelationSourceCollision(
      source,
      ctx.contentTypeNames,
      ctx.databaseNames,
    );
    if (!collision.ok) {
      return {
        ok: false,
        code: "relation_source_collision",
        message: collision.error,
        details: { field, source },
      };
    }
  }
  return { ok: true };
}

export function validateStaticRemap(
  contentType: string,
  fieldKey: string,
  mappingEntry: FieldMappingEntry,
  isDbBacked: boolean,
): FieldPatchValidationFailure | { ok: true; isNewField?: boolean } {
  const result = validateStaticRemapForKey(contentType, fieldKey, mappingEntry, isDbBacked);
  if (!result) return { ok: true };
  const keyResult = result.results[fieldKey];
  if (!keyResult?.valid) {
    return {
      ok: false,
      code: "invalid_field_mapping",
      message:
        `field_mapping for "${fieldKey}" references a source missing on some entries. ` +
        "Fix entry YAML or use an identity mapping (key === source) for new fields.",
      details: { validation: result.results },
    };
  }
  return { ok: true, isNewField: keyResult.isNewField };
}

export function prepareFieldPatch(
  config: ContentTypeConfigSlice,
  input: FieldPatchInput,
  ctx: FieldPatchValidationContext,
): FieldPatchValidationFailure | ValidatedFieldPatch {
  const applied = applyFieldPatch(config, input);
  if (!applied.ok) {
    return {
      ok: false,
      code: applied.code,
      message: applied.message,
      details: applied.details,
    };
  }

  const mappingEntry = applied.nextFieldMapping[input.field_key.trim()];
  let isNewField: boolean | undefined;
  if (mappingEntry !== undefined && input.action !== "remove") {
    const remapCheck = validateStaticRemap(
      ctx.contentType,
      input.field_key.trim(),
      mappingEntry,
      input.isDbBacked,
    );
    if (!remapCheck.ok) return remapCheck;
    isNewField = remapCheck.isNewField;
  }

  if (input.editor?.type === "relation" && input.editor.source) {
    const collision = checkRelationSourceCollision(
      input.editor.source,
      ctx.contentTypeNames,
      ctx.databaseNames,
    );
    if (!collision.ok) {
      return {
        ok: false,
        code: "relation_source_collision",
        message: collision.error,
        details: { field: input.field_key, source: input.editor.source },
      };
    }
  }

  const collisionEditor = validateRelationCollisionsForEditor(applied.nextEditor, ctx);
  if (!collisionEditor.ok) return collisionEditor;

  const fieldKey = input.field_key.trim();
  if (input.action === "remove" || parseDeprecated(applied.nextEditor?.[fieldKey])) {
    const target = assertNotReplacementTarget(applied.nextEditor, fieldKey);
    if (!target.ok) {
      return {
        ok: false,
        code: target.code,
        message: target.error,
        details: { field: fieldKey, referrers: target.referrers },
      };
    }
  }
  const depCheck = validateDeprecations(applied.nextEditor, applied.nextFieldMapping);
  if (!depCheck.ok) {
    return {
      ok: false,
      code: depCheck.code,
      message: depCheck.error,
      details: { field: depCheck.field },
    };
  }

  const editorCheck = validateMergedEditor(applied.nextEditor, config.strategy);
  if (!editorCheck.ok) return editorCheck;

  return { ...applied, isNewField };
}

export function buildFieldPatchWarnings(
  input: FieldPatchInput,
  config: ContentTypeConfigSlice,
  isNewField?: boolean,
  opts?: { templateRefCount?: number },
): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = [
    {
      code: "type_config_only",
      message: "Writes content-types.yml field_mapping/editor only. Does not change entry YAML values.",
    },
    {
      code: "no_entry_fanout",
      message:
        input.action === "remove"
          ? "Remove drops the field from the type schema only; stored values in entry YAML are not deleted."
          : "Adding or updating a field does not populate values on existing entries.",
    },
    {
      code: "execute_on_latest_config",
      message:
        "Execute applies this change on top of the latest config (fresh read before write).",
    },
  ];

  if (isNewField) {
    warnings.push({
      code: "new_field_no_data",
      message: "No entry has this field yet; use update_fields or backfill-property to populate values.",
    });
  }

  const existingEditor = config.editor?.[input.field_key.trim()];
  const mergedHint =
    input.action === "remove"
      ? null
      : input.editor ??
        (existingEditor
          ? { ...existingEditor, ...(input.editor ?? {}) }
          : input.editor);

  const afterHint =
    input.action === "update" && existingEditor
      ? { ...existingEditor, ...(input.editor ?? {}) }
      : input.editor ?? null;

  const hint = afterHint ?? mergedHint;
  if (hint?.required === "attached") {
    warnings.push({
      code: "required_attached_shared_layout",
      message:
        'required: "attached" enforces only on shared-layout entries that are not detached. ' +
        "Detached entries ignore this field's required rule. On types without shared layout, behaves like required: true.",
    });
  } else if (hint?.required === true) {
    warnings.push({
      code: "required_true",
      message:
        "required: true — every entry must have a value before publish; drafts may omit; live cannot clear.",
    });
  }

  if (hint?.type === "relation") {
    warnings.push({
      code: "relation_pointer_only",
      message: "Relation fields store slug pointer(s) only, not embedded related objects.",
    });
  }

  const deprecatedCfg = input.action === "remove" ? null : parseDeprecated(hint);
  if (deprecatedCfg) {
    warnings.push({
      code: "deprecated_existing_values_stay",
      message:
        "Deprecation only changes the type config. Entries whose live files already store a value keep it and may edit it; " +
        "new entries and entries without a value are rejected (deprecated_field). Nothing is copied to " +
        (deprecatedCfg.replaced_by ? `"${deprecatedCfg.replaced_by}".` : "a replacement (none set).") +
        " field_mapping defaults still render. DB-backed types: DB column values still appear; only overrides are blocked.",
    });
    if (typeof opts?.templateRefCount === "number" && opts.templateRefCount > 0) {
      warnings.push({
        code: "deprecated_template_refs",
        message:
          `${opts.templateRefCount} file(s) reference {{ entry.${input.field_key.trim()} }} / {{ single.${input.field_key.trim()} }}; ` +
          "new entries render empty/default there until templates switch to the replacement.",
      });
    }
  }

  const strategy = parseContentTypeStrategy(config.strategy);
  const reqHint = hint?.required === true || hint?.required === "attached";
  if (reqHint && !strategy) {
    warnings.push({
      code: "required_needs_strategy",
      message:
        "Required fields need a valid type strategy (non-empty purpose). Call update_content_type with strategy first.",
    });
  }
  if (reqHint && !hint?.fill_intent) {
    warnings.push({
      code: "required_needs_fill_intent",
      message: "Required fields need fill_intent (goal + purpose) on the editor hint.",
    });
  }

  return warnings;
}

export { parseContentTypeStrategy };
