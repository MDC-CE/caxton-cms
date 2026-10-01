import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ cacheDir: "" }));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "paid-detection-google-"));

vi.mock("../db-cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("../db-cache")>()), CACHE_DIR: h.cacheDir }));
vi.mock("../settings", () => ({
  getAdsSettings: () => ({ google: { enabled: true, customer_ids: ["1234567890"], bigquery: { project: "p-project", dataset: "ads" } } }),
  getLeadConversionEventNames: () => ["generate_lead"],
}));

const { buildPaidLandingSql, nextPaidLandingAttempt, parsePaidLandingRows, paidLandingDatesToFetch, PAID_LANDING_SCHEMA_VERSION, PAID_LANDING_DAYS_DIR } =
  await import("./paid-detection");

afterAll(() => fs.rmSync(h.cacheDir, { recursive: true, force: true }));

const CLICKS = [{ customer_id: "1234567890", table: "p-project.ads.ads_ClickStats_1234567890", columns: ["click_view_gclid", "campaign_id", "segments_date"] }];

describe("buildPaidLandingSql Google fields", () => {
  it("reads the GA4 Google Ads link and joins ClickStats on gclid", () => {
    const sql = buildPaidLandingSql("`g.a.events_*`", { includeSessionLastClick: true, googleLink: true, clickStats: CLICKS });
    expect(sql).toContain("session_traffic_source_last_click.google_ads_campaign.campaign_id");
    expect(sql).toContain("`p-project.ads.ads_ClickStats_1234567890`");
    expect(sql).toContain("LEFT JOIN clicks k");
    // Missing ClickStats columns become typed NULLs.
    expect(sql).toMatch(/CAST\(NULL AS STRING\) AS ad_group_id/);
    expect(sql).toContain("'ga4_link'");
  });

  it("keeps the old shape without Google (positional boolean still works)", () => {
    const sql = buildPaidLandingSql("`g.a.events_*`", false);
    expect(sql).not.toContain("google_ads_campaign");
    expect(sql).not.toContain("ClickStats");
    expect(sql).toContain("matched AS");
  });
});

describe("nextPaidLandingAttempt", () => {
  const full = { includeSessionLastClick: true, googleLink: true, clickStats: CLICKS };

  it("drops the join first on other errors (different dataset location, no access)", () => {
    expect(nextPaidLandingAttempt(full, "Cannot read and write in different locations: source: US, destination: EU")).toEqual({ ...full, clickStats: [] });
  });

  it("drops the Google Ads link field when the export lacks it", () => {
    expect(nextPaidLandingAttempt(full, "Field name google_ads_campaign does not exist in STRUCT")).toEqual({ ...full, googleLink: false });
  });

  it("drops session_traffic_source_last_click, then gives up", () => {
    const noLink = { includeSessionLastClick: true, googleLink: false, clickStats: [] };
    expect(nextPaidLandingAttempt(noLink, "Unrecognized name: session_traffic_source_last_click")).toEqual({ ...noLink, includeSessionLastClick: false });
    expect(nextPaidLandingAttempt({ ...noLink, includeSessionLastClick: false }, "boom")).toBeNull();
  });
});

describe("parsePaidLandingRows Google ids", () => {
  it("normalizes ids and maps the network", () => {
    const { candidates } = parsePaidLandingRows([
      {
        kind: "candidate",
        host: "www.example.com",
        path: "/en/x",
        source: "google",
        medium: "cpc",
        sessions: 3,
        gads_customer_id: "123-456-7890",
        gads_campaign_id: "2233445566",
        gads_ad_group_id: "998877665544",
        gads_network: "YOUTUBE_WATCH",
        gads_match: "gclid",
      },
      { kind: "candidate", host: "example.com", path: "/en/y", source: "facebook", medium: "paid_social", sessions: 1, gads_match: null },
    ]);
    expect(candidates[0]).toMatchObject({
      gads_customer_id: "1234567890",
      gads_campaign_id: "2233445566",
      gads_ad_group_id: "998877665544",
      gads_network: "youtube",
      gads_match: "gclid",
    });
    expect(candidates[1]!.gads_match).toBeUndefined();
  });
});

describe("paidLandingDatesToFetch schema upgrade", () => {
  it("re-reads complete days cached before Google ids, after missing days", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    const dir = path.join(h.cacheDir, "site_x", PAID_LANDING_DAYS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const write = (date: string, schema?: number) =>
      fs.writeFileSync(
        path.join(dir, `${date}.json`),
        JSON.stringify({ date, fetched_at: now.toISOString(), complete: true, candidates: [], organic: [], cookieless: [], ...(schema ? { schema_version: schema } : {}) }),
      );
    write("2026-09-10");
    write("2026-09-11", PAID_LANDING_SCHEMA_VERSION);
    const plain = paidLandingDatesToFetch("site_x", now);
    const upgraded = paidLandingDatesToFetch("site_x", now, true);
    expect(plain).not.toContain("2026-09-10");
    expect(upgraded).toContain("2026-09-10");
    expect(upgraded).not.toContain("2026-09-11");
    expect(upgraded[upgraded.length - 1]).toBe("2026-09-10");
  });
});
