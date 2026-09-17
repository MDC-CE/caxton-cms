import { afterEach, describe, expect, it } from "vitest";
import {
  addUtcDays,
  clearAllTodayKpiCache,
  effectiveCloseAt,
  emptyKindStatusCounts,
  ensureKpiCatchUp,
  getKpiHistory,
  invalidateTodayKpiCache,
  stockAsOf,
  stockForDay,
  toCardBuckets,
  utcDayString,
  utcHourKey,
  wipeAndBackfillKpiHistory,
  yesterdayUtc,
  type ProposalKpiSourceRow,
} from "./kpi-history";
import Database from "better-sqlite3";

afterEach(() => {
  clearAllTodayKpiCache();
});

function row(
  partial: Partial<ProposalKpiSourceRow> & Pick<ProposalKpiSourceRow, "kind" | "status" | "created_at">,
): ProposalKpiSourceRow {
  return {
    closed_at: null,
    updated_at: partial.created_at,
    ...partial,
  };
}

describe("toCardBuckets", () => {
  it("folds partial into open and drops withdrawn", () => {
    const buckets = toCardBuckets([
      { kind: "idea", status: "open", n: 2 },
      { kind: "idea", status: "partial", n: 1 },
      { kind: "idea", status: "finished", n: 4 },
      { kind: "idea", status: "rejected", n: 1 },
      { kind: "idea", status: "withdrawn", n: 9 },
      { kind: "edits", status: "open", n: 3 },
    ]);
    expect(buckets.idea.open).toBe(3);
    expect(buckets.idea.finished).toBe(4);
    expect(buckets.idea.rejected).toBe(1);
    expect(buckets.edits.open).toBe(3);
    expect(buckets.notes).toEqual(emptyKindStatusCounts().notes);
  });
});

describe("stockForDay", () => {
  const day = "2026-09-10";
  const endPrev = Date.parse("2026-09-09T12:00:00.000Z");
  const midDay = Date.parse("2026-09-10T12:00:00.000Z");
  const after = Date.parse("2026-09-11T12:00:00.000Z");

  it("counts still-open proposals as open", () => {
    const stock = stockForDay(
      [row({ kind: "idea", status: "open", created_at: endPrev })],
      day,
    );
    expect(stock.idea.open).toBe(1);
    expect(stock.idea.finished).toBe(0);
  });

  it("counts partial as open", () => {
    const stock = stockForDay(
      [row({ kind: "edits", status: "partial", created_at: endPrev })],
      day,
    );
    expect(stock.edits.open).toBe(1);
  });

  it("finished after EOD still counts as open that day", () => {
    const stock = stockForDay(
      [
        row({
          kind: "idea",
          status: "finished",
          created_at: endPrev,
          closed_at: after,
          updated_at: after,
        }),
      ],
      day,
    );
    expect(stock.idea.open).toBe(1);
    expect(stock.idea.finished).toBe(0);
  });

  it("finished during day counts as finished at EOD", () => {
    const stock = stockForDay(
      [
        row({
          kind: "idea",
          status: "finished",
          created_at: endPrev,
          closed_at: midDay,
          updated_at: midDay,
        }),
      ],
      day,
    );
    expect(stock.idea.open).toBe(0);
    expect(stock.idea.finished).toBe(1);
  });

  it("uses updated_at when closed_at missing", () => {
    expect(
      effectiveCloseAt(
        row({
          kind: "edits",
          status: "finished",
          created_at: endPrev,
          closed_at: null,
          updated_at: midDay,
        }),
      ),
    ).toBe(midDay);
    const stock = stockForDay(
      [
        row({
          kind: "edits",
          status: "finished",
          created_at: endPrev,
          closed_at: null,
          updated_at: midDay,
        }),
      ],
      day,
    );
    expect(stock.edits.finished).toBe(1);
  });

  it("ignores withdrawn entirely", () => {
    const stock = stockForDay(
      [
        row({
          kind: "notes",
          status: "withdrawn",
          created_at: endPrev,
          closed_at: midDay,
          updated_at: midDay,
        }),
      ],
      day,
    );
    expect(stock.notes).toEqual(emptyKindStatusCounts().notes);
  });

  it("ignores proposals created after the day", () => {
    const stock = stockForDay(
      [row({ kind: "idea", status: "open", created_at: after })],
      day,
    );
    expect(stock.idea.open).toBe(0);
  });
});

