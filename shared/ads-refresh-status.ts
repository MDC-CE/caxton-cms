/**
 * Ads background refresh status (Meta insights + GA4 paid-landing days),
 * shared by the server (derives it), staff UI (copy) and MCP (warnings).
 */

export type AdsRefreshState = "idle" | "queued" | "running" | "failed" | "worker_down";

/** Steps finished out of a total counted before the run starts, plus what it is doing now. */
export type AdsRefreshProgress = { done: number; total: number; label: string };

export type AdsRefreshStatus = {
  state: AdsRefreshState;
  requested_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  /** Why the last refresh failed (set for `failed`, and for `idle` while a retry wait is active). */
  error: string | null;
  /** Earliest time an automatic refresh may run again after a failure. */
  retry_after: string | null;
  /** Only while `running`; null when the run reports no steps (e.g. an older worker build). */
  progress: AdsRefreshProgress | null;
};

/** A queued job that has not started after this long counts as failed. */
export const ADS_REFRESH_QUEUED_STUCK_MS = 5 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
/** Wait before the next automatic refresh after 1, 2, 3, 4+ consecutive failures. */
export const ADS_REFRESH_BACKOFF_MS = [HOUR_MS, 2 * HOUR_MS, 4 * HOUR_MS, 6 * HOUR_MS] as const;

export function adsRefreshBackoffMs(failureCount: number): number {
  if (!Number.isFinite(failureCount) || failureCount <= 0) return 0;
  return ADS_REFRESH_BACKOFF_MS[Math.min(failureCount, ADS_REFRESH_BACKOFF_MS.length) - 1];
}

export const IDLE_ADS_REFRESH_STATUS: AdsRefreshStatus = {
  state: "idle",
  requested_at: null,
  started_at: null,
  finished_at: null,
  error: null,
  retry_after: null,
  progress: null,
};

/** True while work is queued or running — the only states worth polling for. */
export function isRefreshActive(status: AdsRefreshStatus | null | undefined): boolean {
  return status?.state === "queued" || status?.state === "running";
}

/** Whole-number percent (0–100), or null when there is nothing to measure. */
export function refreshProgressPercent(progress: AdsRefreshProgress | null | undefined): number | null {
  if (!progress || !Number.isFinite(progress.total) || progress.total <= 0) return null;
  const pct = Math.round((progress.done / progress.total) * 100);
  return Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
}

export type AdsRefreshCopy = { tone: "muted" | "error"; message: string };

/**
 * One plain-English line for staff. `settings` = the Sync card (has Sync now);
 * `report` = read-only Ads surfaces that link to settings instead.
 * Returns null when there is nothing to say (idle).
 */
export function refreshStatusCopy(
  status: AdsRefreshStatus | null | undefined,
  surface: "settings" | "report" = "settings",
  formatTime: (iso: string) => string = (iso) => new Date(iso).toLocaleString(),
): AdsRefreshCopy | null {
  if (!status) return null;
  switch (status.state) {
    case "queued":
      return {
        tone: "muted",
        message: status.requested_at
          ? `Waiting for the background worker since ${formatTime(status.requested_at)}.`
          : "Waiting for the background worker.",
      };
    case "running":
      return { tone: "muted", message: "Syncing ad data in the background…" };
    case "failed": {
      const reason = status.error ? `: ${status.error.trim().replace(/\.+$/, "")}.` : ".";
      if (surface === "report") {
        return { tone: "error", message: `Last Ads sync didn't run${reason} Showing the last synced numbers.` };
      }
      const retry = status.retry_after ? ` Try again, or it retries automatically at ${formatTime(status.retry_after)}.` : " Try again.";
      return { tone: "error", message: `Last sync didn't run${reason}${retry}` };
    }
    case "worker_down":
      return surface === "report"
        ? { tone: "error", message: "The background worker isn't running, so Ads data can't refresh. Showing the last synced numbers." }
        : {
            tone: "error",
            message: "The background worker isn't running, so Ads data can't refresh on its own. Sync now will run it here instead.",
          };
    default:
      return null;
  }
}
