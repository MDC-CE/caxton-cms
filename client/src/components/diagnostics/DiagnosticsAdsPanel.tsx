import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, BadgeCheck, CheckCircle2, ChevronDown, CircleAlert, Copy, Info, Loader2, Megaphone, Scale, Settings, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { useToast } from "@/hooks/use-toast";
import { useDebugAuth } from "@/hooks/useDebugAuth";
import { apiFetch, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsDiagnostics } from "@/components/ads/ads-types";
import { formatMoney, formatNum, formatWhen } from "@/components/ads/ads-format";
import { PaidPagesCard } from "@/components/ads/PaidPagesCard";
import { AdsRefreshNotice } from "@/components/ads/AdsRefreshNotice";
import { AdsResyncButton } from "@/components/ads/AdsResyncButton";
import { AdsPullProductionButton } from "@/components/ads/AdsPullProductionButton";
import { AdsIssueEvidence } from "@/components/diagnostics/AdsIssueEvidence";
import { AdsTrackingFixDialog } from "@/components/diagnostics/AdsTrackingFixDialog";
import { AdsMetaPlatformsCard } from "@/components/diagnostics/AdsMetaPlatformsCard";
import { TabCountBadge } from "@/components/DebugBubble/components/PageErrorsModal";
import { isRefreshActive, type AdsRefreshStatus } from "@shared/ads-refresh-status";

const SEVERITY_STYLE: Record<AdsIssue["severity"], { Icon: typeof AlertTriangle; className: string; label: string }> = {
  error: { Icon: CircleAlert, className: "text-destructive", label: "Error" },
  warning: { Icon: AlertTriangle, className: "text-amber-500", label: "Warning" },
  info: { Icon: Info, className: "text-muted-foreground", label: "Info" },
};

function clicksVisitsHint(k: AdsDiagnostics["kpis"]): string | undefined {
  if (k.clicks_to_visits_mismatch) return "GA4 sees more ad visits than Meta clicks";
  if (k.untagged_clicks > 0) return `excludes ${formatNum(k.untagged_clicks)} clicks from ads without tracking parameters`;
  if (k.unmatched_meta_visits > 0) return `${formatNum(k.unmatched_meta_visits)} Meta visits not from connected ads`;
  return k.clicks_to_visits_pct != null ? "of Meta clicks reach the site" : undefined;
}

