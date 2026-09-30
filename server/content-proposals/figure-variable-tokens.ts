/**
 * Site-fact variable tokens in proposed text. Exact token parsing only — no number heuristics.
 */

import { FACT_CATEGORIES, FIGURE_CATEGORIES } from "@shared/variable-metadata";
import type { VariableDefinition } from "../variable-manager";
import { textFromUnknown, type OpForClaimCue } from "./claim-cues";
import { variesBy, type VariesBy } from "../variable-catalog";

const TOKEN_RE = /\{\{\s*(global\.[a-zA-Z0-9_.]+)\s*(?:\|[^}]*)?\}\}/g;

export type VariableTokenHit = { name: string; category: string };

export type FigureVariableSummary = {
  name: string;
  category: string;
  default: string | null;
  varies_by: VariesBy[];
  deprecated: boolean;
};

type Defs = Record<string, VariableDefinition>;

function findTokens(text: string, defs: Defs, categories: readonly string[]): VariableTokenHit[] {
  if (!text || !text.includes("{{")) return [];
  const want = new Set(categories);
  const seen = new Set<string>();
  const out: VariableTokenHit[] = [];
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const category = defs[name]?.category;
    if (category && want.has(category)) out.push({ name, category });
  }
  return out;
}

/** `{{ global.* }}` tokens whose category is price / outcome_claim / social_proof. */
export function findFigureVariableTokens(text: string, defs: Defs): VariableTokenHit[] {
  return findTokens(text, defs, FIGURE_CATEGORIES);
}

/** `{{ global.* }}` tokens in any fact category (figures + product_fact, company_fact, contact). */
export function findFactVariableTokens(text: string, defs: Defs): VariableTokenHit[] {
  return findTokens(text, defs, FACT_CATEGORIES);
}

/** New values of every pending/failed op (all field paths — tokens can live in any field). */
export function collectPendingOpValueText(entries: OpForClaimCue[]): string {
  const parts: string[] = [];
  for (const e of entries) {
    if (e.status && e.status !== "pending" && e.status !== "failed") continue;
    for (const op of e.ops ?? []) {
      const t = textFromUnknown(op.value);
      if (t.trim()) parts.push(t);
    }
  }
  return parts.join("\n");
}

export function summarizeFigureVariables(hits: VariableTokenHit[], defs: Defs): FigureVariableSummary[] {
  return hits.map((h) => {
    const def = defs[h.name] ?? {};
    return {
      name: h.name,
      category: h.category,
      default: def.default ?? null,
      varies_by: variesBy(def),
      deprecated: def.deprecated === true,
    };
  });
}
