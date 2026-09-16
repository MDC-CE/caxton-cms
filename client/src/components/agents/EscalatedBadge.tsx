import { useState, type MouseEvent } from "react";
import { IconFlame } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type EscalatedBadgeProps = {
  /** When true, stop click from bubbling (e.g. badge inside a list card Link). */
  stopLinkNavigation?: boolean;
  className?: string;
  /** Suffix for test ids — detail uses none; list uses `-${id}`. */
  testIdSuffix?: string;
};

export function EscalatedBadge({
  stopLinkNavigation = false,
  className,
  testIdSuffix = "",
}: EscalatedBadgeProps) {
  const [advanced, setAdvanced] = useState(false);

  const onTriggerClick = stopLinkNavigation
    ? (e: MouseEvent) => {
        e.stopPropagation();
      }
    : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0"
          data-testid={`badge-proposal-escalated${testIdSuffix}`}
          aria-label="Escalated — what this means"
          onClick={onTriggerClick}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer gap-1 font-normal border-status-busy/40 text-status-busy hover-elevate",
              className,
            )}
          >
            <IconFlame className="h-3 w-3 shrink-0 text-status-busy" aria-hidden />
            Escalated
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-3 text-sm"
        align="start"
        data-testid={`popover-proposal-escalated${testIdSuffix}`}
        onClick={onTriggerClick}
      >
        <p className="font-medium text-foreground">Agent work is paused</p>
        <p className="text-muted-foreground leading-5">
          A steward put a hold on this proposal. Agents cannot claim, add blockers, or decide again
          until a steward releases it. Staff can still Approve, Reject, or clear needs-change notes.
          Open blockers still block Approve until someone resolves them.
        </p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          data-testid={`button-escalated-advanced${testIdSuffix}`}
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Hide advanced" : "Read more (advanced)"}
        </button>
        {advanced ? (
          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground leading-5">
            <p>
              Escalated is a flag on top of Open/Partial — the proposal status does not change.
            </p>
            <p>
              MCP agents fail every update while the flag is on; staff UI actions still work.
            </p>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
