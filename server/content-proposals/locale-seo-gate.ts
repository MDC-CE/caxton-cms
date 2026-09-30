/**
 * New language on an SEO-monitored page: the draft's `seo:` must say which search
 * this locale wins and which same-locale hub it joins (or that it is a hub).
 * Enforced on proposal apply and agent publishes; staff direct publish is exempt.
 */

import type { ContentIndex } from "../content-index";
import { canonicalizePillarPath } from "../seo-fields";
import { findOriginIdeaForEntry } from "./idea-origin";
import { SEO_REASON_MIN, STANDALONE_DEMAND_LABELS, standaloneAllowedForDemand } from "./idea-seo-target";

export const LOCALE_SEO_TARGET_REQUIRED = "locale_seo_target_required";

export type LocaleSeoGateResult =
  | { ok: true }
  | { ok: false; code: string; error: string; details: Record<string, unknown> };

function localeOfPath(p: string): string | null {
  const first = p.split("/").filter(Boolean)[0] ?? "";
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(first) ? first : null;
}

export function checkLocaleSeoTarget(opts: {
  site: string;
  contentType: string;
  slug: string;
  locale: string;
  ci: ContentIndex;
  draftSeo: Record<string, unknown> | null | undefined;
  /** Reason the locale stays out of every cluster (pillar_path: null). */
  standaloneReason?: string | null;
}): LocaleSeoGateResult {
  const seo = opts.draftSeo ?? {};
  const where = `${opts.contentType}/${opts.slug} (${opts.locale})`;
  const origin = findOriginIdeaForEntry(opts.site, opts.contentType, opts.slug);
  const baseDetails: Record<string, unknown> = {
    locale: opts.locale,
    required_fields: ["seo.main_keyword", "seo.pillar_path | seo.is_pillar"],
    ...(origin ? { origin_idea_id: origin.id, demand_label: origin.demand_label } : {}),
  };
  const fail = (error: string, extra?: Record<string, unknown>): LocaleSeoGateResult => ({
    ok: false,
    code: LOCALE_SEO_TARGET_REQUIRED,
    error,
    details: { ...baseDetails, ...(extra ?? {}) },
  });

  const keyword = typeof seo.main_keyword === "string" ? seo.main_keyword.trim() : "";
  if (!keyword) {
    return fail(
      `${where} is a new language on an SEO-monitored page. Set seo.main_keyword (the ${opts.locale} search this page should win) on the draft before publishing.`,
    );
  }
  if (seo.is_pillar === true) return { ok: true };

  const hasPillarKey = Object.prototype.hasOwnProperty.call(seo, "pillar_path");
  const pillar = typeof seo.pillar_path === "string" ? seo.pillar_path.trim() : "";
  if (pillar) {
    const hub = canonicalizePillarPath(pillar, opts.locale, opts.ci);
    const hubLocale = localeOfPath(hub.path);
    if (!hub.live) {
      return fail(`${where}: seo.pillar_path ${pillar} is not a live page. Pick a live ${opts.locale} hub.`, {
        pillar_path: pillar,
      });
    }
    if (hubLocale && hubLocale !== opts.locale) {
      return fail(
        `${where}: seo.pillar_path ${hub.path} is a ${hubLocale} hub. Each language joins a hub in its own language — pick a ${opts.locale} hub or set seo.is_pillar.`,
        { pillar_path: hub.path, hub_locale: hubLocale },
      );
    }
    return { ok: true };
  }

  if (hasPillarKey && seo.pillar_path === null) {
    const reason = typeof opts.standaloneReason === "string" ? opts.standaloneReason.trim() : "";
    if (origin && !standaloneAllowedForDemand(origin.demand_label)) {
      return fail(
        `${where} came from traffic idea ${origin.id} (${origin.demand_label ?? "no demand label"}). ` +
          `Standalone (no cluster) is only allowed for ${STANDALONE_DEMAND_LABELS.join(" or ")} ideas — set a ${opts.locale} hub or seo.is_pillar.`,
      );
    }
    if (reason.length < SEO_REASON_MIN) {
      return fail(
        `${where}: seo.pillar_path is null (standalone). Give a reason (min ${SEO_REASON_MIN} chars) why this language stays out of every cluster, or set a ${opts.locale} hub.`,
      );
    }
    return { ok: true };
  }

  return fail(
    `${where} is a new language on an SEO-monitored page. Set seo.pillar_path to a live ${opts.locale} hub, or seo.is_pillar: true, on the draft before publishing.`,
  );
}
