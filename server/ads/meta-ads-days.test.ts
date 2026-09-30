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
  fetchAdPlatformInsights: vi.fn(async () => []),
  fetchAdCreatives: vi.fn(async () => []),
  fetchCustomConversions: vi.fn(async () => []),
  fetchAccountPixels: vi.fn(async () => []),
  fetchPixelEventStats: vi.fn(async () => []),
  MetaApiError: class MetaApiError extends Error {},
}));

const {
  metaSyncStepCount,
  planMetaSyncSteps,
  platformWindowFor,
  shortDateRange,
  syncMetaAds,
  loadMetaState,
  loadMetaCreatives,
  loadMetaPlatformDay,
  loadMetaPlatformRows,
  loadMetaCustomConversions,
  loadMetaPixelEvents,
  metaDaysMissingConversions,
} = await import("./meta-ads-days");
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

function seedLoaded(ids: string[], platformLoaded = true, conversionsLoaded = true) {
  const accounts = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        name: `Acct ${id}`,
        currency: "USD",
        account_status: 1,
        history_loaded_at: "2026-09-01T00:00:00.000Z",
        ...(conversionsLoaded ? { conversions_loaded_at: "2026-09-01T00:00:00.000Z" } : {}),
        ...(platformLoaded ? { platform_history_loaded_at: "2026-09-01T00:00:00.000Z", platform_history_since: "2026-07-01" } : {}),
      },
    ]),
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
  it("counts lookup + insight chunks + placement chunks + creatives + conversions per account, plus pixel events and one save", () => {
    expect(metaSyncStepCount(1, { since: "2026-09-20", until: "2026-09-29" })).toBe(7);
    expect(metaSyncStepCount(2, { since: "2026-07-02", until: "2026-09-29" })).toBe(2 * (6 + 6 + 3) + 2);
  });

  it("uses per-account placement windows when given", () => {
    const refresh = { since: "2026-09-20", until: "2026-09-29" };
    const firstFill = { since: "2026-07-02", until: "2026-09-29" };
    expect(metaSyncStepCount(2, refresh, [refresh, firstFill])).toBe(2 * (1 + 3) + 1 + 6 + 2);
  });

  it("is 0 with no window or no accounts", () => {
    expect(metaSyncStepCount(1, null)).toBe(0);
    expect(metaSyncStepCount(0, { since: "2026-09-20", until: "2026-09-29" })).toBe(0);
  });
});

describe("platformWindowFor", () => {
  const refresh = { since: "2026-09-20", until: "2026-09-29" };
  it("widens to 90 days until placement history is loaded", () => {
    expect(platformWindowFor("refresh", refresh, undefined, NOW)).toEqual({ since: "2026-07-02", until: "2026-09-29" });
    expect(platformWindowFor("refresh", refresh, { name: "", currency: "", account_status: 1, platform_history_loaded_at: "x" }, NOW)).toEqual(refresh);
  });
  it("keeps older-history windows as they are", () => {
    const older = { since: "2026-04-03", until: "2026-07-01" };
    expect(platformWindowFor("older", older, undefined, NOW)).toEqual(older);
  });
});

describe("planMetaSyncSteps", () => {
  it("plans the 90-day first load when no days are cached", () => {
    h.meta.ad_account_ids = ["111", "222"];
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(2 * (6 + 6 + 3) + 2);
  });

  it("plans the 10-day refresh once days are cached and history is loaded", () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(7);
  });

  it("plans a 90-day placement fill when only placement history is missing", () => {
    seedDay("2026-09-01");
    seedLoaded(["111"], false);
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(1 + 1 + 6 + 1 + 1 + 1 + 1);
  });

  it("plans a 90-day backfill when an account never loaded history", () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    h.meta.ad_account_ids = ["111", "222"];
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(2 * (6 + 6 + 3) + 2);
  });

  it("plans a one-time 90-day refill when per-conversion counts were never loaded", () => {
    seedDay("2026-09-01");
    seedLoaded(["111"], true, false);
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(6 + 6 + 3 + 2);
  });

  it("plans 90 older days before the earliest cached day", () => {
    seedDay("2026-09-01");
    expect(planMetaSyncSteps(SITE, undefined, "older", NOW)).toBe(6 + 6 + 3 + 2);
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
    expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(2 * (6 + 6 + 3) + 2);
  });
});

