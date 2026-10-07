/**
 * Title-only issue-code catalog for design-layout.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const DESIGN_LAYOUT_VALIDATOR_NAME = "design-layout" as const;

export const DESIGN_LAYOUT_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  SELF_PADDED_WRAPPER_PADDING: {
    title: "Double Padding On Self-Padded Section",
  },
  OUT_OF_FLOW_STYLED: {
    title: "Spacing Or Background On Out-Of-Flow Section",
  },
  LEARNED_RULE_VIOLATION: {
    title: "Breaks A Learned Layout Rule",
  },
};
