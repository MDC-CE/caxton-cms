/**
 * Registry check for full `sections` arrays sent in edits proposals: each section must be a
 * known component (shared or site registry), with an existing version, a declared variant,
 * and its required props.
 */

import { validateSectionAgainstSchema } from "../component-section-demos";
import { loadSchema } from "../component-registry";
import { isDeclaredOrImplicitDefaultVariant } from "../../scripts/validation/validators/section-variants";
import type { SectionIssue } from "./attached-entry-gate";

export const MAX_SECTION_ISSUES = 10;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateSectionsForProposal(sections: unknown, contentFolder?: string): SectionIssue[] {
  if (!Array.isArray(sections)) {
    return [{ property_path: "sections", message: "sections must be an array of section objects." }];
  }
  const issues: SectionIssue[] = [];
  for (let i = 0; i < sections.length && issues.length < MAX_SECTION_ISSUES; i++) {
    const at = `sections[${i}]`;
    const section = sections[i];
    if (!isPlainObject(section)) {
      issues.push({ property_path: at, message: "Section must be an object." });
      continue;
    }
    const type = section.type;
    if (typeof type !== "string" || !type.trim()) {
      issues.push({ property_path: `${at}.type`, message: "Section must include a string type." });
      continue;
    }
    const version = typeof section.version === "string" ? section.version : undefined;
    const res = validateSectionAgainstSchema(section, type, version, contentFolder);
    if (!res.ok) {
      const suffix = res.error.property_path ? `.${res.error.property_path}` : ".type";
      issues.push({ property_path: `${at}${suffix}`, message: `${type}: ${res.error.message}` });
      continue;
    }
    const variant = typeof section.variant === "string" ? section.variant.trim() : "";
    if (!variant) continue;
    const schema = loadSchema(type, res.version, contentFolder);
    const keys = schema?.variants && typeof schema.variants === "object" ? Object.keys(schema.variants) : [];
    if (!isDeclaredOrImplicitDefaultVariant(variant, keys)) {
      issues.push({
        property_path: `${at}.variant`,
        message: keys.length
          ? `${type}: unknown variant "${variant}" (valid: ${keys.join(", ")}).`
          : `${type}: declares no variants; use "default" or omit variant.`,
      });
    }
  }
  return issues;
}
