import type { PageDiagnostics } from "./types";
import type { McpSetupTabId } from "@/components/mcp/mcpUrlHelpers";
import { getMcpServerUrl } from "@/components/mcp/mcpUrlHelpers";
import { renderAskAgentPrompt } from "@shared/ask-agent-prompts";
import "@/lib/askAgentPrompts";

export type SolveWithAiAgentId =
  | "claude-ai"
  | "grok"
  | "chatgpt"
  | "perplexity"
  | "copilot"
  | "copy-prompt";

export interface SolveWithAiMenuItem {
  id: SolveWithAiAgentId;
  label: string;
  /** Prefill URL prefix ending with `q=` — omit for copy-only. */
  prefillUrlPrefix?: string;
  setupTab: McpSetupTabId;
}

/** Menu order: Claude.ai → Grok → ChatGPT → Perplexity → Copilot → Copy prompt. */
export const SOLVE_WITH_AI_MENU: SolveWithAiMenuItem[] = [
  {
    id: "claude-ai",
    label: "Claude.ai",
    prefillUrlPrefix: "https://claude.ai/new?q=",
    setupTab: "claude-ai",
  },
  {
    id: "grok",
    label: "Grok",
    prefillUrlPrefix: "https://grok.com/?q=",
    setupTab: "grok",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    prefillUrlPrefix: "https://chatgpt.com/?q=",
    setupTab: "chatgpt",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    prefillUrlPrefix: "https://www.perplexity.ai/search/new?q=",
    setupTab: "perplexity",
  },
  {
    id: "copilot",
    label: "Copilot",
    prefillUrlPrefix: "https://copilot.microsoft.com/?q=",
    setupTab: "copilot",
  },
  {
    id: "copy-prompt",
    label: "Copy prompt",
    setupTab: "cursor",
  },
];

const MAX_WARNINGS_IN_PROMPT = 15;

function formatIssueLine(issue: {
  id?: string;
  code: string;
  message: string;
  suggestion?: string;
}): string {
  const idPart = issue.id ? ` [id=${issue.id}]` : "";
  const suggestion = issue.suggestion?.trim()
    ? ` (suggestion: ${issue.suggestion.trim()})`
    : "";
  return `- ${issue.code}${idPart}: ${issue.message}${suggestion}`;
}

export function buildSolveWithAiPrompt(pageDiagnostics: PageDiagnostics): string {
  const errors = (pageDiagnostics.issues ?? []).filter(
    (i) => i.type === "error" && !i.completed,
  );
  const warnings = (pageDiagnostics.issues ?? []).filter(
    (i) => i.type === "warning" && !i.completed,
  );
  const warningLines = warnings.slice(0, MAX_WARNINGS_IN_PROMPT).map(formatIssueLine);
  const extraWarnings = warnings.length - MAX_WARNINGS_IN_PROMPT;

  const errorBlock =
    errors.length > 0 ? errors.map(formatIssueLine).join("\n") : "- (none)";
  const warningBlock =
    warnings.length > 0
      ? [
          ...warningLines,
          ...(extraWarnings > 0
            ? [
                `- … and ${extraWarnings} more — load via get_entry_content.validation_issues`,
              ]
            : []),
        ].join("\n")
      : "- (none)";

  const variantLine =
    pageDiagnostics.variant != null && pageDiagnostics.variant !== ""
      ? `\n- variant: ${pageDiagnostics.variant}`
      : "";

  const mcpUrl = typeof window !== "undefined" ? getMcpServerUrl() : "/mcp";

  return renderAskAgentPrompt("page-diagnostics", {
    url: pageDiagnostics.url,
    content_type: pageDiagnostics.contentType,
    slug: pageDiagnostics.slug,
    locale: pageDiagnostics.locale,
    variant_line: variantLine,
    file_path: pageDiagnostics.filePath,
    mcp_url: mcpUrl,
    error_block: errorBlock,
    warning_block: warningBlock,
  });
}

