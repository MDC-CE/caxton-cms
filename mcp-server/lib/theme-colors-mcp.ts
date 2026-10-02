/**
 * MCP envelopes for the theme color gate (server code `theme_colors_required`):
 * agents write palette IDs for section backgrounds and no hardcoded inline
 * color / font-size / letter-spacing in rich text.
 */
import { THEME_COLORS_CODE } from "../../shared/theme-palette.js";
import { fail, type McpTextResult, type McpWarning, type NextAction } from "./respond.js";

interface Violation {
  code: string;
  section_path: string;
  property_path: string;
  value: string;
  suggested_id?: string;
}

function asViolations(raw: unknown): Violation[] {
  return Array.isArray(raw)
    ? raw.filter(
        (v): v is Violation =>
          !!v && typeof v === "object" && typeof (v as Violation).property_path === "string",
      )
    : [];
}

/** `sections[2].background` → `sections.2.background` (update_fields field_path). */
function toFieldPath(p: string): string {
  return p.replace(/\[(\d+)\]/g, ".$1");
}

/** Non-blocking staff/draft warnings returned as `theme_color_warnings`. */
export function themeColorWarnings(raw: unknown): McpWarning[] {
  return asViolations(raw).map((v) => ({
    code: v.code,
    message: `${toFieldPath(v.property_path)}: ${v.value}${v.suggested_id ? ` (use theme ID "${v.suggested_id}")` : ""}`,
  }));
}

export function themeColorsRequiredResult(
  errMsg: string,
  data: Record<string, unknown>,
  ctx?: { slug?: string; locale?: string; contentType?: string; variant?: string; publish?: boolean },
): McpTextResult {
  const details = (data.details as Record<string, unknown> | undefined) ?? {};
  const violations = asViolations(details.violations ?? data.violations);
  const allowedBackgroundIds = Array.isArray(details.allowed_background_ids) ? details.allowed_background_ids : [];
  const updates = violations
    .filter((v) => v.code !== "off_theme_inline_style")
    .map((v) => ({
      field_path: toFieldPath(v.property_path),
      value: v.suggested_id ?? `<one of allowed_background_ids>`,
    }));
  const next_actions: NextAction[] = [
    {
      tool: "update_fields",
      priority: "required",
      reason: ctx?.publish
        ? "Replace each flagged value on the draft with a theme ID (backgrounds) or remove the inline style (rich text), then retry publish."
        : "Retry with theme IDs for backgrounds and without inline color/font-size/letter-spacing in rich text.",
      args_hint: {
        slug: ctx?.slug,
        locale: ctx?.locale ?? "en",
        contentType: ctx?.contentType,
        ...(ctx?.variant ? { variant: ctx.variant } : {}),
        updates,
      },
    },
    {
      tool: "explain_site",
      priority: "optional",
      reason: "Topic 'design' explains theme IDs and how backgrounds resolve.",
      args_hint: { topic: "design" },
    },
  ];
  return fail(errMsg, {
    code: THEME_COLORS_CODE,
    violations,
    property_paths: violations.map((v) => toFieldPath(v.property_path)),
    allowed_background_ids: allowedBackgroundIds,
    allowed_text_colors: Array.isArray(details.allowed_text_colors) ? details.allowed_text_colors : [],
    warnings: [
      {
        code: THEME_COLORS_CODE,
        message:
          "Agents write palette IDs only (theme.json backgrounds). Rich text may use theme text colors/sizes, never hardcoded hex/rgb/px. " +
          "Only values this write adds or changes are checked; colors already on the page (staff overrides) never block. Staff can still save custom colors with a warning.",
      },
    ],
    side_effects: [],
    next_actions,
  });
}
