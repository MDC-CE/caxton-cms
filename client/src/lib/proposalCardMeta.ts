import {
  formatIssueActorLine,
  type IssueActorRef,
} from "@/lib/formatIssueActor";
import { sameAgentIdentity } from "@shared/agent-identity";

export type ProposalClaimLike = {
  by: string;
  expiresAt: string;
  actor?: IssueActorRef | Record<string, unknown> | null;
};

export function asIssueActor(raw: unknown): IssueActorRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (type !== "ui" && type !== "mcp" && type !== "system") return null;
  return {
    type,
    ...(typeof o.client === "string" ? { client: o.client } : {}),
    ...(typeof o.model === "string" ? { model: o.model } : {}),
    ...(typeof o.role === "string" ? { role: o.role } : {}),
    ...(typeof o.source === "string" ? { source: o.source } : {}),
  };
}

/** Staff-facing category labels for proposal chips. */
export function proposalCategoryLabel(category: string): string {
  if (category === "content.seo") return "SEO";
  if (category === "content.field") return "Field";
  return category;
}

/** Short id for display (last chars of UUID); copy actions should still use the full id. */
export function shortProposalId(id: string, length = 6): string {
  const compact = id.replace(/-/g, "");
  const tail = compact.slice(-length) || id.slice(-length);
  return tail || id;
}

function pluralUnit(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Staff-facing relative time with day/hour/minute parts (no vague "about N hours").
 * Examples: "just now", "5 minutes ago", "2 hours 15 minutes ago", "1 day 5 hours 23 minutes ago"
 */
export function formatProposalRelativeUpdatedAt(
  updatedAtMs: number,
  nowMs: number = Date.now(),
): string {
  const diff = Math.max(0, nowMs - updatedAtMs);
  if (diff < 60_000) return "just now";

  const totalMins = Math.floor(diff / 60_000);
  if (totalMins < 60) return `${pluralUnit(totalMins, "minute")} ago`;

  const totalHours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (totalHours < 24) {
    const parts = [pluralUnit(totalHours, "hour")];
    if (mins > 0) parts.push(pluralUnit(mins, "minute"));
    return `${parts.join(" ")} ago`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [pluralUnit(days, "day")];
  if (hours > 0) parts.push(pluralUnit(hours, "hour"));
  if (mins > 0) parts.push(pluralUnit(mins, "minute"));
  return `${parts.join(" ")} ago`;
}

export function proposalEntryProgress(entries: Array<{ status: string }>): {
  done: number;
  total: number;
  failed: number;
  label: string;
} | null {
  if (entries.length === 0) return null;
  const done = entries.filter((e) => e.status === "done").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const total = entries.length;
  const label =
    failed > 0 ? `${done}/${total} · ${failed} failed` : `${done}/${total} done`;
  return { done, total, failed, label };
}

export type ProposalAttributionLines = {
  /** Primary propose / propose+claim line(s) */
  lines: string[];
  /** Muted expired-claim line, if any */
  expiredLine: string | null;
};

/**
 * Build attribution lines for list/detail.
 * Collapse propose+claim when same staff author and same agent identity (username + role).
 * Expired claims stay visible (not a lock).
 */
export function proposalAttributionLines(opts: {
  proposerUsername: string;
  proposerActor?: unknown;
  claim?: ProposalClaimLike | null;
  nowMs?: number;
}): ProposalAttributionLines {
  const now = opts.nowMs ?? Date.now();
  const proposerActor = asIssueActor(opts.proposerActor);
  const proposeLine = `Proposed by ${formatIssueActorLine(opts.proposerUsername, proposerActor)}`;

  const claim = opts.claim;
  if (!claim?.by) {
    return { lines: [proposeLine], expiredLine: null };
  }

  const claimActor = asIssueActor(claim.actor);
  const claimFmt = formatIssueActorLine(claim.by, claimActor);
  const expiresAt = new Date(claim.expiresAt).getTime();
  const active = Number.isFinite(expiresAt) && expiresAt > now;

  if (!active) {
    return {
      lines: [proposeLine],
      expiredLine: `Claim expired · ${claimFmt}`,
    };
  }

  if (
    sameAgentIdentity(opts.proposerUsername, proposerActor, claim.by, claimActor)
  ) {
    return {
      lines: [`Proposed & claimed by ${claimFmt}`],
      expiredLine: null,
    };
  }

  return {
    lines: [proposeLine, `Claimed by ${claimFmt}`],
    expiredLine: null,
  };
}
