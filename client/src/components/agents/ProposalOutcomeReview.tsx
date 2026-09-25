import { useState } from "react";
import { Bot } from "lucide-react";
import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SolveWithAiAgentDropdown,
  type SolveWithAiAgentSelectPayload,
} from "@/components/DebugBubble/SolveWithAiAgentDropdown";
import {
  buildProposalBadOutcomePrompt,
  type ProposalBadOutcomePromptInput,
  type SolveWithAiAgentId,
} from "@/components/DebugBubble/solveWithAiPrompt";
import { McpRequiredForAiModal } from "@/components/mcp/McpRequiredForAiModal";
import type { McpSetupTabId } from "@/components/mcp/mcpUrlHelpers";
import { CLOSE_NOTE_MIN } from "@/lib/proposalCloseReason";
import { minLengthHint } from "@/lib/minLengthHint";
import { cn } from "@/lib/utils";

export type OutcomeVerdict = "good" | "bad";

export type OutcomeHistoryEntry = {
  outcome: OutcomeVerdict;
  by: string | null;
  at: number | null;
  replaced_at: number;
  replaced_by: string;
  replaced_with: OutcomeVerdict | "cleared";
};

export type ProposalOutcomeFields = ProposalBadOutcomePromptInput & {
  outcome_review?: OutcomeVerdict | null;
  outcome_review_history?: OutcomeHistoryEntry[];
  outcome_lesson_captured_at?: number | null;
  outcome_lesson_captured_by?: string | null;
  outcome_lesson_note?: string | null;
};

export type OutcomeAction = "review_outcome" | "set_outcome_lesson";

export interface ProposalOutcomeReviewProps {
  proposal: ProposalOutcomeFields;
  isSteward: boolean;
  saving: boolean;
  onAction: (action: OutcomeAction, body: Record<string, unknown>, onSuccess?: () => void) => void;
}

const VERDICT_LABEL: Record<OutcomeVerdict, string> = {
  good: "Good outcome",
  bad: "Bad outcome",
};

function formatWhen(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleString() : "";
}

function DevLocalNotice() {
  if (!import.meta.env.DEV) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="text-outcome-dev-notice">
      Local reviews are overwritten by the next production refresh.
    </p>
  );
}

