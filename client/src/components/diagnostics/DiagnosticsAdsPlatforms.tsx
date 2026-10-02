import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Copy, Info, LayoutGrid, Loader2, Megaphone, Settings } from "lucide-react";
import { IconBrandGoogle, IconBrandMeta } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import { formatGoogleCustomerId } from "@shared/ads-settings";
import { GOOGLE_NETWORK_LABELS } from "@shared/paid-traffic";
import { isRefreshActive } from "@shared/ads-refresh-status";
import type { AdsDiagnosticsOverview, AdsDiagnosticsStatus, AdsIssueRow, AdsPlatformCard, AdsResolvedRow, GoogleAdsDiagnostics } from "@/components/ads/ads-types";
import { formatMoney, formatNum, formatWhen } from "@/components/ads/ads-format";
import { PaidPagesCard } from "@/components/ads/PaidPagesCard";
import { AdsRefreshNotice } from "@/components/ads/AdsRefreshNotice";
import { AdsResyncButton } from "@/components/ads/AdsResyncButton";
import { DiagnosticsAdsPanel, RESOLUTION_LABEL } from "@/components/diagnostics/DiagnosticsAdsPanel";
import { AdsRunBar, adsRunPollMs } from "@/components/diagnostics/AdsRunBar";
import { AdsIssueStateBadges, AdsIssueVerifyPanel } from "@/components/diagnostics/AdsIssueActions";

type AdsView = "overview" | "meta" | "google";

export function resolveAdsView(pathname: string): AdsView {
  if (/\/diagnostics\/ads\/meta\/?$/.test(pathname)) return "meta";
  if (/\/diagnostics\/ads\/google\/?$/.test(pathname)) return "google";
  return "overview";
}

const VIEW_HREF: Record<AdsView, string> = {
  overview: "/private/diagnostics/ads",
  meta: "/private/diagnostics/ads/meta",
  google: "/private/diagnostics/ads/google",
};

const SEVERITY_STYLE: Record<AdsIssue["severity"], { Icon: typeof AlertTriangle; className: string }> = {
  error: { Icon: CircleAlert, className: "text-destructive" },
  warning: { Icon: AlertTriangle, className: "text-amber-500" },
  info: { Icon: Info, className: "text-muted-foreground" },
};

function statusStyle(status: AdsDiagnosticsStatus): string {
  return status === "errors"
    ? "border-destructive/40 bg-destructive/10"
    : status === "warnings"
      ? "border-amber-500/40 bg-amber-500/10"
      : status === "ok"
        ? "border-chart-3/40 bg-chart-3/10"
        : "border-border bg-muted/40";
}

function statusLabel(status: AdsDiagnosticsStatus, errors: number, warnings: number): string {
  if (status === "not_connected") return "Not connected";
  if (status === "ok") return "Healthy";
  return `${errors} error(s), ${warnings} warning(s)`;
}

