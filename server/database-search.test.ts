import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CATALOG_DESCRIPTIONS_DB_NAME, DESCRIPTION_SEARCH_LIMIT } from "@shared/playground-catalog";
import {
  SEARCH_CACHE_CEILING,
  SEARCH_CACHE_TTL_MS,
  clearDatabaseSearchMemoryCacheForTests,
  databaseSearchCacheKey,
  getDatabaseSearchCacheStats,
  intersectSearchWithFiltersAndBackfill,
  normalizeSearchQuery,
  parseDescriptionSearchTarget,
  peekDatabaseSearchCacheL1,
  resolveRefs,
  searchDatabaseItems,
} from "./database-search";
import { setJobState } from "./db-job-state";
import {
  __setVectorSearchTestDoubles,
  syncIndex,
  vectorItemKey,
  search as vectorSearch,
  isAvailable,
  collectionExists,
} from "./vector-search";
import { makeFakeEmbedder, makeFakeQdrant } from "./test-helpers/fake-qdrant";
import type { DatabaseManager } from "./database";

vi.mock("./vector-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vector-search")>();
  return {
    ...actual,
    // Default: real search (collection-choice tests use fake Qdrant). Suites that need a
    // canned response call vi.mocked(search).mockResolvedValue(...).
    search: vi.fn((...args: Parameters<typeof actual.search>) => actual.search(...args)),
    isAvailable: vi.fn(async () => true),
    searchChunks: vi.fn(async () => []),
    collectionExists: vi.fn((...args: Parameters<typeof actual.collectionExists>) =>
      actual.collectionExists(...args),
    ),
  };
});

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

describe("resolveRefs", () => {
  const fields = ["excerpt"];
  const items = [
    { locale: "en", excerpt: "first" },
    { locale: "en", excerpt: "second" },
  ];
  const keyMap = () => new Map(items.map((i) => [vectorItemKey(i, fields), i]));

  it("maps keyed refs through the key map", () => {
    const key = vectorItemKey(items[1], fields);
    const out = resolveRefs([{ slug: "", key, score: 0.9 }], items, keyMap);
    expect(out.items).toEqual([items[1]]);
  });

  it("maps legacy refs by position, including slugless rows stored with their position as slug", () => {
    const out = resolveRefs([{ slug: "1", _idx: 1, score: 0.5 }], items, keyMap);
    expect(out.items).toEqual([items[1]]);
  });

  it("drops duplicate hits that resolve to the same row", () => {
    const key = vectorItemKey(items[0], fields);
    const out = resolveRefs(
      [
        { slug: "", key, score: 0.9 },
        { slug: "0", _idx: 0, score: 0.8 },
      ],
      items,
      keyMap,
    );
    expect(out.items).toHaveLength(1);
    expect(out.refs).toHaveLength(1);
  });
});

