import { useEffect, useState, type ReactNode } from "react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconClock,
  IconCopy,
  IconExternalLink,
  IconListCheck,
  IconLoader2,
  IconLock,
  IconRefresh,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatGoogleCustomerId } from "@shared/ads-settings";

type StepId = "dataset" | "access" | "transfer" | "ads_access" | "backfill" | "connect";
type StepState = "done" | "todo" | "warning" | "error" | "waiting" | "blocked";

type TransferInfo =
  | { state: "unavailable"; error: string }
  | { state: "none"; other_datasets: string[] }
  | {
      state: "found";
      config_id: string;
      display_name: string;
      owner_email: string | null;
      runs_as_service_account: boolean;
      schedule: string | null;
      disabled: boolean;
      customer_id: string | null;
      run_history_url: string;
      latest_run: { state: string; run_time: string | null; messages: string[]; permission_error: boolean } | null;
    };

type BackfillProgress = {
  source: "runs" | "tables";
  start: string;
  end: string;
  total_days: number;
  loaded_days: number;
  running: number;
  pending: number;
  failed: number;
  failed_days: Array<{ date: string; message: string | null }>;
};

type SetupStatus = {
  project: string | null;
  dataset: string;
  ga4: { configured: boolean; project: string | null; dataset: string | null; location: string | null };
  recommended_location: string;
  location_source: "ga4_settings" | "ga4_dataset" | "default";
  suggested_dataset: string;
  service_account: string | null;
  credentials_source: string;
  transfer_info: TransferInfo | null;
  backfill: BackfillProgress | null;
  customers: Array<{ id: string; name: string | null; currency: string | null; data_since: string | null; data_through: string | null }>;
  steps: Array<{ id: StepId; state: StepState; detail: string }>;
  next: StepId | null;
  transfer_values: { source: string; schedule: string; refresh_window_days: number; backfill_start: string; backfill_end: string };
  links: { enable_api: string; bigquery: string; dataset: string | null; transfers: string };
  checked_at: string;
};

const PROJECT_RE = /^[a-z][a-z0-9-]{4,62}$/;
const DATASET_RE = /^[A-Za-z0-9_]{1,1024}$/;
const POLL_MS = 30_000;

const STATE_ICON: Record<StepState, { Icon: typeof IconCircleCheck; className: string; label: string }> = {
  done: { Icon: IconCircleCheck, className: "text-chart-3", label: "Done" },
  todo: { Icon: IconCircleDashed, className: "text-foreground", label: "To do" },
  warning: { Icon: IconAlertTriangle, className: "text-amber-500", label: "Check" },
  error: { Icon: IconCircleX, className: "text-destructive", label: "Problem" },
  waiting: { Icon: IconClock, className: "text-amber-500", label: "Waiting" },
  blocked: { Icon: IconLock, className: "text-muted-foreground", label: "Later" },
};

const TITLES: Record<StepId, string> = {
  dataset: "Create a BigQuery dataset",
  access: "Let this site read it",
  transfer: "Create the Google Ads transfer",
  ads_access: "Give the transfer access to Google Ads",
  backfill: "Load 90 days of history",
  connect: "Use it here",
};

function transferApiNote(info: TransferInfo | null): string {
  if (!info) return " (not checked yet)";
  if (info.state === "unavailable") return ` (not readable now: ${info.error})`;
  return " (readable)";
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function CopyField({ label, value, testId }: { label: string; value: string; testId: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5" data-testid={testId}>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-xs text-foreground">{value}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 shrink-0 p-0"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          toast({ title: `${label} copied` });
        }}
        aria-label={`Copy ${label}`}
        data-testid={`${testId}-copy`}
      >
        <IconCopy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ExternalButton({ href, children, testId }: { href: string; children: ReactNode; testId: string }) {
  return (
    <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
      <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testId}>
        {children}
        <IconExternalLink className="ml-1.5 h-3.5 w-3.5" />
      </a>
    </Button>
  );
}