export function buildSolveWithAiPrefillUrl(
  prefillUrlPrefix: string,
  prompt: string,
): string {
  return `${prefillUrlPrefix}${encodeURIComponent(prompt)}`;
}

export type ProposalBadOutcomePromptInput = {
  id: string;
  title: string;
  kind: string;
  status: string;
  close_reason?: string | null;
  outcome_review_note?: string | null;
  outcome_review_expected?: string | null;
  outcome_review_by?: string | null;
  outcome_review_at?: number | null;
  decision_debug?: {
    action?: string;
    source?: string;
    actor?: { username?: string; type?: string; role?: string };
    agent_session_id?: string | null;
    review_context?: {
      damage_class?: string;
      undo_cost?: string;
      summary?: string;
      think_items?: Array<{ title: string }>;
      warnings?: Array<{ code: string; message: string }>;
    };
    discovery_path?: { goal?: string } | null;
  } | null;
};

const NO_DECISION_RECORD =
  "- No decision record — reason from the proposal and the staff notes only.";

function formatDecisionBlock(debug: ProposalBadOutcomePromptInput["decision_debug"]): string {
  if (!debug) return NO_DECISION_RECORD;
  const lines: string[] = [];
  const who = debug.actor?.username ?? "unknown";
  const how = [debug.source, debug.actor?.type, debug.actor?.role].filter(Boolean).join(", ");
  lines.push(`- decided: ${debug.action ?? "unknown"} by ${who}${how ? ` (${how})` : ""}`);
  if (debug.agent_session_id) lines.push(`- agent session: ${debug.agent_session_id}`);
  const ctx = debug.review_context;
  if (ctx) {
    const damage = [
      ctx.damage_class ? `damage class: ${ctx.damage_class}` : null,
      ctx.undo_cost ? `undo cost: ${ctx.undo_cost}` : null,
    ].filter(Boolean);
    if (damage.length) lines.push(`- ${damage.join(" · ")}`);
    if (ctx.summary) lines.push(`- situation: ${ctx.summary}`);
    const think = (ctx.think_items ?? []).map((t) => t.title).filter(Boolean);
    lines.push(`- think items: ${think.length ? think.join("; ") : "(none)"}`);
    const warnings = (ctx.warnings ?? []).map((w) => `${w.code}: ${w.message}`);
    lines.push(`- warnings: ${warnings.length ? warnings.slice(0, 5).join("; ") : "(none)"}`);
  }
  if (debug.discovery_path?.goal) lines.push(`- discovery goal: ${debug.discovery_path.goal}`);
  return lines.join("\n");
}

export function buildProposalBadOutcomePrompt(p: ProposalBadOutcomePromptInput): string {
  const mcpUrl = typeof window !== "undefined" ? getMcpServerUrl() : "/mcp";
  const reviewedAt = p.outcome_review_at
    ? ` on ${new Date(p.outcome_review_at).toISOString().slice(0, 10)}`
    : "";

  return renderAskAgentPrompt("proposal-bad-outcome", {
    proposal_id: p.id,
    title: p.title,
    kind: p.kind,
    status: p.status,
    close_reason: p.close_reason || "none",
    mcp_url: mcpUrl,
    what_went_wrong: p.outcome_review_note?.trim() || "(not provided)",
    expected: p.outcome_review_expected?.trim() || "(not provided)",
    reviewed_by: `${p.outcome_review_by ?? "unknown"}${reviewedAt}`,
    decision_block: formatDecisionBlock(p.decision_debug),
  });
}

export function buildDraftFeedbackAiPrompt(opts: {
  shareUrl: string;
  contentType: string;
  slug: string;
  locale: string;
  variant: string;
}): string {
  const mcpUrl = typeof window !== "undefined" ? getMcpServerUrl() : "/mcp";

  return renderAskAgentPrompt("draft-feedback", {
    share_url: opts.shareUrl,
    content_type: opts.contentType,
    slug: opts.slug,
    locale: opts.locale,
    variant: opts.variant,
    mcp_url: mcpUrl,
  });
}
