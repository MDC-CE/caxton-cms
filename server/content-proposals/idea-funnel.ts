/**
 * Structured funnel intent on new-URL ideas (Phase 2).
 * Same shape as live _common.yml funnel — accept freezes; create seeds/matches.
 */

import {
  isFunnelStage,
  normalizeFunnelBlock,
  normalizeFunnelProducts,
  type FunnelProducts,
  type FunnelStage,
} from "@shared/funnel";

export type IdeaFunnel = {
  stage: FunnelStage;
  products: FunnelProducts;
};

export const IDEA_FUNNEL_MISSING_WARN = "idea_funnel_missing";
export const IDEA_FUNNEL_INCOMPLETE = "idea_funnel_incomplete";
export const IDEA_FUNNEL_REQUIRED = "idea_funnel_required";
export const IDEA_FUNNEL_FROZEN = "idea_funnel_frozen";
export const IDEA_FUNNEL_CONFLICT = "idea_funnel_conflict";
export const IDEA_FUNNEL_ALL_STAGE = "idea_funnel_all_stage";

/** Clear new-page pitch in title/summary (when related targets are absent or ambiguous). */
const NEW_URL_PITCH_RE =
  /\b(new\s+(article|post|page|spoke|url|entry|blog)|nuevo\s+art[ií]culo|nueva\s+p[aá]gina|create\s+a\s+(page|post|article)|net-?new|brand\s+new\s+(url|page))\b/i;

export function looksLikeNewUrlPitch(title?: string | null, summary?: string | null): boolean {
  return NEW_URL_PITCH_RE.test(`${title ?? ""} ${summary ?? ""}`);
}

export function parseIdeaFunnel(raw: unknown): IdeaFunnel | null {
  const block = normalizeFunnelBlock(raw);
  if (!isFunnelStage(block.stage)) return null;
  const products = normalizeFunnelProducts(block.products);
  if (products == null) return null;
  if (products !== "all" && (!Array.isArray(products) || products.length === 0)) return null;
  return { stage: block.stage, products };
}

/**
 * Validate funnel for idea storage. Incomplete → error code for callers.
 * `all` only allowed with awareness.
 */
export function validateIdeaFunnel(
  raw: unknown,
):
  | { ok: true; funnel: IdeaFunnel }
  | { ok: false; code: string; error: string } {
  if (raw == null || (typeof raw === "object" && raw !== null && Object.keys(raw as object).length === 0)) {
    return {
      ok: false,
      code: IDEA_FUNNEL_INCOMPLETE,
      error:
        "idea_funnel requires stage (awareness|consideration|decision|post-enrollment) and products (\"all\" or [{ product, persona? }, ...]).",
    };
  }
  const block = normalizeFunnelBlock(raw);
  if (!isFunnelStage(block.stage)) {
    return {
      ok: false,
      code: IDEA_FUNNEL_INCOMPLETE,
      error:
        "idea_funnel.stage must be awareness, consideration, decision, or post-enrollment.",
    };
  }
  const products = normalizeFunnelProducts(block.products);
  if (products == null) {
    return {
      ok: false,
      code: IDEA_FUNNEL_INCOMPLETE,
      error:
        'idea_funnel.products must be "all" or a non-empty list of { product, persona? } bindings.',
    };
  }
  if (products === "all" && block.stage !== "awareness") {
    return {
      ok: false,
      code: IDEA_FUNNEL_ALL_STAGE,
      error:
        'idea_funnel.products "all" is only allowed when stage is awareness. Consideration/decision/post-enrollment need named product binding(s).',
    };
  }
  return { ok: true, funnel: { stage: block.stage, products } };
}

export function ideaFunnelComplete(funnel: IdeaFunnel | null | undefined): boolean {
  return funnel != null && isFunnelStage(funnel.stage) && funnel.products != null;
}

/** Compare two funnels for create conflict (order-insensitive bindings). */
export function ideaFunnelsEqual(a: IdeaFunnel, b: IdeaFunnel): boolean {
  if (a.stage !== b.stage) return false;
  if (a.products === "all" && b.products === "all") return true;
  if (a.products === "all" || b.products === "all") return false;
  if (!Array.isArray(a.products) || !Array.isArray(b.products)) return false;
  if (a.products.length !== b.products.length) return false;
  const key = (x: { product: string; persona?: string }) =>
    `${x.product}\0${x.persona ?? ""}`;
  const setA = new Set(a.products.map(key));
  for (const p of b.products) {
    if (!setA.has(key(p))) return false;
  }
  return true;
}

export function funnelFromFieldOps(
  ops: Array<{ field_path: string; value?: unknown; reset?: boolean }>,
): IdeaFunnel | null {
  let stage: FunnelStage | undefined;
  let products: FunnelProducts | undefined;
  for (const op of ops) {
    if (op.reset) continue;
    const p = op.field_path?.trim();
    if (p === "funnel.stage" && isFunnelStage(op.value)) stage = op.value;
    if (p === "funnel.products") {
      const n = normalizeFunnelProducts(op.value);
      if (n != null) products = n;
    }
    if (p === "funnel") {
      const parsed = parseIdeaFunnel(op.value);
      if (parsed) return parsed;
    }
  }
  if (stage && products != null) {
    const v = validateIdeaFunnel({ stage, products });
    return v.ok ? v.funnel : null;
  }
  return null;
}

export function hasFunnelFieldOps(
  ops: Array<{ field_path: string; value?: unknown; reset?: boolean }>,
): boolean {
  return ops.some((op) => {
    const p = op.field_path?.trim() ?? "";
    return p === "funnel" || p === "funnel.stage" || p === "funnel.products" || p.startsWith("funnel.");
  });
}

/** YAML block to write onto _common.yml. Both fields are required on IdeaFunnel. */
export function ideaFunnelToYamlBlock(funnel: IdeaFunnel): {
  stage: FunnelStage;
  products: FunnelProducts;
} {
  return { stage: funnel.stage, products: funnel.products };
}

export type ExistenceLite = "exists" | "missing" | "unknown";

/**
 * New-URL ideas need structured funnel before accept.
 * - Missing related/accepted target → required
 * - All related exist (refresh) → not required
 * - Redirect-only to an existing live page → not required
 * - No related but clear new-page pitch → required
 * - Broken-URL locking a new missing slug → required (caller passes missing existence)
 */
export function ideaRequiresStructuredFunnel(opts: {
  title?: string | null;
  summary?: string | null;
  related_entries?: Array<{
    contentType: string;
    slug: string;
    locale?: string;
    existence?: ExistenceLite;
  }>;
  /** When set (accept path), use this instead of related_entries. */
  accepted_entry?: {
    contentType: string;
    slug: string;
    locale: string;
    existence?: ExistenceLite;
  } | null;
}): boolean {
  if (opts.accepted_entry) {
    const ex = opts.accepted_entry.existence ?? "missing";
    if (ex === "exists") return false;
    return true;
  }
  const related = opts.related_entries ?? [];
  if (related.length === 0) {
    return looksLikeNewUrlPitch(opts.title, opts.summary);
  }
  const anyMissing = related.some((r) => (r.existence ?? "unknown") === "missing");
  if (anyMissing) return true;
  const allExist = related.every((r) => r.existence === "exists");
  if (allExist) return false;
  // Unknown existence + new-page pitch → require (safer)
  return looksLikeNewUrlPitch(opts.title, opts.summary);
}
