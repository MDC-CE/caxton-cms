import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconChevronDown } from "@tabler/icons-react";
import { ProposalProposerCombobox } from "@/components/agents/ProposalProposerCombobox";
import {
  AgentSessionPickerModal,
  type AgentSessionPickerSummary,
} from "@/components/pipeline/AgentSessionPickerModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENTIC_SWARM_ROLE_IDS,
  AGENTIC_SWARM_ROLES_BY_ID,
} from "@shared/agentic-swarm-roles";
import { apiFetch } from "@/lib/queryClient";
import {
  PROPOSAL_ACTOR_TYPE_OPTIONS,
  PROPOSAL_ATTENTION_OPTIONS,
  PROPOSAL_KIND_OPTIONS,
  PROPOSAL_STATUS_OPTIONS,
  type ProposalListActorType,
  type ProposalListAttention,
  type ProposalListFilters,
  type ProposalListKind,
  type ProposalListStats,
  type ProposalListStatus,
} from "@/pages/proposals-list-filters";

export type ProposalListFilterDims = Pick<
  ProposalListFilters,
  | "status"
  | "kind"
  | "proposerUsername"
  | "proposerActorType"
  | "proposerActorRole"
  | "agentSessionId"
  | "escalatedOnly"
  | "attention"
>;

