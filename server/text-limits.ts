/**
 * Server side of component text limits: resolves each section's rules from
 * its component schema.yml (`text_limits`) and evaluates a page. Whether a
 * violation warns or blocks is the caller's decision (draft save, live edit,
 * publish, site validation).
 */
import path from "path";
import { loadSchemaForSection } from "./component-registry";
import {
  evaluatePageTextLimits,
  rulesForVariant,
  type TextLimitRule,
  type TextLimitViolation,
} from "@shared/component-text-limits";

export type TextLimitRuleCache = Map<string, TextLimitRule[]>;

/** Registry folder name (e.g. `site_4geeks-com`) from a content root that may be absolute. */
export function registryFolderFromContentRoot(contentRoot?: string): string | undefined {
  if (!contentRoot) return undefined;
  return path.isAbsolute(contentRoot) ? path.relative(process.cwd(), contentRoot) : contentRoot;
}

export function textLimitRulesForSection(
  section: Record<string, unknown>,
  contentRoot?: string,
  cache?: TextLimitRuleCache,
): TextLimitRule[] {
  const type = section.type;
  if (typeof type !== "string" || !type) return [];
  const folder = registryFolderFromContentRoot(contentRoot);
  const variant = typeof section.variant === "string" ? section.variant : "";
  const key = `${folder ?? ""}|${type}|${String(section.version ?? "")}|${variant}`;
  const hit = cache?.get(key);
  if (hit) return hit;
  let rules: TextLimitRule[] = [];
  try {
    rules = rulesForVariant(loadSchemaForSection(type, section.version, folder)?.text_limits, variant);
  } catch {
    rules = [];
  }
  cache?.set(key, rules);
  return rules;
}

/**
 * Text-limit violations for a merged page. With `before` (the saved page),
 * only limited text that changed is reported.
 */
export function evaluatePageTextLimitsForSite(
  pageData: Record<string, unknown> | null | undefined,
  opts: {
    contentRoot?: string;
    before?: Record<string, unknown> | null;
    cache?: TextLimitRuleCache;
  } = {},
): TextLimitViolation[] {
  const cache = opts.cache ?? new Map();
  return evaluatePageTextLimits(pageData, {
    before: opts.before,
    resolveRules: (section) => textLimitRulesForSection(section, opts.contentRoot, cache),
  });
}