function OutcomeAdvanced() {
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        Read more (advanced)
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1 text-xs text-muted-foreground">
        <p>
          The review is stored on the proposal with a history of earlier verdicts, and each change
          is logged as an audit event. Only Platform Stewards can set or clear it.
        </p>
        <p>
          Agents can read outcome_review fields via MCP (list_proposals), but they are not warned by
          it and other proposals are not affected.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ProposalOutcomeReview({
  proposal: p,
  isSteward,
  saving,
  onAction,
}: ProposalOutcomeReviewProps) {
  const verdict = p.outcome_review ?? null;
  const [goodOpen, setGoodOpen] = useState(false);
  const [goodNote, setGoodNote] = useState("");
  const [badOpen, setBadOpen] = useState(false);
  const [badNote, setBadNote] = useState("");
  const [badExpected, setBadExpected] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonNote, setLessonNote] = useState("");

  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpTab, setMcpTab] = useState<McpSetupTabId>("cursor");
  const [mcpAgentId, setMcpAgentId] = useState<SolveWithAiAgentId>("copy-prompt");
  const [mcpAgentLabel, setMcpAgentLabel] = useState("AI Agent");
  const [mcpPrompt, setMcpPrompt] = useState("");
  const [mcpPrefill, setMcpPrefill] = useState<string | undefined>();

  if (!verdict && !isSteward) return null;

  const badNoteHint = minLengthHint(badNote, CLOSE_NOTE_MIN);
  const badExpectedHint = minLengthHint(badExpected, CLOSE_NOTE_MIN);
  const badOk = badNoteHint.ok && badExpectedHint.ok;
  const history = p.outcome_review_history ?? [];
  const lastChange = history.length ? history[history.length - 1] : undefined;
  const changedFrom =
    verdict && lastChange && lastChange.replaced_with === verdict && lastChange.outcome !== verdict
      ? lastChange
      : null;
  const lessonCaptured = verdict === "bad" && p.outcome_lesson_captured_at != null;

  function openGood() {
    setGoodNote(verdict === "good" ? (p.outcome_review_note ?? "") : "");
    setGoodOpen(true);
  }

  function openBad() {
    setBadNote(verdict === "bad" ? (p.outcome_review_note ?? "") : "");
    setBadExpected(verdict === "bad" ? (p.outcome_review_expected ?? "") : "");
    setBadOpen(true);
  }

  function openAskAgent(payload: SolveWithAiAgentSelectPayload) {
    setMcpAgentId(payload.agentId);
    setMcpTab(payload.setupTab);
    setMcpAgentLabel(payload.label);
    setMcpPrompt(payload.prompt);
    setMcpPrefill(payload.prefillUrlPrefix);
    setMcpOpen(true);
  }

  return (
    <div data-testid="section-proposal-outcome">
      {!verdict ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-3">
          <p className="text-sm font-medium text-foreground">Was this the right call?</p>
          <p className="text-sm text-muted-foreground">
            Marking a bad outcome records what should have happened so Cursor can help plan
            improvements. This doesn&apos;t reopen or change the proposal.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="border-status-online/40 text-status-online"
              onClick={openGood}
              disabled={saving}
              data-testid="button-outcome-good"
            >
              <IconThumbUp className="h-4 w-4" aria-hidden />
              Good outcome
            </Button>
            <Button
              variant="outline"
              className="border-status-busy/40 text-status-busy"
              onClick={openBad}
              disabled={saving}
              data-testid="button-outcome-bad"
            >
              <IconThumbDown className="h-4 w-4" aria-hidden />
              Bad outcome
            </Button>
          </div>
          <OutcomeAdvanced />
        </div>
      ) : (
        <div
          className={cn(
            "space-y-2 rounded-md border px-3 py-3 text-sm",
            verdict === "good"
              ? "border-status-online/30 bg-status-online/5"
              : "border-status-busy/30 bg-status-busy/5",
          )}
          data-testid="banner-proposal-outcome"
          data-outcome={verdict}
        >
          <div className="flex flex-wrap items-center gap-2">
            {verdict === "good" ? (
              <IconThumbUp className="h-4 w-4 text-status-online" aria-hidden />
            ) : (
              <IconThumbDown className="h-4 w-4 text-status-busy" aria-hidden />
            )}
            <p
              className={cn(
                "font-medium",
                verdict === "good" ? "text-status-online" : "text-status-busy",
              )}
            >
              {VERDICT_LABEL[verdict]}
            </p>
            <span className="text-xs text-muted-foreground" data-testid="text-outcome-reviewed-by">
              {p.outcome_review_by ?? "unknown"}
              {p.outcome_review_at ? ` · ${formatWhen(p.outcome_review_at)}` : ""}
            </span>
          </div>
          {changedFrom ? (
            <p className="text-xs text-muted-foreground" data-testid="text-outcome-changed-from">
              Changed from {VERDICT_LABEL[changedFrom.outcome]}
              {changedFrom.by ? ` (set by ${changedFrom.by})` : ""}
            </p>
          ) : null}
          {p.outcome_review_note ? (
            <p data-testid="text-outcome-note">
              <span className="font-medium">
                {verdict === "bad" ? "What went wrong: " : "Note: "}
              </span>
              {p.outcome_review_note}
            </p>
          ) : null}
          {verdict === "bad" && p.outcome_review_expected ? (
            <p data-testid="text-outcome-expected">
              <span className="font-medium">What should have happened: </span>
              {p.outcome_review_expected}
            </p>
          ) : null}

          {verdict === "bad" ? (
            <div
              className="space-y-1 rounded-md border border-border bg-background/40 px-3 py-2"
              data-testid="panel-outcome-lesson"
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  id="outcome-lesson-captured"
                  checked={lessonCaptured}
                  disabled={!isSteward || saving}
                  onCheckedChange={(next) => {
                    if (next === true) {
                      setLessonNote("");
                      setLessonOpen(true);
                    } else {
                      onAction("set_outcome_lesson", { outcome_lesson_captured: false });
                    }
                  }}
                  data-testid="checkbox-outcome-lesson"
                />
                <Label htmlFor="outcome-lesson-captured" className="text-sm">
                  Lesson captured
                </Label>
              </div>
              {lessonCaptured ? (
                <p className="text-xs text-muted-foreground" data-testid="text-outcome-lesson">
                  Lesson captured by {p.outcome_lesson_captured_by ?? "unknown"}
                  {p.outcome_lesson_captured_at
                    ? ` on ${formatWhen(p.outcome_lesson_captured_at)}`
                    : ""}
                  {p.outcome_lesson_note ? ` — ${p.outcome_lesson_note}` : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Tick once the fix (rule, checklist, prompt) has landed.
                </p>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {verdict === "bad" ? (
              <SolveWithAiAgentDropdown
                label="Discuss with agent"
                icon={Bot}
                prompt={buildProposalBadOutcomePrompt(p)}
                buttonVariant="outline"
                size="sm"
                testId="discuss-outcome"
                onAgentSelect={openAskAgent}
              />
            ) : null}
            {isSteward ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={verdict === "good" ? openBad : openGood}
                  disabled={saving}
                  data-testid="button-outcome-change"
                >
                  {verdict === "good" ? "Change to bad outcome" : "Change to good outcome"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={verdict === "good" ? openGood : openBad}
                  disabled={saving}
                  data-testid="button-outcome-edit"
                >
                  Edit notes
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setClearOpen(true)}
                  disabled={saving}
                  data-testid="button-outcome-clear"
                >
                  Clear review
                </Button>
              </>
            ) : null}
          </div>
          <OutcomeAdvanced />
        </div>
      )}

      <Dialog open={goodOpen} onOpenChange={setGoodOpen}>
        <DialogContent data-testid="dialog-outcome-good">
          <DialogHeader>
            <DialogTitle>Good outcome</DialogTitle>
            <DialogDescription>
              Confirms this proposal ended the way it should have. The proposal itself does not
              change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="outcome-good-note">Note (optional)</Label>
            <Textarea
              id="outcome-good-note"
              value={goodNote}
              onChange={(e) => setGoodNote(e.target.value)}
              rows={3}
              placeholder="What went well, if worth remembering."
              data-testid="input-outcome-good-note"
            />
          </div>
          <DevLocalNotice />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoodOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() =>
                onAction(
                  "review_outcome",
                  { outcome_review: "good", outcome_review_note: goodNote.trim() },
                  () => setGoodOpen(false),
                )
              }
              data-testid="button-confirm-outcome-good"
            >
              Save good outcome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={badOpen} onOpenChange={setBadOpen}>
        <DialogContent data-testid="dialog-outcome-bad">
          <DialogHeader>
            <DialogTitle>Bad outcome</DialogTitle>
            <DialogDescription>
              Describe what went wrong and what should have happened, so Cursor can help plan how to
              avoid it next time. The proposal itself does not change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="outcome-bad-note">What went wrong (min {CLOSE_NOTE_MIN})</Label>
              <Textarea
                id="outcome-bad-note"
                value={badNote}
                onChange={(e) => setBadNote(e.target.value)}
                rows={4}
                placeholder="What happened with this proposal that should not have."
                data-testid="input-outcome-bad-note"
              />
              {badNote.trim().length > 0 ? (
                <p className={badNoteHint.className}>{badNoteHint.text}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="outcome-bad-expected">
                What should have happened instead? (min {CLOSE_NOTE_MIN})
              </Label>
              <Textarea
                id="outcome-bad-expected"
                value={badExpected}
                onChange={(e) => setBadExpected(e.target.value)}
                rows={4}
                placeholder="The decision or result you would have expected."
                data-testid="input-outcome-bad-expected"
              />
              {badExpected.trim().length > 0 ? (
                <p className={badExpectedHint.className}>{badExpectedHint.text}</p>
              ) : null}
            </div>
          </div>
          <DevLocalNotice />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBadOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving || !badOk}
              onClick={() =>
                onAction(
                  "review_outcome",
                  {
                    outcome_review: "bad",
                    outcome_review_note: badNote.trim(),
                    outcome_review_expected: badExpected.trim(),
                  },
                  () => setBadOpen(false),
                )
              }
              data-testid="button-confirm-outcome-bad"
            >
              Save bad outcome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lessonOpen} onOpenChange={setLessonOpen}>
        <DialogContent data-testid="dialog-outcome-lesson">
          <DialogHeader>
            <DialogTitle>Lesson captured</DialogTitle>
            <DialogDescription>
              Marks that the fix for this bad outcome has landed. It drops out of the &quot;needs
              lesson&quot; filter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="outcome-lesson-note">What changed (optional)</Label>
            <Textarea
              id="outcome-lesson-note"
              value={lessonNote}
              onChange={(e) => setLessonNote(e.target.value)}
              rows={3}
              placeholder="e.g. Added a rule, checklist item, or PR link."
              data-testid="input-outcome-lesson-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLessonOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() =>
                onAction(
                  "set_outcome_lesson",
                  { outcome_lesson_captured: true, outcome_lesson_note: lessonNote.trim() },
                  () => setLessonOpen(false),
                )
              }
              data-testid="button-confirm-outcome-lesson"
            >
              Mark lesson captured
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent data-testid="dialog-outcome-clear">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear outcome review?</AlertDialogTitle>
            <AlertDialogDescription>
              The proposal goes back to not reviewed. The cleared verdict stays in the history and
              audit log. The proposal itself does not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={saving}
              onClick={() =>
                onAction("review_outcome", { outcome_review: "clear" }, () => setClearOpen(false))
              }
              data-testid="button-confirm-outcome-clear"
            >
              Clear review
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <McpRequiredForAiModal
        open={mcpOpen}
        onOpenChange={setMcpOpen}
        defaultTab={mcpTab}
        agentId={mcpAgentId}
        agentLabel={mcpAgentLabel}
        prompt={mcpPrompt}
        prefillUrlPrefix={mcpPrefill}
      />
    </div>
  );
}
