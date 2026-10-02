/**
 * Recipes and learned layout rules from component insights (single learning
 * system). Pure functions over InsightPageRecord[] + staff pins from
 * site_<name>/design-rules.yml.
 *
 * Query weight per layout = baseWeight (manual × approval × performance)
 *   × relevance (content type: same 1.0 / other 0.3; stage: same 1.0 /
 *     adjacent 0.5 / other 0.25; unknown 0.5)
 *   × locale (has the requested locale 1.0 / otherwise 0.2)
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { FUNNEL_STAGES } from "@shared/funnel";
import type { InsightPageRecord, InsightSection } from "@shared/schema";

export const MIN_RECIPE_SAMPLE = 3;
export const RULE_MIN_APPROVED_PAGES = 5;
export const RULE_MIN_AGREEMENT = 0.8;
const MAX_OPTIONS = 3;
const MAX_EXAMPLES = 3;

export interface RecipeQuery {
  contentType?: string;
  intent?: string;
  stage?: string;
  locale?: string;
}

export interface WeightedLayout {
  record: InsightPageRecord;
  weight: number;
  breakdown: { base: number; relevance: number; locale: number };
}

function stageRelevance(a: string | undefined, b: string | undefined): number {
  if (!b) return 1;
  if (!a) return 0.5;
  if (a === b) return 1;
  const ia = (FUNNEL_STAGES as readonly string[]).indexOf(a);
  const ib = (FUNNEL_STAGES as readonly string[]).indexOf(b);
  if (ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1) return 0.5;
  return 0.25;
}

export function weighLayouts(records: InsightPageRecord[], q: RecipeQuery): WeightedLayout[] {
  const out: WeightedLayout[] = [];
  for (const r of records) {
    if (r.kind === "overlay") continue;
    const base = r.baseWeight ?? r.weight;
    if (base <= 0 || r.sections.length === 0) continue;
    if (q.intent && r.intent !== q.intent) continue;
    const ct = q.contentType ? (r.contentType === q.contentType ? 1 : 0.3) : 1;
    const relevance = ct * stageRelevance(r.funnelStage, q.stage);
    const locale = q.locale && r.locales && r.locales.length > 0 && !r.locales.includes(q.locale) ? 0.2 : 1;
    const weight = Math.round(base * relevance * locale * 1000) / 1000;
    if (weight <= 0) continue;
    out.push({ record: r, weight, breakdown: { base, relevance, locale } });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

const inFlow = (s: InsightSection) => s.traits?.flow !== "out";

export type YamlSpacingValue = string | { mobile?: string; desktop?: string };

export interface SlotOption {
  type: string;
  variant: string;
  background: string | null;
  /** YAML-ready section spacing (responsive values as { mobile, desktop }). */
  spacing: { paddingY?: YamlSpacingValue; marginY?: YamlSpacingValue } | null;
  share: number;
  example_pages: string[];
}

export interface RecipeSlot {
  slot: number;
  presence: number;
  required: boolean;
  options: SlotOption[];
}

export interface PageRecipe {
  scope: RecipeQuery;
  fallback: "site_wide" | null;
  sample: { layouts: number; scoped_layouts: number; approved: number; total_weight: number };
  slots: RecipeSlot[];
  out_of_flow: Array<{ type: string; variant: string; share: number }>;
  top_layouts: Array<{
    key: string;
    weight: number;
    approval: string;
    sections: Array<{ type: string; variant: string; background?: string }>;
  }>;
  variant_pairings: Array<{ from: string; to: string; weight: number; share: number }>;
}

