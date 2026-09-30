/**
 * Guided Google Ads → BigQuery transfer setup (Settings → Ads → Google). Read-only:
 * checks what staff already did in Google Cloud and says what's next. Never creates
 * datasets or transfers; transfer / run status is read only when the service account
 * already can (see google-ads-transfer-status.ts).
 */

import fs from "fs";
import type { BigQuery } from "@google-cloud/bigquery";
import { createBigQueryClientForProject, getBigQuerySettings, resolveBigQueryCredentials } from "../ecommerce/bigquery-client";
import { testGoogleTransfer, type TransferTestResult } from "./google-ads-bq";
import { countLoadedDays } from "./google-ads-bq";
import { daysInRange, fetchTransferInfo, type BackfillProgress, type TransferInfo } from "./google-ads-transfer-status";

export const DEFAULT_GOOGLE_DATASET = "google_ads";
export const DEFAULT_TRANSFER_LOCATION = "US";
export const TRANSFER_REFRESH_WINDOW_DAYS = 30;
/** Backfill counts as done when history reaches this many days back (transfer days can trail by a few). */
const BACKFILL_SLACK_DAYS = 5;

export type SetupStepId = "dataset" | "access" | "transfer" | "ads_access" | "backfill" | "connect";
export type SetupStepState = "done" | "todo" | "warning" | "error" | "waiting" | "blocked";
export type SetupStep = { id: SetupStepId; state: SetupStepState; detail: string };

export type DatasetCheck = { state: "ok" | "wrong_location" | "missing" | "no_access" | "error"; location: string | null; error?: string };

