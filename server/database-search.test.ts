import { describe, it, expect, beforeEach, vi } from "vitest";
import { CATALOG_DESCRIPTIONS_DB_NAME, DESCRIPTION_SEARCH_LIMIT } from "@shared/playground-catalog";
import { search as vectorSearch, isAvailable } from "./vector-search";
import {
  normalizeSearchQuery,
  intersectSearchWithFiltersAndBackfill,
  clearDatabaseSearchMemoryCacheForTests,
  getDatabaseSearchCacheStats,
  peekDatabaseSearchCacheL1,
  SEARCH_CACHE_CEILING,
  SEARCH_CACHE_TTL_MS,
  databaseSearchCacheKey,
  parseDescriptionSearchTarget,
  searchDatabaseItems,
} from "./database-search";

vi.mock("./vector-search", () => ({
  search: vi.fn(),
  isAvailable: vi.fn(async () => true),
  searchChunks: vi.fn(async () => []),
}));

describe("normalizeSearchQuery", () => {
  it("trims, lower-cases, and collapses whitespace", () => {
    expect(normalizeSearchQuery("  Job   Guarantee  ")).toBe("job guarantee");
  });
});

describe("intersectSearchWithFiltersAndBackfill", () => {
  it("keeps search rank then backfills from filter-only", () => {
    const searchHits = [
      { slug: "a", question: "A?" },
      { slug: "b", question: "B?" },
    ];
    const filterOnly = [
      { slug: "b", question: "B?" },
      { slug: "c", question: "C?" },
      { slug: "d", question: "D?" },
    ];
    const result = intersectSearchWithFiltersAndBackfill(searchHits, filterOnly, 3);
    expect(result.map((i) => i.slug)).toEqual(["a", "b", "c"]);
  });

  it("stops at remaining slots", () => {
    const result = intersectSearchWithFiltersAndBackfill(
      [{ slug: "a" }, { slug: "b" }],
      [{ slug: "c" }],
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("a");
  });
});

describe("search cache L1 helpers", () => {
  beforeEach(() => {
    clearDatabaseSearchMemoryCacheForTests();
  });

  it("starts empty", () => {
    expect(getDatabaseSearchCacheStats("faqs").memoryEntries).toBe(0);
    expect(peekDatabaseSearchCacheL1("faqs", "job guarantee", "en")).toBeNull();
  });
});

describe("SEARCH_CACHE_TTL_MS", () => {
  it("is seven days", () => {
    expect(SEARCH_CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("description search target", () => {
  const course = {
    slug: "en:course:1170129",
    locale: "en",
    kind: "course",
    destiny_code: "1170129",
    description: "Patient care for nursing.",
  };
  const piece = {
    slug: "en:content_piece:CM000080",
    locale: "en",
    kind: "content_piece",
    destiny_code: "CM000080",
    description: "A blog post about film makeup.",
  };

  function dbWith(name: string, items: Record<string, unknown>[], fields: string[]) {
    return {
      get: (asked: string) => {
        if (asked !== name) throw new Error(`${asked} not found`);
        return { vector_search: { enabled: true, fields }, search_fields: fields };
      },
      fetchItems: async () => ({ items }),
    };
  }

  beforeEach(() => {
    clearDatabaseSearchMemoryCacheForTests();
    vi.mocked(vectorSearch).mockReset();
    vi.mocked(isAvailable).mockResolvedValue(true);
  });

  it("rejects an unknown target", () => {
    expect(() => parseDescriptionSearchTarget("landing")).toThrow(/target must be/);
    expect(parseDescriptionSearchTarget(undefined)).toBeUndefined();
    expect(parseDescriptionSearchTarget("descriptions")).toBe("descriptions");
  });

  it("puts the target in the description cache key and leaves other databases alone", () => {
    expect(databaseSearchCacheKey(CATALOG_DESCRIPTIONS_DB_NAME, "to code", "en", "course"))
      .not.toBe(databaseSearchCacheKey(CATALOG_DESCRIPTIONS_DB_NAME, "to code", "en", "content_piece"));
    expect(databaseSearchCacheKey(CATALOG_DESCRIPTIONS_DB_NAME, "to code", "en"))
      .toBe(databaseSearchCacheKey(CATALOG_DESCRIPTIONS_DB_NAME, "to code", "en", "descriptions"));
    expect(databaseSearchCacheKey("faqs", "to code", "en", "course"))
      .toBe(databaseSearchCacheKey("faqs", "to code", "en"));
  });

  it("filters description hits by target and resolves the destiny code, not the old index", async () => {
    vi.mocked(vectorSearch).mockResolvedValue([
      { slug: course.slug, score: 0.8, _idx: 0, destiny_code: "1170129", kind: "course" },
    ]);
    const result = await searchDatabaseItems(CATALOG_DESCRIPTIONS_DB_NAME, "to code", {
      target: "course",
      locale: "en",
      db: dbWith(CATALOG_DESCRIPTIONS_DB_NAME, [piece, course], ["description"]) as never,
    });
    expect(vi.mocked(vectorSearch)).toHaveBeenCalledWith(
      CATALOG_DESCRIPTIONS_DB_NAME,
      "to code",
      DESCRIPTION_SEARCH_LIMIT,
      "en",
      "course",
    );
    expect(result.items.map((item) => item.destiny_code)).toEqual(["1170129"]);
    expect(result.items[0]?.kind).toBe("course");
    expect(peekDatabaseSearchCacheL1(CATALOG_DESCRIPTIONS_DB_NAME, "to code", "en", "course")).not.toBeNull();
    expect(peekDatabaseSearchCacheL1(CATALOG_DESCRIPTIONS_DB_NAME, "to code", "en", "content_piece")).toBeNull();
  });

  it("keeps the wide neighbor search for other databases", async () => {
    vi.mocked(vectorSearch).mockResolvedValue([
      { slug: "other", score: 0.5, _idx: 0 },
    ]);
    const first = { slug: "first", question: "first row" };
    const result = await searchDatabaseItems("faqs", "job", {
      db: dbWith("faqs", [first], ["question"]) as never,
    });
    expect(vi.mocked(vectorSearch)).toHaveBeenCalledWith(
      "faqs",
      "job",
      SEARCH_CACHE_CEILING,
      undefined,
      undefined,
    );
    expect(result.items[0]?.slug).toBe("first");
  });
});
