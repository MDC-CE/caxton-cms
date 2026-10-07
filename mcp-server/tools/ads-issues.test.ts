import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CatalogGrant } from "../lib/tool-catalog.js";

vi.mock("../lib/content.js", () => ({ resolveSiteContext: () => ({ ok: true, domain: "4geeks.com" }) }));
vi.mock("../lib/loopback.js", () => ({ buildLoopbackHeaders: () => ({ "Content-Type": "application/json" }) }));
vi.mock("../lib/auth.js", () => ({ denyResponse: (cap: string) => ({ content: [{ text: JSON.stringify({ success: false, code: "denied", cap }) }] }) }));

const { registerAdsIssueTools, adsIssueActionMeta } = await import("./ads-issues");

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function register(grants: CatalogGrant[] = [{ name: "metrics_view" } as CatalogGrant]): Handler {
  let handler: Handler | null = null;
  const mcp = { tool: (...args: unknown[]) => (handler = args[args.length - 1] as Handler) } as unknown as McpServer;
  registerAdsIssueTools(mcp, "token", grants);
  return handler!;
}

const parse = (r: Awaited<ReturnType<Handler>>) => JSON.parse(r.content[0]!.text) as Record<string, unknown>;

const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
let response: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };

beforeEach(() => {
  calls.length = 0;
  response = { status: 200, body: { job_id: "ads_run_1", lane: "fork" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify(response.body), { status: response.status });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ID = "ads:meta:missing_tracking_params:campaign:1";

describe("update_ads_issue", () => {
  it("run posts to /run and reports the background job + skipped-platform rule", async () => {
    const out = parse(await register()({ action: "run", agent_session_id: "s" }));
    expect(calls[0]!.url).toContain("/api/diagnostics/ads/run");
    expect(out.success).toBe(true);
    expect((out.warnings as Array<{ code: string }>).map((w) => w.code)).toContain("ads_run_scope");
    expect((out.next_actions as Array<{ tool: string }>)[0]!.tool).toBe("get_paid_traffic");
  });

  it("mark_fixed requires a real report and never calls the server without one", async () => {
    const out = parse(await register()({ action: "mark_fixed", issue_id: ID, report: "fixed", agent_session_id: "s" }));
    expect(out.code).toBe("ads_report_required");
    expect(calls).toHaveLength(0);
  });

  it("mark_fixed forwards report + model and says it is pending, not resolved", async () => {
    response = { status: 200, body: { ok: true, issue_id: ID, verify: { label: "Waiting for the next Meta Sync", verify_after: null } } };
    const report = "Added utm_id and utm_content to the 12 ads of campaign 1 in Ads Manager.";
    const out = parse(await register()({ action: "mark_fixed", issue_id: ID, report, model: "anthropic/claude", agent_session_id: "s" }));
    expect(calls[0]!.url).toContain("/mark-fixed");
    expect(calls[0]!.body).toEqual({ issue_id: ID, report, model: "anthropic/claude" });
    const w = (out.warnings as Array<{ code: string; message: string }>).find((x) => x.code === "ads_pending_not_resolved");
    expect(w?.message).toContain("Waiting for the next Meta Sync");
    expect((out.side_effects as Array<{ kind: string }>)[0]!.kind).toBe("ads_issue_marked_fixed");
  });

  it("recheck by resource sends platform / level / id; busy 409 keeps the code with a hint", async () => {
    response = { status: 409, body: { error: "An Ads Run is already in progress.", code: "ads_run_busy" } };
    const out = parse(await register()({ action: "recheck", platform: "meta", level: "campaign", resource_id: "9", agent_session_id: "s" }));
    expect(calls[0]!.body).toEqual({ platform: "meta", level: "campaign", id: "9" });
    expect(out).toMatchObject({ success: false, code: "ads_run_busy" });
    expect(String(out.hint)).toContain("run.active");
  });

  it("recheck without a scope fails locally", async () => {
    const out = parse(await register()({ action: "recheck", agent_session_id: "s" }));
    expect(out.code).toBe("ads_recheck_scope_required");
    expect(calls).toHaveLength(0);
  });

  it("is denied without metrics_view", async () => {
    const out = parse(await register([{ name: "content_view" } as CatalogGrant])({ action: "undo", issue_id: ID, agent_session_id: "s" }));
    expect(out.code).toBe("denied");
  });

  it("every action says it never edits ad platforms", () => {
    for (const a of ["run", "recheck", "mark_fixed", "undo"] as const) {
      expect(adsIssueActionMeta(a, {}).warnings.map((w) => w.code)).toContain("ads_issue_no_platform_change");
    }
  });
});