export type SetupCheckInput = {
  dataset: DatasetCheck;
  /** Null when the dataset couldn't be read. */
  transfer: Pick<TransferTestResult, "customers" | "error"> | null;
  /** Data Transfer API view; null / unavailable → fall back to table detection. */
  transferInfo?: TransferInfo | null;
  /** History load progress (transfer runs, else distinct days in the tables). */
  backfill?: BackfillProgress | null;
  datasetName: string;
  recommendedLocation: string;
  suggestedDataset: string;
  today: string;
  backfillDays: number;
  /** Saved settings already use this project + dataset, are enabled and tick at least one found account. */
  connected: boolean;
};

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function alternateDatasetName(dataset: string, location: string): string {
  return `${dataset}_${location.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

/** Pure: checks → per-step state and plain-English detail. */
export function deriveSetupSteps(input: SetupCheckInput): { steps: SetupStep[]; next: SetupStepId | null } {
  const { dataset: ds, recommendedLocation: loc } = input;
  const readable = ds.state === "ok" || ds.state === "wrong_location";
  const customers = readable ? (input.transfer?.customers ?? []) : [];
  const steps: SetupStep[] = [];

  steps.push(
    ds.state === "ok"
      ? { id: "dataset", state: "done", detail: `Found in ${ds.location ?? loc}.` }
      : ds.state === "wrong_location"
        ? {
            id: "dataset",
            state: "warning",
            detail: `It's in ${ds.location}, but GA4 is in ${loc}. Spend still works; matching clicks to visits needs the same location. For the best match, create ${input.suggestedDataset} in ${loc} and send the transfer there.`,
          }
        : ds.state === "no_access"
          ? { id: "dataset", state: "done", detail: "Found, but we can't read it yet (see the next step)." }
          : ds.state === "missing"
            ? { id: "dataset", state: "todo", detail: `Not found yet. Create it in ${loc}.` }
            : { id: "dataset", state: "error", detail: ds.error ?? "Couldn't check the dataset." },
  );

  steps.push(
    readable
      ? { id: "access", state: "done", detail: "We can read the dataset." }
      : ds.state === "no_access"
        ? { id: "access", state: "todo", detail: "The dataset exists but our service account can't read it yet." }
        : { id: "access", state: "blocked", detail: "Create the dataset first." },
  );

  const info = input.transferInfo ?? null;
  const found = info?.state === "found" ? info : null;
  if (!readable) {
    steps.push({ id: "transfer", state: "blocked", detail: "Waiting on the steps above." });
  } else if (input.transfer?.error) {
    steps.push({ id: "transfer", state: "error", detail: input.transfer.error });
  } else if (found) {
    const runsAs = found.runs_as_service_account ? "our service account" : (found.owner_email ?? "the person who created it");
    steps.push({
      id: "transfer",
      state: found.disabled ? "warning" : "done",
      detail: `Found “${found.display_name}”${found.schedule ? ` (${found.schedule})` : ""}, running as ${runsAs}.${found.disabled ? " It's paused — turn it back on in Data transfers." : ""}`,
    });
  } else if (customers.length > 0) {
    steps.push({ id: "transfer", state: "done", detail: `Copying ${customers.length} account(s).` });
  } else if (info?.state === "none") {
    steps.push({
      id: "transfer",
      state: "todo",
      detail:
        info.other_datasets.length > 0
          ? `No Google Ads transfer writes into ${input.datasetName} yet (found one writing into ${info.other_datasets.join(", ")}).`
          : `No Google Ads transfer writes into ${input.datasetName} yet.`,
    });
  } else {
    steps.push({
      id: "transfer",
      state: "waiting",
      detail: "No Google Ads tables yet. Create the transfer; if you already did, its first run can take a few hours.",
    });
  }

  const run = found?.latest_run ?? null;
  if (!readable || (!found && customers.length === 0 && info?.state === "none")) {
    steps.push({ id: "ads_access", state: "blocked", detail: "Create the transfer first." });
  } else if (run?.state === "FAILED") {
    steps.push({
      id: "ads_access",
      state: "error",
      detail: `Last run failed${run.run_time ? ` (${run.run_time.slice(0, 16).replace("T", " ")} UTC)` : ""}: ${run.messages[0] ?? "no reason given"}`,
    });
  } else if (customers.length > 0 || run?.state === "SUCCEEDED") {
    steps.push({ id: "ads_access", state: "done", detail: "Google Ads data is arriving." });
  } else if (run?.state === "RUNNING" || run?.state === "PENDING") {
    steps.push({ id: "ads_access", state: "waiting", detail: "First run in progress." });
  } else if (run?.state === "CANCELLED") {
    steps.push({ id: "ads_access", state: "todo", detail: "The last run was cancelled. Start it again in Data transfers." });
  } else if (found) {
    steps.push({ id: "ads_access", state: "waiting", detail: "Waiting for the first run (starts at the scheduled time)." });
  } else {
    steps.push({
      id: "ads_access",
      state: "waiting",
      detail: "We can't see the transfer's runs. If tables don't appear within an hour, open Data transfers → Run history → View details.",
    });
  }

  const since = customers
    .map((c) => c.data_since)
    .filter((d): d is string => !!d)
    .sort()[0];
  const bf = input.backfill ?? null;
  const reachesBack = !!since && daysBetween(since, input.today) >= input.backfillDays - BACKFILL_SLACK_DAYS;
  const bfComplete = !!bf && bf.loaded_days >= bf.total_days - BACKFILL_SLACK_DAYS;
  const runsBf = bf?.source === "runs" ? bf : null;
  if (customers.length === 0) {
    steps.push({ id: "backfill", state: "blocked", detail: "Available once the transfer has run." });
  } else if (runsBf && runsBf.running + runsBf.pending > 0) {
    steps.push({
      id: "backfill",
      state: "waiting",
      detail: `Loading history: ${runsBf.loaded_days} of ${runsBf.total_days} days done (${runsBf.running} running, ${runsBf.pending} queued${runsBf.failed ? `, ${runsBf.failed} failed` : ""}).`,
    });
  } else if (runsBf && runsBf.failed > 0) {
    steps.push({
      id: "backfill",
      state: "error",
      detail: `${runsBf.failed} day(s) failed to load (${runsBf.loaded_days} of ${runsBf.total_days} done). Retry them in the run history.`,
    });
  } else if (bfComplete || reachesBack) {
    const count = bf ? ` · ${bf.loaded_days} of ${bf.total_days} days ${bf.source === "runs" ? "loaded" : "with ad activity"}` : "";
    steps.push({ id: "backfill", state: "done", detail: `History from ${since ?? bf!.start}${count}.` });
  } else if (!since && !bf) {
    steps.push({ id: "backfill", state: "waiting", detail: "Tables exist but no days have loaded yet." });
  } else {
    const loaded = bf ? bf.loaded_days : daysBetween(since!, input.today);
    steps.push({
      id: "backfill",
      state: "todo",
      detail:
        bf?.source === "tables"
          ? `Only ${loaded} of ${bf.total_days} days found. Schedule a backfill for the last ${input.backfillDays} days; if you already did, this count grows as it loads.`
          : `Only ${loaded} day(s) loaded${since ? ` (since ${since})` : ""}. Schedule a backfill for the last ${input.backfillDays} days.`,
    });
  }

  steps.push(
    customers.length === 0
      ? { id: "connect", state: "blocked", detail: "Available once accounts appear." }
      : input.connected
        ? { id: "connect", state: "done", detail: "Connected and saved." }
        : { id: "connect", state: "todo", detail: `Found ${customers.length} account(s). Use them here and save.` },
  );

  const next = steps.find((s) => s.state !== "done" && s.state !== "warning")?.id ?? null;
  return { steps, next };
}

