import { describe, it, expect } from "vitest";
import {
  collectQueryFieldFilters,
  matchesManageStatusFilter,
  matchesPublishedAtRange,
  parseManageDateSortField,
  parseManagePublishDateRange,
  parseManageStatusFilter,
  sortByUpdatedAtField,
  utcDayEndMs,
  utcDayStartMs,
  versioningHasUnallocatedVariant,
} from "./list-pagination";

describe("collectQueryFieldFilters", () => {
  it("ignores __site alone (dev site override)", () => {
    expect(
      collectQueryFieldFilters({
        page: "1",
        pageSize: "50",
        __site: "4geeks.com",
      }),
    ).toEqual([]);
  });

  it("ignores _-prefixed infra keys", () => {
    expect(
      collectQueryFieldFilters({
        _anything: "x",
        __future: "y",
        page: "1",
      }),
    ).toEqual([]);
  });

  it("still collects real content filters", () => {
    expect(
      collectQueryFieldFilters({
        page: "1",
        pageSize: "50",
        __site: "4geeks.com",
        tags: "python",
        language: "es",
      }),
    ).toEqual([
      { field: "tags", value: "python" },
      { field: "language", value: "es" },
    ]);
  });

  it("ignores reserved list keys including shared filters", () => {
    expect(
      collectQueryFieldFilters({
        locale: "en",
        sort: "updated_at",
        limit: "10",
        include_content: "1",
        page: "2",
        pageSize: "50",
        q: "search",
        sortDir: "desc",
        errorsOnly: "1",
        pub: "7d",
        pubFrom: "2024-01-01",
        pubTo: "2024-01-31",
        status: "published",
        market: "us",
        __site: "4geeks.com",
      }),
    ).toEqual([]);
  });

  it("supports repeated filter values", () => {
    expect(
      collectQueryFieldFilters({
        tags: ["python", "ai"],
        __site: "4geeks.com",
      }),
    ).toEqual([
      { field: "tags", value: "python" },
      { field: "tags", value: "ai" },
    ]);
  });
});

describe("parseManageDateSortField", () => {
  it("defaults to updated_at", () => {
    expect(parseManageDateSortField(undefined)).toBe("updated_at");
    expect(parseManageDateSortField("updated_at")).toBe("updated_at");
    expect(parseManageDateSortField("nope")).toBe("updated_at");
  });

  it("accepts published_at", () => {
    expect(parseManageDateSortField("published_at")).toBe("published_at");
  });
});

describe("sortByUpdatedAtField", () => {
  it("sorts by the provided date getter", () => {
    const rows = [
      { slug: "a", published_at: "2024-01-01T00:00:00.000Z" },
      { slug: "b", published_at: "2025-01-01T00:00:00.000Z" },
      { slug: "c", published_at: null },
    ];
    const desc = sortByUpdatedAtField(rows, "desc", (r) => r.published_at);
    expect(desc.map((r) => r.slug)).toEqual(["b", "a", "c"]);
    const asc = sortByUpdatedAtField(rows, "asc", (r) => r.published_at);
    expect(asc.map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("parseManagePublishDateRange", () => {
  const noonUtc = Date.parse("2024-06-15T12:00:00.000Z");

  it("returns null for missing or invalid pub", () => {
    expect(parseManagePublishDateRange({})).toBeNull();
    expect(parseManagePublishDateRange({ pub: "yesterday" })).toBeNull();
    expect(parseManagePublishDateRange({ pub: "custom" })).toBeNull();
  });

  it("parses today as UTC midnight through now", () => {
    const range = parseManagePublishDateRange({ pub: "today" }, noonUtc);
    expect(range).toEqual({
      startMs: utcDayStartMs("2024-06-15"),
      endMs: noonUtc,
    });
  });

  it("parses 7d and 28d rolling windows", () => {
    const d7 = parseManagePublishDateRange({ pub: "7d" }, noonUtc)!;
    expect(d7.startMs).toBe(utcDayStartMs("2024-06-09"));
    expect(d7.endMs).toBe(noonUtc);

    const d28 = parseManagePublishDateRange({ pub: "28d" }, noonUtc)!;
    expect(d28.startMs).toBe(utcDayStartMs("2024-05-19"));
    expect(d28.endMs).toBe(noonUtc);
  });

  it("parses custom inclusive UTC days and swaps inverted bounds", () => {
    const range = parseManagePublishDateRange({
      pub: "custom",
      pubFrom: "2024-01-10",
      pubTo: "2024-01-01",
    })!;
    expect(range.startMs).toBe(utcDayStartMs("2024-01-01"));
    expect(range.endMs).toBe(utcDayEndMs("2024-01-10"));
  });
});

describe("matchesPublishedAtRange", () => {
  const range = {
    startMs: utcDayStartMs("2024-01-01"),
    endMs: utcDayEndMs("2024-01-31"),
  };

  it("passes when no range", () => {
    expect(matchesPublishedAtRange(null, null)).toBe(true);
  });

  it("excludes missing or invalid dates when range is set", () => {
    expect(matchesPublishedAtRange(null, range)).toBe(false);
    expect(matchesPublishedAtRange("", range)).toBe(false);
    expect(matchesPublishedAtRange("not-a-date", range)).toBe(false);
  });

  it("includes dates inside the window", () => {
    expect(matchesPublishedAtRange("2024-01-15T12:00:00.000Z", range)).toBe(true);
    expect(matchesPublishedAtRange("2023-12-31T23:59:59.000Z", range)).toBe(false);
  });
});

describe("versioningHasUnallocatedVariant", () => {
  it("detects allocation 0 including draft", () => {
    expect(versioningHasUnallocatedVariant(null)).toBe(false);
    expect(
      versioningHasUnallocatedVariant({
        en: { variants: [{ slug: "draft", allocation: 0 }] },
      }),
    ).toBe(true);
    expect(
      versioningHasUnallocatedVariant({
        en: { variants: [{ slug: "ab", allocation: 50 }] },
      }),
    ).toBe(false);
  });
});

describe("matchesManageStatusFilter", () => {
  it("parses status filter", () => {
    expect(parseManageStatusFilter("pending_drafts")).toBe("pending_drafts");
    expect(parseManageStatusFilter("nope")).toBeNull();
  });

  it("matches only_draft / pending_drafts / published", () => {
    expect(matchesManageStatusFilter("draft", "only_draft", false)).toBe(true);
    expect(matchesManageStatusFilter("published", "only_draft", true)).toBe(false);
    expect(matchesManageStatusFilter("published", "pending_drafts", true)).toBe(true);
    expect(matchesManageStatusFilter("published", "pending_drafts", false)).toBe(false);
    expect(matchesManageStatusFilter("draft", "pending_drafts", true)).toBe(false);
    expect(matchesManageStatusFilter("published", "published", false)).toBe(true);
    expect(matchesManageStatusFilter("published", "published", true)).toBe(false);
    expect(matchesManageStatusFilter("draft", "published", false)).toBe(false);
  });
});
