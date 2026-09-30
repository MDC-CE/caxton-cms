/**
 * Text Limits Validator
 *
 * Reports section copy longer than the component schema allows
 * (`text_limits` in schema.yml, visible characters). Warning only: existing
 * pages keep rendering; publishing new over-limit text is gated separately.
 */

import * as fs from "fs";
import * as yaml from "js-yaml";
import type {
  Validator,
  ValidatorResult,
  ValidationContext,
  ValidationIssue,
} from "../shared/types";
import { evaluatePageTextLimitsForSite, type TextLimitRuleCache } from "../../../server/text-limits";
import { TEXT_LIMITS_ISSUE_CODES } from "./text-limits.issueCodes";

export const textLimitsValidator: Validator = {
  name: "text-limits",
  issueCodes: TEXT_LIMITS_ISSUE_CODES,
  description: "Flags section text longer than the component schema's text_limits (visible characters)",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "components",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const warnings: ValidationIssue[] = [];
    const cache: TextLimitRuleCache = new Map();

    for (const file of context.contentFiles) {
      let parsed: Record<string, unknown> | null = null;
      try {
        if (!fs.existsSync(file.filePath)) continue;
        parsed = yaml.load(fs.readFileSync(file.filePath, "utf-8")) as Record<string, unknown> | null;
      } catch {
        continue;
      }
      if (!parsed || !Array.isArray(parsed.sections)) continue;

      const violations = evaluatePageTextLimitsForSite(parsed, { contentRoot: context.contentRoot, cache });
      for (const v of violations) {
        warnings.push({
          type: "warning",
          code: "TEXT_LIMIT_EXCEEDED",
          message: v.message,
          file: file.filePath,
          suggestion:
            v.kind === "items"
              ? `Keep at most ${v.max} items in ${v.fields.join(", ")}.`
              : `Shorten ${v.fields.join(" + ")} to ${v.max} visible characters or fewer. Publishing a longer version needs staff confirmation; agents cannot publish it.`,
        });
      }
    }

    return {
      name: this.name,
      description: this.description,
      status: warnings.length > 0 ? "warning" : "passed",
      errors: [],
      warnings,
      duration: Date.now() - startTime,
    };
  },
};
