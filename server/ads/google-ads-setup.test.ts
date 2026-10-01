import { describe, expect, it } from "vitest";
import { alternateDatasetName, deriveSetupSteps, type SetupCheckInput } from "./google-ads-setup";
import {
  pickTransferConfig,
  summarizeBackfill,
  summarizeRun,
  type BackfillProgress,
  type TransferInfo,
  type TransferRunSummary,
} from "./google-ads-transfer-status";

const base: SetupCheckInput = {
  dataset: { state: "ok", location: "US" },
  transfer: { customers: [] },
  datasetName: "google_ads",
  recommendedLocation: "US",
  suggestedDataset: "google_ads_us",
  today: "2026-09-30",
  backfillDays: 90,
  connected: false,
};

const customer = (data_since: string | null) => ({
  id: "1234567890",
  name: "4Geeks",
  currency: "USD",
  data_since,
  data_through: "2026-09-28",
  missing_tables: [],
});

function states(input: SetupCheckInput) {
  return Object.fromEntries(deriveSetupSteps(input).steps.map((s) => [s.id, s.state]));
}

describe("deriveSetupSteps", () => {
  it("missing dataset: create it first, everything after is blocked", () => {
    const out = deriveSetupSteps({ ...base, dataset: { state: "missing", location: null }, transfer: null });
    expect(states({ ...base, dataset: { state: "missing", location: null }, transfer: null })).toEqual({
      dataset: "todo",
      access: "blocked",
      transfer: "blocked",
      ads_access: "blocked",
      backfill: "blocked",
      connect: "blocked",
    });
    expect(out.next).toBe("dataset");
    expect(out.steps[0]!.detail).toContain("US");
  });

  it("dataset exists but unreadable: next step is access", () => {
    const out = deriveSetupSteps({ ...base, dataset: { state: "no_access", location: null }, transfer: null });
    expect(out.next).toBe("access");
    expect(out.steps.find((s) => s.id === "dataset")!.state).toBe("done");
  });

  it("readable but empty: transfer is waiting (created or not)", () => {
    const out = deriveSetupSteps(base);
    expect(out.next).toBe("transfer");
    expect(out.steps.find((s) => s.id === "transfer")!.state).toBe("waiting");
  });

  it("short history is a check (not a blocker); 90 days (minus slack) is done", () => {
    expect(states({ ...base, transfer: { customers: [customer("2026-09-20")] } }).backfill).toBe("warning");
    expect(states({ ...base, transfer: { customers: [customer("2026-07-05")] } }).backfill).toBe("done");
    const short = deriveSetupSteps({ ...base, transfer: { customers: [customer("2026-09-20")] } });
    expect(short.next).toBe("connect");
    expect(short.steps.find((s) => s.id === "backfill")!.detail).toContain("connect now");
  });

  it("wrong location is a warning that doesn't block the rest", () => {
    const out = deriveSetupSteps({
      ...base,
      dataset: { state: "wrong_location", location: "EU" },
      transfer: { customers: [customer("2026-07-01")] },
    });
    expect(out.steps[0]!.state).toBe("warning");
    expect(out.steps[0]!.detail).toContain("google_ads_us");
    expect(out.next).toBe("connect");
  });

  it("all done once saved settings use the found accounts", () => {
    const out = deriveSetupSteps({ ...base, transfer: { customers: [customer("2026-07-01")] }, connected: true });
    expect(out.next).toBeNull();
  });

  it("transfer read errors surface on the transfer step", () => {
    const out = deriveSetupSteps({ ...base, transfer: { customers: [], error: "BigQuery denied access" } });
    expect(out.steps.find((s) => s.id === "transfer")).toMatchObject({ state: "error", detail: "BigQuery denied access" });
  });
});