type HttpErr = { code?: number | string; message?: string };

async function datasetLocation(client: BigQuery, project: string, dataset: string): Promise<DatasetCheck> {
  try {
    const [meta] = await client.dataset(dataset, { projectId: project }).getMetadata();
    return { state: "ok", location: meta?.location ? String(meta.location) : null };
  } catch (err) {
    const e = err as HttpErr;
    const msg = e.message ?? String(err);
    if (e.code === 404 || /not found/i.test(msg)) return { state: "missing", location: null };
    if (e.code === 403 || /permission|denied/i.test(msg)) return { state: "no_access", location: null };
    return { state: "error", location: null, error: msg };
  }
}

/** Service account email from GCS_CREDENTIALS_JSON / GCS_KEY_FILENAME, else ADC credentials. */
export async function detectServiceAccountEmail(client: BigQuery | null): Promise<string | null> {
  const creds = resolveBigQueryCredentials();
  if (creds.source === "gcs_json") {
    const email = creds.credentials.client_email;
    return typeof email === "string" ? email : null;
  }
  if (creds.source === "gcs_key_file") {
    try {
      const parsed = JSON.parse(fs.readFileSync(creds.keyFilename, "utf8")) as { client_email?: unknown };
      return typeof parsed.client_email === "string" ? parsed.client_email : null;
    } catch {
      return null;
    }
  }
  try {
    const auth = (client as unknown as { authClient?: { getCredentials(): Promise<{ client_email?: string }> } } | null)?.authClient;
    return (await auth?.getCredentials())?.client_email ?? null;
  } catch {
    return null;
  }
}

export type GoogleSetupStatus = {
  project: string | null;
  dataset: string;
  ga4: { configured: boolean; project: string | null; dataset: string | null; location: string | null };
  recommended_location: string;
  location_source: "ga4_settings" | "ga4_dataset" | "default";
  suggested_dataset: string;
  service_account: string | null;
  credentials_source: ReturnType<typeof resolveBigQueryCredentials>["source"];
  dataset_check: DatasetCheck | null;
  transfer_info: TransferInfo | null;
  backfill: BackfillProgress | null;
  customers: TransferTestResult["customers"];
  steps: SetupStep[];
  next: SetupStepId | null;
  transfer_values: { source: string; schedule: string; refresh_window_days: number; backfill_start: string; backfill_end: string };
  links: { enable_api: string; bigquery: string; dataset: string | null; transfers: string };
  checked_at: string;
};

