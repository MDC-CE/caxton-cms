/**
 * Build discovery_path for list_proposals (single-id open|partial).
 * Prefer agent_preview think items from server review_context; fall back to kind-based defaults.
 */

import { parseContentTypeStrategy, type ContentTypeStrategy } from "../../shared/contentTypeStrategy.js";
import { TOOL_GATES } from "../../shared/mcp-tool-catalog.js";

export type DiscoveryPathThinkItem = {
  kind: "think";
  id: string;
  title: string;
  why: string;
  look_for: string[];
};

export type DiscoveryPathToolItem = {
  kind: "tool";
  id: string;
  tool: string;
  why: string;
  look_for: string[];
  available: boolean;
  hint?: string;
  args_hint?: Record<string, unknown>;
};

export type DiscoveryPathItem = DiscoveryPathThinkItem | DiscoveryPathToolItem;

export type DiscoveryPath = {
  goal: string;
  items: DiscoveryPathItem[];
  non_effects: string[];
};

export type DiscoveryWarning = { code: string; message: string };

export const DISCOVERY_TOOL_CAPPED = "discovery_tool_capped";

const CATALOG_NAMES = new Set(Object.keys(TOOL_GATES));

const CORE_EDITS_TOOLS: Array<{
  id: string;
  tool: string;
  why: string;
  look_for: string[];
}> = [
  {
    id: "preview_content",
    tool: "get_entry_content",
    why: "See the page body the proposal would change.",
    look_for: [
      "proposed fields vs live copy",
      "broken CTAs or missing sections ops do not touch → adjacent_findings / notes, not default add_blocker",
    ],
  },
  {
    id: "recent_writes",
    tool: "get_entry_activity",
    why: "Check whether someone else edited the same entry recently.",
    look_for: ["overlapping writers", "stale proposal context"],
  },
  {
    id: "seo_context",
    tool: "get_entry_seo",
    why: "Review SEO/meta context for the entry.",
    look_for: ["title/description fit", "keyword or schema gaps"],
  },
  {
    id: "diagnostics",
    tool: "run_entry_diagnostics",
    why: "Surface open validation issues on the entry.",
    look_for: [
      "issues the proposal claims to fix",
      "open issues ops do not touch → adjacent_findings / notes (same or other page), not default add_blocker",
    ],
  },
];

const ORGANIC_TOOL = {
  id: "traffic_risk",
  tool: "get_organic_traffic",
  why: "Gauge Search Console traffic risk before a go-live or high-visibility change.",
  look_for: ["high-traffic paths", "sudden drops after similar changes"],
} as const;

const FUNNEL_ANALYTICS_TOOL = {
  id: "journey_metrics",
  tool: "get_product_funnel_analytics",
  why: "Optional: product journey page performance (GA4) before applying selling/funnel changes.",
  look_for: ["weak journey stages", "path sessions vs conversions"],
} as const;

const SITE_ANALYTICS_TOOL = {
  id: "site_ga",
  tool: "get_analytics_report",
  why: "Optional: GA4 behavioral traffic for this page or site before applying a live change.",
  look_for: ["high-traffic paths", "baseline sessions/views"],
} as const;

/** All tool names that may appear on an edits discovery_path (for catalog checks). */
export function proposalDiscoveryToolNames(): string[] {
  return [
    ...CORE_EDITS_TOOLS.map((t) => t.tool),
    ORGANIC_TOOL.tool,
    FUNNEL_ANALYTICS_TOOL.tool,
    SITE_ANALYTICS_TOOL.tool,
  ];
}

const TOOL_UNAVAILABLE_HINT =
  "This tool is not on your MCP role. Ask a human to enable the needed access, then refresh/reconnect the MCP connector.";

