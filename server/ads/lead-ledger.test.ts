import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";

vi.mock("../settings", () => ({
  getAdsSettings: () => ({
    meta: { enabled: false, ad_account_ids: [], alert_thresholds: {} },
    test_email_patterns: ["*@4geeks-test.com"],
  }),
}));
vi.mock("../staff-session-resolve", () => ({
  resolveOwnedStaffSession: async (token: string) => (token === "staff-token" ? { username: "staff" } : null),
}));

import { clearSiteSqliteCacheForTests } from "../db";
import { resetPipelineDbCache } from "../pipeline-db/runner";
import { enrichLeadBody, insertLedgerRow, listLedgerRows, prepareLead, pruneLedger } from "./lead-ledger";
import { serializeConsentCookie } from "@shared/consent";

const SITE = `site_lead-ledger-test-${process.pid}`;

function rmSite(): void {
  const dir = path.join("data", SITE);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function fakeReq(opts: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}): Request {
  return {
    cookies: opts.cookies ?? {},
    headers: opts.headers ?? {},
    hostname: "4geeks.com",
  } as unknown as Request;
}

function fakeRes(): Response {
  return { locals: { site: { contentRootName: SITE, contentRoot: "/tmp/none" } } } as unknown as Response;
}

describe("lead ledger", () => {
  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
  });
  afterEach(() => {
    clearSiteSqliteCacheForTests();
    rmSite();
  });

  it("flags test leads by email pattern and never stores email", async () => {
    const { wire, row } = await prepareLead(fakeReq({ cookies: { "4g_user_id": "u1" } }), fakeRes(), {
      email: "qa@4geeks-test.com",
      conversion_name: "apply",
      utm_source: "facebook",
      utm_medium: "paid_social",
      utm_id: "1234567890",
      landing_url: "/en/bootcamp?x=1",
      conversion_url: "/en/apply",
    });
    expect(wire.is_test).toBe(true);
    expect(wire.test_reason).toBe("email_pattern");
    expect(wire.is_repeat).toBe(false);
    expect(wire.repeat_of_submission_id).toBeUndefined();
    expect(row.platform).toBe("meta");
    expect(row.campaign_id).toBe("1234567890");
    expect(row.landing_path).toBe("/en/bootcamp");
    expect(JSON.stringify(row)).not.toContain("4geeks-test.com");
  });

  it("flags staff sessions as test", async () => {
    const { wire } = await prepareLead(
      fakeReq({ headers: { "x-debug-token": "staff-token" } }),
      fakeRes(),
      { email: "someone@example.com" },
    );
    expect(wire.test_reason).toBe("staff_session");
  });

  it("marks a second submission from the same browser and form within 24h as repeat", async () => {
    const req = fakeReq({ cookies: { "4g_user_id": "u2" } });
    const first = await prepareLead(req, fakeRes(), { email: "a@example.com", conversion_name: "apply" });
    insertLedgerRow(SITE, first.row);
    const second = await prepareLead(req, fakeRes(), { email: "a@example.com", conversion_name: "apply" });
    expect(second.wire.is_repeat).toBe(true);
    expect(second.wire.repeat_of_submission_id).toBe(first.row.submission_id);
    insertLedgerRow(SITE, second.row);
    const otherForm = await prepareLead(req, fakeRes(), { email: "a@example.com", conversion_name: "download" });
    expect(otherForm.wire.is_repeat).toBe(false);
    expect(listLedgerRows(SITE, 0)).toHaveLength(2);
  });

  it("prefers the 4g_ads cookie when consent is granted", async () => {
    const ads = Buffer.from(
      JSON.stringify({
        v: 1,
        utm: { utm_source: "google", utm_medium: "cpc", gclid: "G1" },
        last_paid: { host: "4geeks.com", path: "/en/ai", at: Date.now() - 1000 },
        updated_at: Date.now(),
      }),
    ).toString("base64url");
    const consent = serializeConsentCookie({ decision: "granted_explicit", mode: "ask", at: Date.now() / 1000 });
    const { wire, row } = await prepareLead(
      fakeReq({ cookies: { "4g_ads": ads, "4g_consent": consent } }),
      fakeRes(),
      { email: "b@example.com", utm_source: "newsletter" },
    );
    expect(wire.utm_source).toBe("google");
    expect(wire.gclid).toBe("G1");
    expect(wire.consent_state).toBe("granted");
    expect(row.last_paid_path).toBe("/en/ai");
  });

  it("stores platform and ids of the first and last paid landings", async () => {
    const at = Date.now() - 5000;
    const { row } = await prepareLead(fakeReq(), fakeRes(), {
      email: "d@example.com",
      utm_source: "google",
      utm_medium: "cpc",
      utm_id: "2233445566",
      first_paid_landing_host: "4geeks.com",
      first_paid_landing_path: "/en/a",
      first_paid_landing_at: at,
      first_paid_landing_platform: "meta",
      first_paid_landing_campaign_id: "120000000001",
      last_paid_landing_host: "4geeks.com",
      last_paid_landing_path: "/en/b",
      last_paid_landing_at: at,
      last_paid_landing_platform: "google",
      last_paid_landing_campaign_id: "2233445566",
      last_paid_landing_adset_id: "not-a-number",
    });
    expect(row).toMatchObject({
      platform: "google",
      campaign_id: "2233445566",
      first_paid_platform: "meta",
      first_paid_campaign_id: "120000000001",
      last_paid_platform: "google",
      last_paid_campaign_id: "2233445566",
      last_paid_adset_id: null,
    });
    insertLedgerRow(SITE, row);
    expect(listLedgerRows(SITE, 0).find((r) => r.submission_id === row.submission_id)?.last_paid_platform).toBe("google");
  });

  it("drops ledger-only keys from the forwarded body", () => {
    const out = enrichLeadBody({ email: "x@y.z", last_paid_landing_host: "h", page_experiment_id: "p" }, {
      submission_id: "s",
      is_test: false,
      is_repeat: false,
    });
    expect(out.last_paid_landing_host).toBeUndefined();
    expect(out.page_experiment_id).toBeUndefined();
    expect(out.submission_id).toBe("s");
  });

  it("prunes rows older than 25 months", async () => {
    const { row } = await prepareLead(fakeReq(), fakeRes(), { email: "c@example.com" });
    insertLedgerRow(SITE, { ...row, created_at: Date.now() - 26 * 31 * 86_400_000 });
    expect(pruneLedger(SITE)).toBe(1);
  });
});
