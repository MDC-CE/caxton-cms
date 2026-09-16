/**
 * Re-export proposal discovery_path builder from server (canonical location).
 */
export {
  DISCOVERY_TOOL_CAPPED,
  buildProposalDiscoveryPath,
  proposalDiscoveryToolNames,
  resolveStrategyForContentType,
  type AgentPreviewThink,
  type BuildProposalDiscoveryPathOpts,
  type DiscoveryPath,
  type DiscoveryPathItem,
  type DiscoveryPathToolItem,
  type DiscoveryWarning,
  type ProposalDiscoveryInput,
  type ReviewContextForDiscovery,
} from "../../server/content-proposals/proposal-discovery-path.js";
