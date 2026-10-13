import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerRow } from "./ads/lead-ledger";

vi.mock("./settings", () => ({
  getAdsSettings: () => ({ meta: { enabled: false, ad_account_ids: [], alert_thresholds: {} }, test_email_patterns: [] }),
  getSearchConsoleSettings: () => ({ organic_markets: [] }),
}));
vi.mock("./staff-session-resolve", () => ({ resolveOwnedStaffSession: async () => null }));

import { clearSiteSqliteCacheForTests } from "./db";
import { resetPipelineDbCache } from "./pipeline-db/runner";
import { insertLedgerRow } from "./ads/lead-ledger";
import { buildOrganicLeadsByPath, lookupPathLeads, sumPathLeads, windowBoundsMs } from "./seo-organic-leads";
import type { OrganicMarket } from "./gsc-organic-markets";

const SITE = `site_organic-leads-test-${process.pid}`;
const WINDOW = { start: "2026-09-01", end: "2026-09-28" };
const IN = Date.parse("2026-09-10T12:00:00.000Z");
const WORLD: OrganicMarket = { id: "worldwide", label: "Worldwide", countries: [], kind: "rollup" };
const SPAIN: OrganicMarket = { id: "spain", label: "Spain", countries: ["esp"], kind: "country" };

function rmSite(): void {
  fs.rmSync(path.join("data", SITE), { recursive: true, force: true });
}

let seq = 0;
function row(over: Partial<LedgerRow>): LedgerRow {
  seq += 1;
  return {
    submission_id: `ol-${seq}`,
    created_at: IN,
    form: "apply",
    browser_hash: `hash-${seq}`,
    host: "4geeks.com",
    locale: "en",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    platform: null,
    campaign_id: null,
    adset_id: null,
    ad_id: null,
    click_id_type: null,
    landing_path: null,
    conversion_path: null,
    first_paid_host: null,
    first_paid_path: null,
    first_paid_at: null,
    last_paid_host: null,
    last_paid_path: null,
    last_paid_at: null,
    experiment_id: null,
    variant: null,
    is_test: 0,
    test_reason: null,
    is_repeat: 0,
    repeat_of: null,
    consent_state: "granted",
    ...over,
  };
}

function organic(over: Partial<LedgerRow>): LedgerRow {
  return row({ traffic_status: "organic", channel: "organic_search", ...over });
}

describe("organic leads by page (Cluster Map)", () => {
  beforeEach(() => {
    seq = 0;
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
  });
  afterEach(() => {
    clearSiteSqliteCacheForTests();
    rmSite();
  });

  it("turns the inclusive Search Console window into UTC bounds", () => {
    expect(windowBoundsMs(WINDOW)).toEqual({
      startMs: Date.parse("2026-09-01T00:00:00.000Z"),
      endMs: Date.parse("2026-09-29T00:00:00.000Z"),
    });
    expect(windowBoundsMs({ start: "2026-09-02", end: "2026-09-01" })).toBeNull();
  });

  it("credits the page the search visit landed on, inside the window only", () => {
    insertLedgerRow(SITE, organic({ channel_landing_path: "/en/blog/python", landing_path: "/en/home", conversion_path: "/en/apply" }));
    insertLedgerRow(SITE, organic({ channel_landing_path: "/en/blog/python/" }));
    insertLedgerRow(SITE, organic({ channel_landing_path: "/en/blog/python", created_at: Date.parse("2026-09-29T00:00:00.000Z") }));
    insertLedgerRow(SITE, organic({ channel_landing_path: "/en/blog/python", is_test: 1 }));
    insertLedgerRow(SITE, organic({ channel_landing_path: "/en/blog/python", is_repeat: 1 }));
    insertLedgerRow(SITE, row({ traffic_status: "organic", channel: "direct", channel_landing_path: "/en/blog/python" }));
    const out = buildOrganicLeadsByPath({ site: SITE, window: WINDOW, market: WORLD });
    expect(lookupPathLeads(out.byPath, "/en/blog/python")).toEqual({ organic_search: 2, not_paid: 2, tracked: 3 });
    expect(lookupPathLeads(out.byPath, "/en/apply")).toBeUndefined();
    expect(lookupPathLeads(out.byPath, "/en/home")).toBeUndefined();
    expect(out.estimated).toBe(false);
    expect(out.tracking_since).toBe(IN);
  });

  it("estimates with untracked non-paid leads by first landing page, never paid ones", () => {
    insertLedgerRow(SITE, organic({ channel_landing_path: "/en/blog/x" }));
    insertLedgerRow(SITE, row({ landing_path: "/en/blog/x" }));
    insertLedgerRow(SITE, row({ landing_path: "/en/blog/x", platform: "google", click_id_type: "gclid" }));
    const out = buildOrganicLeadsByPath({ site: SITE, window: WINDOW, market: WORLD });
    expect(out.byPath["/en/blog/x"]).toEqual({ organic_search: 1, not_paid: 2, tracked: 1 });
    expect(out.estimated).toBe(true);
  });

  it("filters by market country and flags leads without a country", () => {
    insertLedgerRow(SITE, organic({ channel_landing_path: "/es/blog/y", country: "ES" }));
    insertLedgerRow(SITE, organic({ channel_landing_path: "/es/blog/y", country: "MX" }));
    const spainOnly = buildOrganicLeadsByPath({ site: SITE, window: WINDOW, market: SPAIN });
    expect(spainOnly.byPath["/es/blog/y"]?.organic_search).toBe(1);
    expect(spainOnly.estimated).toBe(false);

    insertLedgerRow(SITE, organic({ channel_landing_path: "/es/blog/y", country: null }));
    expect(buildOrganicLeadsByPath({ site: SITE, window: WINDOW, market: SPAIN }).estimated).toBe(true);
    const world = buildOrganicLeadsByPath({ site: SITE, window: WINDOW, market: WORLD });
    expect(world.byPath["/es/blog/y"]?.organic_search).toBe(3);
    expect(world.estimated).toBe(false);
  });

  it("returns nothing without a window and sums parts", () => {
    expect(buildOrganicLeadsByPath({ site: SITE, window: null, market: WORLD })).toEqual({
      byPath: {},
      tracking_since: null,
      estimated: false,
    });
    expect(sumPathLeads([undefined, { organic_search: 1, not_paid: 2, tracked: 3 }, { organic_search: 1, not_paid: 1, tracked: 1 }])).toEqual({
      organic_search: 2,
      not_paid: 3,
      tracked: 4,
    });
    expect(sumPathLeads([undefined])).toBeUndefined();
  });
});
