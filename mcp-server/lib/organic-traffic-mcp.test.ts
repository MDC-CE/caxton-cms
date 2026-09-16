import { describe, expect, it } from "vitest";
import {
  clampOpportunitiesLimit,
  clampOpportunitiesOffset,
  clampLeaderboardLimit,
  clampLeaderboardOffset,
  dedupeStrings,
  filterByPathPrefix,
  flattenOpportunityCards,
  leaderboardRowFromStats,
  normalizePathBatch,
  paginateFlat,
  parseLeaderboardSortBy,
  pathMatchesLeaderboardPrefix,
  resolveAssembleWindow,
  resolveLeaderboardPathPrefix,
  resolveSeriesInclusion,
  seriesIgnoredForQueriesWarning,
  seriesIgnoredForModeWarning,
  siteVsPathsSourceWarning,
  sortLeaderboardEntries,
  opportunitiesDatesRejectMessage,
  validateBatchSize,
  MAX_ORGANIC_PATHS,
  MAX_ORGANIC_HUBS,
  SERIES_BATCH_MAX,
  OPPORTUNITIES_DEFAULT_LIMIT,
  OPPORTUNITIES_MAX_LIMIT,
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  ORGANIC_MAX_SPAN_DAYS,
} from "./organic-traffic-mcp";
import type { PathTrafficStats } from "../../server/gsc-organic-path-traffic";

describe("resolveAssembleWindow", () => {
  it("rejects span over max with OpenRush hint", () => {
    const r = resolveAssembleWindow({
      start: "2026-01-01",
      end: "2026-06-01",
    });
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toContain(String(ORGANIC_MAX_SPAN_DAYS));
    expect(r.error.toLowerCase()).toContain("openrush");
  });

  it("hard-fails empty after clamp", () => {
    const r = resolveAssembleWindow({
      start: "2099-01-01",
      end: "2099-01-07",
    });
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error.toLowerCase()).toMatch(/no complete|retry/);
  });

  it("defaults when both omitted", () => {
    const r = resolveAssembleWindow({});
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.days_expected).toBe(28);
    expect(r.start <= r.end).toBe(true);
  });
});

describe("siteVsPathsSourceWarning", () => {
  it("names the source mismatch", () => {
    expect(siteVsPathsSourceWarning().code).toBe("organic_site_vs_paths_source");
    expect(siteVsPathsSourceWarning().message).toMatch(/leaderboard/);
  });
});

describe("opportunitiesDatesRejectMessage", () => {
  it("rejects when dates are set", () => {
    expect(opportunitiesDatesRejectMessage("2026-08-27", "2026-09-02")).toMatch(/decay_window/);
    expect(opportunitiesDatesRejectMessage("2026-08-27", undefined)).toMatch(/not supported/);
  });

  it("allows omitting dates", () => {
    expect(opportunitiesDatesRejectMessage(undefined, undefined)).toBeNull();
    expect(opportunitiesDatesRejectMessage("", "  ")).toBeNull();
  });
});

describe("dedupeStrings", () => {
  it("preserves order and drops duplicates", () => {
    expect(dedupeStrings(["/a", " /a ", "/b", "/a"])).toEqual({
      unique: ["/a", "/b"],
      dropped: 2,
    });
  });

  it("treats empty or whitespace as absent", () => {
    expect(dedupeStrings(["", "  ", "/x"])).toEqual({ unique: ["/x"], dropped: 0 });
  });
});

describe("validateBatchSize", () => {
  it("fails empty", () => {
    expect(validateBatchSize("paths", 0).ok).toBe(false);
    expect(validateBatchSize("clusters", 0).ok).toBe(false);
  });

  it("fails over cap", () => {
    expect(validateBatchSize("paths", MAX_ORGANIC_PATHS + 1).ok).toBe(false);
    expect(validateBatchSize("clusters", MAX_ORGANIC_HUBS + 1).ok).toBe(false);
  });

  it("accepts within cap", () => {
    expect(validateBatchSize("paths", 1).ok).toBe(true);
    expect(validateBatchSize("paths", MAX_ORGANIC_PATHS).ok).toBe(true);
    expect(validateBatchSize("clusters", MAX_ORGANIC_HUBS).ok).toBe(true);
  });
});