function BackfillBar({ bf }: { bf: BackfillProgress }) {
  const pct = bf.total_days > 0 ? Math.min(100, Math.round((bf.loaded_days / bf.total_days) * 100)) : 0;
  return (
    <div className="mt-2 space-y-1 pl-6" data-testid="google-setup-backfill-progress">
      <Progress value={pct} className="h-1.5" />
      <p className="flex flex-wrap gap-x-3 tabular-nums">
        <span className="text-foreground">
          {bf.loaded_days} / {bf.total_days} days {bf.source === "runs" ? "loaded" : "with data"}
        </span>
        {bf.running > 0 && <span>{bf.running} running</span>}
        {bf.pending > 0 && <span>{bf.pending} queued</span>}
        {bf.failed > 0 && <span className="text-destructive">{bf.failed} failed</span>}
        <span>
          {bf.start} → {bf.end}
        </span>
      </p>
    </div>
  );
}

function StepBody({ id, s, canEdit, onUse }: { id: StepId; s: SetupStatus; canEdit: boolean; onUse: () => void }) {
  const loc = s.recommended_location;
  const project = s.project ?? "your-project";
  switch (id) {
    case "dataset":
      return (
        <>
          <p>
            In Google Cloud → BigQuery, open the menu next to <span className="font-mono text-foreground">{project}</span> → Create dataset.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyField label="Dataset ID" value={s.dataset} testId="google-setup-dataset-id" />
            <CopyField label="Location" value={loc} testId="google-setup-location" />
          </div>
          <p>
            {s.location_source === "default"
              ? "GA4 isn't connected here yet, so we suggest US. If you connect GA4 later, its export should use the same location."
              : "Same location as your GA4 export, so we can match Google clicks to site visits."}
          </p>
          <ExternalButton href={s.links.bigquery} testId="link-google-setup-bigquery">
            Open BigQuery
          </ExternalButton>
        </>
      );
    case "access":
      return (
        <>
          <p>Open the dataset → Sharing → Permissions → Add principal, paste our service account and pick the role below.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.service_account ? (
              <CopyField label="Service account" value={s.service_account} testId="google-setup-service-account" />
            ) : (
              <p className="text-destructive">We couldn&apos;t detect the service account email. Ask a developer which one this site uses for BigQuery.</p>
            )}
            <CopyField label="Role" value="BigQuery Data Viewer" testId="google-setup-role" />
          </div>
          {s.links.dataset && (
            <ExternalButton href={s.links.dataset} testId="link-google-setup-dataset">
              Open the dataset
            </ExternalButton>
          )}
        </>
      );
    case "transfer":
      return (
        <>
          <p>
            BigQuery → Data transfers → Create transfer. Sign in with a Google account that can see your Google Ads accounts. If Google asks, enable
            the BigQuery Data Transfer API first.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyField label="Source" value={s.transfer_values.source} testId="google-setup-source" />
            <CopyField label="Destination dataset" value={s.dataset} testId="google-setup-destination" />
            <CopyField label="Schedule" value={s.transfer_values.schedule} testId="google-setup-schedule" />
            <CopyField label="Refresh window (days)" value={String(s.transfer_values.refresh_window_days)} testId="google-setup-refresh" />
          </div>
          <p>
            Customer ID: use your manager account (the <span className="font-mono">123-456-7890</span> number at the top of Google Ads) to copy every
            account under it, or a single account.
          </p>
          {s.service_account ? (
            <>
              <CopyField label="Service account (optional)" value={s.service_account} testId="google-setup-transfer-service-account" />
              <p>If you run the transfer as this service account, add it as a user in Google Ads too (next step).</p>
            </>
          ) : (
            <p className="text-destructive">We couldn&apos;t detect the service account email. Ask a developer which one this site uses for BigQuery.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <ExternalButton href={s.links.transfers} testId="link-google-setup-transfers">
              Open Data transfers
            </ExternalButton>
            <ExternalButton href={s.links.enable_api} testId="link-google-setup-enable-api">
              Enable the API
            </ExternalButton>
          </div>
        </>
      );
    case "ads_access": {
      const info = s.transfer_info?.state === "found" ? s.transfer_info : null;
      const run = info?.latest_run ?? null;
      const asSa = info ? info.runs_as_service_account : true;
      return (
        <>
          {run && run.messages.length > 1 && (
            <ul className="list-disc space-y-0.5 pl-4 text-foreground" data-testid="google-setup-run-messages">
              {run.messages.slice(1).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {asSa ? (
            <>
              <p>
                The transfer reads Google Ads as our service account, so that account must be a user there: Google Ads → Admin → Access and security →
                add user → paste the email → Read only access.
                {info?.customer_id ? (
                  <>
                    {" "}
                    Do it in the account the transfer uses (<span className="font-mono">{formatGoogleCustomerId(info.customer_id.replace(/\D/g, ""))}</span>).
                  </>
                ) : null}
              </p>
              {s.service_account && <CopyField label="Service account" value={s.service_account} testId="google-setup-ads-access-sa" />}
            </>
          ) : (
            <p>
              The transfer reads Google Ads as <span className="font-mono text-foreground">{info?.owner_email ?? "the person who created it"}</span>. That
              person needs access to the account in the transfer&apos;s Customer ID.
            </p>
          )}
          <p>{run?.state === "FAILED" ? "Then open the failed run and click Retry." : "Tables appear after the first successful run."}</p>
          <ExternalButton href={info?.run_history_url ?? s.links.transfers} testId="link-google-setup-run-history">
            {info ? "Open run history" : "Open Data transfers"}
          </ExternalButton>
        </>
      );
    }
    case "backfill": {
      const bf = s.backfill;
      const started = !!bf && bf.source === "runs" && bf.running + bf.pending + bf.failed > 0;
      const runHistory = s.transfer_info?.state === "found" ? s.transfer_info.run_history_url : null;
      return (
        <>
          {!started && (
            <>
              <p>Open the transfer → Schedule backfill → Run for a date range.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <CopyField label="Start date" value={s.transfer_values.backfill_start} testId="google-setup-backfill-start" />
                <CopyField label="End date" value={s.transfer_values.backfill_end} testId="google-setup-backfill-end" />
              </div>
            </>
          )}
          {bf && bf.failed_days.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-foreground" data-testid="google-setup-backfill-failed">
              {bf.failed_days.map((d) => (
                <li key={d.date}>
                  <span className="font-mono">{d.date}</span>
                  {d.message ? ` — ${d.message}` : ""}
                </li>
              ))}
              {bf.failed > bf.failed_days.length && <li>…and {bf.failed - bf.failed_days.length} more</li>}
            </ul>
          )}
          {started && <p>Google loads the days one by one; this list updates every 30 seconds while it&apos;s open.</p>}
          {runHistory && (
            <ExternalButton href={runHistory} testId="link-google-setup-backfill-history">
              Open run history
            </ExternalButton>
          )}
        </>
      );
    }
    case "connect":
      return (
        <>
          {s.customers.length > 0 && (
            <ul className="space-y-0.5" data-testid="google-setup-customers">
              {s.customers.map((c) => (
                <li key={c.id} className="text-foreground">
                  <span className="font-mono">{formatGoogleCustomerId(c.id)}</span> · {c.name ?? "unnamed"}
                  {c.currency ? ` · ${c.currency}` : ""} · {c.data_through ? `data through ${c.data_through}` : "no days yet"}
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" className="h-7 text-xs" disabled={!canEdit || s.customers.length === 0} onClick={onUse} data-testid="button-google-setup-use">
            Use these settings
          </Button>
        </>
      );
  }
}

export function GoogleAdsSetupGuide({
  project,
  dataset,
  canEdit,
  defaultOpen,
  onUse,
}: {
  project: string;
  dataset: string;
  canEdit: boolean;
  defaultOpen: boolean;
  onUse: (values: { project: string; dataset: string; customerIds: string[] }) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border" data-testid="google-setup-guide">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" data-testid="button-google-setup-toggle">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconListCheck className="h-4 w-4" />
            Setup checklist
          </span>
          <IconChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-3 py-3">
        <SetupChecklist project={project} dataset={dataset} canEdit={canEdit} onUse={onUse} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function SetupChecklist({
  project,
  dataset,
  canEdit,
  onUse,
}: {
  project: string;
  dataset: string;
  canEdit: boolean;
  onUse: (values: { project: string; dataset: string; customerIds: string[] }) => void;
}) {
  const { toast } = useToast();
  const p = useDebounced(PROJECT_RE.test(project.trim()) ? project.trim() : "", 700);
  const d = useDebounced(DATASET_RE.test(dataset.trim()) ? dataset.trim() : "", 700);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["/api/settings/ads/google/setup", p, d],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (p) params.set("project", p);
      if (d) params.set("dataset", d);
      const res = await apiFetch(`/api/settings/ads/google/setup?${params}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Setup check failed");
      return res.json() as Promise<SetupStatus>;
    },
    refetchInterval: (q) => ((q.state.data as SetupStatus | undefined)?.next ? POLL_MS : false),
    placeholderData: (prev) => prev,
  });

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <IconLoader2 className="h-4 w-4 animate-spin" /> Checking Google Cloud…
      </p>
    );
  }
  if (error || !data) return <p className="text-xs text-destructive">{error instanceof Error ? error.message : "Setup check failed"}</p>;

  const use = () => {
    if (!data.project) return;
    onUse({ project: data.project, dataset: data.dataset, customerIds: data.customers.map((c) => c.id) });
    toast({ title: "Filled in", description: "Review the accounts below, then press Save." });
  };

  return (
    <div className="space-y-3 text-xs text-muted-foreground" data-testid="google-setup-checklist">
      <p className="text-sm">
        Google copies your Ads data into BigQuery once a day. You set that copy up once in Google Cloud (about 5 minutes); this list checks each step
        for you and fills in the settings when it&apos;s ready. Nothing here changes your campaigns.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span data-testid="google-setup-checked-at">
          {data.next ? "Re-checks every 30 seconds while open" : "All steps done"} · last checked {new Date(data.checked_at).toLocaleTimeString()}
        </span>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void refetch()} disabled={isFetching} data-testid="button-google-setup-check">
          {isFetching ? <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <IconRefresh className="mr-1.5 h-3.5 w-3.5" />}
          Check now
        </Button>
      </div>

      <ol className="space-y-2">
        {data.steps.map((step, i) => {
          const st = STATE_ICON[step.state];
          const expanded = step.id === data.next || step.state === "warning" || step.state === "error";
          return (
            <li
              key={step.id}
              className={cn("rounded-md border px-3 py-2", step.id === data.next ? "border-foreground/30 bg-muted/30" : "border-border")}
              data-testid={`google-setup-step-${step.id}`}
              data-state={step.state}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-start gap-2 text-sm text-foreground">
                  <st.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", st.className)} aria-label={st.label} />
                  <span>
                    {i + 1}. {TITLES[step.id]}
                  </span>
                </p>
                <span className={cn("shrink-0 text-[11px]", st.className)}>{st.label}</span>
              </div>
              <p className={cn("mt-1 pl-6", step.state === "error" ? "text-destructive" : step.state === "warning" ? "text-foreground" : "")}>{step.detail}</p>
              {step.id === "backfill" && data.backfill && step.state !== "done" && step.state !== "blocked" && (
                <BackfillBar bf={data.backfill} />
              )}
              {expanded && (
                <div className="mt-2 space-y-2 pl-6">
                  <StepBody id={step.id} s={data} canEdit={canEdit} onUse={use} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-foreground" data-testid="button-google-setup-advanced">
          Read more (advanced)
          <IconChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-1">
          <p>
            Checks are read-only: dataset metadata (location) and <code className="font-mono">INFORMATION_SCHEMA</code> of the transfer dataset, using
            the site&apos;s BigQuery service account (<code className="font-mono">{data.credentials_source}</code>). We never create datasets or transfers.
          </p>
          <p>
            Location: the gclid join runs GA4 and Google Ads tables in one query, which BigQuery only allows within one location
            {data.ga4.configured ? ` (GA4: ${data.ga4.project}.${data.ga4.dataset}, ${data.ga4.location ?? "unknown"})` : ""}.
          </p>
          <p>
            Transfer and run status come from the BigQuery Data Transfer API, read with the same service account
            {transferApiNote(data.transfer_info)}. Without that access, &quot;Waiting&quot; can mean the transfer isn&apos;t created or hasn&apos;t
            run yet. The service account also needs BigQuery Job User on the project (already there if GA4 works here).
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
