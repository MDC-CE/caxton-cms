import { useState, type ReactNode } from "react";
import { IconAdjustments, IconChevronDown, IconRestore } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_ADS_ALERT_THRESHOLDS, type AdsAlertThresholds } from "@shared/ads-settings";

type NumericKey = Exclude<keyof AdsAlertThresholds, "severity_spend_floor">;

const NUMERIC_KEYS = Object.keys(DEFAULT_ADS_ALERT_THRESHOLDS).filter(
  (k): k is NumericKey => k !== "severity_spend_floor",
);

const DEFAULT_FLOORS = DEFAULT_ADS_ALERT_THRESHOLDS.severity_spend_floor;

function floorsChanged(floorText: Record<string, string>): boolean {
  const entered = Object.entries(floorText).filter(([, v]) => v.trim() !== "");
  if (entered.length !== Object.keys(DEFAULT_FLOORS).length) return true;
  return entered.some(([c, v]) => DEFAULT_FLOORS[c] !== Number(v));
}

export function countCustomizedThresholds(thresholds: AdsAlertThresholds, floorText: Record<string, string>): number {
  const numeric = NUMERIC_KEYS.filter((k) => thresholds[k] !== DEFAULT_ADS_ALERT_THRESHOLDS[k]).length;
  return numeric + (floorsChanged(floorText) ? 1 : 0);
}

function Group({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <div className="space-y-1.5 rounded-md border border-border p-3" data-testid={testId}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="space-y-2 text-sm leading-9 text-muted-foreground">{children}</div>
    </div>
  );
}