describe("searchDatabaseItems collection choice", () => {
  const fields = ["excerpt"];
  const items = [
    { locale: "en", excerpt: "career support after graduation" },
    { locale: "en", excerpt: "mentors are great" },
  ];
  let contentRoot: string;
  let qdrant: ReturnType<typeof makeFakeQdrant>;
  let queueVectorIndex: ReturnType<typeof vi.fn>;
  let db: DatabaseManager;

  beforeEach(() => {
    clearDatabaseSearchMemoryCacheForTests();
    contentRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "db-search-")), "site_test");
    fs.mkdirSync(contentRoot, { recursive: true });
    qdrant = makeFakeQdrant();
    __setVectorSearchTestDoubles({ client: qdrant, embedder: makeFakeEmbedder().embedder });
    queueVectorIndex = vi.fn(async () => ({ queued: true }));
    db = {
      get: () => ({ name: "T", source: { type: "local" }, vector_search: { enabled: true, fields } }),
      fetchItems: async () => ({ items, raw_count: items.length, fetched_at: "t1", from_cache: true }),
      getContentRoot: () => contentRoot,
      queueVectorIndex,
    } as unknown as DatabaseManager;
  });

  afterEach(() => {
    __setVectorSearchTestDoubles(null);
  });

  it("uses the ready site-scoped collection and maps hits by key", async () => {
    await syncIndex("site_test__testimonials", items, fields);
    setJobState("testimonials", "index", { status: "done", ready: true, collection: "site_test__testimonials" }, contentRoot);
    const res = await searchDatabaseItems("testimonials", "career", { db, contentFolder: "site_test" });
    expect(res.semantic).toBe(true);
    expect(res.items).toHaveLength(2);
    expect(queueVectorIndex).not.toHaveBeenCalled();
    expect(qdrant.search).toHaveBeenCalledWith("site_test__testimonials", expect.anything());
  });

  it("falls back to the legacy collection while the site-scoped one is not ready", async () => {
    qdrant.cols.set(
      "testimonials",
      new Map([["1", { id: 1, payload: { slug: "1", _idx: 1, locale: "en" } }]]),
    );
    const res = await searchDatabaseItems("testimonials", "mentors", { db, contentFolder: "site_test" });
    expect(res.semantic).toBe(true);
    expect(res.items).toEqual([items[1]]);
    expect(queueVectorIndex).toHaveBeenCalledWith("testimonials", "missing_collection");
  });

  it("uses keyword matching and queues a sync when no collection is usable", async () => {
    const res = await searchDatabaseItems("testimonials", "mentors", { db, contentFolder: "site_test" });
    expect(res.semantic).toBe(false);
    expect(res.fallback_reason).toBe("semantic_index_empty");
    expect(res.items).toEqual([items[1]]);
    expect(queueVectorIndex).toHaveBeenCalled();
  });

  it("marks the index not ready and re-queues when a ready collection went missing", async () => {
    setJobState("testimonials", "index", { status: "done", ready: true, collection: "site_test__testimonials" }, contentRoot);
    const res = await searchDatabaseItems("testimonials", "mentors", { db, contentFolder: "site_test" });
    expect(res.semantic).toBe(false);
    expect(queueVectorIndex).toHaveBeenCalledWith("testimonials", "missing_collection");
    const { getJobState } = await import("./db-job-state");
    expect(getJobState("testimonials", contentRoot).index.ready).toBe(false);
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
    // No job-state “ready” site collection in these stubs — use the legacy name.
    vi.mocked(collectionExists).mockResolvedValue(true);
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
    vi.mocked(vectorSearch).mockResolvedValue({
      missingCollection: false,
      hits: [{ slug: course.slug, score: 0.8, _idx: 0, destiny_code: "1170129", kind: "course" }],
    });
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
    vi.mocked(vectorSearch).mockResolvedValue({
      missingCollection: false,
      hits: [{ slug: "first", score: 0.5, _idx: 0 }],
    });
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

describe("frequently_asked_questions search after generic reindex", () => {
  const FAQ = "frequently_asked_questions";
  const pending = {
    id: "sample-faq-pending",
    question: "Pending question?",
    answer: "[Pending from CE. nothing yet]",
    locale: "en",
    status: "pending_from_ce",
    active: false,
  };
  const official = {
    id: "sample-faq-register",
    question: "How do I register for a course?",
    answer: "Register online at ce.mdc.edu.",
    locale: "en",
    status: "official_ce",
    active: true,
  };

  function dbWith(items: Record<string, unknown>[]) {
    return {
      get: (asked: string) => {
        if (asked !== FAQ) throw new Error(`${asked} not found`);
        return {
          vector_search: { enabled: true, fields: ["question", "answer"] },
          search_fields: ["question", "answer"],
        };
      },
      fetchItems: async () => ({ items }),
    };
  }

  beforeEach(() => {
    clearDatabaseSearchMemoryCacheForTests();
    vi.mocked(vectorSearch).mockReset();
    vi.mocked(isAvailable).mockResolvedValue(true);
    vi.mocked(collectionExists).mockResolvedValue(true);
  });

  it("resolves by id so a stale _idx into pending does not win", async () => {
    // Generic reindex used to index [pending, official] with _idx 0/1.
    // Search filters to [official] only — _idx 0 would wrongly pick pending if used.
    vi.mocked(vectorSearch).mockResolvedValue({
      missingCollection: false,
      hits: [{ slug: "sample-faq-register", score: 0.91, _idx: 0 }],
    });
    const result = await searchDatabaseItems(FAQ, "how do I register", {
      locale: "en",
      db: dbWith([pending, official]) as never,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("sample-faq-register");
    expect(result.items[0]?.answer).toBe("Register online at ce.mdc.edu.");
  });

  it("hides pending rows from keyword fallback", async () => {
    vi.mocked(vectorSearch).mockResolvedValue({ missingCollection: false, hits: [] });
    const result = await searchDatabaseItems(FAQ, "pending question", {
      locale: "en",
      db: dbWith([pending, official]) as never,
    });
    expect(result.items.every((i) => i.id !== "sample-faq-pending")).toBe(true);
  });
});

