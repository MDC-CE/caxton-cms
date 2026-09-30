/**
 * Idea proposals ↔ content type `strategy` (content-types.yml).
 * Ideas name their target page type via `related_entries[].contentType`; the type's
 * strategy (purpose + constraints) is shown to the ideator, the reviewer, and staff.
 */

import type { ContentTypeStrategy } from "@shared/contentTypeStrategy";

export const UNKNOWN_CONTENT_TYPE_CODE = "unknown_content_type";
export const IDEA_CONTENT_TYPE_MISSING_WARN = "idea_content_type_missing";
export const IDEA_CONTENT_TYPE_UNKNOWN_WARN = "idea_content_type_unknown";
export const IDEA_MULTIPLE_CONTENT_TYPES_WARN = "idea_multiple_content_types";
export const CONTENT_TYPE_STRATEGY_MISSING_WARN = "content_type_strategy_missing";
export const CONTENT_TYPE_FIT_THINK_ID = "content_type_fit";

/** Ideas filed on/after this instant get reviewer blocker guidance when no page type is named. */
export const IDEA_CONTENT_TYPE_RULE_SINCE = Date.parse("2026-09-30T00:00:00.000Z");

export const MAX_IDEA_CONTENT_TYPES = 3;

export type IdeaContentTypeRole = "pitched" | "accepted";

export type IdeaContentTypeStrategy = {
  contentType: string;
  role: IdeaContentTypeRole;
  purpose?: string;
  constraints?: string[];
  missing?: true;
};

type TypeRef = { contentType: string };

function distinctTypes(refs: readonly TypeRef[]): string[] {
  const out: string[] = [];
  for (const r of refs) {
    const ct = r.contentType?.trim();
    if (ct && !out.includes(ct)) out.push(ct);
  }
  return out;
}

/** Types not present in `known` (content-types.yml keys). Empty when `known` is absent. */
export function unknownContentTypes(
  refs: readonly TypeRef[],
  known: readonly string[] | null | undefined,
): string[] {
  if (!known) return [];
  const set = new Set(known);
  return distinctTypes(refs).filter((ct) => !set.has(ct));
}

export function unknownContentTypeError(unknown: string[], known: readonly string[]) {
  return {
    ok: false as const,
    code: UNKNOWN_CONTENT_TYPE_CODE,
    error:
      `Unknown content type${unknown.length === 1 ? "" : "s"} in related_entries: ${unknown.join(", ")}. ` +
      `Use a content type key from this site (not a folder name): ${[...known].sort().join(", ")}. Nothing was saved.`,
    details: { unknown, valid_types: [...known].sort() },
  };
}

/**
 * Strategies to show for an idea. Before accept: related types (pitched). After accept:
 * the accepted type first, then related types that differ (pitched). Unknown types are skipped.
 */
export function resolveIdeaContentTypeStrategies(opts: {
  related: readonly TypeRef[];
  accepted?: TypeRef | null;
  known?: readonly string[] | null;
  strategyFor: (contentType: string) => ContentTypeStrategy | null;
}): IdeaContentTypeStrategy[] {
  const knownSet = opts.known ? new Set(opts.known) : null;
  const isKnown = (ct: string) => !knownSet || knownSet.has(ct);
  const rows: Array<{ contentType: string; role: IdeaContentTypeRole }> = [];
  const acceptedType = opts.accepted?.contentType?.trim();
  if (acceptedType && isKnown(acceptedType)) rows.push({ contentType: acceptedType, role: "accepted" });
  for (const ct of distinctTypes(opts.related)) {
    if (ct === acceptedType || !isKnown(ct)) continue;
    rows.push({ contentType: ct, role: "pitched" });
  }
  return rows.slice(0, MAX_IDEA_CONTENT_TYPES).map((r) => {
    const s = opts.strategyFor(r.contentType);
    if (!s) return { ...r, missing: true as const };
    return { ...r, purpose: s.purpose, ...(s.constraints?.length ? { constraints: s.constraints } : {}) };
  });
}

export type IdeaContentTypeReview = {
  warnings: Array<{ code: string; message: string }>;
  think: { id: string; title: string; why: string; look_for: string[] } | null;
};

/** Warnings + one think item for the idea branch of the review classifier. */
export function reviewIdeaContentTypes(opts: {
  related: readonly TypeRef[];
  known?: readonly string[] | null;
  strategies?: readonly IdeaContentTypeStrategy[] | null;
  createdAt?: number | null;
}): IdeaContentTypeReview {
  const warnings: IdeaContentTypeReview["warnings"] = [];
  const types = distinctTypes(opts.related);

  if (types.length === 0) {
    const newRule = typeof opts.createdAt === "number" && opts.createdAt >= IDEA_CONTENT_TYPE_RULE_SINCE;
    warnings.push({
      code: IDEA_CONTENT_TYPE_MISSING_WARN,
      message:
        "This idea does not name its target page type. Author: set related_entries [{ contentType, slug, locale }] with update_proposal action set_related_entries (the slug may not exist yet) — use related_entries, not tags. " +
        (newRule
          ? "Reviewer: add_blocker unless the brief explains why no page type applies (e.g. a hub reshape)."
          : "Filed before this rule: reminder only — do not add a blocker for this alone."),
    });
  }

  const unknown = unknownContentTypes(opts.related, opts.known);
  if (unknown.length) {
    warnings.push({
      code: IDEA_CONTENT_TYPE_UNKNOWN_WARN,
      message:
        `related_entries names content type(s) this site does not have: ${unknown.join(", ")}. ` +
        `Valid types: ${[...(opts.known ?? [])].sort().join(", ")}. Author: fix with update_proposal action set_related_entries.`,
    });
  }

  const knownTypes = types.filter((t) => !unknown.includes(t));
  if (knownTypes.length > 1) {
    warnings.push({
      code: IDEA_MULTIPLE_CONTENT_TYPES_WARN,
      message: `This idea names ${knownTypes.length} page types (${knownTypes.join(", ")}). One idea should target one page type — consider splitting. Context links to existing pages are fine.`,
    });
  }

  const strategies = opts.strategies ?? [];
  const missing = strategies.filter((s) => s.missing);
  if (missing.length) {
    warnings.push({
      code: CONTENT_TYPE_STRATEGY_MISSING_WARN,
      message: `No strategy set for content type ${missing.map((s) => s.contentType).join(", ")}. Does not block accept. Staff: set it on the content type's Strategy tab (or update_content_type strategy).`,
    });
  }

  const withStrategy = strategies.filter((s) => !s.missing && s.purpose);
  const showRoles = strategies.some((s) => s.role === "accepted") && strategies.some((s) => s.role === "pitched");
  const think = withStrategy.length
    ? {
        id: CONTENT_TYPE_FIT_THINK_ID,
        title: "Check the brief fits its page type",
        why: "Each content type has a strategy (why the type exists). A good idea for one page type can be a poor fit for another.",
        look_for: [
          ...withStrategy.flatMap((s) => {
            const label = showRoles ? `${s.contentType} (${s.role})` : s.contentType;
            return [
              `${label} purpose: ${s.purpose}`,
              ...(s.constraints ?? []).map((c) => `${label} constraint: ${c}`),
            ];
          }),
          "does the brief's goal match this page type's purpose?",
        ],
      }
    : null;

  return { warnings, think };
}
