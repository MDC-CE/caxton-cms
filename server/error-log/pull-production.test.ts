import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getProductionStaffToken,
  resetProductionStaffTokenForTests,
  setProductionStaffToken,
} from "../dev-production-fetch";
import { fetchProductionErrorLog, type ErrorLogExportRow } from "./pull-production";

const ORIGIN = "https://prod.example";

function sampleRow(overrides: Partial<ErrorLogExportRow> = {}): ErrorLogExportRow {
  return {
    id: 42,
    ts: 1_700_000_000_000,
    level: "error",
    module: "routes/admin",
    message: "Something failed",
    err_name: "TypeError",
    err_stack: "TypeError: boom\n    at x",
    context: { path: "/api/x" },
    ...overrides,
  };
}

describe("fetchProductionErrorLog", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.PRODUCTION_STAFF_TOKEN;

  beforeEach(() => {
    delete process.env.PRODUCTION_STAFF_TOKEN;
    resetProductionStaffTokenForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.PRODUCTION_STAFF_TOKEN;
    else process.env.PRODUCTION_STAFF_TOKEN = originalEnv;
    resetProductionStaffTokenForTests();
  });

  it("requires a production staff token", async () => {
    global.fetch = vi.fn() as typeof fetch;
    const result = await fetchProductionErrorLog("site_any", ORIGIN);
    expect(result.success).toBe(false);
    expect(result.code).toBe("production_staff_token_required");
    expect(result.envVar).toBe("PRODUCTION_STAFF_TOKEN");
    expect(result.productionOrigin).toBe(ORIGIN);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("maps production 401 to token_required and clears the pasted token", async () => {
    setProductionStaffToken("stale-token");
    global.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as typeof fetch;

    const result = await fetchProductionErrorLog("site_any", ORIGIN);

    expect(result.success).toBe(false);
    expect(result.code).toBe("production_staff_token_required");
    expect(getProductionStaffToken()).toBeNull();
  });

  it("returns a reason on network failure", async () => {
    process.env.PRODUCTION_STAFF_TOKEN = "token-abc";
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const result = await fetchProductionErrorLog("site_any", ORIGIN);

    expect(result.success).toBe(false);
    expect(result.code).toBeUndefined();
    expect(result.reason).toContain("ECONNREFUSED");
  });

  it("returns a reason when production has no export endpoint yet (404)", async () => {
    process.env.PRODUCTION_STAFF_TOKEN = "token-abc";
    global.fetch = vi.fn(async () => new Response("Not Found", { status: 404 })) as typeof fetch;

    const result = await fetchProductionErrorLog("site_any", ORIGIN);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("HTTP 404");
  });

  it("passes production rows through with total and exportedAt", async () => {
    process.env.PRODUCTION_STAFF_TOKEN = "token-abc";
    const rows = [sampleRow(), sampleRow({ id: 43, level: "warn", err_name: null, context: null })];
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ rows, total: rows.length, windowHours: 48 }), { status: 200 }),
    ) as typeof fetch;

    const result = await fetchProductionErrorLog("site_any", `${ORIGIN}/`);

    expect(result.success).toBe(true);
    expect(result.productionOrigin).toBe(ORIGIN);
    expect(result.total).toBe(2);
    expect(result.windowHours).toBe(48);
    expect(result.rows).toEqual(rows);
    expect(typeof result.exportedAt).toBe("string");
    expect(global.fetch).toHaveBeenCalledWith(
      `${ORIGIN}/api/admin/error-log/export`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});
