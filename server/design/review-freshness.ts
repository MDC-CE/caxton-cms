/**
 * Is there a render review that matches what is about to go live?
 * Used by the agent publish gate (publish_draft / promote_variant) and by
 * GET /api/render-reviews/freshness.
 *
 * Gated: MCP callers publishing an entry that owns its sections (landing
 * types, detached entries) whose structure is new or differs from live.
 * Not gated: staff, template-attached entries, copy-only edits.
 */
import { layoutInfoForEntry } from "../layout-owner";
import type { ContentIndex } from "../content-index";
import type { PagePreviewSource } from "../entry-preview-capture-auth";
import { deliveredFingerprint } from "./fingerprint";
import { loadPagePreviewData } from "./page-preview";
import { getReviewRecord, renderReviewUnavailableReason, type ReviewRecord } from "./render-review";

export interface ReviewFreshness {
  fingerprint: string | null;
  review: ReviewRecord | null;
  fresh: boolean;
  reason?: "never_reviewed" | "structure_changed";
  layout_owner?: string;
  error?: string;
}

export async function reviewFreshness(
  ci: ContentIndex,
  site: string,
  source: Extract<PagePreviewSource, { source: "entry" }>,
): Promise<ReviewFreshness> {
  const review = getReviewRecord(site, source);
  const preview = await loadPagePreviewData(ci, source);
  if (!preview.ok) return { fingerprint: null, review, fresh: false, error: preview.error };
  const fingerprint = preview.data.fingerprint;
  const fresh = review?.fingerprint === fingerprint;
  return {
    fingerprint,
    review,
    fresh,
    ...(fresh ? {} : { reason: review ? "structure_changed" : "never_reviewed" }),
    ...(preview.data.layout_owner ? { layout_owner: preview.data.layout_owner } : {}),
  };
}

export type RenderReviewGateResult =
  | { status: "not_gated" }
  | { status: "fresh"; review: ReviewRecord }
  | { status: "unavailable"; reason: string }
  | {
      status: "required";
      reason: "never_reviewed" | "structure_changed";
      fingerprint: string;
      review: ReviewRecord | null;
    };

export function evaluateRenderReviewGate(args: {
  callerIsMcp: boolean;
  templateMode: boolean;
  contentType: string;
  slug: string;
  locale: string;
  variantSlug: string;
  site: string;
  contentRoot: string;
  draftSections: unknown;
  liveSections: unknown | null;
}): RenderReviewGateResult {
  if (!args.callerIsMcp || args.templateMode) return { status: "not_gated" };
  if (layoutInfoForEntry(args.contentType, args.slug, args.contentRoot).layout_owner !== "entry") {
    return { status: "not_gated" };
  }
  const fingerprint = deliveredFingerprint(args.draftSections);
  if (args.liveSections != null && deliveredFingerprint(args.liveSections) === fingerprint) {
    return { status: "not_gated" };
  }
  const review = getReviewRecord(args.site, {
    source: "entry",
    contentType: args.contentType,
    slug: args.slug,
    locale: args.locale,
    variant: args.variantSlug,
  });
  if (review?.fingerprint === fingerprint) return { status: "fresh", review };
  const unavailable = renderReviewUnavailableReason(args.contentRoot);
  if (unavailable) return { status: "unavailable", reason: unavailable };
  return { status: "required", reason: review ? "structure_changed" : "never_reviewed", fingerprint, review };
}
