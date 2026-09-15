/**
 * Catalog + filter helpers for get_entry_fields (required `fields` gate).
 */

import {
  getFieldMapping,
  getFullFieldMapping,
  IMAGE_ALIAS_FIELD,
  isSeoDbMappingKey,
  KNOWN_SEO_FIELDS,
  KNOWN_SPECIAL_FIELDS,
  SLUG_ALIAS_FIELD,
  type ContentTypeConfig,
  type ContentTypeEditorHint,
} from "../../server/content-types.js";
import { ecommerceManager, PURCHASABLE_FIELD } from "../../server/ecommerce/ecommerce-manager.js";
import { SEO_YAML_KEY } from "../../server/seo-field-defs.js";
import { isSeoMonitoringEnabled } from "../../server/seo-monitoring.js";
import { SEO_INCLUDE_IN_CLUSTERING } from "./seo-cluster-toggle.js";
import type { NextAction } from "./respond.js";

export type AvailableFieldRow = {
  field: string;
  writable?: boolean;
  group?: "seo" | "system";
  type?: string;
  pick_hint?: string;
};

const LARGE_EDITOR_TYPES = new Set(["markdown", "json", "textarea"]);

function pickHintForEditorType(type: string | undefined): string | undefined {
  if (!type || !LARGE_EDITOR_TYPES.has(type)) return undefined;
  if (type === "markdown") return "Large body; returns full value if selected";
  if (type === "json") return "Structured JSON; returns full value if selected";
  return "May be large; returns full value if selected";
}

/** Field keys that appear on field-provenance (minus MCP-only virtuals). */
export function listMappedFieldKeys(
  config: ContentTypeConfig,
  contentType: string,
  contentRoot?: string,
): string[] {
  const fmRegular = getFieldMapping(contentType, contentRoot) || {};
  const fmFull = getFullFieldMapping(contentType, contentRoot) || {};
  const editor = (config.editor || {}) as Record<string, ContentTypeEditorHint>;
  const editorKeys = Object.keys(editor).filter(
    (k) => k !== IMAGE_ALIAS_FIELD && k !== SLUG_ALIAS_FIELD && !k.startsWith("_"),
  );
  const mappingKeys = Object.keys(fmRegular).filter(
    (k) =>
      !k.startsWith("_") &&
      k !== IMAGE_ALIAS_FIELD &&
      k !== SLUG_ALIAS_FIELD &&
      !isSeoDbMappingKey(k),
  );
  const specialKeys = [...KNOWN_SPECIAL_FIELDS];
  const out = new Set<string>([...specialKeys, ...mappingKeys, ...editorKeys]);
  for (const k of Object.keys(fmFull)) {
    if (k.startsWith("_") || isSeoDbMappingKey(k)) continue;
    if (k === IMAGE_ALIAS_FIELD || k === SLUG_ALIAS_FIELD) continue;
    out.add(k);
  }
  return Array.from(out);
}

export function buildAvailableFieldsCatalog(opts: {
  contentType: string;
  config: ContentTypeConfig;
  contentRoot?: string;
}): AvailableFieldRow[] {
  const { contentType, config, contentRoot } = opts;
  const editor = (config.editor || {}) as Record<string, ContentTypeEditorHint>;
  const typeMonitored = isSeoMonitoringEnabled(contentType, contentRoot);
  const rows: AvailableFieldRow[] = [];

  for (const field of listMappedFieldKeys(config, contentType, contentRoot)) {
    const hint = editor[field];
    const type = typeof hint?.type === "string" ? hint.type : undefined;
    const row: AvailableFieldRow = { field };
    if (type) row.type = type;
    const pick = pickHintForEditorType(type);
    if (pick) row.pick_hint = pick;
    rows.push(row);
  }

  if (ecommerceManager.contentTypeHasEcommerce(contentType)) {
    rows.push({
      field: PURCHASABLE_FIELD,
      writable: false,
      group: "system",
      type: "boolean",
      pick_hint: "Computed; not writable via update_fields",
    });
  }

  // Locale seo:* always listed (same as provenance).
  for (const key of KNOWN_SEO_FIELDS) {
    rows.push({
      field: `${SEO_YAML_KEY}.${key}`,
      group: "seo",
      writable: true,
    });
  }

  // Virtual MCP-only clustering switch — listed whenever seo rows exist.
  rows.push({
    field: SEO_INCLUDE_IN_CLUSTERING,
    group: "seo",
    type: "boolean",
    writable: typeMonitored,
    pick_hint: typeMonitored
      ? "MCP-only virtual boolean; never written to YAML"
      : "Listed but not writable (seo_monitoring.enabled is off)",
  });

  return rows;
}