export type ProposalDiscoveryInput = {
  id: string;
  status: string;
  kind: string;
  title?: string;
  summary?: string;
  escalated?: boolean;
  escalated_note?: string | null;
  entries?: Array<{
    contentType: string;
    slug: string;
    locale: string;
    variant?: string | null;
    status?: string;
    ops?: Array<{ field_path?: string } | null> | null;
  }>;
  open_blocker_count?: number;
  blockers?: unknown[];
};

export type AgentPreviewThink = {
  id: string;
  title: string;
  why: string;
  look_for: string[];
};

export type ReviewContextForDiscovery = {
  summary?: string;
  damage_class?: string;
  block_apply?: boolean;
  situation_changed_since_filed?: boolean;
  agent_preview?: {
    think_items?: AgentPreviewThink[];
    warnings?: DiscoveryWarning[];
  };
};

export type BuildProposalDiscoveryPathOpts = {
  proposal: ProposalDiscoveryInput;
  allowedTools?: ReadonlySet<string> | readonly string[] | null;
  strategy?: ContentTypeStrategy | null;
  reviewContext?: ReviewContextForDiscovery | null;
};

function allowedSet(
  allowedTools: BuildProposalDiscoveryPathOpts["allowedTools"],
): Set<string> | null {
  if (allowedTools == null) return null;
  return allowedTools instanceof Set ? allowedTools : new Set(allowedTools);
}

function collectPendingFieldPaths(proposal: ProposalDiscoveryInput): string[] {
  const out: string[] = [];
  for (const e of proposal.entries ?? []) {
    if (e.status && e.status !== "pending" && e.status !== "failed") continue;
    for (const op of e.ops ?? []) {
      if (op && typeof op.field_path === "string" && op.field_path.trim()) {
        out.push(op.field_path.trim());
      }
    }
  }
  return out;
}

function toToolItem(
  def: {
    id: string;
    tool: string;
    why: string;
    look_for: string[];
  },
  allowed: Set<string> | null,
  args_hint?: Record<string, unknown>,
): DiscoveryPathToolItem {
  if (!CATALOG_NAMES.has(def.tool)) {
    throw new Error(`discovery tool not in catalog: ${def.tool}`);
  }
  const available = allowed == null ? true : allowed.has(def.tool);
  return {
    kind: "tool",
    id: def.id,
    tool: def.tool,
    why: def.why,
    look_for: [...def.look_for],
    available,
    ...(available ? {} : { hint: TOOL_UNAVAILABLE_HINT }),
    ...(args_hint ? { args_hint } : {}),
  };
}

/**
 * Core content tools + at most 2 traffic tools:
 * always organic; second is funnel analytics (selling/funnel) else site GA (live public damage).
 */
export function buildEditsDiscoveryToolItems(opts: {
  allowed: Set<string> | null;
  damageClass?: string | null;
  pendingFieldPaths?: string[];
  entry?: { contentType: string; slug: string; locale?: string } | null;
}): { items: DiscoveryPathToolItem[]; anyCapped: boolean } {
  const { allowed, damageClass, pendingFieldPaths = [], entry } = opts;
  const items: DiscoveryPathToolItem[] = CORE_EDITS_TOOLS.map((t) => toToolItem(t, allowed));

  items.push(toToolItem(ORGANIC_TOOL, allowed));

  const hasFunnelOp = pendingFieldPaths.some((p) => p === "funnel" || p.startsWith("funnel."));
  const sellingOrFunnel = damageClass === "selling_page" || hasFunnelOp;
  const livePublic =
    damageClass === "existing_metadata" ||
    damageClass === "existing_content" ||
    damageClass === "selling_page";

  if (sellingOrFunnel) {
    const productSlug =
      entry?.contentType === "program" || entry?.contentType === "programs"
        ? entry.slug
        : entry?.slug;
    items.push(
      toToolItem(FUNNEL_ANALYTICS_TOOL, allowed, productSlug ? { slug: productSlug } : undefined),
    );
  } else if (livePublic) {
    const args_hint =
      entry?.contentType && entry.slug
        ? {
            report: "page_detail",
            content_type: entry.contentType,
            slug: entry.slug,
            ...(entry.locale ? { locale: entry.locale } : {}),
          }
        : { report: "site_summary" };
    items.push(toToolItem(SITE_ANALYTICS_TOOL, allowed, args_hint));
  }

  const anyCapped = items.some((i) => !i.available);
  return { items, anyCapped };
}

