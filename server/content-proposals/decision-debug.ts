/**
 * Freeze review_context + discovery_path at terminal decide for staff debug.
 */

import type { ReviewContext } from "./review-context";
import {
  buildProposalDiscoveryPath,
  type DiscoveryPath,
  type ProposalDiscoveryInput,
} from "./proposal-discovery-path";

export type DecisionDebugAction =
  | "apply"
  | "reject"
  | "accept"
  | "close"
  | "withdraw";

export type ProposalDecisionDebug = {
  captured_at: number;
  action: DecisionDebugAction;
  actor: { username: string; type?: string; role?: string };
  agent_session_id?: string | null;
  source: "staff" | "mcp";
  review_context: {
    damage_class: string;
    undo_cost: string;
    summary: string;
    active_checklists: string[];
    block_apply: boolean;
    think_items: Array<{ id: string; title: string; why: string; look_for: string[] }>;
    warnings: Array<{ code: string; message: string }>;
  };
  discovery_path: DiscoveryPath | null;
};

export type BuildDecisionDebugOpts = {
  action: DecisionDebugAction;
  proposal: ProposalDiscoveryInput;
  reviewContext: ReviewContext | null;
  caller: {
    username: string;
    asStaff?: boolean;
    agent_session_id?: string | null;
    actor?: { type?: string; role?: string } | null;
  };
  allowedTools?: ReadonlySet<string> | readonly string[] | null;
  captured_at?: number;
  /** Gate-filtered recent activity (same semantics as apply confirm). */
  recentActivity?: Array<{ entryKey: string; writeCount: number; windowDays: number }> | null;
};

export function buildDecisionDebug(opts: BuildDecisionDebugOpts): ProposalDecisionDebug {
  const { action, proposal, reviewContext, caller } = opts;
  const source: "staff" | "mcp" = caller.asStaff ? "staff" : "mcp";
  const actorType =
    caller.actor && typeof caller.actor.type === "string" ? caller.actor.type : undefined;
  const actorRole =
    caller.actor && typeof caller.actor.role === "string" ? caller.actor.role : undefined;

  const think_items = reviewContext?.agent_preview?.think_items ?? [];
  const warnings = reviewContext?.agent_preview?.warnings ?? [];

  const built = buildProposalDiscoveryPath({
    proposal,
    allowedTools: opts.allowedTools ?? null,
    reviewContext: reviewContext
      ? {
          summary: reviewContext.summary,
          damage_class: reviewContext.damage_class,
          block_apply: reviewContext.block_apply,
          situation_changed_since_filed: reviewContext.situation_changed_since_filed,
          review_situations: reviewContext.review_situations,
          active_checklists: reviewContext.active_checklists,
          entries: reviewContext.entries,
          agent_preview: reviewContext.agent_preview,
        }
      : null,
    recentActivity: opts.recentActivity ?? null,
  });

  return {
    captured_at: opts.captured_at ?? Date.now(),
    action,
    actor: {
      username: caller.username,
      ...(actorType ? { type: actorType } : {}),
      ...(actorRole ? { role: actorRole } : {}),
    },
    agent_session_id: caller.agent_session_id ?? null,
    source,
    review_context: {
      damage_class: reviewContext?.damage_class ?? "none",
      undo_cost: reviewContext?.undo_cost ?? "none",
      summary: reviewContext?.summary ?? "",
      active_checklists: reviewContext?.active_checklists ?? [],
      block_apply: Boolean(reviewContext?.block_apply),
      think_items,
      warnings,
    },
    discovery_path: built.discovery_path,
  };
}
