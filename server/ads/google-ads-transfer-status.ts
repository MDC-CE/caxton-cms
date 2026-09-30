/**
 * Read-only BigQuery Data Transfer status for the setup checklist: which Google Ads
 * transfer writes into our dataset, who it runs as, and how its latest run went.
 * Uses the site's BigQuery service account; when it can't read transfers (403, API
 * off) the result is `unavailable` and the checklist falls back to table detection.
 */

import { GoogleAuth } from "google-auth-library";
import { resolveBigQueryCredentials } from "../ecommerce/bigquery-client";

const DTS = "https://bigquerydatatransfer.googleapis.com/v1";
const PERMISSION_RE = /permission|not authori[sz]ed|access denied|does not have access|USER_PERMISSION_DENIED|NOT_ADS_USER|CUSTOMER_NOT_ENABLED|OAUTH_TOKEN/i;
const MAX_MESSAGES = 3;
const RUN_PAGE_SIZE = 500;
const MAX_RUN_PAGES = 3;
const MAX_FAILED_DAYS = 5;

export type TransferRunState = "SUCCEEDED" | "FAILED" | "RUNNING" | "PENDING" | "CANCELLED" | "UNKNOWN";

export type TransferRunSummary = {
  state: TransferRunState;
  run_time: string | null;
  /** Google's error text (run status, then ERROR log lines), newest first. */
  messages: string[];
  permission_error: boolean;
};

export type TransferInfo =
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
      latest_run: TransferRunSummary | null;
      backfill: BackfillProgress | null;
    };

