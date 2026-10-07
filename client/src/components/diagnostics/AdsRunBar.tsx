import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Info, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AdsCheckPlatform, AdsRunInfo } from "@shared/ads-issues";
import { formatWhen } from "@/components/ads/ads-format";
import { postAdsAction } from "@/components/diagnostics/ads-actions";

const PLATFORM_LABEL: Record<AdsCheckPlatform, string> = { meta: "Meta", google: "Google Ads" };

export const RUN_CHECKS_INTRO = "Opening this page shows the last check. Run checks looks again; Sync only updates the other numbers.";

/** Refetch cadence while a Run or Re-check is in flight. */
export function adsRunPollMs(run: AdsRunInfo | undefined): number | false {
  return run && run.active.length > 0 ? 4000 : false;
}

/** Open-issues count, or "—" before the first check so 0 doesn't read as healthy. */
export function adsIssuesValue(run: AdsRunInfo, count: number): string {
  return run.never_run ? "—" : String(count);
}

function useRunChecks(run: AdsRunInfo, onChanged: () => void) {
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

  return { start, starting, running, syncBusy };
}

export function RunChecksButton({ run, onChanged, testIdPrefix, variant = "button" }: { run: AdsRunInfo; onChanged: () => void; testIdPrefix: string; variant?: "button" | "link" }) {
  const { start, starting, running, syncBusy } = useRunChecks(run, onChanged);
  const busy = starting || !!running;
  const props = {
    onClick: start,
    disabled: busy || syncBusy,
    title: syncBusy ? run.busy?.message : running ? "A check is already running" : undefined,
    "data-testid": `${testIdPrefix}-run-checks`,
  };
  if (variant === "link") {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        {...props}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        Run checks
      </button>
    );
  }
  return (
    <Button size="sm" className="h-7 px-2.5 text-xs" {...props}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      Run checks
    </Button>
  );
}

/** Sync-busy, skipped-platform and failed-run notes. Renders nothing when there is nothing to say. */
export function RunNotes({ run, testIdPrefix, className }: { run: AdsRunInfo; testIdPrefix: string; className?: string }) {
  const running = run.active.find((j) => j.kind === "run");
  const syncBusy = run.busy?.code === "ads_sync_active" && !running;
  const skipped = run.last_run?.skipped ?? [];
  if (!syncBusy && skipped.length === 0 && !run.last_failed) return null;
  return (
    <div className={cn("space-y-1", className)}>
      {syncBusy && <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-run-sync-busy`}>{run.busy?.message}</p>}

      {skipped.map((s) => (
        <p key={s.platform} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400" data-testid={`${testIdPrefix}-run-skipped-${s.platform}`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {PLATFORM_LABEL[s.platform]} wasn&apos;t checked last time ({s.reason}). Its issues are from an earlier check — not fixed, just not checked again.
        </p>
      ))}

      {run.last_failed && (
        <p className="flex items-start gap-1.5 text-xs text-destructive" data-testid={`${testIdPrefix}-run-failed`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The last {run.last_failed.kind === "run" ? "check" : "Re-check"} didn&apos;t finish: {run.last_failed.error}
        </p>
      )}
    </div>
  );
}

/** "last N days · checked X" line under an Open issues count. */
export function AdsRunStatus({ run, windowDays, testIdPrefix }: { run: AdsRunInfo; windowDays: number; testIdPrefix: string }) {
  const running = run.active.find((j) => j.kind === "run");
  return (
    <span data-testid={`${testIdPrefix}-run-status`}>
      {running ? (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking your ads…
        </span>
      ) : run.never_run ? (
        "Not checked yet"
      ) : (
        `last ${windowDays} days · checked ${formatWhen(run.last_run?.finished_at ?? null)}`
      )}
    </span>
  );
}

export function RunAdvanced() {
  return (
    <>
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
    </>
  );
}

/** Collapsible "Read more (advanced)" with {@link RunAdvanced}, for dialogs. */
export function RunAdvancedCollapsible({ testIdPrefix }: { testIdPrefix: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-foreground" data-testid={`${testIdPrefix}-run-advanced`}>
        Read more (advanced)
        <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5">
        <RunAdvanced />
      </CollapsibleContent>
    </Collapsible>
  );
}

function RunInfoPopover({ label, intro, testIdPrefix }: { label: string; intro?: string; testIdPrefix: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={label}
          data-testid={`${testIdPrefix}-run-advanced`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        {intro ? (
          <>
            <p>{intro}</p>
            <p className="pt-1 font-medium text-foreground">Read more (advanced)</p>
          </>
        ) : (
          <p className="font-medium text-foreground">Read more (advanced)</p>
        )}
        <RunAdvanced />
      </PopoverContent>
    </Popover>
  );
}

/** Open issues tile with Run checks built in, for simple tile grids. */
export function AdsIssuesTile({
  run,
  errors,
  warnings,
  windowDays,
  onChanged,
  testIdPrefix,
  testId,
}: {
  run: AdsRunInfo;
  errors: number;
  warnings: number;
  windowDays: number;
  onChanged: () => void;
  testIdPrefix: string;
  testId: string;
}) {
  const tone = run.never_run ? undefined : errors > 0 ? "error" : warnings > 0 ? "warning" : undefined;
  return (
    <div className="space-y-1 rounded-md border border-border bg-card px-4 py-3" data-testid={`kpi-${testId}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground">Open issues</p>
          <RunInfoPopover label="How Open issues are checked" intro={RUN_CHECKS_INTRO} testIdPrefix={testIdPrefix} />
        </div>
        <RunChecksButton run={run} onChanged={onChanged} testIdPrefix={testIdPrefix} variant={run.never_run ? "button" : "link"} />
      </div>
      <p className={cn("text-xl font-semibold tabular-nums text-foreground", tone === "error" && "text-destructive", tone === "warning" && "text-amber-500")}>
        {adsIssuesValue(run, errors + warnings)}
      </p>
      <p className="text-xs text-muted-foreground">
        <AdsRunStatus run={run} windowDays={windowDays} testIdPrefix={testIdPrefix} />
      </p>
      <RunNotes run={run} testIdPrefix={testIdPrefix} />
    </div>
  );
}

/** "Issues last checked" tile for the overview grid. */
export function AdsRunTile({ run, onChanged, testIdPrefix }: { run: AdsRunInfo; onChanged: () => void; testIdPrefix: string }) {
  const running = run.active.find((j) => j.kind === "run");
  return (
    <div className="space-y-1 rounded-md border border-border bg-card px-4 py-3" data-testid={`${testIdPrefix}-run-bar`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground">Issues last checked</p>
          <RunInfoPopover label="Read more (advanced)" testIdPrefix={testIdPrefix} />
        </div>
        <RunChecksButton run={run} onChanged={onChanged} testIdPrefix={testIdPrefix} variant="link" />
      </div>
      <p className="text-xl font-semibold text-foreground" data-testid={`${testIdPrefix}-run-status`}>
        {running ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </span>
        ) : run.never_run ? (
          "Never"
        ) : (
          formatWhen(run.last_run?.finished_at ?? null)
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {running ? "Issues update when it finishes." : run.never_run ? "No issues listed until checks run." : "Sync updates numbers; this updates issues."}
      </p>
      <RunNotes run={run} testIdPrefix={testIdPrefix} />
    </div>
  );
}
