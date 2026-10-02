/**
 * Issue codes written by the render review (review_page_render MCP tool /
 * server/design/render-review.ts). There is no validator run() for these:
 * findings come from screenshots + in-page measurements and stay in the
 * issue store until the next review of that page replaces them.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const RENDER_REVIEW_VALIDATOR_NAME = "render-review" as const;

const reReview = { tool: "review_page_render", reason: "Fix the listed sections[i] path, then re-run the review", priority: "recommended" as const };

export const RENDER_REVIEW_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  RENDER_HORIZONTAL_OVERFLOW: {
    title: "Section Overflows The Screen",
    suggestion: "Shorten long words/URLs, reduce fixed widths, or pick a variant that wraps on mobile.",
    next_actions: [reReview],
  },
  RENDER_COLOR_EDGE_WITHOUT_PADDING: {
    title: "Content Touches A Background Edge",
    suggestion: "Add paddingY to the section with the background (or use a self-padded variant).",
    next_actions: [reReview],
  },
  RENDER_HEADING_ORDER: {
    title: "Heading Levels Skip",
    next_actions: [reReview],
  },
  RENDER_MULTIPLE_H1: {
    title: "More Than One H1",
    next_actions: [reReview],
  },
  RENDER_EMPTY_SECTION: {
    title: "Section Renders Empty",
    suggestion: "Fill the required content for this variant or remove the section.",
    next_actions: [reReview],
  },
  RENDER_BROKEN_IMAGE: {
    title: "Image Failed To Load",
    next_actions: [reReview],
  },
  RENDER_TIGHT_GAP: {
    title: "Sections Overlap",
    next_actions: [reReview],
  },
  RENDER_MEASUREMENTS_MISSING: {
    title: "Preview Did Not Finish Rendering",
    summary: "The page preview never published layout measurements — a section may crash or load forever.",
    next_actions: [reReview],
  },
  RENDER_LEARNED_RULE: {
    title: "Layout Differs From Approved Pages",
    summary: "Approved pages of this kind usually lay these sections out differently (learned rule).",
    next_actions: [{ tool: "get_page_recipe", reason: "See the learned rule and example pages", priority: "optional" }],
  },
};
