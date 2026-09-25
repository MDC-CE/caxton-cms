/**
 * Title-only issue-code catalog for seo-depth.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const SEO_DEPTH_VALIDATOR_NAME = "seo-depth" as const;

export const SEO_DEPTH_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  CANONICAL_INHERITED_FROM_COMMON: {
    title: "Canonical Inherited From Common",
  },
  DESCRIPTION_INHERITED_FROM_COMMON: {
    title: "Description Inherited From Common",
  },
  DESCRIPTION_TOO_LONG: {
    title: "Description Too Long",
  },
  DESCRIPTION_TOO_SHORT: {
    title: "Description Too Short",
  },
  META_RESOLVE_FAILED: {
    title: "Meta Resolve Failed",
  },
  MISSING_CANONICAL: {
    title: "Missing Canonical",
  },
  MISSING_OG_IMAGE: {
    title: "Missing Og Image",
  },
  TITLE_INHERITED_FROM_COMMON: {
    title: "Title Inherited From Common",
  },
  TITLE_TOO_LONG: {
    title: "Title Too Long",
  },
  TITLE_TOO_SHORT: {
    title: "Title Too Short",
  },
};