describe("deriveSetupSteps with transfer status", () => {
  const found = (latest_run: TransferRunSummary | null, over: Partial<Extract<TransferInfo, { state: "found" }>> = {}): TransferInfo => ({
    state: "found",
    config_id: "abc",
    display_name: "Google Ads → google_ads",
    owner_email: "sa@proj.iam.gserviceaccount.com",
    runs_as_service_account: true,
    schedule: "every 24 hours",
    disabled: false,
    customer_id: "1234567890",
    run_history_url: "https://console.cloud.google.com/x",
    latest_run,
    backfill: null,
    ...over,
  });

  it("no transfer into this dataset → transfer todo, access blocked", () => {
    const out = deriveSetupSteps({ ...base, transferInfo: { state: "none", other_datasets: ["ads_old"] } });
    expect(out.next).toBe("transfer");
    expect(out.steps.find((s) => s.id === "transfer")!.detail).toContain("ads_old");
    expect(states({ ...base, transferInfo: { state: "none", other_datasets: [] } }).ads_access).toBe("blocked");
  });

  it("failed run with a permission error → access step shows Google's message", () => {
    const run: TransferRunSummary = { state: "FAILED", run_time: "2026-09-30T16:43:00Z", messages: ["User doesn't have permission to access customer"], permission_error: true };
    const out = deriveSetupSteps({ ...base, transferInfo: found(run) });
    expect(states({ ...base, transferInfo: found(run) })).toMatchObject({ transfer: "done", ads_access: "error" });
    expect(out.next).toBe("ads_access");
    expect(out.steps.find((s) => s.id === "ads_access")!.detail).toContain("permission");
  });

  it("running / succeeded / no run yet", () => {
    expect(states({ ...base, transferInfo: found({ state: "RUNNING", run_time: null, messages: [], permission_error: false }) }).ads_access).toBe("waiting");
    expect(states({ ...base, transferInfo: found({ state: "SUCCEEDED", run_time: null, messages: [], permission_error: false }) }).ads_access).toBe("done");
    expect(states({ ...base, transferInfo: found(null) }).ads_access).toBe("waiting");
  });

  it("paused transfer is a warning; API unavailable falls back to waiting", () => {
    expect(states({ ...base, transferInfo: found(null, { disabled: true }) }).transfer).toBe("warning");
    expect(states({ ...base, transferInfo: { state: "unavailable", error: "403" } })).toMatchObject({ transfer: "waiting", ads_access: "waiting" });
  });
});

describe("pickTransferConfig / summarizeRun", () => {
  it("picks the newest Google Ads transfer writing into the dataset", () => {
    const { config, otherDatasets } = pickTransferConfig(
      [
        { name: "a", destinationDatasetId: "google_ads", dataSourceId: "google_ads", updateTime: "2026-09-01T00:00:00Z" },
        { name: "b", destinationDatasetId: "google_ads", dataSourceId: "google_ads", updateTime: "2026-09-30T00:00:00Z" },
        { name: "c", destinationDatasetId: "other", dataSourceId: "google_ads" },
        { name: "d", destinationDatasetId: "google_ads", dataSourceId: "scheduled_query" },
      ],
      "google_ads",
    );
    expect(config?.name).toBe("b");
    expect(otherDatasets).toEqual(["other"]);
  });

  it("summarizes the newest run; error logs first, permission detected", () => {
    const s = summarizeRun(
      [
        { state: "SUCCEEDED", runTime: "2026-09-28T00:00:00Z" },
        { state: "FAILED", runTime: "2026-09-29T00:00:00Z", errorStatus: { message: "No Bigquery load job was created." } },
      ],
      [{ severity: "ERROR", messageText: "USER_PERMISSION_DENIED: caller does not have access to customer 1234567890", messageTime: "2026-09-29T00:01:00Z" }],
    );
    expect(s).toMatchObject({ state: "FAILED", permission_error: true });
    expect(s!.messages[0]).toContain("USER_PERMISSION_DENIED");
    expect(s!.messages[1]).toContain("No Bigquery load job");
  });

  it("no runs → null; success has no messages", () => {
    expect(summarizeRun([], [])).toBeNull();
    expect(summarizeRun([{ state: "SUCCEEDED", runTime: "x" }], [])).toMatchObject({ state: "SUCCEEDED", messages: [], permission_error: false });
  });
});

