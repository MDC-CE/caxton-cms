import { useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useDebugAuth } from "@/hooks/useDebugAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { refreshProgressPercent, refreshStatusCopy, type AdsRefreshStatus } from "@shared/ads-refresh-status";

const ICON_BUTTON =
  "inline-flex items-center justify-center h-5 w-5 rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Compact "Re-sync ad data" control: icon when idle (confirms in a modal), tiny spinner when queued, NN% while running. */
export function AdsResyncButton({
  refresh,
  onStarted,
  testIdPrefix,
  snapshotPulledAt,
  endpoint = "/api/ads/meta/sync",
}: {
  refresh: AdsRefreshStatus | undefined;
  onStarted?: () => void;
  testIdPrefix: string;
  endpoint?: string;
  /** Set (ISO or null) when showing a production download with no local Meta token: re-sync is disabled. */
  snapshotPulledAt?: string | null;
}) {
  const { toast } = useToast();
  const { hasCapability } = useDebugAuth();
  const canSync = hasCapability("ads_settings");
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  async function start() {
    setConfirmOpen(false);
    setStarting(true);
    try {
      const res = await apiRequest("POST", endpoint, { mode: "refresh" });
      const body = (await res.json()) as { refresh?: AdsRefreshStatus };
      const state = body.refresh?.state;
      if (state === "failed" || state === "worker_down") {
        toast({ title: "Sync didn't start", description: refreshStatusCopy(body.refresh, "settings")?.message, variant: "destructive" });
      } else {
        toast({
          title: "Sync started",
          description: state === "queued" ? "Queued for the background worker." : "This runs in the background.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/ads/report"] });
      onStarted?.();
    } catch (err) {
      toast({ title: "Sync failed to start", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  if (refresh?.state === "running" || refresh?.state === "queued" || starting) {
    const pct = refresh?.state === "running" ? refreshProgressPercent(refresh.progress) : null;
    const label =
      refresh?.state === "running"
        ? refresh.progress?.label ?? "Syncing ad data…"
        : refreshStatusCopy(refresh, "settings")?.message ?? "Starting sync…";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {pct !== null ? (
            <span
              className="text-[10px] font-semibold tabular-nums text-muted-foreground min-w-[2rem] text-right"
              data-testid={`${testIdPrefix}-resync-percent`}
              aria-live="polite"
            >
              {pct}%
            </span>
          ) : (
            <span className={ICON_BUTTON} data-testid={`${testIdPrefix}-resync-pending`} aria-live="polite" aria-label={label}>
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[16rem]">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (snapshotPulledAt !== undefined) {
    const when = snapshotPulledAt ? new Date(snapshotPulledAt).toLocaleString() : "an earlier download";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              className={cn(ICON_BUTTON, "opacity-40 cursor-not-allowed")}
              disabled
              aria-label="Re-sync Meta ad data"
              data-testid={`${testIdPrefix}-resync-snapshot`}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[16rem]">
          Showing production data from {when}. Re-sync needs a Meta token locally.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!canSync) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              className={cn(ICON_BUTTON, "opacity-40 cursor-not-allowed")}
              disabled
              aria-label="Re-sync ad data"
              data-testid={`${testIdPrefix}-resync`}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[14rem]">
          Needs Ads settings access to re-sync
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <button
        type="button"
        className={cn(ICON_BUTTON, "hover:bg-muted hover:text-foreground")}
        onClick={() => setConfirmOpen(true)}
        aria-label="Re-sync ad data"
        title="Re-sync ad data"
        data-testid={`${testIdPrefix}-resync`}
      >
        <RefreshCw className="h-3 w-3" />
      </button>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setAdvancedOpen(false);
        }}
      >
        <AlertDialogContent data-testid={`${testIdPrefix}-dialog-resync`}>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-sync ad data now?</AlertDialogTitle>
            <AlertDialogDescription>
              Fetches fresh numbers from your connected ad accounts so this page shows the latest spend, clicks, leads and visits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">If you confirm</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Recent days (about the last 10) are downloaded again from Meta, Google Ads and Google Analytics, whichever are connected.</li>
                <li>An account that has never finished a full load gets its last 90 days instead, which takes longer.</li>
                <li>It runs in the background. You can leave this page; the icon turns into a percentage until it finishes.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">What does not change</p>
              <p className="mt-1">
                Nothing is changed in Meta, Google Ads or Google Analytics: this only reads. Campaigns, budgets and your Ads settings stay as they are.
              </p>
            </div>
          </div>
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid={`${testIdPrefix}-resync-advanced`}>
                Read more (advanced)
                <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2 text-xs text-muted-foreground">
              <p>
                Queues the <code className="font-mono">ads_sync</code> job (mode <code className="font-mono">refresh</code>). If the background worker
                is down, it runs inside the web server instead. If a refresh is already running, nothing new starts. If an Ads diagnostics run is in
                progress, the sync waits for it to finish.
              </p>
              <p>
                Meta: the last 10 days, or 90 days for an account with no full load yet. Google Ads: the last 10 days of the BigQuery transfer plus 30
                days of conversions; the transfer runs about 2 days behind. GA4: paid-landing days that are missing or not yet final.
              </p>
              <p>
                Day files under <code className="font-mono">.cache/&lt;site&gt;/</code> are overwritten for the fetched dates, then the 7/28/90-day
                totals are rebuilt (<code className="font-mono">server/ads/ads-refresh.ts</code> →{" "}
                <code className="font-mono">runAdsRefresh</code>).
              </p>
            </CollapsibleContent>
          </Collapsible>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid={`${testIdPrefix}-resync-cancel`}>Cancel</AlertDialogCancel>
            <Button onClick={() => void start()} data-testid={`${testIdPrefix}-confirm-resync`}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Start sync
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
