/**
 * Design Layout Validator
 *
 * Facts from component layout traits (`layout:` in schema.yml) plus layout
 * rules learned from staff-approved pages (component insights). Out-of-flow
 * sections (schema_org, modals, sticky bars) are skipped by spacing rules.
 * Warning only; the render review (review_page_render) covers what only a
 * screenshot can show.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { Validator, ValidationContext, ValidatorResult, ValidationIssue } from "../shared/types";
import type { InsightSection } from "../../../shared/schema";
import { escapeTemplateVars, unescapeObjectVars } from "../../../shared/templateVars";
import { getDefaultContentFolder, getDefaultContentRoot } from "../../../server/site-config";
import type { LearnedRule } from "../../../server/design/page-recipe";
import { DESIGN_LAYOUT_ISSUE_CODES } from "./design-layout.issueCodes";

const NO_PADDING = /^(none|0|\|none|none\||none\|none)$/;

const hasValue = (v: string | undefined) => !!v && !NO_PADDING.test(v);

/** Trait-based findings for one page (exported for tests). */
export function layoutTraitFindings(sections: InsightSection[]): Array<{ code: string; index: number; message: string; suggestion: string }> {
  const out: Array<{ code: string; index: number; message: string; suggestion: string }> = [];
  sections.forEach((s, index) => {
    const t = s.traits;
    if (!t) return;
    if (t.flow === "out") {
      const styled = [
        s.background ? "background" : null,
        hasValue(s.spacing?.paddingY) ? "paddingY" : null,
        hasValue(s.spacing?.marginY) ? "marginY" : null,
      ].filter(Boolean);
      if (styled.length > 0) {
        out.push({
          code: "OUT_OF_FLOW_STYLED",
          index,
          message: `sections[${index}] (${s.type}) floats outside the page flow, so its ${styled.join(", ")} only paints an empty strip where the section sits`,
          suggestion: `Remove ${styled.join(", ")} from this section; spacing between visible sections belongs on those sections.`,
        });
      }
      return;
    }
    if (t.self_padded && hasValue(s.spacing?.paddingY)) {
      out.push({
        code: "SELF_PADDED_WRAPPER_PADDING",
        index,
        message: `sections[${index}] (${s.type}:${s.variant}) paints its own vertical padding; wrapper paddingY "${s.spacing!.paddingY}" doubles it`,
        suggestion: "Remove paddingY from this section (use marginY if it needs distance from neighbors).",
      });
    }
  });
  return out;
}

function isDefaultSite(contentRoot: string | undefined): boolean {
  if (!contentRoot) return true;
  const def = getDefaultContentRoot();
  const abs = (p: string) => path.resolve(path.isAbsolute(p) ? p : path.join(process.cwd(), p));
  return abs(contentRoot) === abs(def);
}

async function loadLearnedRules(contentRoot: string | undefined): Promise<LearnedRule[]> {
  if (!isDefaultSite(contentRoot)) return [];
  try {
    const [{ readInsightsFile }, { learnRules, readDesignRulePins }] = await Promise.all([
      import("../../../server/component-insights"),
      import("../../../server/design/page-recipe"),
    ]);
    const data = readInsightsFile();
    if (!data) return [];
    const root = contentRoot ?? getDefaultContentRoot();
    const rootAbs = path.isAbsolute(root) ? root : path.join(process.cwd(), root);
    return learnRules(data.pages, readDesignRulePins(rootAbs)).filter((r) => r.status === "active" || r.status === "pinned");
  } catch {
    return [];
  }
}

export const designLayoutValidator: Validator = {
  name: "design-layout",
  issueCodes: DESIGN_LAYOUT_ISSUE_CODES,
  description: "Section spacing vs component layout traits, and layout rules learned from approved pages",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "design",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const warnings: ValidationIssue[] = [];
    const contentFolder = context.contentRoot ? path.basename(context.contentRoot) : getDefaultContentFolder();
    const [{ insightSectionsOf }, { checkRules }] = await Promise.all([
      import("../../../server/component-insights"),
      import("../../../server/design/page-recipe"),
    ]);
    const rules = await loadLearnedRules(context.contentRoot);
    let pagesChecked = 0;

    for (const file of context.contentFiles) {
      let parsed: Record<string, unknown> | null = null;
      try {
        if (!fs.existsSync(file.filePath)) continue;
        const { escaped, map } = escapeTemplateVars(fs.readFileSync(file.filePath, "utf-8"));
        parsed = unescapeObjectVars(yaml.load(escaped), map) as Record<string, unknown> | null;
      } catch {
        continue;
      }
      if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) continue;
      pagesChecked++;
      const sections = insightSectionsOf(parsed.sections, contentFolder);

      for (const f of layoutTraitFindings(sections)) {
        warnings.push({ type: "warning", code: f.code, message: f.message, file: file.filePath, suggestion: f.suggestion });
      }

      for (const { rule, index } of checkRules(sections, rules)) {
        const s = sections[index];
        const why =
          rule.status === "pinned"
            ? "pinned by staff"
            : `followed on ${Math.round(rule.evidence.agreement * 100)}% of ${rule.evidence.approved_pages} approved pages`;
        warnings.push({
          type: "warning",
          code: "LEARNED_RULE_VIOLATION",
          message: `sections[${index}]${s ? ` (${s.type})` : ""}: ${rule.title} — ${why}`,
          file: file.filePath,
          suggestion: `${rule.description}${rule.evidence.examples.length ? ` Examples: ${rule.evidence.examples.join(", ")}.` : ""}`,
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
      artifacts: { pagesChecked, enforcedRules: rules.map((r) => r.id) },
    };
  },
};
