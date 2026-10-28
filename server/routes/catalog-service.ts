/**
 * Service route the playground calls for Caxton's semantic catalog search.
 */
import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import type { DatabaseManager } from "../database";
import {
  resolveCatalogDatabase,
  searchLocalCatalog,
  type CatalogServiceKind,
  type CatalogServiceLang,
  type CatalogServiceQuery,
} from "../catalog-service-search";
import { api } from "../rate-limit/api";

const KINDS = new Set<CatalogServiceKind>(["course", "content_piece"]);
const LANGS = new Set<CatalogServiceLang>(["en", "es", "ht"]);

function configuredToken(): string {
  return process.env.CAXTON_SERVICE_SEARCH_TOKEN?.trim() || "";
}

function presentedToken(req: Request): string {
  const header = req.headers.authorization || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function tokenMatches(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function oneString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function parseQuery(req: Request): { ok: true; query: CatalogServiceQuery } | { ok: false; error: string } {
  const q = oneString(req.query.q)?.trim() ?? "";
  if (!q) return { ok: false, error: "q is required" };
  if (q.length < 3) return { ok: false, error: "q must be at least 3 characters" };

  const kindRaw = oneString(req.query.kind)?.trim() ?? "";
  if (kindRaw && !KINDS.has(kindRaw as CatalogServiceKind)) {
    return { ok: false, error: "kind must be course or content_piece" };
  }

  const langRaw = oneString(req.query.lang)?.trim() ?? "";
  if (langRaw && !LANGS.has(langRaw as CatalogServiceLang)) {
    return { ok: false, error: "lang must be en, es, or ht" };
  }

  const offset = parseBound(req.query.offset, 0, 0);
  if (!offset.ok) return { ok: false, error: "offset must be a whole number" };
  const limit = parseBound(req.query.limit, 20, 1);
  if (!limit.ok) return { ok: false, error: "limit must be a whole number" };

  return {
    ok: true,
    query: {
      q,
      offset: offset.value,
      limit: Math.min(limit.value, 100),
      ...(kindRaw ? { kind: kindRaw as CatalogServiceKind } : {}),
      ...(langRaw ? { lang: langRaw as CatalogServiceLang } : {}),
    },
  };
}

function parseBound(
  value: unknown,
  fallback: number,
  min: number,
): { ok: true; value: number } | { ok: false } {
  if (value == null || value === "") return { ok: true, value: fallback };
  const raw = oneString(value);
  if (raw == null || !/^\d+$/.test(raw.trim())) return { ok: false };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) return { ok: false };
  return { ok: true, value: parsed };
}

export function registerCatalogServiceRoutes(
  app: Express,
  deps?: { database?: () => DatabaseManager },
): void {
  api.get(app, "/api/service/catalog/search", { rate: "publicRead" }, async (req: Request, res: Response) => {
    const expected = configuredToken();
    if (!expected) {
      res.status(503).json({ error: "Catalog search is not configured." });
      return;
    }
    const presented = presentedToken(req);
    if (!presented || !tokenMatches(presented, expected)) {
      res.status(401).json({ error: "Missing or invalid token." });
      return;
    }

    const parsed = parseQuery(req);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const db = deps?.database?.() ?? resolveCatalogDatabase();
      const result = await searchLocalCatalog(parsed.query, db);
      res.json({
        items: result.items,
        count: result.count,
        semantic: result.semantic,
        ...(result.scores ? { scores: result.scores } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("not found")) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: "Catalog search failed" });
    }
  });
}