export function availableFieldNameSet(catalog: AvailableFieldRow[]): Set<string> {
  return new Set(catalog.map((r) => r.field));
}

/** Missing or empty fields[] → catalog gate. */
export function needsSelectFieldsGate(fields: string[] | undefined | null): boolean {
  return !Array.isArray(fields) || fields.length === 0;
}

export function findUnknownFields(requested: string[], catalog: AvailableFieldRow[]): string[] {
  const allowed = availableFieldNameSet(catalog);
  return [...new Set(requested.filter((f) => !allowed.has(f)))];
}

export function selectFieldsGatePayload(opts: {
  contentType: string;
  slug: string;
  locale: string;
  variant?: string;
  site?: string;
  catalog: AvailableFieldRow[];
  unknown_fields?: string[];
}): {
  success: false;
  action_required: "select_fields";
  code: "fields_required" | "unknown_fields";
  message: string;
  available_fields: AvailableFieldRow[];
  unknown_fields?: string[];
  contentType: string;
  slug: string;
  locale: string;
  variant?: string;
} {
  const unknown = opts.unknown_fields?.length ? opts.unknown_fields : undefined;
  const example =
    opts.catalog.find((r) => r.field === "title")?.field ??
    opts.catalog.find((r) => r.writable !== false)?.field ??
    opts.catalog[0]?.field ??
    "title";
  return {
    success: false,
    action_required: "select_fields",
    code: unknown ? "unknown_fields" : "fields_required",
    message: unknown
      ? `Unknown field(s): ${unknown.join(", ")}. Pick paths from available_fields and retry.`
      : "Pass non-empty fields: string[] of field paths to inspect. available_fields lists names only — retry with fields: [...].",
    available_fields: opts.catalog,
    ...(unknown ? { unknown_fields: unknown } : {}),
    contentType: opts.contentType,
    slug: opts.slug,
    locale: opts.locale,
    ...(opts.variant ? { variant: opts.variant } : {}),
  };
}

export function selectFieldsRetryAction(opts: {
  slug: string;
  contentType: string;
  locale: string;
  variant?: string;
  site?: string;
  exampleField: string;
}): NextAction {
  return {
    tool: "get_entry_fields",
    reason: "Retry with fields: [...] chosen from available_fields",
    priority: "required",
    args_hint: {
      slug: opts.slug,
      contentType: opts.contentType,
      locale: opts.locale,
      fields: [opts.exampleField],
      ...(opts.variant ? { variant: opts.variant } : {}),
      ...(opts.site ? { site: opts.site } : {}),
    },
  };
}

/** Drop baseline when it equals effective (avoids static body ×2). */
export function stripRedundantBaseline<T extends Record<string, unknown>>(row: T): T {
  if (!Object.prototype.hasOwnProperty.call(row, "baseline")) return row;
  try {
    if (JSON.stringify(row.baseline) === JSON.stringify(row.effective)) {
      const { baseline: _b, ...rest } = row;
      return rest as T;
    }
  } catch {
    // non-serializable — keep baseline
  }
  return row;
}

export function fieldNameFromRow(f: Record<string, unknown>): string | null {
  if (typeof f.field === "string") return f.field;
  if (typeof f.name === "string") return f.name;
  return null;
}

/** Preserve requested order; one row per requested name. */
export function filterFieldsByRequest(
  rows: Array<Record<string, unknown>>,
  requested: string[],
): Array<Record<string, unknown>> {
  const byName = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const name = fieldNameFromRow(row);
    if (name) byName.set(name, row);
  }
  const out: Array<Record<string, unknown>> = [];
  for (const name of requested) {
    const row = byName.get(name);
    if (row) out.push(stripRedundantBaseline(row));
  }
  return out;
}
