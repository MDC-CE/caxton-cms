import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import {
  PROPOSAL_ACTOR_TYPE_OPTIONS,
  PROPOSAL_KIND_OPTIONS,
  PROPOSAL_STATUS_OPTIONS,
  type ProposalListActorType,
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
>;

const ROLE_ANY = "__any__";

function dimsFromFilters(filters: ProposalListFilters): ProposalListFilterDims {
  return {
    status: filters.status,
    kind: filters.kind,
    proposerUsername: filters.proposerUsername,
    proposerActorType: filters.proposerActorType,
    proposerActorRole: filters.proposerActorRole,
    agentSessionId: filters.agentSessionId,
    escalatedOnly: filters.escalatedOnly,
  };
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
  ]);

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

  const roleSelectValue = draft.proposerActorRole.trim() || ROLE_ANY;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="dialog-proposal-filters">
        <DialogHeader>
          <DialogTitle>Filters</DialogTitle>
          <DialogDescription>
            Narrow which proposals appear in the list by status, kind, or who filed them. Nothing is
            written until someone acts on a proposal. Sort stays on the Sort control next to Filters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
          <div className="space-y-1">
            <Label htmlFor="proposal-proposer-username-filter" className="text-xs text-muted-foreground">
              Proposer
            </Label>
            <Input
              id="proposal-proposer-username-filter"
              className="h-8 text-sm"
              placeholder="Exact email or username"
              value={draft.proposerUsername}
              onChange={(e) => patchDraft({ proposerUsername: e.target.value })}
              data-testid="input-proposal-proposer-username-filter"
            />
            <p className="text-[11px] text-muted-foreground">
              Exact match (not partial). Copy from a proposal card.
            </p>
          </div>
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
          <div className="space-y-1">
            <Label htmlFor="proposal-session-filter" className="text-xs text-muted-foreground">
              Agent session
            </Label>
            <Input
              id="proposal-session-filter"
              className="h-8 text-sm font-mono"
              placeholder="Session id (exact)"
              value={draft.agentSessionId}
              onChange={(e) => patchDraft({ agentSessionId: e.target.value })}
              data-testid="input-proposal-session-filter"
            />
            <p className="text-[11px] text-muted-foreground">
              Staff-filed proposals usually have no session and will not match.
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
  );
}
