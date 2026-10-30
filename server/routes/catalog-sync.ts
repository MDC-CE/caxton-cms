/**
 * One-shot catalog pull. Does not wait for the nightly poll and does not
 * replace a job already waiting in the queue.
 */
import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { CATALOG_DESCRIPTIONS_DB_NAME } from "@shared/playground-catalog";
import { getJobState } from "../db-job-state";
import { startCatalogDescriptionReindex, syncPlaygroundCatalog } from "../playground-catalog-sync";
import { api } from "../rate-limit/api";
import { getStatus } from "../vector-search";

let running = false;

function configuredToken(): string {
  return process.env.CAXTON_CATALOG_TOKEN?.trim() || "";
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

function requireCatalogToken(req: Request, res: Response): boolean {
  const expected = configuredToken();
  if (!expected) {
    res.status(503).json({ error: "Catalog sync is not configured." });
    return false;
  }
  const presented = presentedToken(req);
  if (!presented || !tokenMatches(presented, expected)) {
    res.status(401).json({ error: "Missing or invalid token." });
    return false;
  }
  return true;
}

export function registerCatalogSyncRoutes(app: Express): void {
  api.get(app, "/api/service/catalog/index", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    if (!requireCatalogToken(req, res)) return;
    const job = getJobState(CATALOG_DESCRIPTIONS_DB_NAME);
    const status = await getStatus();
    const points = status.collections.find((collection) => collection.name === CATALOG_DESCRIPTIONS_DB_NAME)?.points_count ?? null;
    res.json({
      ok: true,
      qdrant: status.available,
      points,
      index: {
        status: job.index.status,
        fetched: job.index.fetched ?? null,
        total: job.index.total ?? null,
        error: job.index.error ?? null,
      },
    });
  });

  api.post(app, "/api/service/catalog/reindex", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    if (!requireCatalogToken(req, res)) return;
    try {
      const started = startCatalogDescriptionReindex();
      res.json({ ok: true, documents: started.documents, indexing: started.indexing });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Description reindex failed";
      const status = message.includes("is not loaded") || message.includes("not on disk") ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  api.post(app, "/api/service/catalog/sync", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    if (!requireCatalogToken(req, res)) return;
    if (running) {
      res.status(409).json({ error: "A catalog sync is already running." });
      return;
    }

    running = true;
    try {
      const report = await syncPlaygroundCatalog();
      res.json({
        ok: true,
        items: report.items,
        offerings: report.offerings,
        documents: report.documents,
        indexing: "started",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Catalog sync failed";
      const status = message.includes("is not set") || message.includes("is not loaded") ? 503 : 502;
      res.status(status).json({ error: message });
    } finally {
      running = false;
    }
  });
}