function thinkFromPreview(items: AgentPreviewThink[]): DiscoveryPathItem[] {
  return items.slice(0, 6).map((t) => ({
    kind: "think" as const,
    id: t.id,
    title: t.title,
    why: t.why,
    look_for: t.look_for,
  }));
}

function fallbackNotesThink(proposal: ProposalDiscoveryInput): DiscoveryPathItem[] {
  return [
    {
      kind: "think",
      id: "read_card",
      title: "Read the notes card",
      why: "Notes do not change YAML on close — understand the handoff before closing.",
      look_for: [
        proposal.summary
          ? `summary: ${proposal.summary.slice(0, 200)}${proposal.summary.length > 200 ? "…" : ""}`
          : "what was tried",
        "related issues and blockers",
      ],
    },
    {
      kind: "think",
      id: "close_disposition",
      title: "Close disposition",
      why: "Pick a close_reason that matches reality (wont_fix, fixed_elsewhere, tracked_elsewhere, other).",
      look_for: [
        "is work truly done elsewhere",
        "should this stay open for the next agent instead",
        "close_note when required",
      ],
    },
  ];
}

function fallbackIdeaThink(proposal: ProposalDiscoveryInput): DiscoveryPathItem[] {
  return [
    {
      kind: "think",
      id: "idea_accept",
      title: "Accept greenlights a brief only",
      why: "Accept does not create pages or write YAML.",
      look_for: [
        proposal.summary
          ? `summary: ${proposal.summary.slice(0, 200)}${proposal.summary.length > 200 ? "…" : ""}`
          : "brief intent",
        "next_step is concrete (min 20 characters)",
        "close/park means no — not yes",
      ],
    },
  ];
}

