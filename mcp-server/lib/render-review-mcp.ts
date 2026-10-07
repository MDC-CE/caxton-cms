import { actionRequired, promoteFailureNextActions, type McpTextResult } from "./respond.js";

export const RENDER_REVIEW_REQUIRED_CODE = "render_review_required";

/** publish_draft / promote_variant rejected because the layout has no fresh render review. */
export function renderReviewRequiredResult(
  errMsg: string,
  data: Record<string, unknown>,
  ctx: {
    retryTool: "publish_draft" | "promote_variant";
    contentType: string;
    slug: string;
    locale?: string;
    variantSlug: string;
    site?: string;
  },
): McpTextResult {
  const details = (data.details as Record<string, unknown> | undefined) ?? {};
  return actionRequired(
    {
      success: false,
      action_required: RENDER_REVIEW_REQUIRED_CODE,
      code: RENDER_REVIEW_REQUIRED_CODE,
      message: errMsg,
      reason: details.reason ?? null,
      fingerprint: details.fingerprint ?? null,
      reviewed_fingerprint: details.reviewed_fingerprint ?? null,
      last_review_job_id: details.last_review_job_id ?? null,
      warnings: [
        {
          code: "render_review_gate",
          message:
            "Agents need a render review matching the current layout (section order, types, variants, backgrounds) before a new or restructured entry-owned page goes live. " +
            "Copy-only edits keep the review fresh. Staff publishes and template-attached entries are not gated. " +
            "When Cloudflare or a public SITE_URL is unavailable, publish proceeds with a render_review_unavailable warning instead.",
        },
      ],
      side_effects: [],
    },
    [
      ...promoteFailureNextActions({ code: RENDER_REVIEW_REQUIRED_CODE, ...ctx }),
      {
        tool: ctx.retryTool,
        priority: "recommended",
        reason: "After get_render_review shows no error findings, retry with the same arguments.",
        args_hint: {
          contentType: ctx.contentType,
          slug: ctx.slug,
          ...(ctx.locale ? { locale: ctx.locale } : {}),
          variantSlug: ctx.variantSlug,
        },
      },
    ],
  );
}