describe("ensureKpiCatchUp / getKpiHistory", () => {
  function setupDb() {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE content_proposals (
        id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        closed_at INTEGER
      );
      CREATE TABLE proposal_kpi_daily (
        site TEXT NOT NULL,
        day TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (site, day, kind, status)
      );
    `);
    return db;
  }

  it("back-fills missing days and does not write today", () => {
    const db = setupDb();
    const now = Date.parse("2026-09-16T15:00:00.000Z");
    const created = Date.parse("2026-09-01T12:00:00.000Z");
    db.prepare(
      `INSERT INTO content_proposals (id, site, kind, status, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("p1", "site_a", "idea", "open", created, created, null);

    ensureKpiCatchUp(db, "site_a", {
      from: "2026-09-14",
      to: "2026-09-16",
      now,
    });

    const days = db
      .prepare(`SELECT DISTINCT day FROM proposal_kpi_daily WHERE site = ? ORDER BY day`)
      .all("site_a") as Array<{ day: string }>;
    expect(days.map((d) => d.day)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(days.some((d) => d.day === utcDayString(now))).toBe(false);

    const open = db
      .prepare(
        `SELECT count FROM proposal_kpi_daily WHERE site=? AND day=? AND kind='idea' AND status='open'`,
      )
      .get("site_a", "2026-09-15") as { count: number };
    expect(open.count).toBe(1);
  });

  it("wipeAndBackfill replaces rows", () => {
    const db = setupDb();
    const now = Date.parse("2026-09-16T15:00:00.000Z");
    const outsideRetention = addUtcDays(utcDayString(now), -120);
    db.prepare(
      `INSERT INTO proposal_kpi_daily (site, day, kind, status, count) VALUES (?, ?, ?, ?, ?)`,
    ).run("site_a", outsideRetention, "idea", "open", 99);
    db.prepare(
      `INSERT INTO content_proposals (id, site, kind, status, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("p1", "site_a", "idea", "open", Date.parse("2026-09-10T00:00:00.000Z"), 0, null);

    wipeAndBackfillKpiHistory(db, "site_a", { now });
    const stale = db
      .prepare(`SELECT count FROM proposal_kpi_daily WHERE site=? AND day=? AND kind='idea' AND status='open'`)
      .get("site_a", outsideRetention) as { count: number } | undefined;
    expect(stale).toBeUndefined();
    const y = yesterdayUtc(now);
    const open = db
      .prepare(
        `SELECT count FROM proposal_kpi_daily WHERE site=? AND day=? AND kind='idea' AND status='open'`,
      )
      .get("site_a", y) as { count: number };
    expect(open.count).toBe(1);
  });

  it("getKpiHistory returns day series through yesterday", () => {
    const db = setupDb();
    const now = Date.parse("2026-09-16T15:00:00.000Z");
    db.prepare(
      `INSERT INTO content_proposals (id, site, kind, status, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("p1", "site_a", "idea", "open", Date.parse("2026-09-01T00:00:00.000Z"), 0, null);

    const hist = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "day",
      from: "2026-09-14",
      to: "2026-09-20",
      now,
    });
    expect(hist.to).toBe("2026-09-15");
    expect(hist.granularity).toBe("day");
    const openSeries = hist.series.find((s) => s.kind === "idea" && s.status === "open");
    expect(openSeries?.points.every((p) => p.count === 1)).toBe(true);
    expect(openSeries?.points.some((p) => p.day === "2026-09-16")).toBe(false);
  });

  it("prunes days older than retention", () => {
    const db = setupDb();
    const now = Date.parse("2026-09-16T15:00:00.000Z");
    const old = addUtcDays(utcDayString(now), -120);
    db.prepare(
      `INSERT INTO proposal_kpi_daily (site, day, kind, status, count) VALUES (?, ?, ?, ?, ?)`,
    ).run("site_a", old, "idea", "open", 1);
    ensureKpiCatchUp(db, "site_a", { now, from: yesterdayUtc(now), to: yesterdayUtc(now) });
    const left = db
      .prepare(`SELECT day FROM proposal_kpi_daily WHERE site=? AND day=?`)
      .get("site_a", old);
    expect(left).toBeUndefined();
  });

  it("week is last 7 completed days as day keys (not ISO week)", () => {
    const db = setupDb();
    const now = Date.parse("2026-09-16T15:00:00.000Z");
    db.prepare(
      `INSERT INTO content_proposals (id, site, kind, status, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("p1", "site_a", "idea", "open", Date.parse("2026-09-01T00:00:00.000Z"), 0, null);

    const hist = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "week",
      now,
    });
    expect(hist.granularity).toBe("week");
    expect(hist.to).toBe("2026-09-15");
    expect(hist.from).toBe("2026-09-09");
    const openSeries = hist.series.find((s) => s.kind === "idea" && s.status === "open");
    expect(openSeries?.points).toHaveLength(7);
    expect(openSeries?.points.map((p) => p.day)).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
    expect(openSeries?.points.every((p) => !p.day.includes("W"))).toBe(true);
  });

  it("today returns hourly points through now and caches for 15m", () => {
    const db = setupDb();
    const now = Date.parse("2026-09-16T15:30:00.000Z");
    db.prepare(
      `INSERT INTO content_proposals (id, site, kind, status, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "p1",
      "site_a",
      "idea",
      "open",
      Date.parse("2026-09-16T10:00:00.000Z"),
      Date.parse("2026-09-16T10:00:00.000Z"),
      null,
    );

    const first = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "today",
      now,
    });
    expect(first.granularity).toBe("today");
    expect(first.from).toBe("2026-09-16");
    expect(first.computed_at).toBe(now);
    const openSeries = first.series.find((s) => s.kind === "idea" && s.status === "open");
    // hours 0..14 + now at 15 → 16 points
    expect(openSeries?.points.length).toBe(16);
    expect(openSeries?.points[openSeries.points.length - 1]?.day).toBe(utcHourKey(now));
    expect(openSeries?.points[openSeries.points.length - 1]?.count).toBe(1);
    // before create hour, open is 0
    expect(openSeries?.points[0]?.count).toBe(0);

    const later = now + 60_000;
    const cached = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "today",
      now: later,
    });
    expect(cached.computed_at).toBe(now);

    const forced = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "today",
      now: later,
      fresh: true,
    });
    expect(forced.computed_at).toBe(later);

    invalidateTodayKpiCache("site_a");
    const afterBust = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "today",
      now: later + 1,
    });
    expect(afterBust.computed_at).toBe(later + 1);
  });
});

describe("stockAsOf", () => {
  it("matches stockForDay at end of day", () => {
    const day = "2026-09-10";
    const midDay = Date.parse("2026-09-10T12:00:00.000Z");
    const rows = [
      row({
        kind: "idea",
        status: "finished",
        created_at: Date.parse("2026-09-09T12:00:00.000Z"),
        closed_at: midDay,
        updated_at: midDay,
      }),
    ];
    expect(stockAsOf(rows, Date.parse("2026-09-10T23:59:59.999Z"))).toEqual(stockForDay(rows, day));
  });
});
