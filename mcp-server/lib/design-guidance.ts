/**
 * Design-loop steering for section writes on entry-owned layouts:
 * get_page_recipe → write → review_page_render → run_entry_diagnostics (design).
 */
import type { NextAction } from "./respond.js";
import type { DiscoveryPath } from "../../server/content-proposals/proposal-discovery-path.js";

export interface DesignTarget {
  contentType: string;
  slug: string;
  locale: string;
  variant?: string;
  site?: string;
  stage?: string;
}

/** next_actions after a structural section write (create / replace / add) on an entry-owned layout. */
export function designLoopNextActions(t: DesignTarget, opts: { includeRecipe?: boolean } = {}): NextAction[] {
  const siteHint = t.site ? { site: t.site } : {};
  const actions: NextAction[] = [];
  if (opts.includeRecipe !== false) {
    actions.push({
      tool: "get_page_recipe",
      priority: "recommended",
      reason:
        "If you have not this session: see how this site's best layouts for this type are put together (slots, variants, backgrounds, spacing, learned rules) before adding more sections.",
      args_hint: { contentType: t.contentType, locale: t.locale, ...(t.stage ? { stage: t.stage } : {}), ...siteHint },
    });
  }
  actions.push({
    tool: "review_page_render",
    priority: "recommended",
    reason:
      "Screenshot the draft (desktop + mobile) and fix layout findings. Agents need a review of the final structure before publishing a new or restructured page.",
    args_hint: {
      source: "entry",
      contentType: t.contentType,
      slug: t.slug,
      locale: t.locale,
      ...(t.variant ? { variant: t.variant } : {}),
      ...siteHint,
    },
  });
  return actions;
}

/** discovery_path for creating an entry-owned page (landing-style): think before designing. */
export function createEntryDiscoveryPath(t: DesignTarget): DiscoveryPath {
  const siteHint = t.site ? { site: t.site } : {};
  return {
    goal: "Design this page from what already works on the site, then verify it renders well.",
    items: [
      {
        kind: "think",
        id: "page_goal",
        title: "What should a visitor do on this page?",
        why: "The goal decides which sections earn their place (lead form, checkout, read more).",
        look_for: ["one primary action", "who arrives here (ad, search, email)", "what they must believe before acting"],
      },
      {
        kind: "think",
        id: "funnel_stage",
        title: "Funnel stage",
        why: "Recipes and performance weights are scoped by stage (awareness / consideration / decision / post-enrollment).",
        look_for: [t.stage ? `funnel.stage is ${t.stage}` : "set funnel.stage on _common.yml if missing"],
      },
      {
        kind: "tool",
        id: "recipe",
        tool: "get_page_recipe",
        why: "Skeleton, variant pairings and learned rules from approved, well-performing layouts of this type.",
        look_for: ["required slots", "fallback: site_wide (thin sample)", "learned_rules"],
        available: true,
        args_hint: { contentType: t.contentType, locale: t.locale, ...(t.stage ? { stage: t.stage } : {}), ...siteHint },
      },
      {
        kind: "tool",
        id: "traffic",
        tool: "get_analytics_report",
        why: "Optional: how similar pages perform (sessions, engagement, conversions) to pick between recipe options.",
        look_for: ["top landing pages for this type", "engagement vs conversion"],
        available: true,
        hint: "Needs metrics_view; skip if not in your tools.",
      },
      {
        kind: "tool",
        id: "product_funnel",
        tool: "get_product_funnel",
        why: "Optional: which pages lead into and out of this one for the product it sells.",
        look_for: ["pages before/after in the journey", "missing money page"],
        available: true,
      },
      {
        kind: "tool",
        id: "render_review",
        tool: "review_page_render",
        why: "Screenshots + layout findings for the draft; required before an agent publishes a new page.",
        look_for: ["findings per section", "mobile overflow", "color edges without padding"],
        available: true,
        args_hint: { source: "entry", contentType: t.contentType, slug: t.slug, locale: t.locale, ...(t.variant ? { variant: t.variant } : {}), ...siteHint },
      },
    ],
    non_effects: [
      "Advice only: nothing here publishes or changes traffic.",
      "Recipes are not validators; theme IDs, text limits and the render-review publish gate still apply.",
    ],
  };
}
