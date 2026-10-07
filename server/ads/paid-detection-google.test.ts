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

const {
  ATTRIBUTED_OTHER_HOST,
  buildPaidLandingSql,
  nextPaidLandingAttempt,
  parsePaidLandingRows,
  paidLandingDatesToFetch,
  summarizeAttributedOnly,
  PAID_LANDING_SCHEMA_VERSION,
  PAID_LANDING_DAYS_DIR,
} = await import("./paid-detection");

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

describe("buildPaidLandingSql per-visit evidence", () => {
  const full = buildPaidLandingSql("`g.a.events_*`", { includeSessionLastClick: true, googleLink: true, clickStats: CLICKS });
  const candidateGate = full.split("\n").find((l) => l.includes("AS is_candidate")) ?? "";

  it("gates candidates on landing click ids / per-visit medium only", () => {
    expect(candidateGate).toContain("LOWER(v_medium) IN UNNEST(@paid_mediums)");
    expect(candidateGate).not.toContain("gads_campaign");
    expect(candidateGate).not.toContain("lc_medium");
    expect(full).not.toContain("gads_campaign IS NOT NULL) AS is_candidate");
  });

  it("reads source / medium from the landing URL, then collected_traffic_source, never last click or first user", () => {
    expect(full).toContain("collected_traffic_source.manual_medium");
    expect(full).toContain("r'[?&]utm_medium=([^&#]+)'");
    expect(full).not.toMatch(/session_traffic_source_last_click\.manual_campaign\.source/);
    expect(full).not.toMatch(/\btraffic_source\.(source|medium|name)\b/);
  });

  it("uses the Google Ads link only behind a Google click id", () => {
    expect(full).toContain("IF(google_click, landing.gads_campaign, NULL)");
    expect(full).toContain("WHEN google_click AND landing.gads_campaign IS NOT NULL THEN 'ga4_link'");
    expect(full).toMatch(/\(gclid\|gbraid\|wbraid\|dclid\)=/);
  });

  it("counts attributed-only sessions per host only when the last-click field is read", () => {
    expect(full).toContain("'attributed', host");
    expect(full).toMatch(/WHERE NOT is_candidate AND \(LOWER\(landing\.lc_medium\) IN UNNEST\(@paid_mediums\) OR landing\.gads_campaign IS NOT NULL\)/);
    const noLastClick = buildPaidLandingSql("`g.a.events_*`", { includeSessionLastClick: false });
    expect(noLastClick).not.toContain("'attributed'");
    expect(noLastClick).not.toContain("session_traffic_source_last_click");
  });
});

describe("parsePaidLandingRows attributed", () => {
  it("merges www / bare hosts and sorts by sessions", () => {
    const { attributed_only, candidates, organic } = parsePaidLandingRows([
      { kind: "attributed", host: "learn.4geeks.com", path: null, sessions: 40 },
      { kind: "attributed", host: "www.4geeks.com", path: null, sessions: 5 },
      { kind: "attributed", host: "4geeks.com", path: null, sessions: 7 },
      { kind: "attributed", host: "x.com", path: null, sessions: 0 },
    ]);
    expect(attributed_only).toEqual([
      { host: "learn.4geeks.com", sessions: 40 },
      { host: "4geeks.com", sessions: 12 },
    ]);
    expect(candidates).toEqual([]);
    expect(organic).toEqual([]);
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
  const now = new Date("2026-09-20T12:00:00.000Z");
  const write = (site: string, date: string, extra: Record<string, unknown> = {}) => {
    const dir = path.join(h.cacheDir, site, PAID_LANDING_DAYS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${date}.json`),
      JSON.stringify({ date, fetched_at: now.toISOString(), complete: true, candidates: [], organic: [], cookieless: [], ...extra }),
    );
  };

  it("re-reads every older-schema day, Google on or off, without the 30-day cap", () => {
    write("site_x", "2026-09-10");
    write("site_x", "2026-09-09", { schema_version: 2 });
    write("site_x", "2026-09-11", { schema_version: PAID_LANDING_SCHEMA_VERSION, google_ids: true });
    // Older than the 90-day backfill window, still within retention.
    write("site_x", "2026-03-01", { schema_version: 2 });
    for (const google of [false, true]) {
      const { missing, upgrade } = paidLandingDatesToFetch("site_x", now, google);
      expect(upgrade).toEqual(["2026-09-10", "2026-09-09", "2026-03-01"]);
      expect(missing).not.toContain("2026-09-10");
      expect(missing.length).toBeGreaterThan(30);
    }
  });

  it("re-reads current-schema days without Google ids only once Google is connected", () => {
    write("site_y", "2026-09-12", { schema_version: PAID_LANDING_SCHEMA_VERSION, google_ids: false });
    expect(paidLandingDatesToFetch("site_y", now, false).upgrade).toEqual([]);
    expect(paidLandingDatesToFetch("site_y", now, true).upgrade).toEqual(["2026-09-12"]);
  });
});

describe("summarizeAttributedOnly", () => {
  const day = (extra: Record<string, unknown>) =>
    ({ date: "2026-09-01", fetched_at: "", complete: true, candidates: [], organic: [], cookieless: [], schema_version: PAID_LANDING_SCHEMA_VERSION, ...extra }) as never;

  it("sums hosts across days, keeps the top 10 and folds the rest into (other)", () => {
    const hosts = Array.from({ length: 12 }, (_, i) => ({ host: `h${i}.com`, sessions: 12 - i }));
    const out = summarizeAttributedOnly([day({ attributed_only: hosts }), day({ attributed_only: [{ host: "h0.com", sessions: 3 }] })]);
    expect(out!.total).toBe(81);
    expect(out!.by_host).toHaveLength(11);
    expect(out!.by_host[0]).toEqual({ host: "h0.com", sessions: 15 });
    expect(out!.by_host[10]).toEqual({ host: ATTRIBUTED_OTHER_HOST, sessions: 3 });
  });

  it("is null when a day couldn't measure it; older-schema days contribute nothing", () => {
    expect(summarizeAttributedOnly([day({ attributed_measured: false })])).toBeNull();
    expect(summarizeAttributedOnly([day({ schema_version: 2, attributed_only: [{ host: "a.com", sessions: 9 }] })])).toEqual({ total: 0, by_host: [] });
  });
});