export function buildProposalDiscoveryPath(
  opts: BuildProposalDiscoveryPathOpts,
): { discovery_path: DiscoveryPath | null; warnings: DiscoveryWarning[] } {
  const { proposal, strategy: _strategy, reviewContext } = opts;
  const status = proposal.status;
  if (status !== "open" && status !== "partial") {
    return { discovery_path: null, warnings: [] };
  }

  const warnings: DiscoveryWarning[] = [];

  if (proposal.escalated) {
    warnings.push({
      code: "proposal_escalated",
      message:
        "A steward paused agent work on this proposal. Do not call update_proposal until they release the hold. " +
        (proposal.escalated_note
          ? `Note: ${proposal.escalated_note.slice(0, 240)}${proposal.escalated_note.length > 240 ? "…" : ""}`
          : "Read escalated_note on the proposal for why."),
    });
    return {
      discovery_path: {
        goal: "Steward hold — agents must not mutate this proposal. Skip discovery tools until released.",
        items: [
          {
            kind: "think",
            id: "steward_hold",
            title: "Respect the steward hold",
            why: "Escalate freezes all MCP update_proposal actions until a Platform Steward releases it in the staff UI.",
            look_for: [
              proposal.escalated_note
                ? `steward note: ${proposal.escalated_note.slice(0, 200)}${proposal.escalated_note.length > 200 ? "…" : ""}`
                : "escalated_note on the proposal",
              "do not claim, add_blocker, apply, reject, or revise",
            ],
          },
        ],
        non_effects: [
          "Following discovery_path is optional; skip does not unlock or block update_proposal.",
          "discovery_path is not next_actions — do not treat items as required tool calls.",
        ],
      },
      warnings,
    };
  }

  if (!proposal.escalated && proposal.escalated_note) {
    warnings.push({
      code: "proposal_escalated_history",
      message:
        "A steward previously paused agents on this proposal. Mutations are allowed again. " +
        `Prior note: ${proposal.escalated_note.slice(0, 240)}${proposal.escalated_note.length > 240 ? "…" : ""}`,
    });
  }

  const allowed = allowedSet(opts.allowedTools);

  if (reviewContext?.agent_preview?.warnings?.length) {
    warnings.push(...reviewContext.agent_preview.warnings);
  }

  const kind = proposal.kind === "notes" ? "notes" : proposal.kind === "idea" ? "idea" : "edits";

  let think: DiscoveryPathItem[] = [];
  const previewThink = reviewContext?.agent_preview?.think_items;
  if (previewThink?.length) {
    think = thinkFromPreview(previewThink);
  } else if (kind === "notes") {
    think = fallbackNotesThink(proposal);
  } else if (kind === "idea") {
    think = fallbackIdeaThink(proposal);
  } else {
    think = [
      {
        kind: "think",
        id: "read_card",
        title: "Read what is already on this proposal",
        why: "Summary, blockers, and entries are already in this response — start here before calling tools.",
        look_for: [
          proposal.summary
            ? `summary: ${proposal.summary.slice(0, 200)}${proposal.summary.length > 200 ? "…" : ""}`
            : "summary and rationale",
          `open blockers: ${proposal.open_blocker_count ?? 0}`,
          reviewContext?.summary ? `situation: ${reviewContext.summary.slice(0, 200)}` : "review situation",
        ],
      },
      {
        kind: "think",
        id: "disposition",
        title: "Choose a disposition",
        why: "After optional research, decide apply, reject, add_blocker, or park adjacent notes — discovery is not a gate.",
        look_for: [
          "apply only when you would ship this yourself",
          "add_blocker when the proposed change is wrong or invents claims (then revise_entries)",
          "out-of-scope live defects → adjacent_findings notes park; do not default every finding to add_blocker",
          "reject only for bad/impossible/illegal/harmful/duplicate/target missing — confirm_reject + reject_kind + note",
        ],
      },
    ];
  }

  if (think.length > 6) think = think.slice(0, 6);

  let tools: DiscoveryPathToolItem[] = [];
  if (kind === "edits" && !reviewContext?.block_apply) {
    const entries = proposal.entries ?? [];
    const first =
      entries.find((e) => !e.status || e.status === "pending" || e.status === "failed") ??
      entries[0];
    const built = buildEditsDiscoveryToolItems({
      allowed,
      damageClass: reviewContext?.damage_class,
      pendingFieldPaths: collectPendingFieldPaths(proposal),
      entry: first
        ? { contentType: first.contentType, slug: first.slug, locale: first.locale }
        : null,
    });
    tools = built.items;
    if (built.anyCapped) {
      warnings.push({
        code: DISCOVERY_TOOL_CAPPED,
        message:
          "One or more discovery research tools are not available on this role. See discovery_path items with available:false — ask a human to enable access, then refresh MCP.",
      });
    }
  }

  const goal =
    kind === "notes"
      ? "Optional context before close/withdraw. Not next_actions — you choose; skip does not block."
      : kind === "idea"
        ? "Optional context before accept | close. Not next_actions — skip does not block."
        : reviewContext?.block_apply
          ? "Target missing — apply is blocked. Prefer reject or withdraw. discovery_path is optional context only."
          : "Optional context before apply | reject | add_blocker. Not next_actions — you choose; skip does not block apply.";

  const discovery_path: DiscoveryPath = {
    goal,
    items: [...think, ...tools],
    non_effects: [
      "Following discovery_path is optional; skip does not unlock or block update_proposal.",
      "discovery_path is not next_actions — do not treat items as required tool calls.",
    ],
  };

  return { discovery_path, warnings };
}

export function resolveStrategyForContentType(
  strategyRaw: unknown,
): ContentTypeStrategy | null {
  return parseContentTypeStrategy(strategyRaw);
}
