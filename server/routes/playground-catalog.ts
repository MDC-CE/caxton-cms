import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { api } from "../rate-limit/api";
import { readCatalogItem } from "../playground-catalog-sync";
import type { CatalogKind, CatalogLang } from "@shared/playground-catalog";

function offeringsFile(res: Response): string | null {
  const root = res.locals.site?.contentRoot;
  if (!root) return null;
  return path.join(root, "data", "ce-offerings.json");
}

export function registerPlaygroundCatalogRoutes(app: Express): void {
  api.get(app, "/api/playground-catalog/offerings", { rate: "publicRead" }, (_req: Request, res: Response) => {
    const file = offeringsFile(res);
    if (!file || !fs.existsSync(file)) {
      res.status(404).json({ error: "Catalog has not been loaded yet" });
      return;
    }
    try {
      const payload = JSON.parse(fs.readFileSync(file, "utf8")) as {
        offerings?: unknown;
        fetched_at?: string;
        generated_on?: string;
      };
      res.json({
        offerings: Array.isArray(payload.offerings) ? payload.offerings : [],
        fetched_at: payload.fetched_at ?? null,
        generated_on: payload.generated_on ?? null,
      });
    } catch {
      res.status(500).json({ error: "Catalog file could not be read" });
    }
  });

  api.get(app, "/api/playground-catalog/item", { rate: "publicRead" }, async (req: Request, res: Response) => {
    const kind = String(req.query.kind || "");
    const destinyCode = String(req.query.destiny_code || "");
    const lang = String(req.query.lang || "en");
    if (kind !== "course" && kind !== "content_piece") {
      res.status(400).json({ error: "kind must be course or content_piece" });
      return;
    }
    if (!destinyCode) {
      res.status(400).json({ error: "destiny_code is required" });
      return;
    }
    if (lang !== "en" && lang !== "es" && lang !== "ht") {
      res.status(400).json({ error: "lang must be en, es, or ht" });
      return;
    }
    try {
      const item = await readCatalogItem(kind as CatalogKind, destinyCode, lang as CatalogLang);
      res.json(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Catalog request failed";
      const status = message.includes("is not set") ? 503 : 502;
      res.status(status).json({ error: message });
    }
  });
}
