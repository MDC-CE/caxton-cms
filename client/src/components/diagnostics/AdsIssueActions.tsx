import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CircleSlash, Clock, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AdsIssueRow } from "@shared/ads-issues";
import { formatNum, formatWhen } from "@/components/ads/ads-format";
import { postAdsAction } from "@/components/diagnostics/ads-actions";

const NOTE_STYLE: Record<NonNullable<AdsIssueRow["last_check"]>["outcome"], string> = {
  partly_fixed: "border-chart-3/40 bg-chart-3/10",
  couldnt_check: "border-amber-500/40 bg-amber-500/10",
  still_open: "border-border bg-muted/40",
  reopened_early: "border-amber-500/40 bg-amber-500/10",
};

/** Small state chips next to the issue title (pending / queued / not checked / partly fixed). */
export function AdsIssueStateBadges({ issue }: { issue: AdsIssueRow }) {
  const v = issue.verify;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {v.state === "pending" && (
        <Badge variant="outline" className="gap-1 border-sky-500/50 px-1.5 py-0 text-[10px] font-medium text-sky-600 dark:text-sky-400" data-testid={`ads-issue-pending-${issue.id}`}>
          <Clock className="h-3 w-3" />
          {v.ready_to_verify ? "Ready to confirm" : "Pending"}
        </Badge>
      )}
      {issue.recheck_queued && (
        <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground" data-testid={`ads-issue-queued-${issue.id}`}>
          <Loader2 className="h-3 w-3 animate-spin" /> Re-check queued
        </Badge>
      )}
      {issue.not_checked && (
        <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal text-amber-600 dark:text-amber-400" data-testid={`ads-issue-not-checked-${issue.id}`}>
          <CircleSlash className="h-3 w-3" /> Not checked
        </Badge>
      )}
      {issue.in_grace && (
        <Badge
          variant="outline"
          className="gap-1 border-sky-500/40 px-1.5 py-0 text-[10px] font-normal text-sky-600 dark:text-sky-400"
          title="Uses a value from before the UTM convention changed. It's accepted until the grace period ends, then flagged normally."
          data-testid={`ads-issue-grace-${issue.id}`}
        >
          <Clock className="h-3 w-3" />
          Old convention{issue.grace_ends_at ? ` · until ${issue.grace_ends_at.slice(0, 10)}` : ""}
        </Badge>
      )}
      {issue.last_check?.outcome === "partly_fixed" && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-chart-3" data-testid={`ads-issue-partly-${issue.id}`}>
          Partly fixed
        </Badge>
      )}
    </span>
  );
}

