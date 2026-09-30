import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useDebugAuth } from "@/hooks/useDebugAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { refreshProgressPercent, refreshStatusCopy, type AdsRefreshStatus } from "@shared/ads-refresh-status";

const ICON_BUTTON =
  "inline-flex items-center justify-center h-5 w-5 rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Compact "Re-sync Meta ad data" control: icon when idle, tiny spinner when queued, NN% while running. */
export function AdsResyncButton({
  refresh,
  onStarted,
  testIdPrefix,
}: {
  refresh: AdsRefreshStatus | undefined;
  onStarted?: () => void;
  testIdPrefix: string;
}) {
  const { toast } = useToast();
  const { hasCapability } = useDebugAuth();
  const canSync = hasCapability("ads_settings");
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const res = await apiRequest("POST", "/api/ads/meta/sync", { mode: "refresh" });
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

  if (!canSync) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              className={cn(ICON_BUTTON, "opacity-40 cursor-not-allowed")}
              disabled
              aria-label="Re-sync Meta ad data"
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
    <button
      type="button"
      className={cn(ICON_BUTTON, "hover:bg-muted hover:text-foreground")}
      onClick={() => void start()}
      aria-label="Re-sync Meta ad data"
      title="Re-sync Meta ad data"
      data-testid={`${testIdPrefix}-resync`}
    >
      <RefreshCw className="h-3 w-3" />
    </button>
  );
}