/** Per-day history load status. `source: "runs"` = one transfer run per data day; `"tables"` = distinct days found in the tables. */
export type BackfillProgress = {
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

type RawConfig = {
  name?: string;
  displayName?: string;
  destinationDatasetId?: string;
  dataSourceId?: string;
  schedule?: string;
  disabled?: boolean;
  updateTime?: string;
  ownerInfo?: { email?: string };
  params?: Record<string, unknown>;
};
type RawRun = { name?: string; state?: string; runTime?: string; startTime?: string; scheduleTime?: string; errorStatus?: { message?: string } };
type RawLog = { messageText?: string; severity?: string; messageTime?: string };

/** Pure: pick the Google Ads transfer writing into `dataset` (newest update wins). */
export function pickTransferConfig(configs: RawConfig[], dataset: string): { config: RawConfig | null; otherDatasets: string[] } {
  const ads = configs.filter((c) => !c.dataSourceId || c.dataSourceId === "google_ads");
  const mine = ads
    .filter((c) => c.destinationDatasetId === dataset)
    .sort((a, b) => String(b.updateTime ?? "").localeCompare(String(a.updateTime ?? "")));
  const others = Array.from(new Set(ads.map((c) => c.destinationDatasetId).filter((d): d is string => !!d && d !== dataset)));
  return { config: mine[0] ?? null, otherDatasets: others };
}

function runTime(r: RawRun): string {
  return r.runTime ?? r.startTime ?? r.scheduleTime ?? "";
}

/** Pure: newest run + its error logs → summary. */
export function summarizeRun(runs: RawRun[], logs: RawLog[]): TransferRunSummary | null {
  const latest = [...runs].sort((a, b) => runTime(b).localeCompare(runTime(a)))[0];
  if (!latest) return null;
  const known: TransferRunState[] = ["SUCCEEDED", "FAILED", "RUNNING", "PENDING", "CANCELLED"];
  const state = (known as string[]).includes(latest.state ?? "") ? (latest.state as TransferRunState) : "UNKNOWN";
  const messages: string[] = [];
  const push = (m: string | undefined) => {
    const t = (m ?? "").trim();
    if (t && !messages.includes(t) && messages.length < MAX_MESSAGES) messages.push(t);
  };
  if (state === "FAILED") {
    const errorLogs = logs
      .filter((l) => !l.severity || l.severity === "ERROR")
      .sort((a, b) => String(b.messageTime ?? "").localeCompare(String(a.messageTime ?? "")));
    for (const l of errorLogs) push(l.messageText);
    push(latest.errorStatus?.message);
  }
  return {
    state,
    run_time: runTime(latest) || null,
    messages,
    permission_error: state === "FAILED" && messages.some((m) => PERMISSION_RE.test(m)),
  };
}

export function daysInRange(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
}

/** Pure: runs (latest attempt each) whose data day is in [start, end] → progress. A day's newest run wins. */
export function summarizeBackfill(runs: RawRun[], start: string, end: string): BackfillProgress {
  const byDay = new Map<string, RawRun>();
  for (const r of runs) {
    const day = (r.runTime ?? "").slice(0, 10);
    if (!day || day < start || day > end) continue;
    const prev = byDay.get(day);
    const stamp = (x: RawRun) => x.startTime ?? x.scheduleTime ?? "";
    if (!prev || stamp(r) > stamp(prev)) byDay.set(day, r);
  }
  const out: BackfillProgress = { source: "runs", start, end, total_days: daysInRange(start, end), loaded_days: 0, running: 0, pending: 0, failed: 0, failed_days: [] };
  for (const [day, r] of Array.from(byDay.entries()).sort(([a], [b]) => b.localeCompare(a))) {
    if (r.state === "SUCCEEDED") out.loaded_days++;
    else if (r.state === "RUNNING") out.running++;
    else if (r.state === "PENDING") out.pending++;
    else if (r.state === "FAILED") {
      out.failed++;
      if (out.failed_days.length < MAX_FAILED_DAYS) out.failed_days.push({ date: day, message: r.errorStatus?.message?.trim() || null });
    }
  }
  return out;
}

function dtsAuth(): GoogleAuth {
  const scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  const creds = resolveBigQueryCredentials();
  if (creds.source === "gcs_json") return new GoogleAuth({ credentials: creds.credentials as { client_email?: string; private_key?: string }, scopes });
  if (creds.source === "gcs_key_file") return new GoogleAuth({ keyFilename: creds.keyFilename, scopes });
  return new GoogleAuth({ scopes });
}

async function getJson<T>(auth: GoogleAuth, url: string): Promise<T> {
  const res = await auth.request<T>({ url, method: "GET" });
  return res.data;
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e.response?.data?.error?.message ?? e.message ?? String(err);
}

export async function fetchTransferInfo(opts: {
  project: string;
  location: string;
  dataset: string;
  serviceAccount: string | null;
  /** Inclusive YYYY-MM-DD range to report backfill progress for. */
  backfillRange?: { start: string; end: string };
}): Promise<TransferInfo> {
  const loc = opts.location.toLowerCase();
  const auth = dtsAuth();
  let configs: RawConfig[];
  try {
    const body = await getJson<{ transferConfigs?: RawConfig[] }>(
      auth,
      `${DTS}/projects/${encodeURIComponent(opts.project)}/locations/${encodeURIComponent(loc)}/transferConfigs?dataSourceIds=google_ads&pageSize=100`,
    );
    configs = body.transferConfigs ?? [];
  } catch (err) {
    return { state: "unavailable", error: errorText(err) };
  }
  const { config, otherDatasets } = pickTransferConfig(configs, opts.dataset);
  if (!config?.name) return { state: "none", other_datasets: otherDatasets };

  let latest: TransferRunSummary | null = null;
  let backfill: BackfillProgress | null = null;
  try {
    const runs: RawRun[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_RUN_PAGES; page++) {
      const body = await getJson<{ transferRuns?: RawRun[]; nextPageToken?: string }>(
        auth,
        `${DTS}/${config.name}/runs?pageSize=${RUN_PAGE_SIZE}&runAttempt=LATEST${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      runs.push(...(body.transferRuns ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    if (opts.backfillRange) backfill = summarizeBackfill(runs, opts.backfillRange.start, opts.backfillRange.end);
    const newest = [...runs].sort((a, b) => runTime(b).localeCompare(runTime(a)))[0];
    let logs: RawLog[] = [];
    if (newest?.state === "FAILED" && newest.name) {
      const body = await getJson<{ transferMessages?: RawLog[] }>(auth, `${DTS}/${newest.name}/transferLogs?messageTypes=ERROR&pageSize=20`).catch(
        () => ({ transferMessages: [] as RawLog[] }),
      );
      logs = body.transferMessages ?? [];
    }
    latest = summarizeRun(runs, logs);
  } catch {
    latest = null;
    backfill = null;
  }

  const configId = config.name.split("/").pop() ?? "";
  const owner = config.ownerInfo?.email ?? null;
  const sa = opts.serviceAccount?.toLowerCase() ?? null;
  const customer = config.params?.customer_id;
  return {
    state: "found",
    config_id: configId,
    display_name: config.displayName ?? configId,
    owner_email: owner,
    runs_as_service_account: !!owner && ((!!sa && owner.toLowerCase() === sa) || owner.endsWith(".gserviceaccount.com")),
    schedule: config.schedule ?? null,
    disabled: !!config.disabled,
    customer_id: typeof customer === "string" ? customer : null,
    run_history_url: `https://console.cloud.google.com/bigquery/transfers/locations/${encodeURIComponent(loc)}/configs/${encodeURIComponent(configId)}/runs?project=${encodeURIComponent(opts.project)}`,
    latest_run: latest,
    backfill,
  };
}