function MarkFixedButton({ issue, onDone }: { issue: AdsIssueRow; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const out = await postAdsAction<{ verify: AdsIssueRow["verify"] }>("mark-fixed", { issue_id: issue.id, ...(note.trim() ? { report: note.trim() } : {}) });
      toast({ title: "Marked as fixed", description: `${out.verify.label}. It stays in the list until it's confirmed.` });
      setOpen(false);
      onDone();
    } catch (err) {
      toast({ title: "Couldn't mark as fixed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" className="h-7 text-xs" data-testid={`button-ads-mark-fixed-${issue.id}`}>
          <CheckCheck className="h-3.5 w-3.5" /> Mark as fixed
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-xs" data-testid={`popover-ads-mark-fixed-${issue.id}`}>
        <p className="font-medium text-foreground">Mark as fixed?</p>
        <p className="text-muted-foreground">
          The issue stays listed as pending while new data comes in. If the problem is gone it closes on its own; if it&apos;s still there it
          reopens. Nothing changes in your ad accounts.
        </p>
        <Input
          value={note}
          maxLength={500}
          placeholder="What did you change? (optional)"
          className="h-8 text-xs"
          onChange={(e) => setNote(e.target.value)}
          data-testid={`input-ads-mark-fixed-note-${issue.id}`}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={save} data-testid={`button-ads-mark-fixed-confirm-${issue.id}`}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Mark as fixed
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Dated evidence line, check notes and the Re-check / Mark as fixed / Undo controls for one issue. */
export function AdsIssueVerifyPanel({ issue, onChanged }: { issue: AdsIssueRow; onChanged: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"recheck" | "undo" | null>(null);
  const v = issue.verify;
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/diagnostics/ads"] });
    onChanged();
  };

  async function run(kind: "recheck" | "undo") {
    setBusy(kind);
    try {
      if (kind === "recheck") {
        await postAdsAction("recheck", { issue_id: issue.id });
        toast({ title: "Re-check queued", description: "Usually done within a few seconds." });
      } else {
        await postAdsAction("undo", { issue_id: issue.id });
        toast({ title: "Back to open" });
      }
      done();
    } catch (err) {
      toast({ title: kind === "recheck" ? "Couldn't re-check" : "Couldn't undo", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const progress = v.progress;
  const pct = progress && progress.needed > 0 ? Math.min(100, Math.round((progress.value / progress.needed) * 100)) : null;

  return (
    <div className="space-y-2" data-testid={`ads-issue-verify-${issue.id}`}>
      <p className="text-xs text-muted-foreground" data-testid={`ads-issue-measured-${issue.id}`}>
        Numbers are for the {issue.window.days} days {issue.window.start} → {issue.window.end}, as of the check on {formatWhen(issue.measured_at)}.
      </p>

      {issue.last_check && (
        <p className={cn("rounded-md border px-2 py-1.5 text-xs text-foreground", NOTE_STYLE[issue.last_check.outcome])} data-testid={`ads-issue-note-${issue.id}`}>
          {issue.last_check.message} <span className="text-muted-foreground">({formatWhen(issue.last_check.at)})</span>
        </p>
      )}

      {issue.not_checked && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-foreground">
          Not checked in the last run ({issue.not_checked.reason}). Last checked {formatWhen(issue.not_checked.last_checked_at)} — not fixed, just not
          checked again.
        </p>
      )}

      <div className="rounded-md border border-border bg-muted/30 px-2 py-2 text-xs">
        {v.state === "open" ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground">
              {v.action === "recheck"
                ? "This can be checked right away. Fix it, then press Re-check."
                : "This needs new data to confirm. After you fix it, mark it as fixed."}
            </p>
            {v.action === "recheck" ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={busy !== null || issue.recheck_queued}
                onClick={() => void run("recheck")}
                data-testid={`button-ads-recheck-${issue.id}`}
              >
                {busy === "recheck" || issue.recheck_queued ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Re-check
              </Button>
            ) : (
              <MarkFixedButton issue={issue} onDone={done} />
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground" data-testid={`ads-issue-verify-label-${issue.id}`}>
                {v.label}
              </p>
              <div className="flex gap-1.5">
                {v.ready_to_verify && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs"
                    disabled={busy !== null || issue.recheck_queued}
                    onClick={() => void run("recheck")}
                    data-testid={`button-ads-recheck-${issue.id}`}
                  >
                    {busy === "recheck" || issue.recheck_queued ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Re-check
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy !== null} onClick={() => void run("undo")} data-testid={`button-ads-undo-${issue.id}`}>
                  {busy === "undo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  Undo
                </Button>
              </div>
            </div>
            {progress && (progress.days_needed > 0 || progress.needed > 0) && (
              <div className="space-y-1 text-muted-foreground">
                {progress.days_needed > 0 && (
                  <p>
                    New days counted: {Math.min(progress.days_counted, progress.days_needed)} of {progress.days_needed}
                  </p>
                )}
                {progress.needed > 0 && progress.metric && (
                  <div>
                    <p>
                      {progress.waiting_for_spend ? "Waiting for spend on these ads" : `Data so far: ${formatNum(progress.value)} of ${formatNum(progress.needed)} ${progress.metric}`}
                    </p>
                    {pct != null && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
                        <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {v.verify_after && !v.ready_to_verify && <p className="text-muted-foreground">Earliest confirmation: {formatWhen(v.verify_after)}</p>}
            <p className="text-muted-foreground">
              Marked fixed {v.marked_at ? formatWhen(v.marked_at) : ""}
              {v.marked_by ? ` by ${v.marked_by}` : ""}
              {v.report ? ` — “${v.report}”` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
