import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";
import { refreshStatusCopy, type AdsRefreshStatus } from "@shared/ads-refresh-status";

/** Read-only Ads surfaces: explains a refresh that failed or cannot run, with a link to Sync now. */
export function AdsRefreshNotice({ refresh, testId = "ads-refresh-notice" }: { refresh: AdsRefreshStatus | undefined; testId?: string }) {
  if (refresh?.state !== "failed" && refresh?.state !== "worker_down") return null;
  const copy = refreshStatusCopy(refresh, "report");
  if (!copy) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
      data-testid={testId}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{copy.message}</span>
      <Link href="/private/settings/ads/meta" className="underline underline-offset-2 hover:text-foreground" data-testid={`${testId}-link`}>
        Open Ads settings
      </Link>
    </div>
  );
}
