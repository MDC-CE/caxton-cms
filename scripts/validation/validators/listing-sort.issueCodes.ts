/**
 * Issue-code catalog for listing-sort.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const LISTING_SORT_VALIDATOR_NAME = "listing-sort" as const;

export const LISTING_SORT_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  LISTING_SORT_OLDEST_FIRST: {
    title: "Listing shows oldest entries first",
    summary:
      "dynamic_entries.sort uses a recency field (published_at, created_at, updated_at) without a leading \"-\", so the oldest entries render first.",
    suggestion: 'Prefix the field with "-" for newest first, e.g. sort: "-published_at".',
  },
};
