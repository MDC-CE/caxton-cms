import { useEffect, useMemo, useState } from "react";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconBrandMeta,
  IconChevronDown,
  IconCircleCheck,
  IconCopy,
  IconDeviceFloppy,
  IconFlask,
  IconHistory,
  IconLoader2,
  IconPlugConnected,
  IconRefresh,
  IconToggleLeft,
  IconToggleRight,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDebugAuth } from "@/hooks/useDebugAuth";
import { apiFetch, apiRequest } from "@/lib/queryClient";
import { DEFAULT_ADS_ALERT_THRESHOLDS, type AdsAlertThresholds, type AdsSettings } from "@shared/ads-settings";

type SettingsResponse = {
  ads: AdsSettings;
  token_configured: boolean;
  api_version: string;
  utm_template: string;
  refreshing: boolean;
  sync: {
    last_success_at: string | null;
    last_attempt_at: string | null;
    last_error: string | null;
    last_error_kind: string | null;
    consecutive_failures: number;
    history_since: string | null;
    history_until: string | null;
    accounts: Record<string, { name?: string; currency?: string; account_status?: number; error?: string }>;
  };
  ga4: { configured: boolean; last_success_at: string | null; last_export_date: string | null; last_error: string | null };
  policy: { refresh_days: number; backfill_days: number; retention_days: number; cache_dir: string };
};

type TestResponse = {
  ok: boolean;
  token_configured: boolean;
  error?: string;
  accounts: Array<{ id: string; ok: boolean; name?: string; currency?: string; error?: string }>;
};

type NumericThresholdKey = Exclude<keyof AdsAlertThresholds, "severity_spend_floor">;

const THRESHOLD_FIELDS: { key: NumericThresholdKey; label: string; hint: string; suffix?: string }[] = [
  { key: "severity_spend_share_pct", label: "Urgent when share of spend ≥", hint: "An issue becomes an error at this share of total spend…", suffix: "%" },
  { key: "clicks_visits_drop_pct", label: "Clicks → visits drop", hint: "Warn when the ratio falls this much vs the previous 28 days.", suffix: "%" },
  { key: "clicks_visits_floor_pct", label: "Clicks → visits floor", hint: "Always warn below this ratio.", suffix: "%" },
  { key: "ratio_min_clicks", label: "Min clicks to judge", hint: "Ignore the ratio below this many clicks." },
  { key: "unclear_share_pct", label: "Unclear Meta visits above", hint: "Visits with only Meta's click id and no tags.", suffix: "%" },
  { key: "unclear_min_sessions", label: "…with at least", hint: "Meta visits in the window.", suffix: "visits" },
  { key: "ga4_ledger_gap_widen_pts", label: "GA4 vs site gap widens by", hint: "Points vs the previous 28 days.", suffix: "pts" },
  { key: "ga4_ledger_gap_bootstrap_pct", label: "First 28 days gap", hint: "Fixed gap while our lead records are new.", suffix: "%" },
  { key: "zero_visits_complete_days", label: "Spend with no visits over", hint: "Complete GA4 days before it counts as an error.", suffix: "days" },
  { key: "min_paid_visits_for_rates", label: "Grey out rates below", hint: "Paid visits needed before rates are shown.", suffix: "visits" },
];

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function parseIds(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,]+/).map((s) => s.trim().replace(/^act_/i, "")).filter(Boolean)));
}

