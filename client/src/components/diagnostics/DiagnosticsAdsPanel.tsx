import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleAlert, Copy, Info, Loader2, Megaphone, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsDiagnostics, ConsentRegionRate } from "@/components/ads/ads-types";
import { formatMoney, formatNum, formatWhen } from "@/components/ads/ads-format";
import { PaidPagesCard } from "@/components/ads/PaidPagesCard";

const SEVERITY_STYLE: Record<AdsIssue["severity"], { Icon: typeof AlertTriangle; className: string; label: string }> = {
  error: { Icon: CircleAlert, className: "text-destructive", label: "Error" },
  warning: { Icon: AlertTriangle, className: "text-amber-500", label: "Warning" },
  info: { Icon: Info, className: "text-muted-foreground", label: "Info" },
};

const REGION_LABELS: Record<ConsentRegionRate["region"], string> = {
  ask: "Ask (must choose)",
  notice: "Notice",
  unknown: "Unknown country",
};

function Kpi({ label, value, hint, tone, testId }: { label: string; value: string; hint?: string; tone?: "error" | "warning"; testId: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5" data-testid={`kpi-${testId}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "error" ? "text-destructive" : tone === "warning" ? "text-amber-500" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function IssueRow({ issue, template }: { issue: AdsIssue; template: string }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const style = SEVERITY_STYLE[issue.severity];
  const showTemplate = issue.code === "missing_tracking_params" || issue.code === "non_paid_medium" || issue.code === "unclear_share_high" || issue.code === "spend_zero_visits";
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border last:border-b-0">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-start gap-3 px-3 py-2.5 text-left" data-testid={`ads-issue-${issue.id}`}>
          <style.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.className)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{issue.title}</p>
            {Object.keys(issue.spend_affected).length > 0 && (
              <p className="text-xs text-muted-foreground">Spend affected: {formatMoney(issue.spend_affected)}</p>
            )}
          </div>
          <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-10 pb-3 text-sm" data-testid={`ads-issue-drawer-${issue.id}`}>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why it matters</p>
          <p className="text-foreground/90">{issue.why}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How to fix</p>
          <p className="text-foreground/90">{issue.how_to_fix}</p>
        </div>
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
          </div>
        )}
        {issue.scope.url && (
          <a href={issue.scope.url} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
            {issue.scope.url}
          </a>
        )}
        {!issue.site_fixable && <p className="text-xs text-muted-foreground">This is fixed in Ads Manager or Tag Manager, not on the site.</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DiagnosticsAdsPanel() {
  const [days, setDays] = useState<7 | 28>(28);
  const [list, setList] = useState<"issues" | "resolved">("issues");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/diagnostics/ads", days],
    queryFn: async () => {
      const res = await apiFetch(`/api/diagnostics/ads?days=${days}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load Ads diagnostics");
      return res.json() as Promise<AdsDiagnostics>;
    },
    refetchInterval: (q) => ((q.state.data as AdsDiagnostics | undefined)?.refreshing ? 8000 : false),
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
  const statusStyle =
    data.status === "errors"
      ? "border-destructive/40 bg-destructive/10"
      : data.status === "warnings"
        ? "border-amber-500/40 bg-amber-500/10"
        : data.status === "ok"
          ? "border-chart-3/40 bg-chart-3/10"
          : "border-border bg-muted/40";
  const issues = data.issues.filter((i) => i.severity !== "info");
  const infos = data.issues.filter((i) => i.severity === "info");

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
              {data.status === "ok" ? "Ads tracking looks healthy." : `${k.open_errors} error(s), ${k.open_warnings} warning(s).`} Meta synced{" "}
              {formatWhen(data.meta.last_synced_at)}
              {data.refreshing ? " · refreshing…" : ""}
              {data.collecting_since ? ` · site leads since ${data.collecting_since.slice(0, 10)}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ToggleButtonBar value={String(days)} onValueChange={(v) => setDays(v === "7" ? 7 : 28)} listTestId="ads-window" listClassName="flex">
            <ToggleButtonBarTrigger value="7">7 days</ToggleButtonBarTrigger>
            <ToggleButtonBarTrigger value="28">28 days</ToggleButtonBarTrigger>
          </ToggleButtonBar>
          <Button asChild size="sm" variant="ghost">
            <Link href="/private/settings/ads/meta" data-testid="link-ads-settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {data.missing_floor_currencies.length > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" data-testid="ads-missing-floor">
          Set an urgent-spend amount for {data.missing_floor_currencies.join(", ")} in Settings → Ads → Alert thresholds.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="ads-kpis">
        <Kpi label="Tracked spend" value={formatMoney(k.tracked_spend)} hint={trackedShare != null ? `${trackedShare}% lands on our pages` : undefined} testId="tracked-spend" />
        <Kpi label="Spend" value={formatMoney(k.spend)} testId="spend" />
        <Kpi label="Open errors" value={String(k.open_errors)} tone={k.open_errors > 0 ? "error" : undefined} testId="errors" />
        <Kpi label="Open warnings" value={String(k.open_warnings)} tone={k.open_warnings > 0 ? "warning" : undefined} testId="warnings" />
        <Kpi
          label="Leads: Meta vs site"
          value={`${formatNum(k.meta_leads)} / ${formatNum(k.site_leads)}`}
          hint={k.repeat_submissions > 0 ? `+${k.repeat_submissions} repeats` : "never added together"}
          testId="leads"
        />
        <Kpi label="Clicks → visits" value={k.clicks_to_visits_pct != null ? `${k.clicks_to_visits_pct}%` : "—"} testId="clicks-visits" />
        <Kpi label="Meta: unclear" value={k.meta_unclear_pct != null ? `${k.meta_unclear_pct}%` : "—"} hint="visits without campaign tags" testId="unclear" />
        <Kpi label="Consent rate" value={k.consent_accept_pct != null ? `${k.consent_accept_pct}%` : "—"} hint="banner accepts" testId="consent" />
      </div>

      <Card data-testid="card-ads-issues">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Tracking issues</CardTitle>
            <ToggleButtonBar value={list} onValueChange={(v) => setList(v as "issues" | "resolved")} listTestId="ads-issue-list" listClassName="flex">
              <ToggleButtonBarTrigger value="issues">Issues ({issues.length})</ToggleButtonBarTrigger>
              <ToggleButtonBarTrigger value="resolved">Resolved ({data.resolved.length})</ToggleButtonBarTrigger>
            </ToggleButtonBar>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {list === "issues" ? (
            issues.length === 0 && infos.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground" data-testid="ads-no-issues">
                <CheckCircle2 className="h-4 w-4 text-chart-3" /> No tracking issues found. Issues clear on the next sync once fixed.
              </p>
            ) : (
              <div>
                {[...issues, ...infos].map((i) => (
                  <IssueRow key={i.id} issue={i} template={data.utm_template} />
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
      </Card>

      <Card data-testid="card-ads-consent">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consent rate</CardTitle>
          <p className="text-sm text-muted-foreground">Fewer accepts means fewer measured visits, not fewer real visits.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {data.consent.map((r) => (
              <div key={r.region} className="rounded-md border border-border p-3" data-testid={`consent-region-${r.region}`}>
                <p className="text-sm font-medium text-foreground">{REGION_LABELS[r.region]}</p>
                <p className="text-xs text-muted-foreground">{formatNum(r.shown)} banners shown</p>
                <div className="mt-2 flex gap-4 text-sm tabular-nums">
                  <span>Accept {r.accept_pct != null ? `${r.accept_pct}%` : "—"}</span>
                  <span className="text-muted-foreground">Reject {r.reject_pct != null ? `${r.reject_pct}%` : "—"}</span>
                  <span className="text-muted-foreground">Ignore {r.ignore_pct != null ? `${r.ignore_pct}%` : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <PaidPagesCard issues={data.issues} />
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