const ROLE_ANY = "__any__";
const SESSION_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function dimsFromFilters(filters: ProposalListFilters): ProposalListFilterDims {
  return {
    status: filters.status,
    kind: filters.kind,
    proposerUsername: filters.proposerUsername,
    proposerActorType: filters.proposerActorType,
    proposerActorRole: filters.proposerActorRole,
    agentSessionId: filters.agentSessionId,
    escalatedOnly: filters.escalatedOnly,
    attention: filters.attention,
  };
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function sessionTriggerLabel(
  sessionId: string,
  sessions: AgentSessionPickerSummary[],
): string {
  if (!sessionId) return "All sessions";
  const s = sessions.find((x) => x.agent_session_id === sessionId);
  const short = sessionId.slice(0, 8);
  if (!s) return `${short}…`;
  return `${short}… · ${s.write_count} write${s.write_count === 1 ? "" : "s"} · ${formatRelative(s.ended_at)}`;
}

export function ProposalListFiltersDialog({
  open,
  onOpenChange,
  filters,
  stats,
  onApply,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ProposalListFilters;
  stats?: ProposalListStats | null;
  onApply: (next: ProposalListFilterDims) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState<ProposalListFilterDims>(() => dimsFromFilters(filters));
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [proposerPickerOpen, setProposerPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(dimsFromFilters(filters));
    }
  }, [
    open,
    filters.status,
    filters.kind,
    filters.proposerUsername,
    filters.proposerActorType,
    filters.proposerActorRole,
    filters.agentSessionId,
    filters.escalatedOnly,
    filters.attention,
  ]);

  const { data: siteInfo } = useQuery<{ contentFolder: string }>({
    queryKey: ["/api/site/info"],
    enabled: open,
  });
  const site = siteInfo?.contentFolder;

  const sessionsQuery = useQuery({
    queryKey: ["/api/admin/agent-sessions", site, "proposals-filters-30d"],
    queryFn: async (): Promise<AgentSessionPickerSummary[]> => {
      const since = Date.now() - SESSION_LOOKBACK_MS;
      const res = await apiFetch(
        `/api/admin/agent-sessions?site=${encodeURIComponent(site!)}&since=${since}&limit=100`,
      );
      if (!res.ok) throw new Error(`Failed to load sessions (${res.status})`);
      const data = (await res.json()) as { sessions?: AgentSessionPickerSummary[] };
      return Array.isArray(data.sessions) ? data.sessions : [];
    },
    enabled: open && Boolean(site),
    staleTime: 30_000,
  });

  const sessions = sessionsQuery.data ?? [];
  const nestedOpen = sessionPickerOpen || proposerPickerOpen;

  const patchDraft = (patch: Partial<ProposalListFilterDims>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  function handleApply() {
    onApply({
      ...draft,
      proposerUsername: draft.proposerUsername.trim(),
      proposerActorRole: draft.proposerActorRole.trim(),
      agentSessionId: draft.agentSessionId.trim(),
    });
    onOpenChange(false);
  }

  function handleClear() {
    onClear();
    onOpenChange(false);
  }

  function statusLabel(value: ProposalListStatus, label: string): string {
    if (value === "all") {
      const total = stats?.total;
      return total != null ? `${label} (${total})` : label;
    }
    const n = stats?.by_status?.[value];
    return n != null ? `${label} (${n})` : label;
  }

  function kindLabel(value: ProposalListKind, label: string): string {
    if (value === "all") {
      const total = stats?.total;
      return total != null ? `${label} (${total})` : label;
    }
    const n = stats?.by_kind?.[value];
    return n != null ? `${label} (${n})` : label;
  }

  function attentionLabel(value: ProposalListAttention, label: string): string {
    if (value === "all") return label;
    const n = stats?.by_attention?.[value];
    return n != null ? `${label} (${n})` : label;
  }

  const roleSelectValue = draft.proposerActorRole.trim() || ROLE_ANY;

  return (
    <>
      <Dialog
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (!next && nestedOpen) return;
          onOpenChange(next);
          if (!next) {
            setSessionPickerOpen(false);
            setProposerPickerOpen(false);
          }
        }}
      >
        <DialogContent
          forceOverlay
          className="max-h-[85vh] overflow-y-auto"
          data-testid="dialog-proposal-filters"
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (
              target.closest("[data-radix-popper-content-wrapper]") ||
              target.closest('[data-testid="dialog-agent-session-picker"]') ||
              target.closest('[data-testid="popover-proposal-proposer-filter"]')
            ) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => {
            const target = e.target as HTMLElement;
            if (
              target.closest("[data-radix-popper-content-wrapper]") ||
              target.closest('[data-testid="dialog-agent-session-picker"]') ||
              target.closest('[data-testid="popover-proposal-proposer-filter"]')
            ) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (
              target.closest("[data-radix-popper-content-wrapper]") ||
              target.closest('[data-testid="dialog-agent-session-picker"]') ||
              target.closest('[data-testid="popover-proposal-proposer-filter"]')
            ) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>
              Narrow which proposals appear in the list by status, kind, attention, or who filed them.
              Nothing is written until someone acts on a proposal. Sort stays on the Sort control next
              to Filters — use Needs attention for steward holds, re-checks, then first-pass reviews.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="proposal-status-filter" className="text-xs text-muted-foreground">
                  Status
                </Label>
                <Select
                  value={draft.status}
                  onValueChange={(status) => patchDraft({ status: status as ProposalListStatus })}
                >
                  <SelectTrigger
                    id="proposal-status-filter"
                    className="h-8 text-sm"
                    data-testid="select-proposal-status-filter"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPOSAL_STATUS_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        data-testid={`option-proposal-status-${opt.value}`}
                      >
                        {statusLabel(opt.value, opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="proposal-kind-filter" className="text-xs text-muted-foreground">
                  Kind
                </Label>
                <Select
                  value={draft.kind}
                  onValueChange={(kind) => patchDraft({ kind: kind as ProposalListKind })}
                >
                  <SelectTrigger
                    id="proposal-kind-filter"
                    className="h-8 text-sm"
                    data-testid="select-proposal-kind-filter"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPOSAL_KIND_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        data-testid={`option-proposal-kind-${opt.value}`}
                      >
                        {kindLabel(opt.value, opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="proposal-attention-filter" className="text-xs text-muted-foreground">
                Attention
              </Label>
              <Select
                value={draft.attention}
                onValueChange={(attention) =>
                  patchDraft({ attention: attention as ProposalListAttention })
                }
              >
                <SelectTrigger
                  id="proposal-attention-filter"
                  className="h-8 text-sm"
                  data-testid="select-proposal-attention-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_ATTENTION_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      data-testid={`option-proposal-attention-${opt.value}`}
                    >
                      {attentionLabel(opt.value, opt.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="proposal-proposer-username-filter" className="text-xs text-muted-foreground">
                Proposer
              </Label>
              <ProposalProposerCombobox
                value={draft.proposerUsername}
                onChange={(proposerUsername) => patchDraft({ proposerUsername })}
                enabled={open}
                onOpenChange={setProposerPickerOpen}
              />
              <p className="text-[11px] text-muted-foreground">
                People with a proposal touched in the last 30 days. Type a full username if they’re not
                listed (exact match).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="proposal-actor-type-filter" className="text-xs text-muted-foreground">
                  Filed by
                </Label>
                <Select
                  value={draft.proposerActorType}
                  onValueChange={(v) =>
                    patchDraft({ proposerActorType: v as ProposalListActorType })
                  }
                >
                  <SelectTrigger
                    id="proposal-actor-type-filter"
                    className="h-8 text-sm"
                    data-testid="select-proposal-actor-type-filter"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPOSAL_ACTOR_TYPE_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        data-testid={`option-proposal-actor-type-${opt.value}`}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="proposal-actor-role-filter" className="text-xs text-muted-foreground">
                  Agent role
                </Label>
                <Select
                  value={roleSelectValue}
                  onValueChange={(v) =>
                    patchDraft({ proposerActorRole: v === ROLE_ANY ? "" : v })
                  }
                >
                  <SelectTrigger
                    id="proposal-actor-role-filter"
                    className="h-8 text-sm"
                    data-testid="select-proposal-actor-role-filter"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROLE_ANY} data-testid="option-proposal-actor-role-any">
                      Any
                    </SelectItem>
                    {AGENTIC_SWARM_ROLE_IDS.map((id) => (
                      <SelectItem
                        key={id}
                        value={id}
                        data-testid={`option-proposal-actor-role-${id}`}
                      >
                        {AGENTIC_SWARM_ROLES_BY_ID[id].label}
                      </SelectItem>
                    ))}
                    {draft.proposerActorRole.trim() &&
                    !(AGENTIC_SWARM_ROLE_IDS as readonly string[]).includes(
                      draft.proposerActorRole.trim(),
                    ) ? (
                      <SelectItem
                        value={draft.proposerActorRole.trim()}
                        data-testid="option-proposal-actor-role-custom"
                      >
                        {draft.proposerActorRole.trim()}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Agent session</p>
              <button
                type="button"
                id="proposal-session-filter"
                onClick={() => setSessionPickerOpen(true)}
                className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-sm hover:bg-muted/40"
                data-testid="button-proposal-session-filter"
              >
                <span className="min-w-0 truncate font-mono text-xs">
                  {sessionTriggerLabel(draft.agentSessionId, sessions)}
                </span>
                <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
              <p className="text-[11px] text-muted-foreground">
                Sessions from the last 30 days. Staff-filed proposals usually have no session and will
                not match.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="proposal-escalated-only-filter" className="text-xs text-foreground">
                  Escalated only
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Steward hold — agents paused
                  {stats?.escalated_count != null ? ` (${stats.escalated_count})` : ""}.
                </p>
              </div>
              <Switch
                id="proposal-escalated-only-filter"
                checked={draft.escalatedOnly}
                onCheckedChange={(checked) => patchDraft({ escalatedOnly: checked })}
                data-testid="switch-proposal-escalated-only-filter"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={handleClear} data-testid="button-clear-proposal-filters">
              Clear
            </Button>
            <Button size="sm" onClick={handleApply} data-testid="button-apply-proposal-filters">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentSessionPickerModal
        open={sessionPickerOpen}
        onOpenChange={setSessionPickerOpen}
        sessions={sessions}
        value={draft.agentSessionId}
        onSelect={(next) => patchDraft({ agentSessionId: next })}
        formatRelative={formatRelative}
        includeUnscoped={false}
      />
    </>
  );
}