describe("normalizePathBatch", () => {
  it("normalizes absolute URLs to pathnames", () => {
    const r = normalizePathBatch([
      "https://example.com/us/foo",
      "/us/foo",
      "not a path",
    ]);
    expect(r.keys).toEqual(["/us/foo"]);
    expect(r.invalid_inputs).toContain("not a path");
  });
});

describe("resolveSeriesInclusion", () => {
  it("site only when include_series true", () => {
    expect(resolveSeriesInclusion({ mode: "site", include_series: true, batchSize: 100 })).toEqual({
      include: true,
    });
    expect(resolveSeriesInclusion({ mode: "site", batchSize: 1 }).include).toBe(false);
  });

  it("skips series when paths batch too large", () => {
    const r = resolveSeriesInclusion({
      mode: "paths",
      include_series: true,
      batchSize: SERIES_BATCH_MAX + 1,
    });
    expect(r.include).toBe(false);
    expect(r.warning?.code).toBe("series_skipped_batch_too_large");
  });

  it("allows series for small paths batch", () => {
    expect(
      resolveSeriesInclusion({ mode: "paths", include_series: true, batchSize: SERIES_BATCH_MAX })
        .include,
    ).toBe(true);
  });

  it("never includes series for leaderboard", () => {
    expect(
      resolveSeriesInclusion({ mode: "leaderboard", include_series: true, batchSize: 1 }).include,
    ).toBe(false);
  });
});

describe("flattenOpportunityCards + paginateFlat", () => {
  it("flattens kinds in stable order and paginates", () => {
    const flat = flattenOpportunityCards({
      page2: [{ query: "q1", url: "/a", clicks: 1, impressions: 10, position: 12, ctr: 0.1, cms_known: true, entry_key: null, write_count: 0 }],
      low_ctr: [{ query: "q2", url: "/b", clicks: 1, impressions: 200, position: 3, ctr: 0.01, expected_ctr: 0.1, gap: 0.09, cms_known: false, entry_key: null, write_count: 0 }],
      link_gaps: [],
      decay: [{ url: "/c", clicks: 1, impressions: 2, prior_clicks: 5, prior_impressions: 10, click_drop: 4 }],
      cannibalization: [{ query: "dup", impressions: 50, urls: [{ url: "/x", clicks: 1, impressions: 20, position: 2 }] }],
      missing_serp: [],
    });
    expect(flat.map((i) => i.kind)).toEqual(["page2", "low_ctr", "decay", "cannibalization"]);
    const page = paginateFlat(flat, 1, 2);
    expect(page.total).toBe(4);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.kind).toBe("low_ctr");
    expect(page.next_offset).toBe(3);
  });
});

describe("clamp opportunities pagination", () => {
  it("defaults and clamps", () => {
    expect(clampOpportunitiesLimit(undefined)).toBe(OPPORTUNITIES_DEFAULT_LIMIT);
    expect(clampOpportunitiesLimit(999)).toBe(OPPORTUNITIES_MAX_LIMIT);
    expect(clampOpportunitiesOffset(-5)).toBe(0);
    expect(clampOpportunitiesOffset(10)).toBe(10);
  });
});

describe("seriesIgnoredForQueriesWarning", () => {
  it("codes series_ignored_for_mode", () => {
    expect(seriesIgnoredForQueriesWarning().code).toBe("series_ignored_for_mode");
    expect(seriesIgnoredForModeWarning("leaderboard").message).toMatch(/leaderboard/);
  });
});