function ReadMore({ testId, children }: { testId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid={testId}>
          Read more (advanced)
          <IconChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-1 text-xs text-muted-foreground">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function MetaAdsTab() {
  const { hasCapability } = useDebugAuth();
  const canEdit = hasCapability("ads_settings");
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/settings/ads/meta"],
    queryFn: async () => {
      const res = await apiFetch("/api/settings/ads/meta");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load Ads settings");
      return res.json() as Promise<SettingsResponse>;
    },
    refetchInterval: (q) => ((q.state.data as SettingsResponse | undefined)?.refreshing ? 5000 : false),
  });

  const [enabled, setEnabled] = useState(false);
  const [idsText, setIdsText] = useState("");
  const [patternsText, setPatternsText] = useState("");
  const [thresholds, setThresholds] = useState<AdsAlertThresholds>(DEFAULT_ADS_ALERT_THRESHOLDS);
  const [floorText, setFloorText] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState<null | "refresh" | "older">(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);

  useEffect(() => {
    if (!data || dirty) return;
    setEnabled(data.ads.meta.enabled);
    setIdsText(data.ads.meta.ad_account_ids.join("\n"));
    setPatternsText(data.ads.test_email_patterns.join("\n"));
    setThresholds(data.ads.meta.alert_thresholds);
    setFloorText(Object.fromEntries(Object.entries(data.ads.meta.alert_thresholds.severity_spend_floor).map(([c, v]) => [c, String(v)])));
  }, [data, dirty]);

  const accountCurrencies = useMemo(
    () => Array.from(new Set(Object.values(data?.sync.accounts ?? {}).map((a) => a.currency).filter((c): c is string => !!c))),
    [data],
  );
  const missingFloors = accountCurrencies.filter((c) => !(c in floorText));

  async function save() {
    setSaving(true);
    try {
      const floors: Record<string, number> = {};
      for (const [c, v] of Object.entries(floorText)) {
        const n = Number(v);
        if (/^[A-Z]{3}$/.test(c) && Number.isFinite(n) && v.trim() !== "") floors[c] = n;
      }
      const res = await apiRequest("PUT", "/api/settings/ads/meta", {
        enabled,
        ad_account_ids: parseIds(idsText),
        test_email_patterns: patternsText.split(/\n+/).map((s) => s.trim()).filter(Boolean),
        alert_thresholds: { ...thresholds, severity_spend_floor: floors },
      });
      const body = (await res.json()) as SettingsResponse & { sync_requested?: boolean };
      setDirty(false);
      toast({
        title: "Ads settings saved",
        description: body.sync_requested ? "Loading the last 90 days from Meta in the background." : undefined,
      });
      await refetch();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/settings/ads/meta/test", { ad_account_ids: parseIds(idsText) });
      const body = (await res.json()) as TestResponse;
      setTestResult(body);
      toast({
        title: body.ok ? "Meta connected" : "Meta test failed",
        description: body.ok ? `${body.accounts.length} account(s) readable.` : body.error || "One or more accounts failed.",
        variant: body.ok ? undefined : "destructive",
      });
    } catch (err) {
      toast({ title: "Meta test failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  async function sync(mode: "refresh" | "older") {
    setSyncing(mode);
    try {
      await apiRequest("POST", "/api/ads/meta/sync", { mode });
      toast({ title: mode === "older" ? "Loading older history" : "Sync started", description: "This runs in the background." });
      await refetch();
    } catch (err) {
      toast({ title: "Sync failed to start", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSyncing(null);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <IconLoader2 className="h-5 w-5 animate-spin mr-2" />
        Loading Meta settings…
      </div>
    );
  }

  const markDirty = () => setDirty(true);

  return (
    <div className="space-y-4" data-testid="tab-panel-ads-meta">
      <Card data-testid="card-meta-connection">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconBrandMeta className="h-4 w-4" />
            Meta connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your Meta ad accounts so Caxton can show spend and leads next to your pages. Caxton only reads — it
            never changes your ads.
          </p>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Use Meta data</p>
              <p className="text-xs text-muted-foreground">
                Access key: {data.token_configured ? (
                  <span className="text-chart-3">set on the server</span>
                ) : (
                  <span className="text-amber-500">missing — ask an admin to add it to the server environment</span>
                )}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-meta-token-env">
                Environment variable:
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">META_ADS_ACCESS_TOKEN</code>
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                  aria-label="Copy variable name"
                  onClick={() => {
                    void navigator.clipboard?.writeText("META_ADS_ACCESS_TOKEN");
                    toast({ title: "Variable name copied" });
                  }}
                  data-testid="button-copy-meta-token-env"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                </button>
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canEdit}
              onClick={() => {
                setEnabled((v) => !v);
                markDirty();
              }}
              data-testid="button-meta-enabled"
            >
              {enabled ? <IconToggleRight className="h-5 w-5 text-chart-3" /> : <IconToggleLeft className="h-5 w-5 text-muted-foreground" />}
            </Button>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="meta-account-ids">
              Ad accounts
            </label>
            <Textarea
              id="meta-account-ids"
              rows={3}
              placeholder={"1234567890\nact_9876543210"}
              value={idsText}
              disabled={!canEdit}
              onChange={(e) => {
                setIdsText(e.target.value);
                markDirty();
              }}
              data-testid="input-meta-account-ids"
            />
            <p className="text-xs text-muted-foreground">One account id per line (from Ads Manager, with or without “act_”).</p>
            {Object.keys(data.sync.accounts).length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5" data-testid="list-meta-accounts">
                {Object.entries(data.sync.accounts).map(([id, a]) => (
                  <li key={id}>
                    <span className="font-mono">{id}</span> — {a.name || "unnamed"} {a.currency ? `(${a.currency})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {testResult && (
            <div className="rounded-md border border-border p-3 space-y-1 text-xs" data-testid="meta-test-result">
              {testResult.error && <p className="text-destructive">{testResult.error}</p>}
              {testResult.accounts.map((a) => (
                <p key={a.id} className={a.ok ? "text-foreground" : "text-destructive"}>
                  {a.ok ? <IconCircleCheck className="inline h-3.5 w-3.5 mr-1 text-chart-3" /> : <IconAlertTriangle className="inline h-3.5 w-3.5 mr-1" />}
                  <span className="font-mono">{a.id}</span> {a.ok ? `— ${a.name} (${a.currency})` : `— ${a.error}`}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={!canEdit || !dirty || saving} data-testid="button-meta-save">
              {saving ? <IconLoader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <IconDeviceFloppy className="h-4 w-4 mr-1.5" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={test}
              disabled={!canEdit || testing || parseIds(idsText).length === 0}
              data-testid="button-meta-test"
            >
              {testing ? <IconLoader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <IconPlugConnected className="h-4 w-4 mr-1.5" />}
              Test connection
            </Button>
          </div>

          <ReadMore testId="button-meta-connection-advanced">
            <p>
              Key: <code className="font-mono">META_ADS_ACCESS_TOKEN</code> (env only; System User token with <code className="font-mono">ads_read</code>).
            </p>
            <p>
              Non-secret config: <code className="font-mono">settings.yml → ads.meta</code> (per site).
            </p>
            <p>
              Cache: <code className="font-mono">{data.policy.cache_dir}</code> · refresh last {data.policy.refresh_days} days · keep{" "}
              {Math.round(data.policy.retention_days / 30)} months · first connect loads {data.policy.backfill_days} days.
            </p>
            <p>Marketing API {data.api_version}. Data older than ~24h refreshes in the background when someone opens a report.</p>
          </ReadMore>
        </CardContent>
      </Card>

      <Card data-testid="card-meta-sync">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconRefresh className="h-4 w-4" />
            Sync
            {data.refreshing && <IconLoader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Meta last synced</p>
              <p className="text-foreground" data-testid="text-meta-last-synced">{fmtWhen(data.sync.last_success_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">History loaded</p>
              <p className="text-foreground">
                {data.sync.history_since ? `${data.sync.history_since} → ${data.sync.history_until}` : "none yet"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">GA4 paid visits</p>
              <p className="text-foreground">
                {data.ga4.configured ? `last export ${data.ga4.last_export_date ?? "—"}` : "GA4 export not configured"}
              </p>
            </div>
          </div>
          {data.sync.last_error && (
            <p className="text-xs text-destructive" data-testid="text-meta-sync-error">
              Last sync failed{data.sync.consecutive_failures > 1 ? ` (${data.sync.consecutive_failures} times in a row)` : ""}: {data.sync.last_error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => sync("refresh")}
              disabled={!canEdit || syncing !== null || data.refreshing}
              data-testid="button-meta-sync-now"
            >
              {syncing === "refresh" ? <IconLoader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <IconRefresh className="h-4 w-4 mr-1.5" />}
              Sync now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => sync("older")}
              disabled={!canEdit || syncing !== null || data.refreshing || !data.sync.history_since}
              data-testid="button-meta-load-older"
            >
              {syncing === "older" ? <IconLoader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <IconHistory className="h-4 w-4 mr-1.5" />}
              Load older history
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-meta-utm-template">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">URL parameters for every ad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste this into each ad under Tracking → URL parameters. It lets us match visits and leads to the exact campaign and ad.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={data.utm_template} className="font-mono text-xs" data-testid="input-meta-utm-template" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(data.utm_template);
                toast({ title: "Copied" });
              }}
              data-testid="button-copy-utm-template"
            >
              <IconCopy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-meta-thresholds">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconAdjustments className="h-4 w-4" />
            Alert thresholds
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">These decide when Diagnostics warns you and when a problem is urgent.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {THRESHOLD_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-sm font-medium text-foreground" htmlFor={`threshold-${f.key}`}>
                  {f.label}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`threshold-${f.key}`}
                    type="number"
                    min={0}
                    value={thresholds[f.key]}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setThresholds((t) => ({ ...t, [f.key]: Number(e.target.value) }));
                      markDirty();
                    }}
                    data-testid={`input-threshold-${f.key}`}
                  />
                  {f.suffix && <span className="text-xs text-muted-foreground shrink-0">{f.suffix}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">…or when spend affected reaches</p>
            <div className="flex flex-wrap gap-3">
              {Object.keys(floorText)
                .concat(missingFloors)
                .map((cur) => (
                  <div key={cur} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-9">{cur}</span>
                    <Input
                      type="number"
                      min={0}
                      className="w-24"
                      value={floorText[cur] ?? ""}
                      placeholder="—"
                      disabled={!canEdit}
                      onChange={(e) => {
                        setFloorText((f) => ({ ...f, [cur]: e.target.value }));
                        markDirty();
                      }}
                      data-testid={`input-floor-${cur}`}
                    />
                  </div>
                ))}
            </div>
            {missingFloors.length > 0 && (
              <p className="text-xs text-amber-500" data-testid="text-missing-floors">
                Set an amount for {missingFloors.join(", ")} — until then only the share-of-spend rule applies to those accounts.
              </p>
            )}
          </div>

          <ReadMore testId="button-meta-thresholds-advanced">
            <p>Drops compare the current window with the previous 28 days. Ratios are judged only above the minimum clicks / visits.</p>
            <p>GA4 days count as complete 2 days after the date (export delay). Issues clear on the next sync once fixed.</p>
            <p>
              Stored in <code className="font-mono">settings.yml → ads.meta.alert_thresholds</code>.
            </p>
          </ReadMore>
        </CardContent>
      </Card>

      <Card data-testid="card-test-leads">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconFlask className="h-4 w-4" />
            Test leads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Leads from these emails (and from logged-in staff) are still sent to your CRM, but marked as tests and left out of reports.
          </p>
          <Textarea
            rows={3}
            placeholder={"*@4geeks-test.com\nqa+*@example.com"}
            value={patternsText}
            disabled={!canEdit}
            onChange={(e) => {
              setPatternsText(e.target.value);
              markDirty();
            }}
            data-testid="input-test-email-patterns"
          />
          <p className="text-xs text-muted-foreground">One pattern per line; * matches anything. Emails are never stored by us.</p>
          <Button size="sm" onClick={save} disabled={!canEdit || !dirty || saving} data-testid="button-test-leads-save">
            {saving ? <IconLoader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <IconDeviceFloppy className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
