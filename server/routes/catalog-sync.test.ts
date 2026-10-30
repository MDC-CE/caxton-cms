import http from "http";
import type { AddressInfo } from "net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCatalogSyncRoutes } from "./catalog-sync";

const syncPlaygroundCatalog = vi.fn();
const startCatalogDescriptionReindex = vi.fn();
const getJobState = vi.fn();
const getStatus = vi.fn();

vi.mock("../playground-catalog-sync", () => ({
  syncPlaygroundCatalog: (...args: unknown[]) => syncPlaygroundCatalog(...args),
  startCatalogDescriptionReindex: (...args: unknown[]) => startCatalogDescriptionReindex(...args),
}));

vi.mock("../db-job-state", () => ({
  getJobState: (...args: unknown[]) => getJobState(...args),
}));

vi.mock("../vector-search", () => ({
  getStatus: (...args: unknown[]) => getStatus(...args),
}));

const TOKEN = "catalog-sync-test-token";

let server: http.Server | null = null;
let baseUrl = "";
let previousToken: string | undefined;

async function post(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/service/catalog/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

beforeEach(async () => {
  syncPlaygroundCatalog.mockReset();
  startCatalogDescriptionReindex.mockReset();
  startCatalogDescriptionReindex.mockReturnValue({ documents: 4, indexing: "started" });
  getJobState.mockReset();
  getJobState.mockReturnValue({ index: { status: "running", fetched: 32, total: 4 } });
  getStatus.mockReset();
  getStatus.mockResolvedValue({
    available: true,
    collections: [{ name: "ce-catalog-descriptions", points_count: 4 }],
  });
  syncPlaygroundCatalog.mockResolvedValue({
    items: 3,
    offerings: 1,
    documents: 3,
    contentRoot: "/tmp/site_learning-mdc-edu",
  });
  previousToken = process.env.CAXTON_CATALOG_TOKEN;
  process.env.CAXTON_CATALOG_TOKEN = TOKEN;
  const app = express();
  registerCatalogSyncRoutes(app);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (previousToken === undefined) delete process.env.CAXTON_CATALOG_TOKEN;
  else process.env.CAXTON_CATALOG_TOKEN = previousToken;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  }
});

describe("POST /api/service/catalog/sync", () => {
  it("rejects a missing token and a missing configuration", async () => {
    const missing = await fetch(`${baseUrl}/api/service/catalog/sync`, { method: "POST" });
    expect(missing.status).toBe(401);
    const wrong = await fetch(`${baseUrl}/api/service/catalog/sync`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(wrong.status).toBe(401);

    delete process.env.CAXTON_CATALOG_TOKEN;
    const unset = await post();
    expect(unset.status).toBe(503);
    expect(syncPlaygroundCatalog).not.toHaveBeenCalled();
  });

  it("runs the catalog sync once and does not return the disk path", async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      items: 3,
      offerings: 1,
      documents: 3,
      indexing: "started",
    });
    expect(syncPlaygroundCatalog).toHaveBeenCalledTimes(1);
  });

  it("refuses a second call while the first is still running", async () => {
    let release: () => void = () => {};
    syncPlaygroundCatalog.mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({
          items: 1,
          offerings: 0,
          documents: 1,
          contentRoot: "/tmp/site_learning-mdc-edu",
        });
      }),
    );
    const first = post();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await post();
    expect(second.status).toBe(409);
    release();
    const done = await first;
    expect(done.status).toBe(200);
  });
});

describe("catalog description reindex", () => {
  it("starts a reindex of the saved descriptions and reports index progress", async () => {
    const started = await fetch(`${baseUrl}/api/service/catalog/reindex`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({ ok: true, documents: 4, indexing: "started" });
    expect(startCatalogDescriptionReindex).toHaveBeenCalledTimes(1);

    const status = await fetch(`${baseUrl}/api/service/catalog/index`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      ok: true,
      qdrant: true,
      points: 4,
      index: { status: "running", fetched: 32, total: 4, error: null },
    });
  });

  it("rejects an index status request without the catalog token", async () => {
    const status = await fetch(`${baseUrl}/api/service/catalog/index`);
    expect(status.status).toBe(401);
  });
});
