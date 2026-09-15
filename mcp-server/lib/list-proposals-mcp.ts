/**
 * Stats-first helpers for list_proposals MCP tool.
 */

import {
  parseProposalSort,
  parseProposerActorType,
  type ProposalSortDir,
  type ProposalSortField,
  type ProposerActorType,
} from "../../server/content-proposals/service.js";

export type ListProposalsArgs = {
  proposal_id?: string;
  query?: string;
  status?: string;
  kind?: string;
  issue_id?: string;
  proposer_username?: string;
  proposer_actor?: {
    type?: ProposerActorType;
    role?: string;
  };
  agent_session_id?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  sort_dir?: string;
};

export function isProposalsScoped(args: ListProposalsArgs): boolean {
  return Boolean(
    args.proposal_id?.trim() ||
      args.query?.trim() ||
      args.issue_id?.trim() ||
      args.status ||
      args.kind ||
      args.proposer_username?.trim() ||
      args.proposer_actor?.type ||
      args.proposer_actor?.role?.trim() ||
      args.agent_session_id?.trim(),
  );
}

export function clampProposalLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return 20;
  return Math.min(200, Math.max(1, Math.floor(limit)));
}

export function clampProposalOffset(offset?: number): number {
  if (offset == null || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

export function proposalNextOffset(
  offset: number,
  limit: number,
  total: number,
  pageLen: number,
): number | null {
  const next = offset + pageLen;
  return next < total ? next : null;
}

export {
  parseProposalSort,
  parseProposerActorType,
  type ProposalSortField,
  type ProposalSortDir,
  type ProposerActorType,
};
