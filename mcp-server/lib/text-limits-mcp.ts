/**
 * MCP envelopes for component text limits (server code `text_limits_exceeded`,
 * rules in each component's schema.yml `text_limits`).
 */
import {
  TEXT_LIMITS_EXCEEDED_CODE,
  type TextLimitViolation,
} from "../../shared/component-text-limits.js";
import { fail, type McpTextResult, type McpWarning, type NextAction } from "./respond.js";

function asViolations(raw: unknown): TextLimitViolation[] {
  return Array.isArray(raw)
    ? raw.filter(
        (v): v is TextLimitViolation =>
          !!v && typeof v === "object" && typeof (v as TextLimitViolation).message === "string",
      )
    : [];
}

/** `sections[2]` + `brand_mark.prefix` → `sections.2.brand_mark.prefix` (update_fields field_path). */
function fieldPaths(v: TextLimitViolation): string[] {
  const base = v.section_path.replace(/^sections\[(\d+)\]$/, "sections.$1");
  return v.fields.map((f) => `${base}.${f}`);
}

/** Non-blocking draft-save / staff-edit warnings returned as `text_limit_warnings`. */
export function textLimitWarnings(raw: unknown): McpWarning[] {
  return asViolations(raw).map((v) => ({
    code: "text_limit_exceeded",
    message: `${v.message} — field_path(s): ${fieldPaths(v).join(", ")}. Saved (draft saves never block), but publishing is blocked for agents until shortened.`,
  }));
}

/**
 * Edit or publish rejected by text limits. Agents cannot override: the staff
 * "publish anyway" confirmation is not exposed over MCP.
 */
export function textLimitsExceededResult(
  errMsg: string,
  data: Record<string, unknown>,
  ctx?: { slug?: string; locale?: string; contentType?: string; variant?: string; publish?: boolean },
): McpTextResult {
  const details = data.details as Record<string, unknown> | undefined;
  const violations = asViolations(data.violations ?? details?.violations);
  const next_actions: NextAction[] = [
    {
      tool: "update_fields",
      priority: "required",
      reason: ctx?.publish
        ? "Shorten each flagged field on the draft (visible characters, HTML stripped), then retry publish."
        : "Retry with shorter text in each flagged field (visible characters, HTML stripped).",
      args_hint: {
        slug: ctx?.slug,
        locale: ctx?.locale ?? "en",
        contentType: ctx?.contentType,
        ...(ctx?.variant ? { variant: ctx.variant } : {}),
        updates: violations.flatMap((v) =>
          v.kind === "length"
            ? fieldPaths(v).map((field_path) => ({ field_path, value: `<≤ ${v.max} visible chars total>` }))
            : [],
        ),
      },
    },
    {
      tool: "get_component_schema",
      priority: "recommended",
      reason: "Read text_limits for this component/variant before rewriting.",
    },
  ];
  return fail(errMsg, {
    code: TEXT_LIMITS_EXCEEDED_CODE,
    violations,
    property_paths: violations.flatMap(fieldPaths),
    warnings: [
      {
        code: TEXT_LIMITS_EXCEEDED_CODE,
        message:
          "Limits come from the component schema.yml text_limits (per variant; grouped fields count together, e.g. hero productShowcase H1 = brand_mark prefix + highlight + suffix). " +
          "Draft saves only warn; publish and agent live edits block. Only text that changed is checked, so existing copy never blocks unrelated edits. " +
          "Agents cannot override — staff can publish anyway from the Versions UI.",
      },
    ],
    side_effects: [],
    next_actions,
  });
}
