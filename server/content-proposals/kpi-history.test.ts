import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllKpiCache,
  effectiveCloseAt,
  emptyKindStatusCounts,
  getKpiHistory,
  invalidateKpiCache,
  mondayOfUtcWeek,
  stockAsOf,
  stockForDay,
  toCardBuckets,
  utcHourKey,
  type KpiHistoryResult,
  type ProposalKpiSourceRow,
} from "./kpi-history";
import Database from "better-sqlite3";

afterEach(() => {
  clearAllKpiCache();
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

describe("stockForDay / stockAsOf", () => {
  const day = "2026-09-10";
  const endPrev = Date.parse("2026-09-09T12:00:00.000Z");
  const midDay = Date.parse("2026-09-10T12:00:00.000Z");
  const after = Date.parse("2026-09-11T12:00:00.000Z");

  it("finished after EOD still counts as open that day", () => {
    const stock = stockForDay(
      [row({ kind: "idea", status: "finished", created_at: endPrev, closed_at: after, updated_at: after })],
      day,
    );
    expect(stock.idea.open).toBe(1);
    expect(stock.idea.finished).toBe(0);
  });

  it("uses updated_at when closed_at missing", () => {
    const r = row({ kind: "edits", status: "finished", created_at: endPrev, closed_at: null, updated_at: midDay });
    expect(effectiveCloseAt(r)).toBe(midDay);
    expect(stockForDay([r], day).edits.finished).toBe(1);
  });

  it("stockAsOf matches stockForDay at end of day", () => {
    const rows = [
      row({ kind: "idea", status: "finished", created_at: endPrev, closed_at: midDay, updated_at: midDay }),
    ];
    expect(stockAsOf(rows, Date.parse("2026-09-10T23:59:59.999Z"))).toEqual(stockForDay(rows, day));
  });
});

describe("mondayOfUtcWeek", () => {
  it("snaps any day to its Monday (UTC)", () => {
    expect(mondayOfUtcWeek("2026-09-14")).toBe("2026-09-14");
    expect(mondayOfUtcWeek("2026-09-16")).toBe("2026-09-14");
    expect(mondayOfUtcWeek("2026-09-20")).toBe("2026-09-14");
    expect(mondayOfUtcWeek("2026-09-13")).toBe("2026-09-07");
  });
});

describe("getKpiHistory (flow per bucket)", () => {
  /** Wednesday 2026-09-16 15:30 UTC; that week starts Monday 2026-09-14. */
  const NOW = Date.parse("2026-09-16T15:30:00.000Z");

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
    `);
    return db;
  }

  let seq = 0;
  function insert(
    db: Database.Database,
    p: { kind?: string; status: string; created: string; closed?: string | null; updated?: string },
  ) {
    const created = Date.parse(p.created);
    const closed = p.closed ? Date.parse(p.closed) : null;
    const updated = p.updated ? Date.parse(p.updated) : (closed ?? created);
    db.prepare(
      `INSERT INTO content_proposals (id, site, kind, status, created_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(`p${++seq}`, "site_a", p.kind ?? "idea", p.status, created, updated, closed);
  }

  function points(hist: KpiHistoryResult, status: "open" | "finished" | "rejected", kind = "idea") {
    return hist.series.find((s) => s.kind === kind && s.status === status)?.points ?? [];
  }

  function countAt(hist: KpiHistoryResult, status: "open" | "finished" | "rejected", key: string) {
    return points(hist, status).find((p) => p.day === key)?.count;
  }

  it("day buckets restart each day: created vs closed land in their own day", () => {
    const db = setupDb();
    insert(db, { status: "open", created: "2026-09-14T09:00:00.000Z" });
    insert(db, {
      status: "finished",
      created: "2026-09-14T10:00:00.000Z",
      closed: "2026-09-15T11:00:00.000Z",
    });
    insert(db, { status: "partial", created: "2026-09-15T08:00:00.000Z" });

    const hist = getKpiHistory(db, "site_a", { kind: "idea", granularity: "day", now: NOW });
    expect(hist.metric).toBe("flow");
    expect(hist.from).toBe("2026-08-20");
    expect(hist.to).toBe("2026-09-16");

    const open = points(hist, "open");
    expect(open).toHaveLength(28);
    expect(countAt(hist, "open", "2026-09-14")).toBe(2);
    expect(countAt(hist, "open", "2026-09-15")).toBe(1);
    expect(countAt(hist, "open", "2026-09-16")).toBe(0);
    expect(countAt(hist, "finished", "2026-09-14")).toBe(0);
    expect(countAt(hist, "finished", "2026-09-15")).toBe(1);
    expect(countAt(hist, "finished", "2026-09-16")).toBe(0);

    expect(open[open.length - 1]).toEqual({ day: "2026-09-16", count: 0, partial: true });
    expect(open.slice(0, -1).every((p) => p.partial === undefined)).toBe(true);
  });

  it("omits withdrawn and uses updated_at fallback for rejected", () => {
    const db = setupDb();
    insert(db, {
      status: "withdrawn",
      created: "2026-09-15T08:00:00.000Z",
      closed: "2026-09-15T09:00:00.000Z",
    });
    insert(db, {
      status: "rejected",
      created: "2026-09-10T08:00:00.000Z",
      closed: null,
      updated: "2026-09-15T12:00:00.000Z",
    });

    const hist = getKpiHistory(db, "site_a", { kind: "idea", granularity: "day", now: NOW });
    expect(countAt(hist, "open", "2026-09-15")).toBe(0);
    expect(countAt(hist, "open", "2026-09-10")).toBe(1);
    expect(countAt(hist, "rejected", "2026-09-15")).toBe(1);
  });

  it("today = one bucket per UTC hour through now; last hour partial", () => {
    const db = setupDb();
    insert(db, { status: "open", created: "2026-09-16T10:05:00.000Z" });
    insert(db, { status: "open", created: "2026-09-15T23:00:00.000Z" });

    const hist = getKpiHistory(db, "site_a", { kind: "idea", granularity: "today", now: NOW });
    const open = points(hist, "open");
    expect(open).toHaveLength(16);
    expect(open[10]).toEqual({ day: "2026-09-16T10:00Z", count: 1 });
    expect(open.filter((p) => p.count > 0)).toHaveLength(1);
    expect(open[open.length - 1]).toEqual({ day: utcHourKey(NOW), count: 0, partial: true });
  });

  it("week = Monday-start UTC buckets, last 12 + current", () => {
    const db = setupDb();
    insert(db, { status: "open", created: "2026-09-13T23:59:00.000Z" });
    insert(db, { status: "open", created: "2026-09-14T00:00:00.000Z" });

    const hist = getKpiHistory(db, "site_a", { kind: "idea", granularity: "week", now: NOW });
    const open = points(hist, "open");
    expect(open).toHaveLength(13);
    expect(hist.from).toBe("2026-06-22");
    expect(open[0]?.day).toBe("2026-06-22");
    expect(countAt(hist, "open", "2026-09-07")).toBe(1);
    expect(countAt(hist, "open", "2026-09-14")).toBe(1);
    expect(open[open.length - 1]).toEqual({ day: "2026-09-14", count: 1, partial: true });
  });

  it("a past kpi_to window has no partial bucket; future to clamps to today", () => {
    const db = setupDb();
    const past = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "day",
      from: "2026-09-01",
      to: "2026-09-10",
      now: NOW,
    });
    expect(points(past, "open")).toHaveLength(10);
    expect(points(past, "open").some((p) => p.partial)).toBe(false);

    const future = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "day",
      from: "2026-09-10",
      to: "2026-12-01",
      now: NOW,
    });
    expect(future.to).toBe("2026-09-16");
  });

  it("reflects a late close without any backfill once the cache is cleared", () => {
    const db = setupDb();
    insert(db, { status: "open", created: "2026-09-10T08:00:00.000Z" });
    const before = getKpiHistory(db, "site_a", { kind: "idea", granularity: "day", now: NOW });
    expect(countAt(before, "finished", "2026-09-16")).toBe(0);

    db.prepare(`UPDATE content_proposals SET status = 'finished', closed_at = ?, updated_at = ?`).run(
      Date.parse("2026-09-16T12:00:00.000Z"),
      Date.parse("2026-09-16T12:00:00.000Z"),
    );
    invalidateKpiCache("site_a");
    const after = getKpiHistory(db, "site_a", { kind: "idea", granularity: "day", now: NOW + 1 });
    expect(countAt(after, "finished", "2026-09-16")).toBe(1);
    expect(countAt(after, "open", "2026-09-10")).toBe(1);
  });

  it("caches for 15m, honors fresh, and clears on invalidate", () => {
    const db = setupDb();
    insert(db, { status: "open", created: "2026-09-16T10:00:00.000Z" });

    const first = getKpiHistory(db, "site_a", { kind: "idea", granularity: "today", now: NOW });
    expect(first.computed_at).toBe(NOW);

    const later = NOW + 60_000;
    const cached = getKpiHistory(db, "site_a", { kind: "idea", granularity: "today", now: later });
    expect(cached.computed_at).toBe(NOW);

    const forced = getKpiHistory(db, "site_a", {
      kind: "idea",
      granularity: "today",
      now: later,
      fresh: true,
    });
    expect(forced.computed_at).toBe(later);

    invalidateKpiCache("site_a");
    const afterBust = getKpiHistory(db, "site_a", { kind: "idea", granularity: "today", now: later + 1 });
    expect(afterBust.computed_at).toBe(later + 1);
  });

  it("returns every kind when unfiltered", () => {
    const db = setupDb();
    insert(db, { kind: "notes", status: "open", created: "2026-09-15T08:00:00.000Z" });
    const hist = getKpiHistory(db, "site_a", { granularity: "day", now: NOW });
    expect(hist.series).toHaveLength(9);
    expect(
      hist.series.find((s) => s.kind === "notes" && s.status === "open")?.points.find((p) => p.day === "2026-09-15")
        ?.count,
    ).toBe(1);
  });
});
