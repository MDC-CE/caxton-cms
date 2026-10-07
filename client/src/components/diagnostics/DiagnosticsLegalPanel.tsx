import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Info, Loader2, Scale, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatNum } from "@/components/ads/ads-format";
import type { ConsentRegionRate, LegalDiagnostics, LegalDiagnosticsSummary } from "@shared/legal-diagnostics";

const LEGAL_SETTINGS_HREF = "/private/settings/legal";

const REGION_LABELS: Record<ConsentRegionRate["region"], string> = {
  ask: "Ask (must choose)",
  notice: "Notice",
  unknown: "Unknown country",
};

function pct(v: number | null): string {
  return v != null ? `${v}%` : "—";
}

function Kpi({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2.5" data-testid={`kpi-legal-${testId}`}>
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ConsentAdvancedInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Read more (advanced)" data-testid="button-legal-consent-advanced">
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p className="text-sm font-medium text-foreground">Read more (advanced)</p>
        <p>
          Counts only — no visitor IDs. Stored per day, country and banner mode in the site pipeline SQLite table{" "}
          <code className="font-mono">consent_daily</code> (about 25 months kept).
        </p>
        <p>
          Which countries must choose (Ask) or just see a notice comes from the banner rules in Settings → Legal → Consent Window. Visitors
          whose country we cannot detect are counted as Unknown.
        </p>
        <p>The drop warning compares the Ask accept rate (accepts ÷ decisions) against the 28 days before this window, and needs at least 100 banners shown.</p>
      </PopoverContent>
    </Popover>
  );
}

export function DiagnosticsLegalPanel() {
  const [days, setDays] = useState<7 | 28>(28);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/diagnostics/legal", days],
    queryFn: async () => {
      const res = await apiFetch(`/api/diagnostics/legal?days=${days}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load Legal diagnostics");
      return res.json() as Promise<LegalDiagnostics>;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Legal diagnostics…
      </div>
    );
  }
  if (error || !data) {
    return <p className="py-8 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load Legal diagnostics"}</p>;
  }

  const k = data.kpis;
  const statusStyle =
    data.status === "warnings" ? "border-amber-500/40 bg-amber-500/10" : data.status === "ok" ? "border-chart-3/40 bg-chart-3/10" : "border-border bg-muted/40";
  const statusText =
    data.status === "warnings"
      ? `${data.issues.length} warning(s) about the tracking banner.`
      : data.status === "ok"
        ? "The tracking banner looks healthy."
        : "No banner events in this window.";

  return (
    <div className="space-y-4" data-testid="diagnostics-legal-panel">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3", statusStyle)} data-testid="legal-status-bar">
        <div className="flex items-center gap-2 text-sm">
          <Scale className="h-4 w-4" />
          <span>{statusText}</span>
        </div>
        <div className="flex items-center gap-2">
          <ToggleButtonBar value={String(days)} onValueChange={(v) => setDays(v === "7" ? 7 : 28)} listTestId="legal-window" listClassName="flex">
            <ToggleButtonBarTrigger value="7">7 days</ToggleButtonBarTrigger>
            <ToggleButtonBarTrigger value="28">28 days</ToggleButtonBarTrigger>
          </ToggleButtonBar>
          <Button asChild size="sm" variant="ghost">
            <Link href={LEGAL_SETTINGS_HREF} aria-label="Legal settings" data-testid="link-legal-settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4" data-testid="legal-kpis">
        <Kpi label="Banners shown" value={formatNum(k.banners_shown)} testId="shown" />
        <Kpi label="Accept" value={pct(k.accept_pct)} testId="accept" />
        <Kpi label="Reject" value={pct(k.reject_pct)} testId="reject" />
        <Kpi label="Ignore" value={pct(k.ignore_pct)} testId="ignore" />
      </div>

      {data.issues.length > 0 && (
        <Card data-testid="card-legal-issues">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Issues</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.issues.map((issue) => (
              <div key={issue.id} className="flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0" data-testid={`legal-issue-${issue.id}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-foreground">{issue.title}</p>
                  <p className="text-muted-foreground">{issue.why}</p>
                  <p className="text-foreground/90">{issue.how_to_fix}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-legal-consent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-1">
            <CardTitle className="text-base">Consent rate</CardTitle>
            <ConsentAdvancedInfo />
          </div>
          <p className="text-sm text-muted-foreground">
            How visitors respond to the tracking banner. Fewer accepts means fewer measured visits, not fewer real visits.
          </p>
        </CardHeader>
        <CardContent>
          {k.banners_shown === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="legal-consent-empty">
              No banner events in this window. Check that the consent banner is on in{" "}
              <Link href={LEGAL_SETTINGS_HREF} className="underline underline-offset-2 hover:text-foreground">
                Settings → Legal
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {data.consent.map((r) => (
                <div key={r.region} className="rounded-md border border-border p-3" data-testid={`consent-region-${r.region}`}>
                  <p className="text-sm font-medium text-foreground">{REGION_LABELS[r.region]}</p>
                  <p className="text-xs text-muted-foreground">{formatNum(r.shown)} banners shown</p>
                  <div className="mt-2 flex gap-4 text-sm tabular-nums">
                    <span>Accept {pct(r.accept_pct)}</span>
                    <span className="text-muted-foreground">Reject {pct(r.reject_pct)}</span>
                    <span className="text-muted-foreground">Ignore {pct(r.ignore_pct)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function LegalGlobalRollupCard() {
  const { data } = useQuery({
    queryKey: ["/api/diagnostics/legal", "summary"],
    queryFn: async () => {
      const res = await apiFetch("/api/diagnostics/legal?summary=1");
      if (!res.ok) return null;
      return res.json() as Promise<LegalDiagnosticsSummary>;
    },
    staleTime: 5 * 60 * 1000,
  });
  if (!data || data.open_warnings === 0) return null;
  return (
    <Link
      href="/private/diagnostics/legal"
      className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm"
      data-testid="legal-global-rollup"
    >
      <span className="flex items-center gap-2">
        <Scale className="h-4 w-4" />
        Legal: fewer visitors accept tracking — measured visits may look lower than real traffic
      </span>
      <span className="text-xs underline underline-offset-2">Open Legal diagnostics</span>
    </Link>
  );
}
