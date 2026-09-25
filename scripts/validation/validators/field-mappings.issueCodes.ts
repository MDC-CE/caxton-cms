/**
 * Title-only issue-code catalog for field-mappings.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const FIELD_MAPPINGS_VALIDATOR_NAME = "field-mappings" as const;

export const FIELD_MAPPINGS_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  FIELD_MAPPING_MISSING: {
    title: "Field mapping missing",
  },
  FIELD_MAPPING_PARTIAL: {
    title: "Field mapping partial",
  },
  DEPRECATED_CONFIG_INVALID: {
    title: "Deprecated field config invalid",
  },
  DEPRECATED_FIELD_TEMPLATE_REF: {
    title: "Template references a deprecated field",
  },
  DEPRECATED_FIELD_ON_NEW_ENTRY: {
    title: "Deprecated field set on a draft that cannot publish",
  },
};
