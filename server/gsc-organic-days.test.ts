import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { CACHE_DIR } from "./db-cache";
import {
  anyKeepRulesStale,
  buildKeepContext,
  EMPTY_DAY_RETRY_MS,
  gscOrganicDaysDir,
  loadOrganicDay,
  organicDayNeedsCatchUp,
  pruneOrganicDays,
  saveOrganicDay,
  type GscOrganicDayFile,
} from "./gsc-organic-days";
import { KEEP_RULES_VERSION } from "./gsc-keep-filter";
import { aggregateDayRows } from "./seo-organic-opportunities";
import { resetSettings } from "./settings";
import type { OrganicMarket } from "./gsc-organic-markets";

const FOLDER = "vitest-gsc-organic-days";

function day(date: string, version: number, rows: GscOrganicDayFile["rows"]): GscOrganicDayFile {
  return {
    date,
    fetched_at: "2026-01-01T00:00:00.000Z",
    keep_rules_version: version,
    truncated: false,
    rows,
  };
}

describe("gsc organic days + weighted position", () => {
  beforeEach(() => {
    fs.rmSync(gscOrganicDaysDir(FOLDER), { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(gscOrganicDaysDir(FOLDER), { recursive: true, force: true });
  });

  it("flags keep_rules_version mismatch", () => {
    saveOrganicDay(day("2026-08-01", 0, []), FOLDER);
    saveOrganicDay(day("2026-08-02", KEEP_RULES_VERSION, []), FOLDER);
    expect(anyKeepRulesStale(["2026-08-01", "2026-08-02"], FOLDER)).toBe(true);
    expect(loadOrganicDay("2026-08-01", FOLDER)?.keep_rules_version).toBe(0);
  });

  it("does not flag when every day matches KEEP_RULES_VERSION", () => {
    saveOrganicDay(day("2026-08-01", KEEP_RULES_VERSION, []), FOLDER);
    expect(anyKeepRulesStale(["2026-08-01"], FOLDER)).toBe(false);
  });

  it("prunes older than 60 days", () => {
    const dates: string[] = [];
    for (let m = 1; m <= 3; m++) {
      for (let d = 1; d <= 28; d++) {
        dates.push(`2026-0${m}-${String(d).padStart(2, "0")}`);
      }
    }
    for (const d of dates) saveOrganicDay(day(d, KEEP_RULES_VERSION, []), FOLDER);
    expect(dates.length).toBe(84);
    const dropped = pruneOrganicDays(FOLDER, 60);
    expect(dropped.length).toBe(24);
    expect(fs.readdirSync(path.join(CACHE_DIR, FOLDER, "gsc-organic-days")).length).toBe(60);
  });

  it("aggregates impressions-weighted position across days (not average of averages)", () => {
    const rows = aggregateDayRows([
      {
        date: "2026-08-01",
        fetched_at: "",
        keep_rules_version: 1,
        truncated: false,
        rows: [
          {
            query: "python bootcamp",
            url: "https://example.com/a",
            country: "",
            clicks: 0,
            impressions: 300,
            sum_position: 300 * 10,
            ctr: 0,
          },
        ],
      },
      {
        date: "2026-08-02",
        fetched_at: "",
        keep_rules_version: 1,
        truncated: false,
        rows: [
          {
            query: "python bootcamp",
            url: "https://example.com/a",
            country: "",
            clicks: 0,
            impressions: 100,
            sum_position: 100 * 20,
            ctr: 0,
          },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.position).toBeCloseTo(12.5);
    expect(rows[0]!.impressions).toBe(400);
  });
});

describe("buildKeepContext hosts", () => {
  let tmp: string;
  let prevSiteUrl: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsc-keep-ctx-"));
    prevSiteUrl = process.env.SITE_URL;
    process.env.SITE_URL = "https://donna-privacy-treating-funeral.trycloudflare.com";
    resetSettings(tmp);
  });

  afterEach(() => {
    if (prevSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prevSiteUrl;
    resetSettings(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("ignores SITE_URL tunnels and uses Search Console site_url", () => {
    fs.writeFileSync(
      path.join(tmp, "settings.yml"),
      `search_console:
  site_url: sc-domain:4geeks.com
`,
      "utf-8",
    );
    resetSettings(tmp);
    const ctx = buildKeepContext(tmp);
    expect([...ctx.ourHosts]).toEqual(["4geeks.com"]);
  });

  it("leaves hosts empty when Search Console site_url is unset (do not lock to SITE_URL)", () => {
    fs.writeFileSync(path.join(tmp, "settings.yml"), "i18n: {}\n", "utf-8");
    resetSettings(tmp);
    const ctx = buildKeepContext(tmp);
    expect(ctx.ourHosts.size).toBe(0);
  });
});

describe("organicDayNeedsCatchUp", () => {
  const worldwide: OrganicMarket = {
    id: "worldwide",
    label: "Worldwide",
    countries: [],
    kind: "rollup",
  };
  const spain: OrganicMarket = {
    id: "spain",
    label: "Spain",
    countries: ["esp"],
    kind: "country",
  };
  const now = Date.parse("2026-09-16T12:00:00.000Z");

  function file(partial: Partial<GscOrganicDayFile> & { date?: string }): GscOrganicDayFile {
    return {
      date: partial.date ?? "2026-09-01",
      fetched_at: partial.fetched_at ?? "2026-09-16T11:00:00.000Z",
      keep_rules_version: partial.keep_rules_version ?? KEEP_RULES_VERSION,
      truncated: partial.truncated ?? false,
      rows: partial.rows ?? [],
    };
  }

  const usaRow = {
    query: "bootcamp",
    url: "https://4geeks.com/us",
    country: "usa",
    clicks: 1,
    impressions: 10,
    sum_position: 50,
    ctr: 0.1,
  };
  const espRow = {
    ...usaRow,
    url: "https://4geeks.com/es",
    country: "esp",
  };

  it("treats absent file as eligible", () => {
    expect(organicDayNeedsCatchUp(null, worldwide, now)).toBe(true);
  });

  it("treats stale keep_rules_version as eligible", () => {
    expect(
      organicDayNeedsCatchUp(file({ keep_rules_version: 0, rows: [usaRow] }), worldwide, now),
    ).toBe(true);
  });

  it("skips non-empty worldwide file", () => {
    expect(organicDayNeedsCatchUp(file({ rows: [usaRow] }), worldwide, now)).toBe(false);
  });

  it("skips fresh empty file (age gate)", () => {
    expect(
      organicDayNeedsCatchUp(
        file({ rows: [], fetched_at: "2026-09-16T11:00:00.000Z" }),
        worldwide,
        now,
      ),
    ).toBe(false);
  });

  it("retries empty file older than 12h", () => {
    const aged = new Date(now - EMPTY_DAY_RETRY_MS - 1).toISOString();
    expect(organicDayNeedsCatchUp(file({ rows: [], fetched_at: aged }), worldwide, now)).toBe(true);
  });

  it("treats invalid fetched_at on empty file as eligible", () => {
    expect(
      organicDayNeedsCatchUp(file({ rows: [], fetched_at: "not-a-date" }), worldwide, now),
    ).toBe(true);
  });

  it("country market: rows only for other countries are empty for market; age gate applies", () => {
    const fresh = file({ rows: [usaRow], fetched_at: "2026-09-16T11:00:00.000Z" });
    expect(organicDayNeedsCatchUp(fresh, spain, now)).toBe(false);

    const aged = file({
      rows: [usaRow],
      fetched_at: new Date(now - EMPTY_DAY_RETRY_MS - 1).toISOString(),
    });
    expect(organicDayNeedsCatchUp(aged, spain, now)).toBe(true);
  });

  it("country market: matching country rows are not eligible", () => {
    expect(organicDayNeedsCatchUp(file({ rows: [espRow, usaRow] }), spain, now)).toBe(false);
  });

  it("worldwide: any non-empty file is not eligible", () => {
    expect(organicDayNeedsCatchUp(file({ rows: [usaRow] }), worldwide, now)).toBe(false);
    expect(organicDayNeedsCatchUp(file({ rows: [espRow] }), worldwide, now)).toBe(false);
  });
});
