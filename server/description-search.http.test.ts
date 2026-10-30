import type { AddressInfo } from "net";
import express from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_DESCRIPTIONS_DB_NAME } from "@shared/playground-catalog";
import { clearDatabaseSearchMemoryCacheForTests } from "./database-search";
import { isAvailable, search as vectorSearch } from "./vector-search";
import { registerDatabasesRoutes } from "./routes/databases";
import { registerListingsRoutes } from "./routes/listings";

const gate = vi.hoisted(() => ({ allowStaff: true }));

vi.mock("./vector-search", () => ({
  search: vi.fn(),
  isAvailable: vi.fn(async () => true),
  searchChunks: vi.fn(async () => []),
  indexItems: vi.fn(),
}));

vi.mock("./routes/_helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./routes/_helpers")>();
  return {
    ...actual,
    requireDatabasesBrowseAccess: async (
      _req: unknown,
      res: { status: (code: number) => { json: (body: unknown) => void } },
    ) => {
      if (!gate.allowStaff) {
        res.status(401).json({ error: "Authentication required" });
        return { authorized: false, token: null, username: null, author: null };
      }
      return { authorized: true, token: "t", username: "staff", author: "staff" };
    },
  };
});

const course = {
  slug: "en:course:1170129",
  id: "en:course:1170129",
  locale: "en",
  kind: "course",
  destiny_code: "1170129",
  description: "Patient care and the Florida nursing exam.",
};
const piece = {
  slug: "en:content_piece:CM000080",
  id: "en:content_piece:CM000080",
  locale: "en",
  kind: "content_piece",
  destiny_code: "CM000080",
  description: "A blog post about film makeup.",
};

function catalogDb() {
  const items = [piece, course];
  return {
    get: (name: string) => {
      if (name !== CATALOG_DESCRIPTIONS_DB_NAME) throw new Error(`${name} not found`);
      return {
        vector_search: { enabled: true, fields: ["description"] },
        search_fields: ["description", "destiny_code"],
      };
    },
    fetchItems: async () => ({ items }),
  };
}

const app = express();
app.use((_req, res, next) => {
  res.locals.site = { database: catalogDb(), contentRoot: "site_learning-mdc-edu" };
  next();
});
registerListingsRoutes(app);
registerDatabasesRoutes(app);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => {
  server.close();
});

describe("description search over HTTP", () => {
  beforeEach(() => {
    clearDatabaseSearchMemoryCacheForTests();
    gate.allowStaff = true;
    vi.mocked(isAvailable).mockResolvedValue(true);
    vi.mocked(vectorSearch).mockImplementation(async (_db, _q, _limit, _locale, kind) => {
      const rows = [
        { slug: piece.slug, score: 0.99, destiny_code: "CM000080", kind: "content_piece" as const },
        { slug: course.slug, score: 0.7, destiny_code: "1170129", kind: "course" as const },
      ];
      return kind ? rows.filter((row) => row.kind === kind) : rows;
    });
  });

  it("lets a visitor ask for courses and not receive the blog post", async () => {
    const response = await fetch(
      `${base}/api/listings/search?database=${CATALOG_DESCRIPTIONS_DB_NAME}&q=to+code&target=course&locale=en`,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { semantic: boolean; items: Array<{ destiny_code: string; kind: string }> };
    expect(body.semantic).toBe(true);
    expect(body.items.map((item) => item.destiny_code)).toEqual(["1170129"]);
    expect(body.items.every((item) => item.kind === "course")).toBe(true);
  });

  it("lets a visitor ask for a content piece", async () => {
    const response = await fetch(
      `${base}/api/listings/search?database=${CATALOG_DESCRIPTIONS_DB_NAME}&q=film+makeup&target=content_piece&locale=en`,
    );
    const body = await response.json() as { items: Array<{ destiny_code: string; description: string }> };
    expect(response.status).toBe(200);
    expect(body.items.map((item) => item.destiny_code)).toEqual(["CM000080"]);
    expect(body.items[0]?.description).toContain("film makeup");
  });

  it("rejects a visitor target the catalog does not know", async () => {
    const response = await fetch(
      `${base}/api/listings/search?database=${CATALOG_DESCRIPTIONS_DB_NAME}&q=to+code&target=landing`,
    );
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/target must be/);
  });

  it("blocks a staff search without a session", async () => {
    gate.allowStaff = false;
    const response = await fetch(
      `${base}/api/databases/${CATALOG_DESCRIPTIONS_DB_NAME}/search?q=to+code&target=course&lang=en`,
    );
    expect(response.status).toBe(401);
  });

  it("lets staff search descriptions and open the row by destiny code", async () => {
    const response = await fetch(
      `${base}/api/databases/${CATALOG_DESCRIPTIONS_DB_NAME}/search?q=become+a+nurse&target=course&lang=en`,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      semantic: boolean;
      items: Array<{ destiny_code: string; kind: string; description: string }>;
    };
    expect(body.semantic).toBe(true);
    expect(body.items).toEqual([
      expect.objectContaining({
        destiny_code: "1170129",
        kind: "course",
        description: "Patient care and the Florida nursing exam.",
      }),
    ]);
  });

  it("tells staff when the target is not a real group", async () => {
    const response = await fetch(
      `${base}/api/databases/${CATALOG_DESCRIPTIONS_DB_NAME}/search?q=to+code&target=blog`,
    );
    expect(response.status).toBe(400);
  });

  it("falls back to the description text when the vector store is down", async () => {
    vi.mocked(isAvailable).mockResolvedValue(false);
    const response = await fetch(
      `${base}/api/listings/search?database=${CATALOG_DESCRIPTIONS_DB_NAME}&q=film+makeup&target=content_piece&locale=en`,
    );
    const body = await response.json() as {
      semantic: boolean;
      fallback_reason?: string;
      items: Array<{ destiny_code: string }>;
    };
    expect(response.status).toBe(200);
    expect(body.semantic).toBe(false);
    expect(body.fallback_reason).toBe("vector_store_unavailable");
    expect(body.items.map((item) => item.destiny_code)).toEqual(["CM000080"]);
  });
});
