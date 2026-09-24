/**
 * Title-only issue-code catalog for nonlocalized-common-locale.
 */

import type { IssueCodeDefinition } from "../shared/types";

export const NONLOCALIZED_COMMON_LOCALE_VALIDATOR_NAME = "nonlocalized-common-locale" as const;

export const NONLOCALIZED_COMMON_LOCALE_ISSUE_CODES: Record<string, IssueCodeDefinition> = {
  NONLOCALIZED_COMMON_LOCALE_MISSING: {
    title: "Common Locale Missing For Nonlocalized URL",
    suggestion:
      "Add locale: <xx> to _common.yml (e.g. locale: es). Required so SSR can load the right YAML when url_pattern.default has no :locale and the public URL does not encode language.",
  },
  NONLOCALIZED_COMMON_LOCALE_NO_FILE: {
    title: "Common Locale Has No Matching Locale File",
    suggestion:
      "Change _common.yml locale to match an existing locale file (e.g. es.yml), or add the missing locale file.",
  },
};
