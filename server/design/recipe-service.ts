/**
 * get_page_recipe backend: section recipe for entry-owned layouts, or
 * fields-mode for entries attached to a shared template (agents fill fields;
 * the template owns sections).
 */
import fs from "fs";
import path from "path";
import { contentIndex } from "../content-index";
import { getFolder } from "../content-types";
import { getDefaultContentRoot } from "../site-config";
import { layoutInfoForEntry } from "../layout-owner";
import { ensureInsightsData, insightSectionsOf, TEMPLATE_LAYOUT_CANDIDATES } from "../component-insights";
import type { InsightPageRecord } from "@shared/schema";
import {
  buildPageRecipe,
  checkRules,
  learnRules,
  readDesignRulePins,
  type LearnedRule,
  type PageRecipe,
  type RecipeQuery,
  type SlotOption,
} from "./page-recipe";
import { paletteIds } from "@shared/theme-palette";
import { loadSiteTheme } from "../theme-config";
import { setLearnedRuleCheck } from "./render-review";

function rootAbs(): string {
  const r = getDefaultContentRoot();
  return path.isAbsolute(r) ? r : path.join(process.cwd(), r);
}

export function currentLearnedRules(records?: InsightPageRecord[]): LearnedRule[] {
  const data = records ?? ensureInsightsData().pages;
  return learnRules(data, readDesignRulePins(rootAbs()));
}

const ENTRY_BIND = /\{\{\s*(?:entry|single)\.([A-Za-z0-9_.]+)/g;

function collectBinds(node: unknown, at: string, out: Array<{ field: string; path: string }>): void {
  if (typeof node === "string") {
    for (const m of node.matchAll(ENTRY_BIND)) out.push({ field: m[1]!, path: at });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectBinds(v, `${at}[${i}]`, out));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) collectBinds(v, at ? `${at}.${k}` : k, out);
  }
}

export interface FieldsModeRecipe {
  mode: "fields";
  layout_owner: "shared_template";
  template_file: string | null;
  attached_pages: number | null;
  sections: Array<{ index: number; type: string; variant: string; binds: string[] }>;
  fields: Array<{ field: string; used_in: Array<{ section_index: number; type: string; path: string }> }>;
}

export function buildFieldsModeRecipe(contentType: string, locale: string): FieldsModeRecipe {
  const root = rootAbs();
  const dir = path.join(root, getFolder(contentType, getDefaultContentRoot()));
  const candidates = [`template.${locale}.yml`, ...TEMPLATE_LAYOUT_CANDIDATES];
  let file: string | null = null;
  let sections: Array<Record<string, unknown>> = [];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    const data = contentIndex.safeYamlLoad(fs.readFileSync(p, "utf-8")) as Record<string, unknown> | null;
    const list = Array.isArray(data?.sections) ? (data!.sections as Array<Record<string, unknown>>) : [];
    if (list.length === 0) continue;
    file = path.relative(process.cwd(), p);
    sections = list;
    break;
  }
  const fieldMap = new Map<string, Array<{ section_index: number; type: string; path: string }>>();
  const outSections = sections.map((s, index) => {
    const binds: Array<{ field: string; path: string }> = [];
    collectBinds(s, `sections[${index}]`, binds);
    const type = String(s.type ?? "");
    for (const b of binds) {
      const list = fieldMap.get(b.field) ?? [];
      list.push({ section_index: index, type, path: b.path });
      fieldMap.set(b.field, list);
    }
    return {
      index,
      type,
      variant: typeof s.variant === "string" && s.variant ? s.variant : "default",
      binds: [...new Set(binds.map((b) => b.field))],
    };
  });
  const template = ensureInsightsData().pages.find((p) => p.kind === "shared_template" && p.contentType === contentType);
  return {
    mode: "fields",
    layout_owner: "shared_template",
    template_file: file,
    attached_pages: template?.instanceCount ?? null,
    sections: outSections,
    fields: [...fieldMap.entries()].map(([field, used_in]) => ({ field, used_in })),
  };
}

export type RecipeResult =
  | ({ mode: "sections"; layout_owner: "entry" } & PageRecipe & { learned_rules: LearnedRule[] })
  | FieldsModeRecipe;

export function getPageRecipe(q: RecipeQuery & { slug?: string }): RecipeResult {
  const contentRoot = getDefaultContentRoot();
  if (q.contentType) {
    const owner = q.slug
      ? layoutInfoForEntry(q.contentType, q.slug, contentRoot).layout_owner
      : layoutInfoForEntry(q.contentType, "__new__", contentRoot).layout_owner;
    if (owner === "shared_template") return buildFieldsModeRecipe(q.contentType, q.locale || "en");
  }
  const records = ensureInsightsData().pages;
  const recipe = buildPageRecipe(records, {
    ...(q.contentType ? { contentType: q.contentType } : {}),
    ...(q.intent ? { intent: q.intent } : {}),
    ...(q.stage ? { stage: q.stage } : {}),
    ...(q.locale ? { locale: q.locale } : {}),
  });
  const learned_rules = currentLearnedRules(records).filter((r) => r.status !== "disabled");
  const allowed = new Set(paletteIds(loadSiteTheme(contentRoot)?.backgrounds));
  for (const slot of recipe.slots) {
    for (const opt of slot.options as Array<SlotOption & { off_theme_background?: string }>) {
      if (opt.background && !allowed.has(opt.background)) {
        opt.off_theme_background = opt.background;
        opt.background = null;
      }
    }
  }
  for (const layout of recipe.top_layouts) {
    for (const s of layout.sections as Array<{ background?: string; off_theme_background?: string }>) {
      if (s.background && !allowed.has(s.background)) {
        s.off_theme_background = s.background;
        delete s.background;
      }
    }
  }
  return { mode: "sections", layout_owner: "entry", ...recipe, learned_rules };
}

/** Wire learned rules into render reviews (warnings with evidence). */
export function registerLearnedRuleCheck(): void {
  setLearnedRuleCheck((sections) => {
    const rules = currentLearnedRules();
    return checkRules(insightSectionsOf(sections), rules).map(({ rule, index }) => ({
      code: "learned_rule",
      severity: "warning" as const,
      section_path: `sections[${index}]`,
      message: `${rule.title} (${rule.status === "pinned" ? "pinned by staff" : `${Math.round(rule.evidence.agreement * 100)}% of ${rule.evidence.approved_pages} approved pages`}).`,
      evidence: { rule_id: rule.id, examples: rule.evidence.examples },
    }));
  });
}