describe("leaderboard helpers", () => {
  const stats = (clicks: number, impressions: number, position = 5): PathTrafficStats => ({
    clicks,
    impressions,
    position,
  });

  it("parseLeaderboardSortBy defaults to clicks", () => {
    expect(parseLeaderboardSortBy(undefined)).toBe("clicks");
    expect(parseLeaderboardSortBy("clicks")).toBe("clicks");
    expect(parseLeaderboardSortBy("impressions")).toBe("impressions");
    expect(parseLeaderboardSortBy("other")).toBe("clicks");
  });

  it("resolveLeaderboardPathPrefix normalizes slash, URL, trailing slash", () => {
    expect(resolveLeaderboardPathPrefix(undefined)).toEqual({ ok: true, prefix: null });
    expect(resolveLeaderboardPathPrefix("  ")).toEqual({ ok: true, prefix: null });
    expect(resolveLeaderboardPathPrefix("/en/blog/")).toEqual({ ok: true, prefix: "/en/blog" });
    expect(resolveLeaderboardPathPrefix("/en/blog")).toEqual({ ok: true, prefix: "/en/blog" });
    expect(resolveLeaderboardPathPrefix("https://example.com/en/blog/")).toEqual({
      ok: true,
      prefix: "/en/blog",
    });
  });

  it("resolveLeaderboardPathPrefix hard-fails unnormalizable input", () => {
    const r = resolveLeaderboardPathPrefix("not a path!!!");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/path_prefix/);
  });

  it("pathMatchesLeaderboardPrefix is exact-or-descendant (not /en/blogging)", () => {
    expect(pathMatchesLeaderboardPrefix("/en/blog", "/en/blog")).toBe(true);
    expect(pathMatchesLeaderboardPrefix("/en/blog/post", "/en/blog")).toBe(true);
    expect(pathMatchesLeaderboardPrefix("/en/blogging", "/en/blog")).toBe(false);
    expect(pathMatchesLeaderboardPrefix("/en/other", "/en/blog")).toBe(false);
  });

  it("filterByPathPrefix + sort by clicks with path tie-break", () => {
    const byPath: Record<string, PathTrafficStats> = {
      "/en/blog/z": stats(10, 100),
      "/en/blog/a": stats(10, 50),
      "/en/blogging": stats(99, 9),
      "/es/blog/x": stats(5, 200),
    };
    const filtered = filterByPathPrefix(byPath, "/en/blog");
    expect(filtered.map((e) => e.path).sort()).toEqual(["/en/blog/a", "/en/blog/z"]);
    const byClicks = sortLeaderboardEntries(filtered, "clicks");
    expect(byClicks.map((e) => e.path)).toEqual(["/en/blog/a", "/en/blog/z"]);
  });

  it("sorts by impressions when requested", () => {
    const entries = [
      { path: "/b", stats: stats(1, 10) },
      { path: "/a", stats: stats(5, 100) },
      { path: "/c", stats: stats(9, 50) },
    ];
    expect(sortLeaderboardEntries(entries, "impressions").map((e) => e.path)).toEqual([
      "/a",
      "/c",
      "/b",
    ]);
  });

  it("leaderboardRowFromStats includes ctr and position", () => {
    const row = leaderboardRowFromStats("/x", stats(2, 10, 3.5), {
      content_type: "blog",
      slug: "x",
      locale: "en",
    });
    expect(row).toEqual({
      path: "/x",
      clicks: 2,
      impressions: 10,
      ctr: 0.2,
      position: 3.5,
      content_type: "blog",
      slug: "x",
      locale: "en",
    });
  });

  it("clamps leaderboard pagination and soft-empty filter paginates", () => {
    expect(clampLeaderboardLimit(undefined)).toBe(LEADERBOARD_DEFAULT_LIMIT);
    expect(clampLeaderboardLimit(999)).toBe(LEADERBOARD_MAX_LIMIT);
    expect(clampLeaderboardOffset(-1)).toBe(0);
    const byPath: Record<string, PathTrafficStats> = {
      "/en/home": stats(1, 1),
    };
    const filtered = filterByPathPrefix(byPath, "/en/blog");
    expect(filtered).toEqual([]);
    const page = paginateFlat(filtered, 0, 25);
    expect(page.total).toBe(0);
    expect(page.items).toEqual([]);
    expect(page.next_offset).toBeNull();
  });
});