describe("backfill progress", () => {
  const range = { start: "2026-07-02", end: "2026-09-29" };
  const bf = (over: Partial<BackfillProgress>): BackfillProgress => ({
    source: "runs",
    ...range,
    total_days: 90,
    loaded_days: 0,
    running: 0,
    pending: 0,
    failed: 0,
    failed_days: [],
    ...over,
  });
  const withCustomer = (since: string | null) => ({ ...base, transfer: { customers: [customer(since)] } });

  it("summarizeBackfill counts one run per day (newest attempt wins) within the range", () => {
    const out = summarizeBackfill(
      [
        { state: "SUCCEEDED", runTime: "2026-09-29T00:00:00Z", startTime: "2026-09-30T01:00:00Z" },
        { state: "FAILED", runTime: "2026-09-28T00:00:00Z", startTime: "2026-09-30T01:00:00Z", errorStatus: { message: "quota" } },
        { state: "SUCCEEDED", runTime: "2026-09-28T00:00:00Z", startTime: "2026-09-30T02:00:00Z" },
        { state: "RUNNING", runTime: "2026-09-27T00:00:00Z" },
        { state: "PENDING", runTime: "2026-09-26T00:00:00Z" },
        { state: "FAILED", runTime: "2026-09-25T00:00:00Z", errorStatus: { message: "boom" } },
        { state: "SUCCEEDED", runTime: "2026-06-01T00:00:00Z" },
      ],
      range.start,
      range.end,
    );
    expect(out).toMatchObject({ total_days: 90, loaded_days: 2, running: 1, pending: 1, failed: 1 });
    expect(out.failed_days).toEqual([{ date: "2026-09-25", message: "boom" }]);
  });

  it("in progress → waiting with counts; failures after it finishes → error; waiting does not block connect", () => {
    const running = deriveSetupSteps({ ...withCustomer("2026-09-29"), backfill: bf({ loaded_days: 34, running: 2, pending: 54 }) });
    expect(running.steps.find((s) => s.id === "backfill")).toMatchObject({ state: "waiting" });
    expect(running.steps.find((s) => s.id === "backfill")!.detail).toContain("34 of 90");
    expect(running.steps.find((s) => s.id === "backfill")!.detail).toContain("connect while it loads");
    expect(running.next).toBe("connect");
    expect(states({ ...withCustomer("2026-07-02"), backfill: bf({ loaded_days: 87, failed: 3 }) }).backfill).toBe("error");
  });

  it("complete runs → done; no backfill scheduled → warning (connect still next)", () => {
    expect(states({ ...withCustomer("2026-07-02"), backfill: bf({ loaded_days: 90 }) }).backfill).toBe("done");
    const short = deriveSetupSteps({ ...withCustomer("2026-09-29"), backfill: bf({ loaded_days: 1 }) });
    expect(short.steps.find((s) => s.id === "backfill")).toMatchObject({ state: "warning" });
    expect(short.next).toBe("connect");
  });

  it("table fallback: done when history reaches back even with quiet days; otherwise warning that mentions growth", () => {
    expect(states({ ...withCustomer("2026-07-03"), backfill: bf({ source: "tables", loaded_days: 70 }) }).backfill).toBe("done");
    const out = deriveSetupSteps({ ...withCustomer("2026-09-20"), backfill: bf({ source: "tables", loaded_days: 10 }) });
    expect(out.steps.find((s) => s.id === "backfill")).toMatchObject({ state: "warning" });
    expect(out.steps.find((s) => s.id === "backfill")!.detail).toContain("grows");
    expect(out.next).toBe("connect");
  });
});

describe("alternateDatasetName", () => {
  it("suffixes the location", () => {
    expect(alternateDatasetName("google_ads", "US")).toBe("google_ads_us");
    expect(alternateDatasetName("google_ads", "us-central1")).toBe("google_ads_us_central1");
  });
});
