/**
 * Title-only issue-code catalog for funnel-completeness.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const FUNNEL_COMPLETENESS_VALIDATOR_NAME = "funnel-completeness" as const;

export const FUNNEL_COMPLETENESS_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  MISSING_FUNNEL_STAGE: {
    title: "Missing Funnel Stage",
    summary: "Page lacks funnel.stage while funnel enforcement is on for this content type.",
    suggestion: "Set funnel.stage on _common.yml (Funnel tab): awareness, consideration, decision, or post-enrollment.",
    next_actions: [
      {
        tool: "update_fields",
        reason: "Set funnel.stage on the page",
        priority: "recommended",
      },
    ],
  },
  MISSING_FUNNEL_PRODUCTS: {
    title: "Missing Funnel Products",
    summary: "Page lacks funnel.products while the site has purchasable products and enforcement is on.",
    suggestion: 'Set funnel.products to "all" or product+persona bindings on _common.yml (Funnel tab).',
    next_actions: [
      {
        tool: "update_fields",
        reason: "Set funnel.products on the page",
        priority: "recommended",
      },
    ],
  },
  MISSING_PRODUCT_AUDIENCE: {
    title: "Missing Product Audience",
    summary: "Funnel binding targets a product without a minimal audience.",
    suggestion: "Add offer + persona on the product (_product.yml), then retry the binding.",
    next_actions: [
      { tool: "get_product", reason: "Inspect product audience", priority: "recommended" },
      { tool: "create_or_update_product", reason: "Set minimal audience", priority: "optional" },
    ],
  },
  MISSING_FUNNEL_PERSONA: {
    title: "Missing Funnel Persona",
    summary: "Product binding requires a persona because the product has an audience.",
    suggestion: "Add persona to the binding (program self-page may omit for itself only).",
    next_actions: [
      { tool: "update_fields", reason: "Set persona on funnel.products binding", priority: "recommended" },
    ],
  },
  UNKNOWN_PERSONA: {
    title: "Unknown Funnel Persona",
    summary: "Binding persona id is not defined on the product audience.",
    suggestion: "Use a persona id from the product audience, or add that persona on the product.",
    next_actions: [
      { tool: "get_product", reason: "List valid persona ids", priority: "recommended" },
    ],
  },
  INACTIVE_FUNNEL_PRODUCT: {
    title: "Inactive Funnel Product",
    summary: "Funnel binding references an unknown or non-purchasable product.",
    suggestion: "Point the binding at an active purchasable product, or remove it.",
  },
};