export function AdsAlertThresholdsCard({
  thresholds,
  onThresholdsChange,
  floorText,
  onFloorTextChange,
  missingFloors,
  canEdit,
}: {
  thresholds: AdsAlertThresholds;
  onThresholdsChange: (next: AdsAlertThresholds) => void;
  floorText: Record<string, string>;
  onFloorTextChange: (next: Record<string, string>) => void;
  missingFloors: string[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const customized = countCustomizedThresholds(thresholds, floorText);

  function num(key: NumericKey, suffix?: string) {
    const recommended = DEFAULT_ADS_ALERT_THRESHOLDS[key];
    const changed = thresholds[key] !== recommended;
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        <Input
          type="number"
          min={0}
          aria-label={key}
          title={`Recommended: ${recommended}`}
          className={cn("inline-block h-8 w-20 px-2 text-sm text-foreground", changed && "border-primary")}
          value={thresholds[key]}
          disabled={!canEdit}
          onChange={(e) => onThresholdsChange({ ...thresholds, [key]: Number(e.target.value) })}
          data-testid={`input-threshold-${key}`}
        />
        {suffix && <span>{suffix}</span>}
        {changed && <span className="text-xs">(recommended {recommended})</span>}
      </span>
    );
  }

  function resetAll() {
    onThresholdsChange({ ...DEFAULT_ADS_ALERT_THRESHOLDS, severity_spend_floor: { ...DEFAULT_FLOORS } });
    const next: Record<string, string> = Object.fromEntries(Object.entries(DEFAULT_FLOORS).map(([c, v]) => [c, String(v)]));
    for (const c of Object.keys(floorText)) if (!(c in next)) next[c] = "";
    onFloorTextChange(next);
  }

  const floorCurrencies = Object.keys(floorText).concat(missingFloors.filter((c) => !(c in floorText)));

  return (
    <Card data-testid="card-meta-thresholds">
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          data-testid="button-meta-thresholds-toggle"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <IconAdjustments className="h-4 w-4" />
            Alert thresholds
          </CardTitle>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span data-testid="text-thresholds-summary">
              {customized === 0 ? "Using recommended settings" : `${customized} setting${customized === 1 ? "" : "s"} customized`}
            </span>
            <IconChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </CardHeader>
      {(open || missingFloors.length > 0) && (
        <CardContent className="space-y-4">
          {open && (
            <p className="text-sm text-muted-foreground">
              Caxton checks your ads for problems and lists them in Diagnostics. These settings decide how sensitive those
              checks are — the recommended values work for most accounts.
            </p>
          )}

          {missingFloors.length > 0 && (
            <p className="text-xs text-amber-500" data-testid="text-missing-floors">
              Set an urgent amount for {missingFloors.join(", ")} — until then only the share-of-spend rule applies to those
              accounts.
            </p>
          )}

          {open && (
            <>
              <Group title="When is a problem urgent?" testId="threshold-group-urgent">
                <p>
                  Mark a problem as urgent when it affects at least {num("severity_spend_share_pct", "%")} of your ad spend,
                  or at least{" "}
                  {floorCurrencies.map((cur, i) => (
                    <span key={cur} className="inline-flex items-center gap-1 align-middle">
                      {i > 0 && <span className="mr-1">/</span>}
                      <Input
                        type="number"
                        min={0}
                        aria-label={`Urgent amount in ${cur}`}
                        title={DEFAULT_FLOORS[cur] != null ? `Recommended: ${DEFAULT_FLOORS[cur]}` : undefined}
                        className={cn(
                          "inline-block h-8 w-20 px-2 text-sm text-foreground",
                          (floorText[cur] ?? "") === "" && "border-amber-500",
                        )}
                        value={floorText[cur] ?? ""}
                        placeholder="—"
                        disabled={!canEdit}
                        onChange={(e) => onFloorTextChange({ ...floorText, [cur]: e.target.value })}
                        data-testid={`input-floor-${cur}`}
                      />
                      <span className="font-mono text-xs">{cur}</span>
                    </span>
                  ))}
                  . Everything else shows as a warning.
                </p>
              </Group>

              <Group title="Ads not reaching your pages" testId="threshold-group-visits">
                <p>
                  Warn when fewer than {num("clicks_visits_floor_pct", "%")} of ad clicks turn into visits, or when that
                  rate falls by {num("clicks_visits_drop_pct", "%")} compared with the previous 28 days.
                </p>
                <p>Mark it urgent when an ad keeps spending for {num("zero_visits_complete_days", "days")} with no visits at all.</p>
              </Group>

              <Group title="Visits missing campaign tags" testId="threshold-group-tags">
                <p>
                  Warn when more than {num("unclear_share_pct", "%")} of visits from Meta arrive without campaign tags, so we
                  can't tell which ad they came from.
                </p>
              </Group>

              <Group title="Campaigns we can't see" testId="threshold-group-unrecognized">
                <p>
                  Flag Meta campaigns sending visitors that aren&apos;t in any connected ad account, once they send at least{" "}
                  {num("unrecognized_campaign_min_visits", "visits")}.
                </p>
                <p>
                  Mark it urgent at {num("unrecognized_campaign_error_visits", "visits")} or more, or when it brings at least{" "}
                  {num("unrecognized_campaign_error_share_pct", "%")} of paid Meta visits.
                </p>
              </Group>

              <Group title="Lead counts don't match" testId="threshold-group-leads">
                <p>
                  Warn when the gap between Google Analytics lead counts and our own lead records grows by{" "}
                  {num("ga4_ledger_gap_widen_pts", "points")} more than usual. Only checked on days both Google Analytics
                  and our records cover (at least 7).
                </p>
              </Group>

              <Group title="Meta counting the same lead twice" testId="threshold-group-conversions">
                <p>
                  Warn when two picked lead conversions both report on at least {num("conversion_overlap_days_pct", "%")} of the
                  ad-days where either has leads, and their counts are within {num("conversion_overlap_count_pct", "%")} of each
                  other.
                </p>
                <p>
                  Warn when two pixel events each fire at least {num("lockstep_min_events", "times")} in 7 days, with totals within{" "}
                  {num("lockstep_count_pct", "%")} and the same count in most hours.
                </p>
              </Group>

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium text-foreground"
                    data-testid="button-meta-thresholds-advanced"
                  >
                    Read more (advanced)
                    <IconChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  <div className="space-y-2 text-sm leading-9 text-muted-foreground">
                    <p>Only check click-to-visit rates once there are at least {num("ratio_min_clicks", "clicks")}.</p>
                    <p>Only check missing campaign tags once there are at least {num("unclear_min_sessions", "Meta visits")}.</p>
                    <p>
                      Only use the share rule for campaigns we can&apos;t see once there are at least{" "}
                      {num("unrecognized_campaign_share_min_visits", "paid Meta visits")}.
                    </p>
                    <p>
                      Until there are 28 days to compare against, warn when the lead gap is over{" "}
                      {num("ga4_ledger_gap_bootstrap_pct", "%")}.
                    </p>
                    <p>
                      In reports, grey out rates for pages with fewer than {num("min_paid_visits_for_rates", "paid visits")}.
                      This does not affect alerts.
                    </p>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>Drops compare the current window with the previous 28 days.</p>
                    <p>GA4 days count as complete 2 days after the date (export delay). Issues clear on the next sync once fixed.</p>
                    <p>
                      Double counting compares per-ad daily results from the last 28 days (at least 3 ad-days). Pixel events come from Meta&apos;s
                      pixel stats for the last 7 days, read at each sync; PageView and pairs marked as expected (
                      <code className="font-mono">ads.meta.expected_event_pairs</code>) are skipped. &quot;Most hours&quot; means at least 80% of
                      hours where either event fired.
                    </p>
                    <p>
                      Stored in <code className="font-mono">settings.yml → ads.alert_thresholds</code> (shared by Meta and Google; older files used{" "}
                      <code className="font-mono">ads.meta.alert_thresholds</code>, still read as a fallback). Campaigns marked as known live in{" "}
                      <code className="font-mono">settings.yml → ads.meta.known_external_campaigns</code>.
                    </p>
                    <p>
                      A campaign counts as connected when any of its ids appears in the stored Meta data (about 90 days) or ad setups, or its name
                      matches a connected campaign. Only visits to this site&apos;s own pages count.
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {canEdit && customized > 0 && (
                <Button type="button" size="sm" variant="outline" onClick={resetAll} data-testid="button-thresholds-reset">
                  <IconRestore className="h-4 w-4" />
                  Reset to recommended
                </Button>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
