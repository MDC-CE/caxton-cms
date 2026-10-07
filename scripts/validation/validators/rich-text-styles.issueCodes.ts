/**
 * Title-only issue-code catalog for rich-text-styles.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const RICH_TEXT_STYLES_VALIDATOR_NAME = "rich-text-styles" as const;

export const RICH_TEXT_STYLES_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  OFF_THEME_INLINE_STYLE: {
    title: "Rich Text Hardcodes Color Or Font Size",
  },
};
