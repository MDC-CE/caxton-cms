import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { useSettingsNavigate } from "@/components/settings/SettingsShell";
import type { TrackingParamsCoverage } from "@shared/ads-diagnostics-rules";

const MAX_CAMPAIGNS = 5;

/** Whether ads with recent spend carry the URL parameters template (from the last Meta sync). */
export function MetaTrackingParamsStatus({ coverage }: { coverage: TrackingParamsCoverage | null | undefined }) {
  const navigate = useSettingsNavigate();
  if (!coverage || coverage.checked_ads === 0) return null;

  const scope = `ads with spend in the last ${coverage.window_days} days`;
  const hasMissing = coverage.missing_ads > 0;
  const hasNonPaid = coverage.non_paid_campaigns.length > 0;

  if (!hasMissing && !hasNonPaid) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="meta-utm-status-ok">
        <IconCircleCheck className="h-4 w-4 shrink-0 text-chart-3" />
        All {coverage.checked_ads} {scope} have these parameters.
      </p>
    );
  }

  const shown = coverage.campaigns.slice(0, MAX_CAMPAIGNS);
  const more = coverage.campaigns.length - shown.length;

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-testid="meta-utm-status-issues">
      {hasMissing && (
        <div className="space-y-1.5">
          <p className="flex items-start gap-2 text-foreground" data-testid="meta-utm-status-missing">
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {coverage.missing_ads} of {coverage.checked_ads} {scope} {coverage.missing_ads === 1 ? "is" : "are"} missing these parameters
              {coverage.campaigns.length > 1 ? ` (${coverage.campaigns.length} campaigns)` : ""}, so we can't match their visits and leads to
              the ad.
            </span>
          </p>
          <ul className="ml-6 space-y-0.5 text-xs text-muted-foreground" data-testid="meta-utm-status-campaigns">
            {shown.map((c) => (
              <li key={c.id}>
                <span className="text-foreground">{c.name || c.id}</span> · {c.ads} ad{c.ads === 1 ? "" : "s"} · missing{" "}
                <span className="font-mono">{c.missing.join(", ")}</span>
              </li>
            ))}
            {more > 0 && <li>+{more} more</li>}
          </ul>
        </div>
      )}
      {coverage.non_paid_campaigns.map((c) => (
        <p key={c.id} className="flex items-start gap-2 text-foreground" data-testid={`meta-utm-status-non-paid-${c.id}`}>
          <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {c.name || c.id} uses <span className="font-mono text-xs">utm_medium={c.medium}</span>, so its visits count as unpaid.
          </span>
        </p>
      ))}
      <button
        type="button"
        className="ml-6 text-xs text-primary underline-offset-2 hover:underline"
        onClick={() => navigate("/private/diagnostics/ads")}
        data-testid="link-meta-utm-diagnostics"
      >
        See in Diagnostics
      </button>
    </div>
  );
}
