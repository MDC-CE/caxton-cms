/**
 * Title-only issue-code catalog for text-limits.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const TEXT_LIMITS_VALIDATOR_NAME = "text-limits" as const;

export const TEXT_LIMITS_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  TEXT_LIMIT_EXCEEDED: {
    title: "Text Longer Than Section Allows",
  },
};
