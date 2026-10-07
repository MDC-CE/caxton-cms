import { describe, expect, it } from "vitest";
import {
  IDLE_ADS_REFRESH_STATUS,
  isRefreshActive,
  refreshProgressPercent,
  refreshStatusCopy,
  type AdsRefreshStatus,
} from "./ads-refresh-status";

const fmt = (iso: string) => iso.slice(11, 16);
const status = (over: Partial<AdsRefreshStatus>): AdsRefreshStatus => ({ ...IDLE_ADS_REFRESH_STATUS, ...over });

describe("isRefreshActive", () => {
  it("is true only while queued or running", () => {
    expect(isRefreshActive(status({ state: "queued" }))).toBe(true);
    expect(isRefreshActive(status({ state: "running" }))).toBe(true);
    expect(isRefreshActive(status({ state: "failed" }))).toBe(false);
    expect(isRefreshActive(status({ state: "worker_down" }))).toBe(false);
    expect(isRefreshActive(undefined)).toBe(false);
  });
});

describe("refreshProgressPercent", () => {
  it("rounds done/total to a whole percent", () => {
    expect(refreshProgressPercent({ done: 2, total: 5, label: "" })).toBe(40);
    expect(refreshProgressPercent({ done: 1, total: 3, label: "" })).toBe(33);
  });

  it("clamps to 0–100", () => {
    expect(refreshProgressPercent({ done: 7, total: 5, label: "" })).toBe(100);
    expect(refreshProgressPercent({ done: -1, total: 5, label: "" })).toBe(0);
  });

  it("is null when there is nothing to measure", () => {
    expect(refreshProgressPercent({ done: 0, total: 0, label: "" })).toBeNull();
    expect(refreshProgressPercent(null)).toBeNull();
    expect(refreshProgressPercent(undefined)).toBeNull();
  });
});

describe("refreshStatusCopy", () => {
  it("says nothing when idle", () => {
    expect(refreshStatusCopy(IDLE_ADS_REFRESH_STATUS)).toBeNull();
  });

  it("shows when the queued job was requested", () => {
    const copy = refreshStatusCopy(status({ state: "queued", requested_at: "2026-09-29T12:05:00.000Z" }), "settings", fmt);
    expect(copy).toEqual({ tone: "muted", message: "Waiting for the background worker since 12:05." });
  });

  it("explains a failure with retry time on settings", () => {
    const copy = refreshStatusCopy(
      status({ state: "failed", error: "Invalid job class: MetaAdsSyncJob", retry_after: "2026-09-29T13:00:00.000Z" }),
      "settings",
      fmt,
    );
    expect(copy).toEqual({
      tone: "error",
      message: "Last sync didn't run: Invalid job class: MetaAdsSyncJob. Try again, or it retries automatically at 13:00.",
    });
  });

  it("does not double the period when the error already ends with one", () => {
    const copy = refreshStatusCopy(status({ state: "failed", error: "The background worker never picked this up." }), "report", fmt);
    expect(copy?.message).toBe("Last Ads sync didn't run: The background worker never picked this up. Showing the last synced numbers.");
  });

  it("points settings at the in-process Sync now when the worker is down", () => {
    expect(refreshStatusCopy(status({ state: "worker_down" }), "settings")?.message).toContain("Sync now will run it here instead");
    expect(refreshStatusCopy(status({ state: "worker_down" }), "report")?.message).toContain("Showing the last synced numbers");
  });
});
