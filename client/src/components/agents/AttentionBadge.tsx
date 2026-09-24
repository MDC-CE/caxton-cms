import { useState, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AttentionBadgeKind = "awaiting_rereview" | "no_feedback";

type AttentionBadgeProps = {
  attention: AttentionBadgeKind;
  /** Resolved blocker count — shown on Ready for re-check when > 0. */
  resolvedBlockerCount?: number;
  /** When true, stop click from bubbling (e.g. badge inside a list card Link). */
  stopLinkNavigation?: boolean;
  className?: string;
  /** Suffix for test ids — list uses `-${id}`. */
  testIdSuffix?: string;
};

const COPY: Record<
  AttentionBadgeKind,
  {
    label: string;
    title: string;
    body: string;
    advanced: string[];
    variant: "secondary" | "outline";
  }
> = {
  awaiting_rereview: {
    label: "Ready for re-check",
    title: "Reviewers should look again",
    body: "Blockers are cleared, or the author rewrote this proposal / marked a blocker fixed, and nothing is still waiting on the author. Open it and decide Approve, Reject, or leave a new needs-change note.",
    advanced: [
      "Derived triage only — not a stored status. Open blockers still win and show as Waiting on author instead.",
      "An author rewrite after the last reviewer action also lands here until someone reviews again.",
    ],
    variant: "secondary",
  },
  no_feedback: {
    label: "No feedback yet",
    title: "First-pass review still needed",
    body: "Nobody has left a needs-change note or other reviewer action since this was filed. It is waiting for a first look — Approve, Reject, or leave feedback.",
    advanced: [
      "Derived triage only — not a stored status. Escalated holds and open blockers take priority over this chip.",
      "Once someone leaves feedback or the author rewrites after review, this chip is replaced by Ready for re-check or Waiting on author.",
    ],
    variant: "outline",
  },
};

export function AttentionBadge({
  attention,
  resolvedBlockerCount = 0,
  stopLinkNavigation = false,
  className,
  testIdSuffix = "",
}: AttentionBadgeProps) {
  const [advanced, setAdvanced] = useState(false);
  const copy = COPY[attention];

  const onTriggerClick = stopLinkNavigation
    ? (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      }
    : undefined;

  const label =
    attention === "awaiting_rereview" && resolvedBlockerCount > 0
      ? `${copy.label} (${resolvedBlockerCount})`
      : copy.label;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0"
          data-testid={`badge-attention-${attention}${testIdSuffix}`}
          aria-label={`${label} — what this means`}
          onClick={onTriggerClick}
        >
          <Badge
            variant={copy.variant}
            className={cn("cursor-pointer font-normal hover-elevate", className)}
          >
            {label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-3 text-sm"
        align="start"
        data-testid={`popover-attention-${attention}${testIdSuffix}`}
        onClick={onTriggerClick}
      >
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="text-muted-foreground leading-5">{copy.body}</p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          data-testid={`button-attention-${attention}-advanced${testIdSuffix}`}
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Hide advanced" : "Read more (advanced)"}
        </button>
        {advanced ? (
          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground leading-5">
            {copy.advanced.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