function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function checkGoogleSetup(opts: {
  contentRoot?: string;
  project?: string | null;
  dataset?: string | null;
  savedGoogle: { enabled: boolean; customer_ids: string[]; bigquery: { project: string | null; dataset: string | null } };
  backfillDays: number;
  now?: Date;
}): Promise<GoogleSetupStatus> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const ga4 = getBigQuerySettings(opts.contentRoot);
  const ga4Configured = !!(ga4.enabled && ga4.project_id && ga4.dataset_id);
  const project = (opts.project || opts.savedGoogle.bigquery.project || (ga4Configured ? ga4.project_id : "") || "").trim() || null;
  const dataset = (opts.dataset || opts.savedGoogle.bigquery.dataset || DEFAULT_GOOGLE_DATASET).trim();
  const client = project ? createBigQueryClientForProject(project) : null;

  let location: string | null = ga4.location?.trim() || null;
  let locationSource: GoogleSetupStatus["location_source"] = location ? "ga4_settings" : "default";
  if (!location && ga4Configured) {
    const ga4Client = createBigQueryClientForProject(ga4.project_id);
    if (ga4Client) {
      const check = await datasetLocation(ga4Client, ga4.project_id, ga4.dataset_id);
      if (check.location) {
        location = check.location;
        locationSource = "ga4_dataset";
      }
    }
  }
  const recommended = (location ?? DEFAULT_TRANSFER_LOCATION).toUpperCase();

  const serviceAccount = await detectServiceAccountEmail(client);
  const backfillRange = { start: addDaysIso(today, -opts.backfillDays), end: addDaysIso(today, -1) };
  let backfill: BackfillProgress | null = null;
  let datasetCheck: DatasetCheck | null = null;
  let transfer: Pick<TransferTestResult, "customers" | "error"> | null = null;
  let transferInfo: TransferInfo | null = null;
  if (client && project) {
    datasetCheck = await datasetLocation(client, project, dataset);
    if (datasetCheck.state === "ok" && datasetCheck.location && datasetCheck.location.toUpperCase() !== recommended) {
      datasetCheck = { ...datasetCheck, state: "wrong_location" };
    }
    if (datasetCheck.state === "ok" || datasetCheck.state === "wrong_location") {
      const [t, info] = await Promise.all([
        testGoogleTransfer(project, dataset),
        fetchTransferInfo({ project, location: datasetCheck.location ?? recommended, dataset, serviceAccount, backfillRange }),
      ]);
      transfer = { customers: t.customers, ...(t.ok ? {} : { error: t.error }) };
      transferInfo = info;
      backfill = info.state === "found" ? info.backfill : null;
      if (!backfill && t.customers.length > 0) {
        const loaded = await countLoadedDays(project, dataset, backfillRange.start, backfillRange.end);
        if (loaded != null) {
          backfill = {
            source: "tables",
            ...backfillRange,
            total_days: daysInRange(backfillRange.start, backfillRange.end),
            loaded_days: loaded,
            running: 0,
            pending: 0,
            failed: 0,
            failed_days: [],
          };
        }
      }
    }
  } else {
    datasetCheck = { state: "error", location: null, error: project ? "BigQuery client unavailable (check GCS_CREDENTIALS_JSON / GCS_KEY_FILENAME)." : "Enter the Google Cloud project first." };
  }

  const found = new Set((transfer?.customers ?? []).map((c) => c.id));
  const saved = opts.savedGoogle;
  const connected =
    saved.enabled && saved.bigquery.project === project && saved.bigquery.dataset === dataset && saved.customer_ids.some((id) => found.has(id));
  const suggested = alternateDatasetName(dataset, recommended);
  const { steps, next } = deriveSetupSteps({
    dataset: datasetCheck,
    transfer,
    transferInfo,
    backfill,
    datasetName: dataset,
    recommendedLocation: recommended,
    suggestedDataset: suggested,
    today,
    backfillDays: opts.backfillDays,
    connected,
  });

  const p = project ? encodeURIComponent(project) : "";
  return {
    project,
    dataset,
    ga4: { configured: ga4Configured, project: ga4.project_id || null, dataset: ga4.dataset_id || null, location },
    recommended_location: recommended,
    location_source: locationSource,
    suggested_dataset: suggested,
    service_account: serviceAccount,
    credentials_source: resolveBigQueryCredentials().source,
    dataset_check: datasetCheck,
    transfer_info: transferInfo,
    backfill,
    customers: transfer?.customers ?? [],
    steps,
    next,
    transfer_values: {
      source: "Google Ads",
      schedule: "Every 24 hours",
      refresh_window_days: TRANSFER_REFRESH_WINDOW_DAYS,
      backfill_start: backfillRange.start,
      backfill_end: backfillRange.end,
    },
    links: {
      enable_api: `https://console.cloud.google.com/apis/library/bigquerydatatransfer.googleapis.com${p ? `?project=${p}` : ""}`,
      bigquery: `https://console.cloud.google.com/bigquery${p ? `?project=${p}` : ""}`,
      dataset: project ? `https://console.cloud.google.com/bigquery?project=${p}&ws=!1m4!1m3!3m2!1s${p}!2s${encodeURIComponent(dataset)}` : null,
      transfers: `https://console.cloud.google.com/bigquery/transfers${p ? `?project=${p}` : ""}`,
    },
    checked_at: now.toISOString(),
  };
}
