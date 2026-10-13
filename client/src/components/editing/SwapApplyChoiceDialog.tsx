import React from "react";
import { Check, Loader2 } from "lucide-react";
import { IconLink } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SolveWithAiAgentDropdown,
  type SolveWithAiAgentSelectPayload,
} from "@/components/DebugBubble/SolveWithAiAgentDropdown";

export interface SwapApplyChoiceOptionsProps {
  prompt: string;
  entryKey?: string;
  isConfirming?: boolean;
  isBound?: boolean;
  boundSiblingCount?: number;
  isSharedTemplate?: boolean;
  onUseSample: () => void;
  onAgentSelect: (payload: SolveWithAiAgentSelectPayload) => void;
  index: number;
}

export function formatBoundAgentReason(boundSiblingCount: number): string {
  const pages = boundSiblingCount === 1 ? "page" : "pages";
  return `This section is synced to ${boundSiblingCount} other ${pages}. Use sample text, or unbind it first.`;
}

export const SHARED_TEMPLATE_AGENT_NOTE =
  "This section is shared by other pages; the agent will ask before saving.";

export function SwapApplyChoiceOptions({
  prompt,
  entryKey,
  isConfirming = false,
  isBound = false,
  boundSiblingCount = 0,
  isSharedTemplate = false,
  onUseSample,
  onAgentSelect,
  index,
}: SwapApplyChoiceOptionsProps) {
  return (
    <div className="space-y-3" data-testid={`swap-apply-choice-${index}`}>
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Use sample text</p>
          <p className="text-sm text-muted-foreground">
            Swaps now. The section shows the example&apos;s text and you edit it afterwards.
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onUseSample}
            disabled={isConfirming}
            data-testid={`button-swap-use-sample-${index}`}
          >
            {isConfirming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Use sample text
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Ask an AI agent to move my text</p>
          <p className="text-sm text-muted-foreground">
            Nothing changes yet. Your agent proposes how your current text fits the new layout,
            and saves only after you approve.
          </p>
          {isBound ? (
            <p
              className="flex items-start gap-1.5 text-xs text-muted-foreground pt-1"
              data-testid={`text-swap-agent-bound-${index}`}
            >
              <IconLink className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
              {formatBoundAgentReason(boundSiblingCount)}
            </p>
          ) : isSharedTemplate ? (
            <p
              className="text-xs text-muted-foreground pt-1"
              data-testid={`text-swap-agent-shared-${index}`}
            >
              {SHARED_TEMPLATE_AGENT_NOTE}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <SolveWithAiAgentDropdown
            label="Ask AI agent"
            prompt={prompt}
            disabled={isBound || isConfirming}
            size="sm"
            buttonVariant="outline"
            entryKey={entryKey}
            testId={`swap-ai-agent-${index}`}
            onAgentSelect={onAgentSelect}
          />
        </div>
      </div>
    </div>
  );
}

export interface SwapApplyChoiceDialogProps extends SwapApplyChoiceOptionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "two_column v1.0 / Showcase" */
  targetLabel: string;
}

export function SwapApplyChoiceDialog({
  open,
  onOpenChange,
  targetLabel,
  ...optionsProps
}: SwapApplyChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid={`dialog-swap-apply-choice-${optionsProps.index}`}
      >
        <DialogHeader>
          <DialogTitle>How do you want to apply this layout?</DialogTitle>
          <DialogDescription>{targetLabel}</DialogDescription>
        </DialogHeader>
        <SwapApplyChoiceOptions {...optionsProps} />
      </DialogContent>
    </Dialog>
  );
}
