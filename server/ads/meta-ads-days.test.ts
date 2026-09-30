import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  cacheDir: "",
  meta: { enabled: true, ad_account_ids: ["111"] as string[] },
  tokenConfigured: true,
}));
h.cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-ads-days-test-"));

vi.mock("../db-cache", () => ({ CACHE_DIR: h.cacheDir }));
vi.mock("../settings", () => ({ getAdsSettings: () => ({ meta: h.meta }) }));
vi.mock("./meta-client", () => ({
  isMetaTokenConfigured: () => h.tokenConfigured,
  fetchAccountInfo: vi.fn(async () => ({ name: "Acct", currency: "USD", account_status: 1 })),
  fetchAdInsights: vi.fn(async () => []),
  fetchAdCreatives: vi.fn(async () => []),
  MetaApiError: class MetaApiError extends Error {},
}));

const { metaSyncStepCount, planMetaSyncSteps, shortDateRange, syncMetaAds, loadMetaState, loadMetaCreatives } = await import("./meta-ads-days");
const metaClient = await import("./meta-client");

const SITE = "site_test";
const NOW = new Date("2026-09-29T12:00:00.000Z");

function seedDay(date: string, rows: unknown[] = []) {
  const dir = path.join(h.cacheDir, SITE, "meta-ads-days");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify({ date, fetched_at: "", rows }), "utf-8");
}

function readDay(date: string): { rows: Array<{ account_id: string; ad_id: string }> } {
  return JSON.parse(fs.readFileSync(path.join(h.cacheDir, SITE, "meta-ads-days", `${date}.json`), "utf-8"));
}

function seedLoaded(ids: string[]) {
  const accounts = Object.fromEntries(
    ids.map((id) => [id, { name: `Acct ${id}`, currency: "USD", account_status: 1, history_loaded_at: "2026-09-01T00:00:00.000Z" }]),
  );
  fs.mkdirSync(path.join(h.cacheDir, SITE), { recursive: true });
  fs.writeFileSync(path.join(h.cacheDir, SITE, "meta-ads-state.json"), JSON.stringify({ consecutive_failures: 0, accounts }), "utf-8");
}

function insightRow(account_id: string, date: string, ad_id = `ad-${account_id}`) {
  return { account_id, date, ad_id, campaign_id: "c", adset_id: "s", campaign_name: "C", spend: 10, currency: "USD", link_clicks: 1 };
}

beforeEach(() => {
  fs.rmSync(path.join(h.cacheDir, SITE), { recursive: true, force: true });
  h.meta = { enabled: true, ad_account_ids: ["111"] };
  h.tokenConfigured = true;
});

afterAll(() => {
  fs.rmSync(h.cacheDir, { recursive: true, force: true });
});

describe("metaSyncStepCount", () => {
  it("counts lookup + 15-day chunks + creatives per account, plus one save", () => {
    expect(metaSyncStepCount(1, { since: "2026-09-20", until: "2026-09-29" })).toBe(4);
    expect(metaSyncStepCount(2, { since: "2026-07-02", until: "2026-09-29" })).toBe(2 * (6 + 2) + 1);
  });

  it("is 0 with no window or no accounts", () => {
    expect(metaSyncStepCount(1, null)).toBe(0);
    expect(metaSyncStepCount(0, { since: "2026-09-20", until: "2026-09-29" })).toBe(0);
  });
});

describe("planMetaSyncSteps", () => {
  it("plans the 90-day first load when no days are cached", () => {
    h.meta.ad_account_ids = ["111", "222"];
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(17);
  });

  it("plans the 10-day refresh once days are cached and history is loaded", () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(4);
  });

  it("plans a 90-day backfill when an account never loaded history", () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    h.meta.ad_account_ids = ["111", "222"];
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(17);
  });

  it("plans 90 older days before the earliest cached day", () => {
    seedDay("2026-09-01");
    expect(planMetaSyncSteps(SITE, undefined, "older", NOW)).toBe(6 + 2 + 1);
  });

  it("is 0 when the sync would skip", () => {
    h.tokenConfigured = false;
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(0);
    h.tokenConfigured = true;
    h.meta = { enabled: false, ad_account_ids: ["111"] };
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(0);
  });
});

describe("syncMetaAds onStep", () => {
  it("reports exactly the planned number of steps", async () => {
    h.meta.ad_account_ids = ["111", "222"];
    const planned = planMetaSyncSteps(SITE, undefined, "refresh", NOW);
    const labels: string[] = [];
    const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW, onStep: (l) => labels.push(l) });
    expect(res.ok).toBe(true);
    expect(labels).toHaveLength(planned);
    expect(labels[0]).toBe("Meta: looking up account 1 of 2");
    expect(labels[1]).toBe("Meta: account 1 of 2, Jul 2–16");
    expect(labels.at(-1)).toBe("Meta: saving synced days");
  });
});

