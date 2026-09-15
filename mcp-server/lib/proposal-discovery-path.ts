/**
 * Build discovery_path for list_proposals (single-id open|partial).
 * Prefer agent_preview think items from server review_context; fall back to kind-based defaults.
 */

import { parseContentTypeStrategy, type ContentTypeStrategy } from "../../shared/contentTypeStrategy.js";
import { TOOL_GATES } from "../../shared/mcp-tool-catalog.js";
import type { DiscoveryPath, DiscoveryPathItem, DiscoveryPathToolItem, McpWarning } from "./respond.js";

export const DISCOVERY_TOOL_CAPPED = "discovery_tool_capped";

const CATALOG_NAMES = new Set(Object.keys(TOOL_GATES));

const EDITS_TOOLS: Array<{
  id: string;
  tool: string;
  why: string;
  look_for: string[];
}> = [
  {
    id: "preview_content",
    tool: "get_entry_content",
    why: "See the page body the proposal would change.",
    look_for: ["proposed fields vs live copy", "broken CTAs or missing sections"],
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
    id: "traffic_risk",
    tool: "get_organic_traffic",
    why: "Gauge traffic risk before a go-live or high-visibility change.",
    look_for: ["high-traffic paths", "sudden drops after similar changes"],
  },
  {
    id: "diagnostics",
    tool: "run_entry_diagnostics",
    why: "Surface open validation issues on the entry.",
    look_for: ["blocking SEO/content issues", "issues the proposal claims to fix"],
  },
];

const TOOL_UNAVAILABLE_HINT =
  "This tool is not on your MCP role. Ask a human to enable the needed access, then refresh/reconnect the MCP connector.";

export type ProposalDiscoveryInput = {
  id: string;
  status: string;
  kind: string;
  title?: string;
  summary?: string;
  entries?: Array<{
    contentType: string;
    slug: string;
    locale: string;
    variant?: string | null;
    status?: string;
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
    warnings?: McpWarning[];
  };
};

export type BuildProposalDiscoveryPathOpts = {
  proposal: ProposalDiscoveryInput;
  allowedTools?: ReadonlySet<string> | readonly string[] | null;
  strategy?: ContentTypeStrategy | null;
  /** Live review_context from admin API (preferred). */
  reviewContext?: ReviewContextForDiscovery | null;
};

function allowedSet(
  allowedTools: BuildProposalDiscoveryPathOpts["allowedTools"],
): Set<string> | null {
  if (allowedTools == null) return null;
  return allowedTools instanceof Set ? allowedTools : new Set(allowedTools);
}

function buildToolItems(allowed: Set<string> | null): {
  items: DiscoveryPathToolItem[];
  anyCapped: boolean;
} {
  let anyCapped = false;
  const items: DiscoveryPathToolItem[] = EDITS_TOOLS.map((t) => {
    if (!CATALOG_NAMES.has(t.tool)) {
      throw new Error(`discovery tool not in catalog: ${t.tool}`);
    }
    const available = allowed == null ? true : allowed.has(t.tool);
    if (!available) anyCapped = true;
    return {
      kind: "tool" as const,
      id: t.id,
      tool: t.tool,
      why: t.why,
      look_for: t.look_for,
      available,
      ...(available ? {} : { hint: TOOL_UNAVAILABLE_HINT }),
    };
  });
  return { items, anyCapped };
}

function thinkFromPreview(items: AgentPreviewThink[]): DiscoveryPathItem[] {
  return items.slice(0, 5).map((t) => ({
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

/**
 * Returns discovery_path for a decidable single-proposal read, or null.
 */
export function buildProposalDiscoveryPath(
  opts: BuildProposalDiscoveryPathOpts,
): { discovery_path: DiscoveryPath | null; warnings: McpWarning[] } {
  const { proposal, strategy: _strategy, reviewContext } = opts;
  const status = proposal.status;
  if (status !== "open" && status !== "partial") {
    return { discovery_path: null, warnings: [] };
  }

  const allowed = allowedSet(opts.allowedTools);
  const warnings: McpWarning[] = [];

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
        why: "After optional research, decide apply, reject, or add_blocker — discovery is not a gate.",
        look_for: [
          "apply only when you would ship this yourself",
          "add_blocker for fixable polish (then revise_entries)",
          "reject only for bad/impossible/illegal/harmful/duplicate/target missing — confirm_reject + reject_kind + note",
        ],
      },
    ];
  }

  if (think.length > 5) think = think.slice(0, 5);

  let tools: DiscoveryPathToolItem[] = [];
  if (kind === "edits" && !reviewContext?.block_apply) {
    const built = buildToolItems(allowed);
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

/** Catalog names used by the edits discovery tool list (for tests). */
export function proposalDiscoveryToolNames(): string[] {
  return EDITS_TOOLS.map((t) => t.tool);
}
