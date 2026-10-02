/**
 * Title-only issue-code catalog for backgrounds.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const BACKGROUNDS_VALIDATOR_NAME = "backgrounds" as const;

export const BACKGROUNDS_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  OFF_THEME_BACKGROUND: {
    title: "Background Not In Theme",
  },
  LEGACY_BACKGROUND_CSS: {
    title: "Background Uses CSS Instead Of Theme ID",
  },
  NO_THEME_CONFIG: {
    title: "No Theme Config",
  },
};