describe("syncMetaAds per-conversion refill, custom conversions and pixel events", () => {
  it("re-reads 90 days once, marks conversions_loaded_at, then refreshes 10 days", async () => {
    seedDay("2026-09-01", [insightRow("111", "2026-09-01")]);
    seedLoaded(["111"], true, false);
    expect(metaDaysMissingConversions(SITE, "2026-09-01", "2026-09-29", ["111"])).toEqual(["2026-09-01"]);
    const first = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(first.mode).toBe("backfill");
    expect(first.dates).toHaveLength(90);
    expect(loadMetaState(SITE).accounts["111"].conversions_loaded_at).toBeTruthy();
    const second = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(second.mode).toBe("refresh");
    expect(second.dates).toHaveLength(10);
  });

  it("keeps retrying the refill while an account fails", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111", "222"], true, false);
    h.meta.ad_account_ids = ["111", "222"];
    vi.mocked(metaClient.fetchAccountInfo).mockImplementation(async (accountId: string) => {
      if (accountId === "222") throw new Error("rate limited");
      return { id: accountId, name: "Acct", currency: "USD", account_status: 1 };
    });
    try {
      await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
      const state = loadMetaState(SITE);
      expect(state.accounts["111"].conversions_loaded_at).toBeTruthy();
      expect(state.accounts["222"].conversions_loaded_at).toBeUndefined();
      expect(planMetaSyncSteps(SITE, undefined, "refresh", NOW)).toBe(2 * (6 + 6 + 3) + 2);
    } finally {
      vi.mocked(metaClient.fetchAccountInfo).mockImplementation(async () => ({ id: "", name: "Acct", currency: "USD", account_status: 1 }));
    }
  });

  it("saves custom conversions per account and pixel events deduped across accounts", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111", "222"]);
    h.meta.ad_account_ids = ["111", "222"];
    const cc = { id: "1086440567304045", name: "request_more_info", pixel_id: "414048075447471", pixel_name: "P", custom_event_type: "OTHER", last_fired_time: null, archived: false };
    vi.mocked(metaClient.fetchCustomConversions).mockResolvedValue([cc] as never);
    vi.mocked(metaClient.fetchAccountPixels).mockResolvedValue([{ id: "414048075447471", name: "P", last_fired_time: null }] as never);
    vi.mocked(metaClient.fetchPixelEventStats).mockResolvedValue([{ event: "Lead", total: 3, hourly: { "2026-09-29T10:00:00": 3 } }] as never);
    try {
      await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
      expect(loadMetaCustomConversions(SITE).accounts["222"].conversions).toEqual([cc]);
      const px = loadMetaPixelEvents(SITE).pixels["414048075447471"];
      expect(px.accounts).toEqual(["111", "222"]);
      expect(px.events[0]).toMatchObject({ event: "Lead", total: 3 });
      expect(metaClient.fetchPixelEventStats).toHaveBeenCalledTimes(1);
    } finally {
      vi.mocked(metaClient.fetchCustomConversions).mockResolvedValue([]);
      vi.mocked(metaClient.fetchAccountPixels).mockResolvedValue([]);
      vi.mocked(metaClient.fetchPixelEventStats).mockResolvedValue([]);
    }
  });

  it("keeps the previous conversions and records conversions_error when the read fails", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    const cc = { id: "1086440567304045", name: "request_more_info", pixel_id: null, pixel_name: null, custom_event_type: null, last_fired_time: null, archived: false };
    vi.mocked(metaClient.fetchCustomConversions).mockResolvedValueOnce([cc] as never);
    await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    vi.mocked(metaClient.fetchCustomConversions).mockRejectedValueOnce(new Error("no perms"));
    await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(loadMetaCustomConversions(SITE).accounts["111"]).toEqual({ conversions: [cc], error: "no perms" });
    expect(loadMetaState(SITE).accounts["111"].conversions_error).toBe("no perms");
  });
});

describe("syncMetaAds placement read", () => {
  function platformRow(account_id: string, date: string, ad_id: string, platform = "instagram") {
    return { account_id, date, ad_id, campaign_id: "c", adset_id: "s", currency: "USD", platform, spend: 5, impressions: 10, link_clicks: 1, pixel_leads: 0 };
  }

  it("saves placement rows, fills 90 days on first sync and marks the history", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111"], false);
    vi.mocked(metaClient.fetchAdPlatformInsights).mockImplementation(async (_a: string, since: string) =>
      since === "2026-09-15" ? ([platformRow("111", "2026-09-29", "a1")] as never) : [],
    );
    try {
      const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
      expect(res.ok).toBe(true);
      expect(res.dates).toHaveLength(10);
      expect(loadMetaPlatformDay(SITE, "2026-07-02")).not.toBeNull();
      expect(loadMetaPlatformRows(SITE, "2026-09-29", "2026-09-29").map((r) => r.ad_id)).toEqual(["a1"]);
      const acct = loadMetaState(SITE).accounts["111"];
      expect(acct.platform_history_loaded_at).toBeTruthy();
      expect(acct.platform_history_since).toBe("2026-07-02");
      expect(acct.platform_error).toBeUndefined();
    } finally {
      vi.mocked(metaClient.fetchAdPlatformInsights).mockImplementation(async () => []);
    }
  });

  it("keeps main rows and old placement rows when the placement read fails", async () => {
    seedDay("2026-09-01");
    seedLoaded(["111"]);
    const dir = path.join(h.cacheDir, SITE, "meta-ads-platform-days");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "2026-09-29.json"),
      JSON.stringify({ date: "2026-09-29", fetched_at: "", rows: [platformRow("111", "2026-09-29", "old")] }),
      "utf-8",
    );
    vi.mocked(metaClient.fetchAdInsights).mockResolvedValueOnce([insightRow("111", "2026-09-29")] as never);
    vi.mocked(metaClient.fetchAdPlatformInsights).mockRejectedValueOnce(new Error("rate limited"));
    const res = await syncMetaAds({ site: SITE, mode: "refresh", now: NOW });
    expect(res.ok).toBe(true);
    expect(readDay("2026-09-29").rows.map((r) => r.ad_id)).toEqual(["ad-111"]);
    expect(loadMetaPlatformRows(SITE, "2026-09-29", "2026-09-29").map((r) => r.ad_id)).toEqual(["old"]);
    expect(loadMetaState(SITE).accounts["111"].platform_error).toBe("rate limited");
  });
});

describe("shortDateRange", () => {
  it("formats same-month, cross-month and single days", () => {
    expect(shortDateRange("2026-06-01", "2026-06-15")).toBe("Jun 1–15");
    expect(shortDateRange("2026-05-28", "2026-06-11")).toBe("May 28 – Jun 11");
    expect(shortDateRange("2026-06-03", "2026-06-03")).toBe("Jun 3");
  });
});
