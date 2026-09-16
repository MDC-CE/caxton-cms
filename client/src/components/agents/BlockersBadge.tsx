import { useState, type MouseEvent } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type BlockersBadgeProps = {
  count: number;
  /** When true, stop click from bubbling (e.g. badge inside a list card Link). */
  stopLinkNavigation?: boolean;
  className?: string;
  /** Suffix for test ids — detail uses none; list uses `-${id}`. */
  testIdSuffix?: string;
  /** List cards say “blocker(s)”; detail header says “needs changes”. */
  labelMode?: "blockers" | "needs_changes";
};

export function BlockersBadge({
  count,
  stopLinkNavigation = false,
  className,
  testIdSuffix = "",
  labelMode = "blockers",
}: BlockersBadgeProps) {
  const [advanced, setAdvanced] = useState(false);

  if (count <= 0) return null;

  const onTriggerClick = stopLinkNavigation
    ? (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      }
    : undefined;

  const label =
    labelMode === "needs_changes"
      ? `${count} needs changes`
      : `${count} blocker${count === 1 ? "" : "s"}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0"
          data-testid={`badge-proposal-blockers${testIdSuffix}`}
          aria-label={`${label} — what this means`}
          onClick={onTriggerClick}
        >
          <Badge
            variant="destructive"
            className={cn("cursor-pointer gap-1 font-normal", className)}
          >
            <IconAlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            {label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-3 text-sm"
        align="start"
        data-testid={`popover-proposal-blockers${testIdSuffix}`}
        onClick={onTriggerClick}
      >
        <p className="font-medium text-foreground">Needs changes before approve</p>
        <p className="text-muted-foreground leading-5">
          {count === 1
            ? "Someone left one open change request on this proposal."
            : `Someone left ${count} open change requests on this proposal.`}{" "}
          Approve (and Accept for ideas) stay blocked until each request is marked resolved.
          Reject and withdraw still work.
        </p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          data-testid={`button-blockers-advanced${testIdSuffix}`}
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Hide advanced" : "Read more (advanced)"}
        </button>
        {advanced ? (
          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground leading-5">
            <p>
              Open blockers block apply / accept only — reject, withdraw, and close still succeed.
            </p>
            <p>
              Clearing a blocker does not ship the proposal; re-preview, then Approve with four-eyes.
            </p>
            <p>
              Only the active claimant resolves a blocker; reviewers can reopen one after it was
              cleared.
            </p>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
