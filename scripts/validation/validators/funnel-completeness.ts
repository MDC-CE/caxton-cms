/**
 * Funnel completeness validator — when site funnel.enforcement is on,
 * enforced content types require stage (+ products when site has purchasables)
 * and valid persona bindings.
 */

import type { Validator, ValidatorResult, ValidationContext, ValidationIssue } from "../shared/types";
import { skipCrossEntryVariantRow } from "../shared/draftFiles";
import { isSiteFunnelEnforcementEnabled, isFunnelEnforcedForType } from "../../../server/funnel-enforcement";
import { commonYmlPath, readFunnelBlockFromFile } from "../../../server/funnel-fields";
import { assertFunnelAudienceGates } from "../../../server/product/funnel-audience-gates";
import {
  FUNNEL_COMPLETENESS_ISSUE_CODES,
  FUNNEL_COMPLETENESS_VALIDATOR_NAME,
} from "./funnel-completeness.issueCodes";

const GATE_CODE_TO_ISSUE: Record<string, string> = {
  missing_funnel_stage: "MISSING_FUNNEL_STAGE",
  missing_funnel_products: "MISSING_FUNNEL_PRODUCTS",
  missing_product_audience: "MISSING_PRODUCT_AUDIENCE",
  missing_funnel_persona: "MISSING_FUNNEL_PERSONA",
  unknown_persona: "UNKNOWN_PERSONA",
};

export const funnelCompletenessValidator: Validator = {
  name: FUNNEL_COMPLETENESS_VALIDATOR_NAME,
  issueCodes: FUNNEL_COMPLETENESS_ISSUE_CODES,
  description:
    "When site funnel enforcement is on, requires funnel.stage (and products when the site has purchasables) plus valid personas on enforced content types",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "content",
  runClass: "entry-local",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const contentRoot = context.contentRoot;

    if (!isSiteFunnelEnforcementEnabled(contentRoot)) {
      return {
        name: FUNNEL_COMPLETENESS_VALIDATOR_NAME,
        description: funnelCompletenessValidator.description!,
        status: "passed",
        errors: [],
        warnings: [],
        duration: Date.now() - startTime,
        category: "content",
      };
    }

    const seen = new Set<string>();
    for (const file of context.contentFiles) {
      if (skipCrossEntryVariantRow(file)) continue;
      const key = `${file.type}\0${file.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!isFunnelEnforcedForType(file.type, contentRoot)) continue;

      const filePath = commonYmlPath(file.type, file.slug, contentRoot);
      const funnel = readFunnelBlockFromFile(filePath);
      const gates = assertFunnelAudienceGates(funnel, {
        contentType: file.type,
        contentSlug: file.slug,
        contentRoot,
      });

      if (!gates.ok) {
        const issueCode = GATE_CODE_TO_ISSUE[gates.code] ?? gates.code.toUpperCase();
        errors.push({
          type: "error",
          code: issueCode,
          message: gates.error,
          file: filePath,
          suggestion: FUNNEL_COMPLETENESS_ISSUE_CODES[issueCode]?.suggestion,
        });
        continue;
      }

      for (const w of gates.warnings) {
        if (w.code === "inactive_product") {
          warnings.push({
            type: "warning",
            code: "INACTIVE_FUNNEL_PRODUCT",
            message: w.message,
            file: filePath,
            suggestion: FUNNEL_COMPLETENESS_ISSUE_CODES.INACTIVE_FUNNEL_PRODUCT?.suggestion,
          });
        }
      }
    }

    const status =
      errors.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed";

    return {
      name: FUNNEL_COMPLETENESS_VALIDATOR_NAME,
      description: funnelCompletenessValidator.description!,
      status,
      errors,
      warnings,
      duration: Date.now() - startTime,
      category: "content",
    };
  },
};
