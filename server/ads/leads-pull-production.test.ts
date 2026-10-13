import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchProductionAdminResult } from "../dev-production-fetch";
import type { LedgerRow } from "./lead-ledger";

vi.mock("../settings", () => ({
  getAdsSettings: () => ({ meta: { enabled: false, ad_account_ids: [], alert_thresholds: {} }, test_email_patterns: [] }),
}));
vi.mock("../staff-session-resolve", () => ({ resolveOwnedStaffSession: async () => null }));
vi.mock("../dev-production-fetch", () => ({
  fetchProductionAdmin: vi.fn(),
  resolveProductionOrigin: () => "https://prod.test",
}));

import { clearSiteSqliteCacheForTests } from "../db";
import { resetPipelineDbCache } from "../pipeline-db/runner";
import { insertLedgerRow, listLedgerRows } from "./lead-ledger";
import { listConsentDaily, recordConsentEvent } from "./consent-store";
import { buildLeadsExport, pullProductionLeads, readLeadsPullState } from "./leads-pull-production";

const SITE = `site_leads-pull-test-${process.pid}`;
const SINCE = Date.parse("2026-09-01T00:00:00.000Z");

function rmSite(): void {
  fs.rmSync(path.join("data", SITE), { recursive: true, force: true });
}

function row(over: Partial<LedgerRow>): LedgerRow {
  return {
    submission_id: "x",
    created_at: SINCE + 1000,
    form: "apply",
    browser_hash: null,
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

function okResponse(body: unknown): FetchProductionAdminResult {
  return { ok: true, response: new Response(JSON.stringify(body), { status: 200 }) };
}

describe("pullProductionLeads", () => {
  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
  });
  afterEach(() => {
    clearSiteSqliteCacheForTests();
    rmSite();
  });

  it("replaces real leads and consent from `since` on, keeping local test leads and older rows", async () => {
    insertLedgerRow(SITE, row({ submission_id: "local-real", created_at: SINCE + 5000 }));
    insertLedgerRow(SITE, row({ submission_id: "local-test", created_at: SINCE + 6000, is_test: 1, test_reason: "staff_session" }));
    insertLedgerRow(SITE, row({ submission_id: "local-old", created_at: SINCE - 86_400_000 }));
    recordConsentEvent(SITE, { kind: "shown", mode: "ask", country: "ES", at: SINCE + 1000 });
    recordConsentEvent(SITE, { kind: "shown", mode: "ask", country: "ES", at: SINCE - 86_400_000 });

    let asked = "";
    const r = await pullProductionLeads(SITE, { sinceMs: SINCE }, {
      fetchAdmin: async (url) => {
        asked = url.toString();
        return okResponse({
          since: SINCE,
          leads: [row({ submission_id: "prod-1", created_at: SINCE + 100 }), row({ submission_id: "prod-2", created_at: SINCE + 200, platform: "meta" })],
          consent_daily: [
            { date: "2026-09-01", country: "US", mode: "notice", shown: 40, granted_explicit: 0, granted_implied: 38, denied: 2 },
            { date: "2026-09-02", country: "ES", mode: "ask", shown: 10, granted_explicit: 7, granted_implied: 0, denied: 3 },
          ],
        });
      },
    });

    expect(asked).toBe(`https://prod.test/api/ads/leads/export?since=${SINCE}`);
    expect(r).toMatchObject({ success: true, imported_leads: 2, imported_consent_days: 2, since: SINCE });
    const ids = listLedgerRows(SITE, 0).map((x) => x.submission_id).sort();
    expect(ids).toEqual(["local-old", "local-test", "prod-1", "prod-2"]);
    const consent = listConsentDaily(SITE, "2000-01-01");
    expect(consent.map((c) => `${c.date}:${c.country}:${c.shown}`)).toEqual(["2026-08-31:ES:1", "2026-09-01:US:40", "2026-09-02:ES:10"]);
    expect(buildLeadsExport(SITE, SINCE).leads.map((x) => x.submission_id).sort()).toEqual(["local-test", "prod-1", "prod-2"]);
    const pulled = readLeadsPullState(SITE);
    expect(pulled).toMatchObject({ since: SINCE, origin: "https://prod.test" });
    expect(typeof pulled.pulled_at).toBe("number");
  });

  it("explains a 404 as 'not deployed yet' and leaves local rows alone", async () => {
    insertLedgerRow(SITE, row({ submission_id: "local-real" }));
    const r = await pullProductionLeads(SITE, { sinceMs: SINCE }, {
      fetchAdmin: async () => ({ ok: false, kind: "http", status: 404, body: "", productionOrigin: "https://prod.test", response: new Response(null, { status: 404 }) }),
    });
    expect(r).toMatchObject({ success: false, not_supported: true, imported_leads: 0 });
    expect(listLedgerRows(SITE, 0).map((x) => x.submission_id)).toEqual(["local-real"]);
    expect(readLeadsPullState(SITE)).toEqual({ pulled_at: null, since: null, origin: null });
  });
});