describe("syncMetaAds ad-setup read state", () => {
  it("records setup_read_at per account and tags setups with the account", async () => {
    vi.mocked(metaClient.fetchAdCreatives).mockResolvedValueOnce([
      { ad_id: "a1", campaign_id: "c1", adset_id: "s1", links: ["https://x.com/"], instant_form: false },
    ]);
    const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(res.ok).toBe(true);
    const acct = loadMetaState(SITE).accounts["111"];
    expect(acct.setup_read_at).toBeTruthy();
    expect(acct.setup_error).toBeUndefined();
    expect(loadMetaCreatives(SITE).ads.a1.account_id).toBe("111");
  });

  it("keeps the previous setup_read_at and records setup_error when the read fails", async () => {
    await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    const before = loadMetaState(SITE).accounts["111"].setup_read_at;
    expect(before).toBeTruthy();
    vi.mocked(metaClient.fetchAdCreatives).mockRejectedValueOnce(new Error("boom"));
    const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(res.ok).toBe(true);
    const acct = loadMetaState(SITE).accounts["111"];
    expect(acct.setup_read_at).toBe(before);
    expect(acct.setup_error).toBe("boom");
  });
});

describe("syncMetaAds history loading", () => {
  it("backfills 90 days for a new account and marks history loaded", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    h.meta.ad_account_ids = ["111", "222"];
    const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("backfill");
    expect(res.dates).toHaveLength(90);
    const state = loadMetaState(SITE);
    expect(state.accounts["222"].history_loaded_at).toBeTruthy();
    expect(state.accounts["111"].history_loaded_at).not.toBe("2026-09-01T00:00:00.000Z");
  });

  it("stays a 10-day refresh once every account is loaded", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(res.mode).toBe("refresh");
    expect(res.dates).toHaveLength(10);
    expect(loadMetaState(SITE).accounts["111"].history_loaded_at).toBe("2026-09-01T00:00:00.000Z");
  });

  it("does not mark history loaded when the whole sync fails", async () => {
    vi.mocked(metaClient.fetchAccountInfo).mockRejectedValueOnce(new Error("token expired"));
    const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("token expired");
    const acct = loadMetaState(SITE).accounts["111"];
    expect(acct.history_loaded_at).toBeUndefined();
    expect(acct.sync_error).toBe("token expired");
  });

  it("skips an unreadable account, saves the others and keeps its old rows", async () => {
    seedLoaded(["111", "222"]);
    seedDay("2026-09-29", [insightRow("222", "2026-09-29", "old-222")]);
    for (let d = 20; d <= 28; d++) seedDay(`2026-09-${d}`);
    h.meta.ad_account_ids = ["111", "222"];
    vi.mocked(metaClient.fetchAdInsights).mockImplementation(async (accountId: string, since: string) =>
      accountId === "111" && since === "2026-09-20" ? ([insightRow("111", "2026-09-29")] as never) : [],
    );
    vi.mocked(metaClient.fetchAccountInfo).mockImplementation(async (accountId: string) => {
      if (accountId === "222") throw new Error("no access");
      return { id: accountId, name: "Acct", currency: "USD", account_status: 1 };
    });
    try {
      const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
      expect(res.ok).toBe(true);
      const ads = readDay("2026-09-29").rows.map((r) => r.ad_id).sort();
      expect(ads).toEqual(["ad-111", "old-222"]);
      const state = loadMetaState(SITE);
      expect(state.accounts["222"].sync_error).toBe("no access");
      expect(state.accounts["222"].name).toBe("Acct 222");
      expect(state.accounts["111"].sync_error).toBeUndefined();
      expect(state.last_error).toContain("222");
    } finally {
      vi.mocked(metaClient.fetchAdInsights).mockImplementation(async () => []);
      vi.mocked(metaClient.fetchAccountInfo).mockImplementation(async () => ({ id: "", name: "Acct", currency: "USD", account_status: 1 }));
    }
  });

  it("prunes removed accounts so re-adding one backfills again", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111", "222"]);
    h.meta.ad_account_ids = ["111"];
    await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(loadMetaState(SITE).accounts["222"]).toBeUndefined();

    h.meta.ad_account_ids = ["111", "222"];
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(17);
  });
});

describe("shortDateRange", () => {
  it("formats same-month, cross-month and single days", () => {
    expect(shortDateRange("2026-06-01", "2026-06-15")).toBe("Jun 1–15");
    expect(shortDateRange("2026-05-28", "2026-06-11")).toBe("May 28 – Jun 11");
    expect(shortDateRange("2026-06-03", "2026-06-03")).toBe("Jun 3");
  });
});
