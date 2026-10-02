import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AdsCheckPlatform, AdsRunInfo } from "@shared/ads-issues";
import { formatWhen } from "@/components/ads/ads-format";
import { postAdsAction } from "@/components/diagnostics/ads-actions";

const PLATFORM_LABEL: Record<AdsCheckPlatform, string> = { meta: "Meta", google: "Google Ads" };

/** Refetch cadence while a Run or Re-check is in flight. */
export function adsRunPollMs(run: AdsRunInfo | undefined): number | false {
  return run && run.active.length > 0 ? 4000 : false;
}

/** Run checks button + last check status. Opening the page never runs checks. */
export function AdsRunBar({ run, onChanged, testIdPrefix }: { run: AdsRunInfo; onChanged: () => void; testIdPrefix: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const running = run.active.find((j) => j.kind === "run");
  const syncBusy = run.busy?.code === "ads_sync_active";

  async function start() {
    setStarting(true);
    try {
      await postAdsAction("run", {});
      toast({ title: "Checks started", description: "This takes a minute or two. Issues update when it finishes." });
      void queryClient.invalidateQueries({ queryKey: ["/api/diagnostics/ads"] });
      onChanged();
    } catch (err) {
      toast({ title: "Couldn't start checks", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-card px-4 py-3 text-sm" data-testid={`${testIdPrefix}-run-bar`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-foreground" data-testid={`${testIdPrefix}-run-status`}>
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your ads… issues update when it finishes.
              </span>
            ) : run.never_run ? (
              "No checks have run yet, so no issues are listed."
            ) : (
              `Issues last checked ${formatWhen(run.last_run?.finished_at ?? null)}.`
            )}
          </p>
          <p className="text-xs text-muted-foreground">Opening this page shows the last check. Sync updates the numbers; Run checks updates the issues.</p>
        </div>
        <Button
          size="sm"
          onClick={start}
          disabled={starting || !!running || syncBusy}
          title={syncBusy ? run.busy?.message : running ? "A check is already running" : undefined}
          data-testid={`${testIdPrefix}-run-checks`}
        >
          {starting || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run checks
        </Button>
      </div>

      {syncBusy && !running && <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-run-sync-busy`}>{run.busy?.message}</p>}

      {run.last_run?.skipped.map((s) => (
        <p key={s.platform} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400" data-testid={`${testIdPrefix}-run-skipped-${s.platform}`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {PLATFORM_LABEL[s.platform]} wasn&apos;t checked last time ({s.reason}). Its issues are from an earlier check — not fixed, just not checked again.
        </p>
      ))}

      {run.last_failed && (
        <p className={cn("flex items-start gap-1.5 text-xs text-destructive")} data-testid={`${testIdPrefix}-run-failed`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The last {run.last_failed.kind === "run" ? "check" : "Re-check"} didn&apos;t finish: {run.last_failed.error}
        </p>
      )}

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-foreground" data-testid={`${testIdPrefix}-run-advanced`}>
          Read more (advanced)
          <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <p>
            Run checks looks at the last 28 days for every connected platform in a background worker and saves the issues. A platform it can&apos;t
            reach keeps its earlier issues. Marks, undos and Re-checks made after a Run started always win over that Run.
          </p>
          <p>
            Each check confirms a fix one of three ways: right away (<span className="font-mono">instant</span>, use Re-check), after the next Sync of
            that platform (<span className="font-mono">after_sync</span>), or after a few days of new data (<span className="font-mono">fresh_days</span>
            , counted from the first full day after you mark it, in the ad account&apos;s time zone, and only once there are enough clicks or spend).
            Pending issues can reopen early if the problem is still there; they never close early.
          </p>
          <p>
            Ads with the same problem are grouped at the highest level they fully cover (account → campaign → ad set → ad). The list shows the top
            50 ads by spend; the full list of ad ids is kept on the issue. Small Re-checks run in the job queue; accounts or more than 50 ads use the
            same background worker as Run checks.
          </p>
          <p>
            Landing pages are checked against the site&apos;s own pages and redirects (no web requests). Coming soon: errors real visitors hit on
            ad landings, and a watchlist for pages outside this site.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
