/**
 * One-shot catalog pull. Does not wait for the nightly poll and does not
 * replace a job already waiting in the queue.
 */
import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { syncPlaygroundCatalog } from "../playground-catalog-sync";
import { api } from "../rate-limit/api";

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

export function registerCatalogSyncRoutes(app: Express): void {
  api.post(app, "/api/service/catalog/sync", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const expected = configuredToken();
    if (!expected) {
      res.status(503).json({ error: "Catalog sync is not configured." });
      return;
    }
    const presented = presentedToken(req);
    if (!presented || !tokenMatches(presented, expected)) {
      res.status(401).json({ error: "Missing or invalid token." });
      return;
    }
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
