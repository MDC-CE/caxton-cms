import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseManager } from "./database";
import { clearDatabaseSearchMemoryCacheForTests, searchDatabaseItems } from "./database-search";

const vectorSearch = vi.fn();
const isAvailable = vi.fn();

vi.mock("./vector-search", () => ({
  search: (...args: unknown[]) => vectorSearch(...args),
  isAvailable: (...args: unknown[]) => isAvailable(...args),
}));

const NURSING = {
  slug: "en:course:nursing",
  kind: "course",
  destiny_code: "NURSE1",
  title: "Practical Nursing",
  description: "Patient care and clinical hours.",
  locale: "en",
  lang: "en",
};

function catalogDb(options?: { missing?: boolean }): DatabaseManager {
  return {
    get() {
      if (options?.missing) throw new Error('Database "ce-catalog" not found');
      return {
        vector_search: {
          enabled: true,
          fields: ["title", "description", "program_area_name", "kind"],
        },
        search_fields: ["title", "description"],
      };
    },
    async fetchItems() {
      return { items: [NURSING] };
    },
  } as unknown as DatabaseManager;
}

let previousFetch: typeof fetch;
let previousToken: string | undefined;
let fetchCalls: string[];

beforeEach(() => {
  clearDatabaseSearchMemoryCacheForTests();
  vectorSearch.mockReset();
  isAvailable.mockReset();
  isAvailable.mockResolvedValue(true);
  vectorSearch.mockResolvedValue([{ slug: "en:course:nursing", score: 0.81, _idx: 0 }]);
  fetchCalls = [];
  previousFetch = globalThis.fetch;
  previousToken = process.env.CAXTON_CATALOG_TOKEN;
  process.env.CAXTON_CATALOG_TOKEN = "catalog-token";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push(url);
    return new Response(
      JSON.stringify({
        results: [
          {
            kind: "course",
            destiny_code: "WORD1",
            title: "Exact nurse word",
            description: "nurse",
            score: 8,
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.CAXTON_CATALOG_TOKEN;
  else process.env.CAXTON_CATALOG_TOKEN = previousToken;
  clearDatabaseSearchMemoryCacheForTests();
});

describe("ce-catalog prefers the local embedding index", () => {
  it("returns the vector hit and does not call the playground when embeddings match", async () => {
    const result = await searchDatabaseItems("ce-catalog", "nurse", { db: catalogDb(), limit: 20 });
    expect(result.semantic).toBe(true);
    expect(result.items.map((item) => item.destiny_code)).toEqual(["NURSE1"]);
    expect(result.scores?.["en:course:nursing"]).toBe(0.81);
    expect(fetchCalls.filter((url) => url.includes("/api/v2/destiny/catalog/search"))).toEqual([]);
  });

  it("uses the playground word score when Qdrant is down", async () => {
    isAvailable.mockResolvedValue(false);
    const result = await searchDatabaseItems("ce-catalog", "nurse", { db: catalogDb(), limit: 20 });
    expect(result.semantic).toBe(true);
    expect(result.items.map((item) => item.title)).toEqual(["Exact nurse word"]);
    expect(result.scores?.["en:course:WORD1"]).toBe(8);
    expect(fetchCalls.some((url) => url.includes("/api/v2/destiny/catalog/search"))).toBe(true);
  });

  it("uses the playground word score when the local catalog does not exist yet", async () => {
    const result = await searchDatabaseItems("ce-catalog", "nurse", {
      db: catalogDb({ missing: true }),
      limit: 20,
    });
    expect(result.semantic).toBe(true);
    expect(result.items.map((item) => item.destiny_code)).toEqual(["WORD1"]);
    expect(fetchCalls.some((url) => url.includes("/api/v2/destiny/catalog/search"))).toBe(true);
  });
});
