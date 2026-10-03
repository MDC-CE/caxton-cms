/**
 * Issue-code catalog for internal-link-utm.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const INTERNAL_LINK_UTM_VALIDATOR_NAME = "internal-link-utm" as const;

export const INTERNAL_LINK_UTM_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  INTERNAL_LINK_HAS_UTM: {
    title: "Internal link carries UTM parameters",
    summary:
      "A link to a page on this same site has utm_* parameters. Clicking it starts a new GA4 session and overwrites the visitor's real source (e.g. a paid ad), so paid visits and leads get credited to the wrong campaign.",
    suggestion:
      "Remove the utm_* parameters from the link. Links to the organization's other sites (other domains) may keep them.",
    next_actions: [
      { tool: "get_entry_content", reason: "Open the entry and find the link at the reported YAML path", priority: "recommended" },
      { tool: "update_fields", reason: "Write the link back without its utm_* parameters (same field_path)", priority: "recommended" },
    ],
  },
};