function round(n: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Insight spacing token ("md" or "mobile|desktop") → the YAML value a section uses. */
export function spacingTokenToYaml(token: string | undefined): YamlSpacingValue | undefined {
  if (!token) return undefined;
  if (!token.includes("|")) return token;
  const [m, d] = token.split("|") as [string, string];
  const out: { mobile?: string; desktop?: string } = {};
  if (m) out.mobile = m;
  if (d) out.desktop = d;
  return Object.keys(out).length ? out : undefined;
}

function yamlSpacing(sp: InsightSection["spacing"] | undefined): SlotOption["spacing"] {
  if (!sp) return null;
  const paddingY = spacingTokenToYaml(sp.paddingY);
  const marginY = spacingTokenToYaml(sp.marginY);
  if (!paddingY && !marginY) return null;
  return { ...(paddingY ? { paddingY } : {}), ...(marginY ? { marginY } : {}) };
}

function exampleKey(r: InsightPageRecord): string {
  return r.kind === "shared_template" ? `${r.key} (${r.instanceCount} pages)` : r.key;
}

/** Position-normalized skeleton: each layout's in-flow sections map onto L slots (L = weighted median length). */
export function buildSkeleton(layouts: WeightedLayout[]): { slots: RecipeSlot[]; out_of_flow: PageRecipe["out_of_flow"] } {
  const total = layouts.reduce((s, l) => s + l.weight, 0) || 1;
  const lengths = layouts
    .map((l) => ({ n: l.record.sections.filter(inFlow).length, w: l.weight }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.n - b.n);
  let acc = 0;
  let L = lengths[lengths.length - 1]?.n ?? 0;
  for (const x of lengths) {
    acc += x.w;
    if (acc >= total / 2) {
      L = x.n;
      break;
    }
  }
  const slotAcc = Array.from({ length: L }, () => ({
    presence: 0,
    options: new Map<string, { opt: Omit<SlotOption, "share" | "example_pages">; w: number; examples: string[] }>(),
  }));
  const oof = new Map<string, { type: string; variant: string; w: number }>();

  for (const l of layouts) {
    const flow = l.record.sections.filter(inFlow);
    for (const s of l.record.sections.filter((s) => !inFlow(s))) {
      const k = `${s.type}|${s.variant}`;
      const e = oof.get(k) ?? { type: s.type, variant: s.variant, w: 0 };
      e.w += l.weight;
      oof.set(k, e);
    }
    if (flow.length === 0 || L === 0) continue;
    const seenSlots = new Set<number>();
    flow.forEach((s, i) => {
      const slot = flow.length === 1 ? 0 : Math.round((i / (flow.length - 1)) * (L - 1));
      const sa = slotAcc[slot]!;
      if (!seenSlots.has(slot)) {
        sa.presence += l.weight;
        seenSlots.add(slot);
      }
      const k = `${s.type}|${s.variant}|${s.background ?? ""}`;
      const e = sa.options.get(k) ?? {
        opt: { type: s.type, variant: s.variant, background: s.background ?? null, spacing: yamlSpacing(s.spacing) },
        w: 0,
        examples: [],
      };
      e.w += l.weight;
      if (e.examples.length < MAX_EXAMPLES) e.examples.push(exampleKey(l.record));
      sa.options.set(k, e);
    });
  }

  const slots: RecipeSlot[] = slotAcc.map((sa, slot) => {
    const presence = round(sa.presence / total, 2);
    const opts = [...sa.options.values()].sort((a, b) => b.w - a.w).slice(0, MAX_OPTIONS);
    const slotTotal = [...sa.options.values()].reduce((s, o) => s + o.w, 0) || 1;
    return {
      slot,
      presence,
      required: presence >= 0.7,
      options: opts.map((o) => ({ ...o.opt, share: round(o.w / slotTotal, 2), example_pages: o.examples })),
    };
  });
  const out_of_flow = [...oof.values()]
    .map((e) => ({ type: e.type, variant: e.variant, share: round(e.w / total, 2) }))
    .filter((e) => e.share >= 0.2)
    .sort((a, b) => b.share - a.share);
  return { slots, out_of_flow };
}

export function buildVariantPairings(layouts: WeightedLayout[], limit = 25): PageRecipe["variant_pairings"] {
  const pairs = new Map<string, number>();
  const from = new Map<string, number>();
  for (const l of layouts) {
    const flow = l.record.sections.filter(inFlow);
    for (let i = 0; i < flow.length - 1; i++) {
      const a = `${flow[i]!.type}:${flow[i]!.variant}`;
      const b = `${flow[i + 1]!.type}:${flow[i + 1]!.variant}`;
      pairs.set(`${a}→${b}`, (pairs.get(`${a}→${b}`) ?? 0) + l.weight);
      from.set(a, (from.get(a) ?? 0) + l.weight);
    }
  }
  return [...pairs.entries()]
    .map(([k, w]) => {
      const [a, b] = k.split("→") as [string, string];
      return { from: a, to: b, weight: round(w), share: round(w / (from.get(a) || 1), 2) };
    })
    .sort((x, y) => y.weight - x.weight)
    .slice(0, limit);
}

export function buildPageRecipe(records: InsightPageRecord[], q: RecipeQuery): PageRecipe {
  let layouts = weighLayouts(records, q);
  const scoped = layouts.filter(
    (l) => (!q.contentType || l.record.contentType === q.contentType) && (!q.intent || l.record.intent === q.intent),
  );
  let fallback: PageRecipe["fallback"] = null;
  if (scoped.length < MIN_RECIPE_SAMPLE) {
    fallback = "site_wide";
    layouts = weighLayouts(records, { ...(q.locale ? { locale: q.locale } : {}), ...(q.stage ? { stage: q.stage } : {}) });
  } else if (q.contentType) {
    // Enough same-type layouts: other types only add noise to the skeleton.
    layouts = scoped;
  }
  const { slots, out_of_flow } = buildSkeleton(layouts);
  return {
    scope: q,
    fallback,
    sample: {
      layouts: layouts.length,
      scoped_layouts: scoped.length,
      approved: layouts.filter((l) => l.record.approval?.state === "approved" || l.record.approval?.state === "implicit").length,
      total_weight: round(layouts.reduce((s, l) => s + l.weight, 0)),
    },
    slots,
    out_of_flow,
    top_layouts: layouts.slice(0, 3).map((l) => ({
      key: exampleKey(l.record),
      weight: l.weight,
      approval: l.record.approval?.state ?? "none",
      sections: l.record.sections.map((s) => ({
        type: s.type,
        variant: s.variant,
        ...(s.background ? { background: s.background } : {}),
      })),
    })),
    variant_pairings: buildVariantPairings(layouts, 15),
  };
}

// ─── Learned layout rules ──────────────────────────────────────────────────

export type RuleStatus = "active" | "suggestion" | "pinned" | "disabled";

export interface LearnedRule {
  id: string;
  title: string;
  description: string;
  status: RuleStatus;
  evidence: { approved_pages: number; checks: number; agreement: number; examples: string[]; counter_examples: string[] };
}

interface RuleDef {
  id: string;
  title: string;
  description: string;
  /** For one layout: list of (ok, sectionIndex) observations. */
  observe: (flow: Array<InsightSection & { index: number }>) => Array<{ ok: boolean; index: number }>;
}

const hasPadding = (s: InsightSection) => !!s.spacing?.paddingY && !/^(none|0|\|none|none\|none)$/.test(s.spacing.paddingY);
const bgOf = (s: InsightSection) => s.background ?? "";

export const RULE_DEFS: RuleDef[] = [
  {
    id: "colored_section_has_padding",
    title: "Colored sections have vertical padding",
    description:
      "When a section's background differs from a neighbor's, the colored section carries paddingY (or is a self-padded variant) so content never touches the color edge.",
    observe: (flow) => {
      const out: Array<{ ok: boolean; index: number }> = [];
      flow.forEach((s, i) => {
        if (!s.background) return;
        const prev = flow[i - 1];
        const next = flow[i + 1];
        const differs = (prev && bgOf(prev) !== bgOf(s)) || (next && bgOf(next) !== bgOf(s));
        if (!differs) return;
        out.push({ ok: hasPadding(s) || !!s.traits?.self_padded, index: s.index });
      });
      return out;
    },
  },
  {
    id: "no_stacked_same_color",
    title: "Don't stack two sections with the same colored background",
    description:
      "Consecutive sections rarely share the same non-default background on approved pages; alternate with the page background (or merge them).",
    observe: (flow) => {
      const out: Array<{ ok: boolean; index: number }> = [];
      for (let i = 1; i < flow.length; i++) {
        const a = flow[i - 1]!;
        const b = flow[i]!;
        if (!a.background || !b.background) continue;
        out.push({ ok: a.background !== b.background, index: b.index });
      }
      return out;
    },
  },
  {
    id: "first_section_is_top_of_page",
    title: "Pages open with a top-of-page section",
    description: "The first visible section is a component designed for the top of the page (e.g. a hero).",
    observe: (flow) => (flow.length > 0 ? [{ ok: flow[0]!.traits?.edge === "top_of_page", index: flow[0]!.index }] : []),
  },
  {
    id: "no_adjacent_same_component",
    title: "Don't repeat the same component back to back",
    description: "Two consecutive sections of the same component type are rare on approved pages; combine them or separate with a different section.",
    observe: (flow) => {
      const out: Array<{ ok: boolean; index: number }> = [];
      for (let i = 1; i < flow.length; i++) out.push({ ok: flow[i - 1]!.type !== flow[i]!.type, index: flow[i]!.index });
      return out;
    },
  },
];

function flowWithIndex(sections: InsightSection[]): Array<InsightSection & { index: number }> {
  return sections.map((s, index) => ({ ...s, index })).filter(inFlow);
}

export function learnRules(records: InsightPageRecord[], pins: DesignRulePins = {}): LearnedRule[] {
  const approved = records.filter(
    (r) => r.kind !== "overlay" && (r.approval?.state === "approved" || r.approval?.state === "implicit"),
  );
  return RULE_DEFS.map((def) => {
    let checks = 0;
    let oks = 0;
    let pages = 0;
    const examples: string[] = [];
    const counter: string[] = [];
    for (const r of approved) {
      const obs = def.observe(flowWithIndex(r.sections));
      if (obs.length === 0) continue;
      pages++;
      checks += obs.length;
      const good = obs.filter((o) => o.ok).length;
      oks += good;
      if (good === obs.length && examples.length < MAX_EXAMPLES) examples.push(exampleKey(r));
      if (good < obs.length && counter.length < MAX_EXAMPLES) counter.push(exampleKey(r));
    }
    const agreement = checks ? round(oks / checks, 2) : 0;
    const learned = pages >= RULE_MIN_APPROVED_PAGES && agreement >= RULE_MIN_AGREEMENT;
    const pin = pins[def.id]?.status;
    const status: RuleStatus = pin === "disabled" ? "disabled" : pin === "pinned" ? "pinned" : learned ? "active" : "suggestion";
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      status,
      evidence: { approved_pages: pages, checks, agreement, examples, counter_examples: counter },
    };
  });
}

/** Violations of active/pinned rules for one page's sections (raw YAML or insight sections). */
export function checkRules(
  sections: InsightSection[],
  rules: LearnedRule[],
): Array<{ rule: LearnedRule; index: number }> {
  const enforced = rules.filter((r) => r.status === "active" || r.status === "pinned");
  if (enforced.length === 0) return [];
  const flow = flowWithIndex(sections);
  const out: Array<{ rule: LearnedRule; index: number }> = [];
  for (const rule of enforced) {
    const def = RULE_DEFS.find((d) => d.id === rule.id);
    if (!def) continue;
    for (const o of def.observe(flow)) if (!o.ok) out.push({ rule, index: o.index });
  }
  return out;
}

// ─── design-rules.yml pins ─────────────────────────────────────────────────

export type DesignRulePins = Record<string, { status: "pinned" | "disabled"; note?: string; by?: string; at?: string }>;

export function designRulesPath(contentRootAbs: string): string {
  return path.join(contentRootAbs, "design-rules.yml");
}

export function readDesignRulePins(contentRootAbs: string): DesignRulePins {
  try {
    const parsed = yaml.load(fs.readFileSync(designRulesPath(contentRootAbs), "utf8")) as { rules?: DesignRulePins } | null;
    const rules = parsed?.rules;
    if (!rules || typeof rules !== "object") return {};
    const out: DesignRulePins = {};
    for (const [id, v] of Object.entries(rules)) {
      if (v && (v.status === "pinned" || v.status === "disabled")) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeDesignRulePin(
  contentRootAbs: string,
  id: string,
  pin: { status: "pinned" | "disabled"; note?: string; by: string } | null,
): string {
  const pins = readDesignRulePins(contentRootAbs);
  if (pin) pins[id] = { ...pin, at: new Date().toISOString() };
  else delete pins[id];
  const file = designRulesPath(contentRootAbs);
  const header =
    "# Staff pins for learned layout rules (component insights).\n" +
    "# pinned = always enforced as a design warning; disabled = never enforced.\n";
  fs.writeFileSync(file, header + yaml.dump({ rules: pins }, { lineWidth: 120, noRefs: true, sortKeys: true }));
  return file;
}
