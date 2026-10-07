/**
 * Which accepted idea created a page (idea-born pages). Used by the SEO opt-out
 * gate, the new-locale SEO gate, and `/api/seo/entry` for the staff warning.
 */

import { getSiteSqlite } from "../db";
import { ensurePipelineDb } from "../pipeline-db/runner";
import { ideaDemandLabel, standaloneAllowedForDemand, SEO_REASON_MIN } from "./idea-seo-target";

export type IdeaOrigin = {
  id: string;
  title: string;
  demand_label: string | null;
  /** Locale the idea locked (the page's first language). */
  locale: string;
};

export const SEO_OPTOUT_IDEA_BORN = "seo_optout_idea_born";

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Accepted idea whose locked page is this entry (any locale). Null when none or DB unavailable. */
export function findOriginIdeaForEntry(
  site: string,
  contentType: string,
  slug: string,
): IdeaOrigin | null {
  try {
    ensurePipelineDb(site);
    const db = getSiteSqlite(site);
    const rows = db
      .prepare(
        `SELECT id, title, accepted_entry_json, review_situations_json FROM content_proposals
         WHERE site = ? AND kind = 'idea' AND status = 'finished' AND close_reason = 'accepted'
           AND accepted_entry_json IS NOT NULL
         ORDER BY closed_at DESC`,
      )
      .all(site) as Array<{
      id: string;
      title: string;
      accepted_entry_json: string;
      review_situations_json: string | null;
    }>;
    for (const row of rows) {
      const entry = parse<{ contentType?: string; slug?: string; locale?: string } | null>(
        row.accepted_entry_json,
        null,
      );
      if (!entry || entry.contentType !== contentType || entry.slug !== slug) continue;
      return {
        id: row.id,
        title: row.title,
        demand_label: ideaDemandLabel(parse<string[]>(row.review_situations_json, [])),
        locale: entry.locale ?? "",
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** `seo.pillar_path: null` — the explicit "not in any cluster" opt-out (reset is a gap, not an opt-out). */
export function isSeoClusterOptOutOp(op: { field_path?: string; value?: unknown; reset?: boolean }): boolean {
  const p = op.field_path?.trim() ?? "";
  return (p === "seo.pillar_path" || p === "seo.pillar") && op.value === null && op.reset !== true;
}

/**
 * Agents may take an idea-born page out of clustering only when its idea was
 * news / broken-URL and they give a real reason.
 */
export function agentOptOutAllowed(
  origin: IdeaOrigin,
  reason: string | null | undefined,
): { ok: true } | { ok: false; code: string; error: string; details: Record<string, unknown> } {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (standaloneAllowedForDemand(origin.demand_label) && r.length >= SEO_REASON_MIN) return { ok: true };
  return {
    ok: false,
    code: SEO_OPTOUT_IDEA_BORN,
    error: standaloneAllowedForDemand(origin.demand_label)
      ? `This page came from traffic idea ${origin.id} ("${origin.title}"). Pass seo_optout_reason (min ${SEO_REASON_MIN} chars) to take it out of its cluster.`
      : `This page came from traffic idea ${origin.id} ("${origin.title}", ${origin.demand_label ?? "no demand label"}). ` +
        "Agents may only take idea-born pages out of clustering for news or broken-URL ideas. Fix the cluster instead (seo.pillar_path to a live hub, or seo.is_pillar).",
    details: {
      origin_idea_id: origin.id,
      origin_idea_title: origin.title,
      demand_label: origin.demand_label,
    },
  };
}
