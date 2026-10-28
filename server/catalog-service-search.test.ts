import http from "http";
import type { AddressInfo } from "net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseManager } from "./database";
import { clearDatabaseSearchMemoryCacheForTests } from "./database-search";
import { registerCatalogServiceRoutes } from "./routes/catalog-service";

vi.mock("./vector-search", () => ({
  isAvailable: vi.fn(async () => true),
  search: vi.fn(async () => [
    { slug: "en:course:20001023", score: 0.42, _idx: 0 },
    { slug: "en:content_piece:CM000061", score: 0.91, _idx: 1 },
  ]),
}));

const ITEMS = [
  {
    slug: "en:course:20001023",
    kind: "course",
    destiny_code: "20001023",
    title: "Photoshop",
    description: "Photo editing",
    lang: "en",
    locale: "en",
  },
  {
    slug: "en:content_piece:CM000061",
    kind: "content_piece",
    destiny_code: "CM000061",
    title: "ESOL",
    description: "The ESOL program prepares non-native English speakers.",
    lang: "en",
    locale: "en",
  },
];

function catalogDb(): DatabaseManager {
  return {
    get() {
      return {
        vector_search: {
          enabled: true,
          fields: ["title", "description", "program_area_name", "kind"],
        },
        search_fields: ["title", "description", "kind", "destiny_code"],
      };
    },
    async fetchItems() {
      return { items: ITEMS };
    },
  } as unknown as DatabaseManager;
}

const SERVICE_TOKEN = "service-search-test-token";

let server: http.Server | null = null;
let baseUrl = "";
let fetchCalls: string[] = [];
let previousFetch: typeof fetch;
let previousToken: string | undefined;

async function getJson(path: string, token?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

beforeEach(async () => {
  clearDatabaseSearchMemoryCacheForTests();
  fetchCalls = [];
  previousFetch = globalThis.fetch;
  previousToken = process.env.CAXTON_SERVICE_SEARCH_TOKEN;
  process.env.CAXTON_SERVICE_SEARCH_TOKEN = SERVICE_TOKEN;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:")) {
      return previousFetch(input, init);
    }
    fetchCalls.push(url);
    throw new Error(`unexpected outbound fetch ${url}`);
  }) as typeof fetch;

  const app = express();
  registerCatalogServiceRoutes(app, { database: catalogDb });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  globalThis.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.CAXTON_SERVICE_SEARCH_TOKEN;
  else process.env.CAXTON_SERVICE_SEARCH_TOKEN = previousToken;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  }
});

describe("GET /api/service/catalog/search", () => {
  it("rejects a missing or wrong token and a missing configuration", async () => {
    expect((await getJson("/api/service/catalog/search?q=esol")).status).toBe(401);
    expect((await getJson("/api/service/catalog/search?q=esol", "wrong-token")).status).toBe(401);

    delete process.env.CAXTON_SERVICE_SEARCH_TOKEN;
    const unset = await getJson("/api/service/catalog/search?q=esol", SERVICE_TOKEN);
    expect(unset.status).toBe(503);
  });

  it("requires q of at least 3 characters", async () => {
    expect((await getJson("/api/service/catalog/search", SERVICE_TOKEN)).status).toBe(400);
    expect((await getJson("/api/service/catalog/search?q=es", SERVICE_TOKEN)).status).toBe(400);
  });

  it("returns courses and content pieces from the local index and does not call the playground", async () => {
    const { status, body } = await getJson(
      "/api/service/catalog/search?q=esol&offset=0&limit=20&lang=en",
      SERVICE_TOKEN,
    );
    expect(status).toBe(200);
    expect(body.semantic).toBe(true);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items.map((item) => item.kind).sort()).toEqual(["content_piece", "course"]);
    const esol = items.find((item) => item.destiny_code === "CM000061");
    expect(esol).toMatchObject({
      kind: "content_piece",
      destiny_code: "CM000061",
      title: "ESOL",
      description: "The ESOL program prepares non-native English speakers.",
    });
    expect(fetchCalls.filter((url) => url.includes("/api/v2/destiny/catalog"))).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });

  it("can return only content pieces", async () => {
    const { status, body } = await getJson(
      "/api/service/catalog/search?q=esol&kind=content_piece",
      SERVICE_TOKEN,
    );
    expect(status).toBe(200);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("content_piece");
    expect(fetchCalls).toEqual([]);
  });
});