function ReadMore({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-foreground" data-testid={testId}>
        Read more (advanced)
        <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1 text-xs text-muted-foreground">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Tile({ label, value, hint, tone, testId }: { label: string; value: string; hint?: ReactNode; tone?: "error" | "warning"; testId: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3" data-testid={`kpi-${testId}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums text-foreground", tone === "error" && "text-destructive", tone === "warning" && "text-amber-500")}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function WindowPicker({ days, onChange }: { days: 7 | 28 | 90; onChange: (d: 7 | 28 | 90) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Numbers for</span>
      <ToggleButtonBar value={String(days)} onValueChange={(v) => onChange(v === "7" ? 7 : v === "90" ? 90 : 28)} listTestId="ads-window" listClassName="flex">
        <ToggleButtonBarTrigger value="7">7 days</ToggleButtonBarTrigger>
        <ToggleButtonBarTrigger value="28">28 days</ToggleButtonBarTrigger>
        <ToggleButtonBarTrigger value="90">90 days</ToggleButtonBarTrigger>
      </ToggleButtonBar>
    </div>
  );
}

function IssueRow({ issue, onChanged }: { issue: AdsIssueRow; onChanged: () => void }) {
  const s = SEVERITY_STYLE[issue.severity];
  const spend = Object.keys(issue.spend_affected).length > 0 ? formatMoney(issue.spend_affected) : null;
  return (
    <Collapsible className="border-b border-border last:border-b-0" data-testid={`ads-issue-${issue.id}`}>
      <CollapsibleTrigger className="group flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left">
        <span className="flex min-w-0 items-start gap-2">
          <s.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.className)} />
          <span className="min-w-0 space-y-0.5">
            <span className="block text-sm text-foreground">{issue.title}</span>
            <AdsIssueStateBadges issue={issue} />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {spend && <span className="tabular-nums">{spend}</span>}
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-9 pb-3 text-sm">
        <p className="text-muted-foreground">{issue.why}</p>
        <p className="text-foreground">
          <span className="font-medium">How to fix: </span>
          {issue.how_to_fix}
        </p>
        {issue.first_seen && <p className="text-xs text-muted-foreground">Open since {formatWhen(issue.first_seen)}</p>}
        <AdsIssueVerifyPanel issue={issue} onChanged={onChanged} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function IssuesCard({
  title,
  issues,
  resolved,
  emptyText,
  windowDays,
  testId,
  onChanged,
}: {
  title: string;
  issues: AdsIssueRow[];
  resolved?: AdsResolvedRow[];
  emptyText: string;
  windowDays: number;
  testId: string;
  onChanged: () => void;
}) {
  const [list, setList] = useState<"issues" | "resolved">("issues");
  const open = issues.filter((i) => i.severity !== "info");
  const openCount = open.filter((i) => i.verify.state === "open").length;
  const infos = issues.filter((i) => i.severity === "info");
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            {title} <span className="tabular-nums text-muted-foreground">({openCount})</span>
          </CardTitle>
          {resolved && (
            <ToggleButtonBar value={list} onValueChange={(v) => setList(v as "issues" | "resolved")} listTestId={`${testId}-list`} listClassName="flex">
              <ToggleButtonBarTrigger value="issues">Issues ({openCount})</ToggleButtonBarTrigger>
              <ToggleButtonBarTrigger value="resolved">Resolved ({resolved.length})</ToggleButtonBarTrigger>
            </ToggleButtonBar>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Found by the last check over the last {windowDays} days; changing the window above doesn&apos;t hide or resolve them. Issues you marked as fixed
          stay listed as pending until they&apos;re confirmed.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {list === "resolved" && resolved ? (
          resolved.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing resolved yet.</p>
          ) : (
            resolved.map((r) => (
              <div key={`${r.id}-${r.resolved_at}`} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0">
                <span className="flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-chart-3" /> {r.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {RESOLUTION_LABEL[r.resolution]} · {formatWhen(r.resolved_at)}
                </span>
              </div>
            ))
          )
        ) : open.length + infos.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-chart-3" /> {emptyText}
          </p>
        ) : (
          [...open, ...infos].map((i) => <IssueRow key={i.id} issue={i} onChanged={onChanged} />)
        )}
      </CardContent>
    </Card>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────
function PlatformSummaryCard({ name, Icon, card, view, settingsHref }: { name: string; Icon: typeof IconBrandMeta; card: AdsPlatformCard; view: AdsView; settingsHref: string }) {
  return (
    <Card className={cn("border", statusStyle(card.status))} data-testid={`ads-overview-card-${view}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4" /> {name}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{statusLabel(card.status, card.open_errors, card.open_warnings)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!card.connected ? (
          <p className="text-muted-foreground">
            Not connected.{" "}
            <Link href={settingsHref} className="underline underline-offset-2 hover:text-foreground">
              Connect it in Settings → Ads
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Spend</p>
                <p className="tabular-nums text-foreground">{formatMoney(card.spend)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{name} leads</p>
                <p className="tabular-nums text-foreground">{formatNum(card.platform_leads)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Site leads</p>
                <p className="tabular-nums text-foreground">{formatNum(card.site_leads)}</p>
              </div>
            </div>
            {card.top_issues.length > 0 ? (
              <ul className="space-y-1" data-testid={`ads-overview-top-${view}`}>
                {card.top_issues.map((i) => {
                  const s = SEVERITY_STYLE[i.severity];
                  return (
                    <li key={i.id} className="flex items-start gap-2 text-xs text-foreground">
                      <s.Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", s.className)} /> {i.title}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-chart-3" /> No open issues.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {view === "google" ? `Google data through ${card.data_through ?? "—"}` : `Synced ${formatWhen(card.last_synced_at)}`}
            </p>
          </>
        )}
        <Link href={VIEW_HREF[view]} className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2" data-testid={`link-ads-overview-${view}`}>
          Open {name} diagnostics <ChevronRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

export function DiagnosticsAdsOverview() {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["/api/diagnostics/ads", "overview", days],
    queryFn: async () => {
      const res = await apiFetch(`/api/diagnostics/ads?platform=overview&days=${days}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load Ads overview");
      return res.json() as Promise<AdsDiagnosticsOverview>;
    },
    placeholderData: (prev) => prev,
    refetchInterval: (q) => adsRunPollMs((q.state.data as AdsDiagnosticsOverview | undefined)?.run) || false,
  });
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Ads overview…
      </div>
    );
  }
  if (error || !data) return <p className="py-8 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load Ads overview"}</p>;
  const noneConnected = !data.platforms.meta.connected && !data.platforms.google.connected;
  return (
    <div className="space-y-4" data-testid="diagnostics-ads-overview">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm", statusStyle(data.status))} data-testid="ads-overview-status">
        <span className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          {noneConnected
            ? "No ad platform is connected yet."
            : data.status === "ok"
              ? "Ads tracking looks healthy on every connected platform."
              : `${data.open_errors} error(s), ${data.open_warnings} warning(s) across your ad platforms.`}
        </span>
        <Button asChild size="sm" variant="ghost">
          <Link href="/private/settings/ads" data-testid="link-ads-overview-settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        One status for all ad platforms; open a platform for the evidence behind each issue. Leads each platform reports are never added together.
      </p>
      {!noneConnected && <AdsRunBar run={data.run} onChanged={() => void refetch()} testIdPrefix="ads-overview" />}
      <div className="flex justify-end">
        {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />}
        <WindowPicker days={days} onChange={setDays} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile label="Spend, all platforms" value={formatMoney(data.totals.spend)} testId="overview-spend" />
        <Tile label="Site leads" value={formatNum(data.totals.site_leads)} hint="each lead counted once, whatever the platform" testId="overview-site-leads" />
        <Tile label="Paid visits" value={formatNum(data.totals.paid_visits)} testId="overview-paid-visits" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PlatformSummaryCard name="Meta" Icon={IconBrandMeta} card={data.platforms.meta} view="meta" settingsHref="/private/settings/ads/meta" />
        <PlatformSummaryCard name="Google Ads" Icon={IconBrandGoogle} card={data.platforms.google} view="google" settingsHref="/private/settings/ads/google" />
      </div>
      <IssuesCard
        title="Lead tracking (all platforms)"
        issues={data.shared_issues}
        emptyText="Lead records and consent look fine."
        windowDays={data.window_days}
        testId="card-ads-shared-issues"
        onChanged={() => void refetch()}
      />
    </div>
  );
}

// ── Google ──────────────────────────────────────────────────────────────────
export function DiagnosticsGoogleAdsPanel() {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const { toast } = useToast();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["/api/diagnostics/ads", "google", days],
    queryFn: async () => {
      const res = await apiFetch(`/api/diagnostics/ads?platform=google&days=${days}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load Google Ads diagnostics");
      return res.json() as Promise<GoogleAdsDiagnostics>;
    },
    placeholderData: (prev) => prev,
    refetchInterval: (q) => {
      const d = q.state.data as GoogleAdsDiagnostics | undefined;
      const state = d?.refresh?.state;
      return state === "running" ? 3000 : adsRunPollMs(d?.run) || (state === "queued" ? 8000 : false);
    },
  });
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Google Ads diagnostics…
      </div>
    );
  }
  if (error || !data) return <p className="py-8 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load Google Ads diagnostics"}</p>;
  const k = data.kpis;
  const vm = data.google.visit_match;
  const googleVisits = vm.ga4_link + vm.gclid + vm.tags + vm.none;
  const pct = (n: number) => (googleVisits > 0 ? `${Math.round((n / googleVisits) * 100)}%` : "—");
  return (
    <div className="space-y-4" data-testid="diagnostics-google-ads-panel">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm", statusStyle(data.status))} data-testid="google-ads-status">
        <span className="flex items-center gap-2">
          <IconBrandGoogle className="h-4 w-4" />
          {data.status === "not_connected" ? (
            <span>
              Google Ads is not connected.{" "}
              <Link href="/private/settings/ads/google" className="underline underline-offset-2">
                Connect it in Settings → Ads
              </Link>
              .
            </span>
          ) : (
            <span>
              {data.status === "ok" ? "Google Ads tracking looks healthy." : `${k.open_errors} error(s), ${k.open_warnings} warning(s).`} Google data through{" "}
              {data.google.data_through ?? "—"} · synced {formatWhen(data.google.last_synced_at)}
              {isRefreshActive(data.refresh) ? " · refreshing…" : ""}
            </span>
          )}
        </span>
        <Button asChild size="sm" variant="ghost">
          <Link href="/private/settings/ads/google" data-testid="link-google-ads-settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <AdsRefreshNotice refresh={data.refresh} testId="google-ads-refresh-notice" settingsHref="/private/settings/ads/google" />

      {data.status !== "not_connected" && <AdsRunBar run={data.run} onChanged={() => void refetch()} testIdPrefix="google-ads" />}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isFetching && !isRefreshActive(data.refresh) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {data.status !== "not_connected" && <AdsResyncButton refresh={data.refresh} onStarted={() => void refetch()} testIdPrefix="google-ads-diagnostics" endpoint="/api/ads/sync" />}
        <WindowPicker days={days} onChange={setDays} />
      </div>

      {data.status !== "not_connected" && (
        <>
          <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-3" data-testid="google-ads-kpis">
            <Tile
              label="Spend"
              value={formatMoney(k.spend)}
              hint={Object.keys(k.no_site_spend).length > 0 ? `${formatMoney(k.no_site_spend)} never reaches the site` : "all can reach the site"}
              testId="google-spend"
            />
            <Tile
              label="Open issues"
              value={String(k.open_errors + k.open_warnings)}
              tone={k.open_errors > 0 ? "error" : k.open_warnings > 0 ? "warning" : undefined}
              hint={`last ${data.issue_window_days} days`}
              testId="google-issues"
            />
            <Tile label="Leads: Google vs site" value={`${formatNum(k.google_leads)} / ${formatNum(k.site_leads)}`} hint="never added together" testId="google-leads" />
            <Tile label="Clicks → visits" value={k.clicks_to_visits_pct != null ? `${k.clicks_to_visits_pct}%` : "—"} hint="of Google clicks we saw arrive" testId="google-ctv" />
            <Tile label="Visits tied to a campaign" value={k.matched_visits_pct != null ? `${k.matched_visits_pct}%` : "—"} hint={`${formatNum(k.paid_visits)} paid Google visits`} testId="google-matched" />
            <Tile label="Paid visits" value={formatNum(k.paid_visits)} testId="google-visits" />
          </div>

          <Card data-testid="card-google-matching">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How visits are matched to campaigns</CardTitle>
              <p className="text-sm text-muted-foreground">
                The more visits GA4&apos;s Google Ads link covers, the more accurate campaign and page numbers are. Unmatched visits still count as
                paid Google traffic.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile label="GA4 link" value={pct(vm.ga4_link)} testId="match-ga4" />
                <Tile label="Click id join" value={pct(vm.gclid)} testId="match-gclid" />
                <Tile label="URL suffix" value={pct(vm.tags)} testId="match-tags" />
                <Tile label="Not matched" value={pct(vm.none)} testId="match-none" />
              </div>
              <div className="flex gap-2">
                <Input readOnly value={data.url_suffix_template} className="font-mono text-xs" data-testid="input-google-diag-suffix" />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(data.url_suffix_template);
                    toast({ title: "Copied" });
                  }}
                  data-testid="button-copy-google-diag-suffix"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <ReadMore testId="button-google-matching-advanced">
                <p>
                  GA4 link: <code className="font-mono">session_traffic_source_last_click.google_ads_campaign</code> in the GA4 export (
                  {data.matching.ga4_link_available === false ? "not in this export yet" : "read"}).
                </p>
                <p>
                  Click id join: the landing <code className="font-mono">gclid</code> joined to <code className="font-mono">ClickStats</code> inside BigQuery (
                  {data.matching.gclid_join_error ? `off: ${data.matching.gclid_join_error}` : `${data.matching.gclid_join_tables} table(s)`}). Click ids are never
                  stored by us.
                </p>
                <p>URL suffix: utm_id / utm_term / utm_content carry campaign / ad group / ad ids. Paste it in Google Ads → Account settings → Final URL suffix.</p>
              </ReadMore>
            </CardContent>
          </Card>

          {data.networks && data.networks.rows.length > 0 && (
            <Card data-testid="card-google-networks">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Where Google showed your ads</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.networks.rows.map((n) => (
                  <div key={n.network} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0" data-testid={`google-network-${n.network}`}>
                    <span className="text-foreground">{GOOGLE_NETWORK_LABELS[n.network] ?? n.network}</span>
                    <span className="flex gap-5 tabular-nums">
                      <span>{formatMoney(n.spend)}</span>
                      <span className="text-muted-foreground">{formatNum(n.clicks)} clicks</span>
                      <span className="text-muted-foreground">{formatNum(n.paid_visits)} visits</span>
                    </span>
                  </div>
                ))}
                {data.networks.not_split_share != null && data.networks.not_split_share > 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {Math.round(data.networks.not_split_share * 100)}% of paid Google visits couldn&apos;t be tied to a network (needs the click id join).
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {data.google.unconnected_accounts.length > 0 && (
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground" data-testid="google-unconnected-accounts">
              Paid visits also came from {data.google.unconnected_accounts.map((a) => `${formatGoogleCustomerId(a.customer_id)} (${formatNum(a.paid_visits)})`).join(", ")}, which
              aren&apos;t ticked in Settings. Their spend isn&apos;t counted.
            </p>
          )}
        </>
      )}

      <IssuesCard
        title="Google Ads issues"
        issues={data.issues}
        resolved={data.resolved}
        emptyText={data.run.never_run ? "No checks have run yet. Press Run checks above to look for problems." : "No Google Ads issues found in the last check."}
        windowDays={data.issue_window_days}
        testId="card-google-ads-issues"
        onChanged={() => void refetch()}
      />

      {data.status !== "not_connected" && <PaidPagesCard days={days} initialPlatform="google" />}
    </div>
  );
}

// ── Router ──────────────────────────────────────────────────────────────────
const VIEWS: Array<{ id: AdsView; label: string; Icon: typeof LayoutGrid }> = [
  { id: "overview", label: "Overview", Icon: LayoutGrid },
  { id: "meta", label: "Meta", Icon: IconBrandMeta as unknown as typeof LayoutGrid },
  { id: "google", label: "Google Ads", Icon: IconBrandGoogle as unknown as typeof LayoutGrid },
];

export function DiagnosticsAdsRoute() {
  const [pathname, setLocation] = useLocation();
  const view = resolveAdsView(pathname);
  return (
    <div className="space-y-4">
      <ToggleButtonBar value={view} onValueChange={(v) => setLocation(VIEW_HREF[v as AdsView])} listTestId="ads-diagnostics-views" listClassName="flex">
        {VIEWS.map((v) => (
          <ToggleButtonBarTrigger key={v.id} value={v.id} data-testid={`ads-view-${v.id}`} className="gap-1.5">
            <v.Icon className="h-3.5 w-3.5" />
            {v.label}
          </ToggleButtonBarTrigger>
        ))}
      </ToggleButtonBar>
      {view === "overview" && <DiagnosticsAdsOverview />}
      {view === "meta" && <DiagnosticsAdsPanel />}
      {view === "google" && <DiagnosticsGoogleAdsPanel />}
    </div>
  );
}