function ClicksVisitsInfo() {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Clicks → visits</p>
      <p>
        Out of every 100 people who click one of your Meta ads, how many show up as a visit on the site that we can match back to that ad.
        Below 100% is normal — some people leave before the page loads or reject cookies.
      </p>
      <p>
        A sudden drop usually means slow pages, fewer visitors accepting cookies, or ads missing the tracking URL template.
      </p>
      <p>
        <span className="font-medium text-foreground">Mismatch</span> (above 110%) means Meta and Google Analytics are counting differently,
        not that you gained visits.
      </p>
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-foreground" data-testid="button-kpi-clicks-visits-advanced">
          Read more (advanced)
          <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          <p>
            Visits: paid Meta visits whose <code className="font-mono">utm_id</code> / <code className="font-mono">utm_term</code> /{" "}
            <code className="font-mono">utm_content</code> match a campaign, ad set or ad synced from the connected ad accounts. Other paid Meta
            visits are counted separately as “not from connected ads”.
          </p>
          <p>
            Clicks: Meta link clicks (not landing page views) from ads landing on this site, only on days Google Analytics has already exported
            (about 2 days behind). Instant forms, ads pointing to other sites, and ads without the tracking template are left out.
          </p>
          <p>
            Warns when the ratio falls under the floor or drops against the previous 28 days (thresholds in Settings → Ads). Never warns on a
            mismatch.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type KpiReading = { reading: string; meaning: string };

const CLICKS_VISITS_READINGS: KpiReading[] = [
  { reading: "Steady, roughly 50–80%", meaning: "Healthy. Some people leave before the page loads or reject cookies." },
  { reading: "Sudden drop", meaning: "Something broke between the ad and the page: slow or broken landing page, a redirect losing the tags, a cookie banner change, or a new ad without tags." },
  { reading: "Very low", meaning: "Most paid clicks are lost or can't be traced. Urgent when spend is high." },
  { reading: "Mismatch", meaning: "Meta and Google Analytics count differently. You did not gain visits — usually safe to ignore." },
  { reading: "—", meaning: "Not enough traceable clicks yet. The line under the number says why." },
];

function clicksVisitsRightNow(k: AdsDiagnostics["kpis"]): string {
  if (k.clicks_to_visits_mismatch) return "Meta and Google Analytics disagree on this window. Watch the trend instead of the number.";
  if (k.clicks_to_visits_pct == null && k.untagged_clicks > 0) {
    return `All ${formatNum(k.untagged_clicks)} clicks came from ads without the tracking template, so there is nothing to compare yet. Add the template to your Meta ads, then check back in about 2 days.`;
  }
  if (k.clicks_to_visits_pct == null) return "No traceable Meta clicks yet in this window, or Google Analytics is not connected.";
  if (k.untagged_clicks > 0) {
    return `${k.clicks_to_visits_pct}% of traceable clicks reach the site. ${formatNum(k.untagged_clicks)} clicks from untagged ads are not counted — tag them to get the full picture.`;
  }
  return `${k.clicks_to_visits_pct}% of clicks reach the site. Compare it with last week rather than judging the number alone.`;
}

const SPEND_READINGS: KpiReading[] = [
  { reading: "The amount", meaning: "What Meta charged for this window, per currency, as in Ads Manager. Updates each time Meta syncs." },
  { reading: "All lands on our pages", meaning: "Every ad sends people to a page on this site, so all of the spend can be checked here." },
  { reading: "Under 100%", meaning: "Some spend goes to Instant Forms, other websites, or pages that don't exist here. This page can't check that part — fine if it's on purpose." },
];

function spendRightNow(spend: Record<string, number>, trackedShare: number | null): string {
  const currencies = Object.keys(spend).filter((c) => (spend[c] ?? 0) > 0);
  if (currencies.length === 0) return "No Meta spend in this window.";
  if (currencies.length > 1) return `Spend runs in ${currencies.join(" and ")}. Amounts are shown per currency and never converted.`;
  if (trackedShare == null) return `You spent ${formatMoney(spend)}.`;
  if (trackedShare >= 100) return `All ${formatMoney(spend)} went to ads that land on this site, so everything else on this page covers all of it.`;
  return `${trackedShare}% of ${formatMoney(spend)} went to ads that land on this site. The rest isn't covered by the other numbers here.`;
}

const ISSUES_READINGS: KpiReading[] = [
  { reading: "0", meaning: "Nothing to fix. Ads and tracking look healthy." },
  { reading: "Warnings", meaning: "Mostly measurement gaps: ads still run, but some numbers here are incomplete or can't be tied to an ad." },
  { reading: "Errors", meaning: "Fix first: Meta can't sync, or enough spend goes through a broken setup (for example ads sending people to a broken page)." },
  { reading: "$ affected", meaning: "Spend that ran through ads with an open issue. Not all of it is wasted — for tracking gaps it just can't be traced." },
];

function issuesRightNow(k: AdsDiagnostics["kpis"], affected: string | null, windowDays: number): string {
  const spendNote = affected ? ` ${affected} ran through ads with a problem.` : "";
  if (k.open_errors > 0) {
    return `${k.open_errors} error${k.open_errors === 1 ? "" : "s"} and ${k.open_warnings} warning${k.open_warnings === 1 ? "" : "s"}.${spendNote} Start with the errors in the list below.`;
  }
  if (k.open_warnings > 0) {
    return `No errors, ${k.open_warnings} warning${k.open_warnings === 1 ? "" : "s"}.${spendNote} Open the list below — each issue says what to fix.`;
  }
  return `No open issues in the last ${windowDays} days.`;
}

const LEADS_READINGS: KpiReading[] = [
  { reading: "Meta (left)", meaning: "Leads Meta's pixel says its ads produced, counted Meta's way (it can include people who saw an ad and converted later)." },
  { reading: "Site (right)", meaning: "Form submissions this site recorded from people who came from a paid ad in the last 30 days. Staff tests are left out." },
  { reading: "Close together", meaning: "Both sides agree. Healthy." },
  { reading: "Meta much higher", meaning: "Some gap is normal. A big one can mean forms aren't recording on the site." },
  { reading: "Site much higher", meaning: "Meta's pixel may not be sending the Lead event." },
  { reading: "+ repeats", meaning: "The same person sent the same form again within 24 hours. Not counted as new leads." },
];

function leadsRightNow(k: AdsDiagnostics["kpis"], collectingSince: string | null): string {
  const since = collectingSince ? ` Site leads are only recorded since ${collectingSince.slice(0, 10)}.` : "";
  if (k.meta_leads === 0 && k.site_leads === 0) {
    return `No leads on either side in this window. If these ads should bring form fills, check Open issues for pixel or form problems.${since}`;
  }
  if (k.meta_leads === 0) return `The site recorded ${formatNum(k.site_leads)} but Meta reported none. Check that the pixel sends a Lead event.`;
  if (k.site_leads === 0) return `Meta reported ${formatNum(k.meta_leads)} but the site recorded none. Check Open issues — forms may not be recording.${since}`;
  return `Meta reports ${formatNum(k.meta_leads)}, the site recorded ${formatNum(k.site_leads)}. Compare the trend over time; never add them together.`;
}

const UNCLEAR_READINGS: KpiReading[] = [
  { reading: "What it counts", meaning: "Visits from Meta that carry only Meta's click id and no campaign tags. We can't tell if they came from a paid ad or an organic post or shared link." },
  { reading: "Low", meaning: "Normal. Organic posts and shared links always add a few." },
  { reading: "High or rising", meaning: "Usually ads without the tracking template. You get a warning in the list below when it gets too high." },
  { reading: "—", meaning: "No Meta visits in this window yet." },
];

function unclearRightNow(k: AdsDiagnostics["kpis"]): string {
  if (k.meta_unclear_pct == null) return "No Meta visits in this window yet.";
  const base = `${k.meta_unclear_pct}% of Meta visits can't be tied to a campaign.`;
  if (k.untagged_clicks > 0) {
    return `${base} ${formatNum(k.untagged_clicks)} clicks came from ads without the tracking template — adding it usually brings this down.`;
  }
  return base;
}

function KpiReadGuide({
  title,
  intro,
  readings,
  rightNow,
  template,
  footer,
  testId,
}: {
  title: string;
  intro: string;
  readings: KpiReading[];
  rightNow: string;
  /** Shows a copy button for the tracking template in the "Right now" box. */
  template?: string;
  footer?: ReactNode;
  testId: string;
}) {
  const { toast } = useToast();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="whitespace-nowrap text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`button-kpi-${testId}-guide`}
        >
          How to read this
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3 text-xs leading-relaxed text-muted-foreground">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">How to read {title}</p>
          <p>{intro}</p>
        </div>
        <dl className="space-y-1.5">
          {readings.map((r) => (
            <div key={r.reading} className="grid grid-cols-[7.5rem_1fr] gap-2">
              <dt className="font-medium text-foreground">{r.reading}</dt>
              <dd>{r.meaning}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-2 rounded-md border bg-muted/40 p-2" data-testid={`kpi-${testId}-guide-now`}>
          <p>
            <span className="font-medium text-foreground">Right now: </span>
            {rightNow}
          </p>
          {template && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => {
                void navigator.clipboard?.writeText(template);
                toast({ title: "Template copied", description: "Paste it into each Meta ad's URL parameters field." });
              }}
              data-testid={`button-kpi-${testId}-copy-template`}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy tracking template
            </Button>
          )}
        </div>
        {footer && <p>{footer}</p>}
      </PopoverContent>
    </Popover>
  );
}

function AdsSettingsLink({ children }: { children: ReactNode }) {
  return (
    <Link href="/private/settings/ads/meta" className="underline underline-offset-2">
      {children}
    </Link>
  );
}

function Kpi({
  label,
  value,
  hint,
  info,
  tone,
  aside,
  corner,
  testId,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  /** Opens from an ⓘ button next to the label. */
  info?: ReactNode;
  tone?: "error" | "warning";
  aside?: ReactNode;
  /** Bottom-right of the card, under `aside`. */
  corner?: ReactNode;
  testId: string;
}) {
  return (
    <Card className="min-w-0" data-testid={`kpi-${testId}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-2xl font-bold tabular-nums",
                tone === "error" ? "text-destructive" : tone === "warning" ? "text-amber-500" : "text-foreground",
              )}
            >
              {value}
            </p>
            <div className="mt-0.5 flex items-center gap-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              {info && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`What is ${label}?`}
                      data-testid={`button-kpi-${testId}-info`}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 text-xs leading-relaxed text-muted-foreground">
                    {info}
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {hint && <p className="mt-1 truncate text-[11px] leading-snug text-muted-foreground">{hint}</p>}
          </div>
          {(aside || corner) && (
            <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch">
              {aside ?? <span />}
              {corner && <div className="text-right text-[11px] leading-snug text-muted-foreground">{corner}</div>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IssueCountChips({ errors, warnings }: { errors: number; warnings: number }) {
  return (
    <div className="flex items-center gap-0.5" data-testid="kpi-issues-breakdown">
      <span className="inline-flex items-center gap-0.5 p-0.5" aria-label={`${errors} errors`}>
        <span className={cn("text-[10px] font-semibold leading-none", errors > 0 ? "text-destructive" : "text-muted-foreground")}>Err</span>
        <TabCountBadge count={errors} variant="error" testId="kpi-issues-errors" zeroAsCount />
      </span>
      <span className="inline-flex items-center gap-0.5 p-0.5" aria-label={`${warnings} warnings`}>
        <span
          className={cn(
            "text-[10px] font-semibold leading-none",
            warnings > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          Warn
        </span>
        <TabCountBadge count={warnings} variant="warning" testId="kpi-issues-warnings" zeroAsCount />
      </span>
    </div>
  );
}

/** Adds an unrecognized campaign to Settings → Ads → Known external campaigns (ads_settings only). */
function MarkCampaignKnown({ issue, onDone }: { issue: AdsIssue; onDone: () => void }) {
  const { hasCapability } = useDebugAuth();
  const canEdit = hasCapability("ads_settings");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const key = issue.id.slice("unrecognized_campaign:".length);

  async function save() {
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/settings/ads/meta/known-campaigns", { key, ...(note.trim() ? { note: note.trim() } : {}) });
      const body = (await res.json()) as { already_known?: boolean };
      toast({ title: body.already_known ? "Already marked as known" : "Marked as known", description: "It stays listed as info and no longer counts as a problem." });
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/settings/ads/meta"] });
      onDone();
    } catch (err) {
      toast({ title: "Couldn't mark as known", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={`ads-issue-mark-known-${issue.id}`}>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled data-testid="button-mark-campaign-known">
          <BadgeCheck className="h-3.5 w-3.5" />
          Mark as known
        </Button>
        <span className="text-xs text-muted-foreground">Ask someone with Ads settings access to mark this as known.</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-mark-campaign-known">
          <BadgeCheck className="h-3.5 w-3.5" />
          Mark as known
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-xs" data-testid="popover-mark-campaign-known">
        <p className="font-medium text-foreground">Mark this campaign as known?</p>
        <p className="text-muted-foreground">
          Stops flagging this campaign. Its visits are still counted as paid, and its spend still isn&apos;t included.
        </p>
        <Input
          value={note}
          maxLength={200}
          placeholder="Note (optional), e.g. Run by our agency"
          className="h-8 text-xs"
          onChange={(e) => setNote(e.target.value)}
          data-testid="input-mark-campaign-known-note"
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={save} data-testid="button-mark-campaign-known-confirm">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Mark as known
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function IssueRow({
  issue,
  template,
  snapshotId,
  issueWindowDays,
  refresh,
  onReload,
}: {
  issue: AdsIssue;
  template: string;
  snapshotId: string | undefined;
  issueWindowDays: number;
  refresh: AdsRefreshStatus | undefined;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const { toast } = useToast();
  const { hasCapability } = useDebugAuth();
  const canFixInMeta = issue.code === "missing_tracking_params" && hasCapability("ads_edit");
  const style = SEVERITY_STYLE[issue.severity];
  const hasSpend = Object.keys(issue.spend_affected).length > 0;
  const ga4Seen = issue.details?.ga4_seen ?? [];
  const ga4Totals =
    !hasSpend && issue.details?.ga4_totals
      ? issue.details.ga4_totals
      : !hasSpend && ga4Seen.length > 0
        ? ga4Seen.reduce((t, r) => ({ visits: t.visits + r.visits, leads: t.leads + r.leads }), { visits: 0, leads: 0 })
        : null;
  const showTemplate = issue.code === "missing_tracking_params" || issue.code === "non_paid_medium" || issue.code === "unclear_share_high" || issue.code === "spend_zero_visits";
  const unrecognized = issue.code === "unrecognized_campaign";
  const showFixedElsewhere = !issue.site_fixable && issue.severity !== "info" && !unrecognized;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border last:border-b-0">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" data-testid={`ads-issue-${issue.id}`}>
          <div className="flex w-28 shrink-0 flex-col" data-testid={`ads-issue-spend-${issue.id}`}>
            <div className="flex items-center gap-1.5">
              <style.Icon className={cn("h-4 w-4 shrink-0", style.className)} aria-label={style.label} />
              {hasSpend ? (
                <span className={cn("text-base font-semibold leading-tight tabular-nums", style.className)}>
                  {formatMoney(issue.spend_affected)}
                </span>
              ) : ga4Totals ? (
                <span className="text-base font-semibold leading-tight tabular-nums text-foreground">{formatNum(ga4Totals.visits)} visits</span>
              ) : (
                <span className="text-base font-semibold leading-tight text-muted-foreground">Unknown</span>
              )}
            </div>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {ga4Totals ? `${formatNum(ga4Totals.leads)} leads · GA4` : "spend affected"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{issue.title}</p>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pb-3 pl-[8.5rem] pr-10 text-sm" data-testid={`ads-issue-drawer-${issue.id}`}>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why it matters</p>
          <p className="text-foreground/90">{issue.why}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How to fix</p>
          <p className="text-foreground/90">{issue.how_to_fix}</p>
        </div>
        <AdsIssueEvidence
          issue={issue}
          snapshotId={snapshotId}
          issueWindowDays={issueWindowDays}
          refresh={refresh}
          onSnapshotExpired={onReload}
          onResyncStarted={onReload}
        />
        {showTemplate && (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{template}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(template);
                toast({ title: "Template copied" });
              }}
              data-testid="button-copy-issue-template"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {canFixInMeta && (
              <Button size="sm" onClick={() => setFixOpen(true)} data-testid={`button-tracking-fix-${issue.id}`}>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Fix via Meta
              </Button>
            )}
          </div>
        )}
        {canFixInMeta && (
          <AdsTrackingFixDialog open={fixOpen} onOpenChange={setFixOpen} issue={issue} snapshotId={snapshotId} onApplied={onReload} />
        )}
        {issue.scope.url && (
          <a href={issue.scope.url} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
            {issue.scope.url}
          </a>
        )}
        {unrecognized && issue.severity !== "info" && <MarkCampaignKnown issue={issue} onDone={onReload} />}
        {showFixedElsewhere && <p className="text-xs text-muted-foreground">This is fixed in Meta Ads Manager or Tag Manager, not on the site.</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

const ISSUES_OPEN_KEY = "diagnostics-ads-issues-open";

export function DiagnosticsAdsPanel() {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [list, setList] = useState<"issues" | "resolved">("issues");
  const [issuesOpen, setIssuesOpen] = useState(() => localStorage.getItem(ISSUES_OPEN_KEY) !== "0");
  const toggleIssuesOpen = (open: boolean) => {
    setIssuesOpen(open);
    localStorage.setItem(ISSUES_OPEN_KEY, open ? "1" : "0");
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["/api/diagnostics/ads", days],
    queryFn: async () => {
      const res = await apiFetch(`/api/diagnostics/ads?days=${days}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load Ads diagnostics");
      return res.json() as Promise<AdsDiagnostics>;
    },
    placeholderData: (prev) => prev,
    refetchInterval: (q) => {
      const state = (q.state.data as AdsDiagnostics | undefined)?.refresh?.state;
      return state === "running" ? 3000 : state === "queued" ? 8000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Ads diagnostics…
      </div>
    );
  }
  if (error || !data) {
    return <p className="py-8 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load Ads diagnostics"}</p>;
  }

  const k = data.kpis;
  const trackedShare =
    Object.keys(k.spend).length === 1 && Object.values(k.spend)[0]! > 0
      ? Math.round(((Object.values(k.tracked_spend)[0] ?? 0) / Object.values(k.spend)[0]!) * 100)
      : null;
  const spendHint: ReactNode =
    trackedShare != null
      ? trackedShare >= 100
        ? (
            <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400" data-testid="kpi-spend-all-tracked">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600 dark:text-green-500" />
              all lands on our pages
            </span>
          )
        : `${trackedShare}% lands on our pages`
      : Object.keys(k.tracked_spend).length > 0
        ? `${formatMoney(k.tracked_spend)} lands on our pages`
        : undefined;
  const statusStyle =
    data.status === "errors"
      ? "border-destructive/40 bg-destructive/10"
      : data.status === "warnings"
        ? "border-amber-500/40 bg-amber-500/10"
        : data.status === "ok"
          ? "border-chart-3/40 bg-chart-3/10"
          : "border-border bg-muted/40";
  const issues = data.issues.filter((i) => i.severity !== "info");
  const consentDrop = data.issues.find((i) => i.code === "consent_rate_drop");
  const infos = data.issues.filter((i) => i.severity === "info" && i.code !== "consent_rate_drop");
  const issueWindow = `last ${data.issue_window_days} days`;
  const affectedSpend: Record<string, number> = {};
  for (const i of [...issues, ...infos]) {
    for (const [cur, v] of Object.entries(i.spend_affected)) affectedSpend[cur] = (affectedSpend[cur] ?? 0) + v;
  }
  for (const cur of Object.keys(affectedSpend)) {
    const cap = k.spend[cur];
    if (cap != null) affectedSpend[cur] = Math.min(affectedSpend[cur]!, cap);
  }
  const hasAffectedSpend = Object.values(affectedSpend).some((v) => v > 0);

  return (
    <div className="space-y-4" data-testid="diagnostics-ads-panel">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3", statusStyle)} data-testid="ads-status-bar">
        <div className="flex items-center gap-2 text-sm">
          <Megaphone className="h-4 w-4" />
          {data.status === "not_connected" ? (
            <span>
              Meta is not connected.{" "}
              <Link href="/private/settings/ads/meta" className="underline underline-offset-2">
                Connect it in Settings → Ads
              </Link>
              .
            </span>
          ) : (
            <span>
              {data.status === "ok" ? "Ads tracking looks healthy." : `${k.open_errors} error(s), ${k.open_warnings} warning(s).`} Checked over the{" "}
              {issueWindow}. Meta synced {formatWhen(data.meta.last_synced_at)}
              {isRefreshActive(data.refresh) ? " · refreshing…" : ""}
              {data.collecting_since ? ` · site leads since ${data.collecting_since.slice(0, 10)}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/private/settings/ads/meta" data-testid="link-ads-settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <AdsRefreshNotice refresh={data.refresh} testId="ads-diagnostics-refresh-notice" />

      {data.missing_floor_currencies.length > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" data-testid="ads-missing-floor">
          Set an urgent-spend amount for {data.missing_floor_currencies.join(", ")} in Settings → Ads → Alert thresholds.
        </p>
      )}

      {consentDrop && (
        <Link
          href="/private/diagnostics/legal"
          className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
          data-testid="ads-consent-warning"
        >
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4 shrink-0" />
            Fewer visitors accept tracking. Measured visits may look lower than real traffic.
          </span>
          <span className="shrink-0 underline underline-offset-2">Open Legal</span>
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2" data-testid="ads-window-row">
        {isFetching && !isRefreshActive(data.refresh) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {data.status !== "not_connected" && (
          <AdsResyncButton
            refresh={data.refresh}
            onStarted={() => void refetch()}
            testIdPrefix="ads-diagnostics"
            snapshotPulledAt={data.meta.source === "production_snapshot" ? (data.meta.pulled_at ?? null) : undefined}
          />
        )}
        <AdsPullProductionButton onDone={() => void refetch()} testIdPrefix="ads-diagnostics" />
        <span className="text-sm text-muted-foreground">Numbers for</span>
        <ToggleButtonBar
          value={String(days)}
          onValueChange={(v) => setDays(v === "7" ? 7 : v === "90" ? 90 : 28)}
          listTestId="ads-window"
          listClassName="flex"
        >
          <ToggleButtonBarTrigger value="7">7 days</ToggleButtonBarTrigger>
          <ToggleButtonBarTrigger value="28">28 days</ToggleButtonBarTrigger>
          <ToggleButtonBarTrigger value="90">90 days</ToggleButtonBarTrigger>
        </ToggleButtonBar>
      </div>

      <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-3" data-testid="ads-kpis">
        <Kpi
          label="Spend"
          value={formatMoney(k.spend)}
          hint={spendHint}
          aside={
            <KpiReadGuide
              title="Spend"
              intro="How much Meta charged, and how much of it this page can check because the ads land on this site."
              readings={SPEND_READINGS}
              rightNow={spendRightNow(k.spend, trackedShare)}
              testId="spend"
            />
          }
          testId="spend"
        />
        <Kpi
          label="Open issues"
          value={String(k.open_errors + k.open_warnings)}
          tone={k.open_errors > 0 ? "error" : k.open_warnings > 0 ? "warning" : undefined}
          hint={issueWindow}
          aside={
            <KpiReadGuide
              title="Open issues"
              intro={`Problems found in your ads or tracking over the last ${data.issue_window_days} days. Changing the window above doesn't hide or resolve them.`}
              readings={ISSUES_READINGS}
              rightNow={issuesRightNow(k, hasAffectedSpend ? formatMoney(affectedSpend) : null, data.issue_window_days)}
              footer={
                <>
                  An issue becomes an error when enough spend is involved.{" "}
                  <AdsSettingsLink>Change that limit in Settings → Ads</AdsSettingsLink>.
                </>
              }
              testId="issues"
            />
          }
          corner={
            <div className="flex flex-col items-end gap-0.5">
              {hasAffectedSpend && (
                <span data-testid="kpi-issues-affected-spend">
                  <span className="font-semibold tabular-nums text-amber-500">{formatMoney(affectedSpend)}</span> affected
                </span>
              )}
              <IssueCountChips errors={k.open_errors} warnings={k.open_warnings} />
            </div>
          }
          testId="issues"
        />
        <Kpi
          label="Leads: Meta vs site"
          value={`${formatNum(k.meta_leads)} / ${formatNum(k.site_leads)}`}
          hint={k.repeat_submissions > 0 ? `+${k.repeat_submissions} repeats` : "never added together"}
          aside={
            <KpiReadGuide
              title="Leads: Meta vs site"
              intro="Two independent counts of the same leads. They never match exactly — compare them to spot a broken pixel or form, never add them."
              readings={LEADS_READINGS}
              rightNow={leadsRightNow(k, data.collecting_since)}
              testId="leads"
            />
          }
          testId="leads"
        />
        <Kpi
          label="Clicks → visits"
          value={k.clicks_to_visits_mismatch ? "Mismatch" : k.clicks_to_visits_pct != null ? `${k.clicks_to_visits_pct}%` : "—"}
          tone={k.clicks_to_visits_mismatch ? "warning" : undefined}
          hint={clicksVisitsHint(k)}
          info={<ClicksVisitsInfo />}
          aside={
            <KpiReadGuide
              title="Clicks → visits"
              intro="Of the people Meta says clicked your ads, how many we saw arrive on the site. Watch for changes, not a perfect score."
              readings={CLICKS_VISITS_READINGS}
              rightNow={clicksVisitsRightNow(k)}
              template={k.untagged_clicks > 0 ? data.utm_template : undefined}
              footer={
                <>
                  You get a warning in the list below when it drops sharply or falls too low.{" "}
                  <AdsSettingsLink>Change the limits in Settings → Ads</AdsSettingsLink>.
                </>
              }
              testId="clicks-visits"
            />
          }
          testId="clicks-visits"
        />
        <Kpi
          label="Meta: unclear"
          value={k.meta_unclear_pct != null ? `${k.meta_unclear_pct}%` : "—"}
          hint="visits without campaign tags"
          aside={
            <KpiReadGuide
              title="Meta: unclear"
              intro="Of all visits from Meta, the share we can't tie to a campaign. Lower is better."
              readings={UNCLEAR_READINGS}
              rightNow={unclearRightNow(k)}
              template={k.untagged_clicks > 0 ? data.utm_template : undefined}
              testId="unclear"
            />
          }
          testId="unclear"
        />
      </div>

      {data.status !== "not_connected" && data.meta_platforms && <AdsMetaPlatformsCard data={data.meta_platforms} days={data.window_days} />}

      {(issues.length > 0 || infos.length > 0 || data.resolved.length > 0) && (
        <Collapsible open={issuesOpen} onOpenChange={toggleIssuesOpen} asChild>
        <Card data-testid="card-ads-issues">
          <CardHeader className={cn(issuesOpen ? "pb-3" : "py-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={issuesOpen ? "Collapse tracking issues" : "Expand tracking issues"}
                  data-testid="button-ads-issues-collapse"
                >
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                  <CardTitle className="text-base" data-testid="text-ads-issues-title">
                    Tracking issues
                    <span
                      className={cn(
                        "ml-1 tabular-nums",
                        k.open_errors > 0 ? "text-destructive" : issues.length > 0 ? "text-amber-500" : "text-muted-foreground",
                      )}
                      data-testid="text-ads-issues-count"
                    >
                      ({issues.length})
                    </span>
                    {hasAffectedSpend && (
                      <span className="font-normal text-muted-foreground">
                        {" "}affecting <span className="font-semibold tabular-nums text-foreground">{formatMoney(affectedSpend)}</span> in spend
                      </span>
                    )}
                  </CardTitle>
                </button>
              </CollapsibleTrigger>
              {issuesOpen && (
                <ToggleButtonBar value={list} onValueChange={(v) => setList(v as "issues" | "resolved")} listTestId="ads-issue-list" listClassName="flex">
                  <ToggleButtonBarTrigger value="issues">Issues ({issues.length})</ToggleButtonBarTrigger>
                  <ToggleButtonBarTrigger value="resolved">Resolved ({data.resolved.length})</ToggleButtonBarTrigger>
                </ToggleButtonBar>
              )}
            </div>
            {issuesOpen && (
              <p className="text-sm text-muted-foreground">
                Problems are always checked over the {issueWindow}, so changing the window above does not hide or resolve them.
              </p>
            )}
          </CardHeader>
          <CollapsibleContent>
          <CardContent className="p-0">
            {list === "issues" ? (
              issues.length === 0 && infos.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground" data-testid="ads-no-issues">
                  <CheckCircle2 className="h-4 w-4 text-chart-3" /> No tracking issues found. Issues clear on the next sync once fixed.
                </p>
              ) : (
                <div>
                  {[...issues, ...infos].map((i) => (
                    <IssueRow
                      key={i.id}
                      issue={i}
                      template={data.utm_template}
                      snapshotId={data.snapshot_id}
                      issueWindowDays={data.issue_window_days}
                      refresh={data.refresh}
                      onReload={() => void refetch()}
                    />
                  ))}
                </div>
              )
            ) : data.resolved.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nothing resolved yet.</p>
            ) : (
              data.resolved.map((r) => (
                <div key={`${r.id}-${r.resolved_at}`} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0">
                  <span className="flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-chart-3" /> {r.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatWhen(r.resolved_at)}</span>
                </div>
              ))
            )}
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
      )}

      <PaidPagesCard days={days} issues={data.issues} />
    </div>
  );
}

export function AdsGlobalRollupCard() {
  const { data } = useQuery({
    queryKey: ["/api/diagnostics/ads", "summary"],
    queryFn: async () => {
      const res = await apiFetch("/api/diagnostics/ads?summary=1");
      if (!res.ok) return null;
      return res.json() as Promise<{ status: AdsDiagnostics["status"]; open_errors: number; open_warnings: number }>;
    },
    staleTime: 5 * 60 * 1000,
  });
  if (!data || data.status === "not_connected" || data.open_errors === 0) return null;
  return (
    <Link
      href="/private/diagnostics/ads"
      className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm"
      data-testid="ads-global-rollup"
    >
      <span className="flex items-center gap-2">
        <Megaphone className="h-4 w-4" />
        Ads: {data.open_errors} tracking error(s){data.open_warnings > 0 ? `, ${data.open_warnings} warning(s)` : ""}
      </span>
      <span className="text-xs underline underline-offset-2">Open Ads diagnostics</span>
    </Link>
  );
}
