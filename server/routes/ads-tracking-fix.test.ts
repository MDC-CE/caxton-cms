import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

type Handler = (req: Request, res: Response) => unknown;
const routes = new Map<string, Handler>();
const state = vi.hoisted(() => ({ grants: new Set<string>(), loopback: false, tokenConfigured: true }));

vi.mock("../rate-limit/api", () => {
  const reg = (method: string) => (_app: unknown, path: string, _opts: unknown, handler: Handler) => routes.set(`${method} ${path}`, handler);
  return { api: { get: reg("GET"), post: reg("POST"), put: reg("PUT"), patch: reg("PATCH"), delete: reg("DELETE") } };
});

vi.mock("./_helpers", () => ({
  isMcpLoopbackRequest: () => state.loopback,
  resolveIssueActor: () => (state.loopback ? { type: "mcp", client: "test" } : { type: "ui" }),
  requireCapability: async (_req: Request, res: Response, cap: string) => {
    if (state.grants.has(cap)) return { authorized: true, token: "t", username: "staff@4geeks.com", author: "staff@4geeks.com" };
    res.status(403).json({ error: `Insufficient permissions: ${cap} required` });
    return { authorized: false, token: "t", username: null, author: null };
  },
}));

vi.mock("../ads/meta-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ads/meta-client")>()),
  isMetaTokenConfigured: () => state.tokenConfigured,
}));

vi.mock("../ads/meta-write", () => ({
  fetchAdsForFix: vi.fn(async () => new Map()),
  replaceAdUrlTags: vi.fn(),
}));

const { registerAdsRoutes } = await import("./ads");
const { registerConsentRoutes } = await import("./consent");
registerAdsRoutes({} as never);
registerConsentRoutes({} as never);

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    locals: { site: { contentRoot: "/tmp/nope", contentRootName: "test-site" } },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    cookie() {
      return res;
    },
  };
  return res;
}

async function call(key: string, body: unknown = {}) {
  const handler = routes.get(key);
  if (!handler) throw new Error(`route not registered: ${key}`);
  const res = fakeRes();
  await handler({ body, query: {}, headers: {} } as unknown as Request, res as unknown as Response);
  return res;
}

beforeEach(() => {
  state.grants = new Set();
  state.loopback = false;
  state.tokenConfigured = true;
});

describe("tracking-fix routes", () => {
  const body = { issue_id: "ads:meta:missing_tracking_params:campaign:123", ad_ids: ["1"] };

  it("require ads_edit", async () => {
    state.grants = new Set(["ads_settings", "metrics_view"]);
    expect((await call("POST /api/ads/meta/tracking-fix/preview", body)).statusCode).toBe(403);
    expect((await call("POST /api/ads/meta/tracking-fix/apply", body)).statusCode).toBe(403);
  });

  it("refuse MCP loopback even with the grant", async () => {
    state.grants = new Set(["ads_edit"]);
    state.loopback = true;
    const res = await call("POST /api/ads/meta/tracking-fix/apply", body);
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toMatch(/staff UI only/);
  });

  it("reject non-tracking issue ids and too many ads", async () => {
    state.grants = new Set(["ads_edit"]);
    expect((await call("POST /api/ads/meta/tracking-fix/preview", { issue_id: "ads:meta:landing_not_live:none:none" })).statusCode).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => String(i + 1));
    expect((await call("POST /api/ads/meta/tracking-fix/apply", { ...body, ad_ids: many })).statusCode).toBe(400);
  });

  it("apply returns 409 when the Meta token is missing", async () => {
    state.grants = new Set(["ads_edit"]);
    state.tokenConfigured = false;
    expect((await call("POST /api/ads/meta/tracking-fix/apply", body)).statusCode).toBe(409);
  });
});

describe("Ads diagnostics action routes", () => {
  it("need metrics_view", async () => {
    for (const key of ["run", "recheck", "mark-fixed", "undo"]) {
      expect((await call(`POST /api/diagnostics/ads/${key}`, { issue_id: "ads:meta:missing_tracking_params:campaign:1" })).statusCode).toBe(403);
    }
  });

  it("reject malformed issue ids and scopes", async () => {
    state.grants = new Set(["metrics_view"]);
    expect((await call("POST /api/diagnostics/ads/mark-fixed", { issue_id: "missing_tracking_params:1" })).statusCode).toBe(400);
    expect((await call("POST /api/diagnostics/ads/undo", {})).statusCode).toBe(400);
    expect((await call("POST /api/diagnostics/ads/recheck", { platform: "tiktok", level: "ad", id: "1" })).statusCode).toBe(400);
    expect((await call("POST /api/diagnostics/ads/run", { platforms: ["bing"] })).statusCode).toBe(400);
  });

  it("404 when the issue is not in the saved results", async () => {
    state.grants = new Set(["metrics_view"]);
    const res = await call("POST /api/diagnostics/ads/mark-fixed", { issue_id: "ads:meta:missing_tracking_params:campaign:1" });
    expect(res.statusCode).toBe(404);
    expect((res.body as { code: string }).code).toBe("ads_issue_not_found");
  });
});

describe("consent window routes", () => {
  it("need consent_settings, not ads_settings", async () => {
    state.grants = new Set(["ads_settings"]);
    expect((await call("GET /api/settings/consent/window")).statusCode).toBe(403);
    expect((await call("PUT /api/settings/consent/window", {})).statusCode).toBe(403);
  });
});
