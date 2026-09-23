import { describe, expect, it } from "vitest";
import {
  mcpWriteDisabledGuide,
  oauthPlainMcpNotice,
  pickPrimaryBlocker,
  roleConnectorGuideFromEntries,
  shouldDenyUnscopedMutating,
  shouldStripUnscopedMutating,
} from "./role-connector-guide.js";

describe("shouldDenyUnscopedMutating", () => {
  it("denies on plain /mcp in production", () => {
    expect(
      shouldDenyUnscopedMutating({ isRoleScoped: false, nodeEnv: "production" }),
    ).toBe(true);
  });

  it("does not deny on role connectors in production", () => {
    expect(
      shouldDenyUnscopedMutating({ isRoleScoped: true, nodeEnv: "production" }),
    ).toBe(false);
  });

  it("does not deny on plain /mcp in development", () => {
    expect(
      shouldDenyUnscopedMutating({ isRoleScoped: false, nodeEnv: "development" }),
    ).toBe(false);
  });
});

describe("shouldStripUnscopedMutating", () => {
  it("never strips (production uses deny wrap instead)", () => {
    expect(
      shouldStripUnscopedMutating({ isRoleScoped: false, nodeEnv: "production" }),
    ).toBe(false);
    expect(
      shouldStripUnscopedMutating({ isRoleScoped: false, nodeEnv: "development" }),
    ).toBe(false);
  });
});

describe("pickPrimaryBlocker", () => {
  it("prefers role connector over write-off", () => {
    expect(
      pickPrimaryBlocker({ productionUnscoped: true, mcpWriteEnabled: false }),
    ).toBe("role_connector_required");
  });

  it("returns mcp_write_disabled when scoped but write off", () => {
    expect(
      pickPrimaryBlocker({ productionUnscoped: false, mcpWriteEnabled: false }),
    ).toBe("mcp_write_disabled");
  });

  it("returns null when ok to write", () => {
    expect(
      pickPrimaryBlocker({ productionUnscoped: false, mcpWriteEnabled: true }),
    ).toBe(null);
  });
});

describe("roleConnectorGuideFromEntries", () => {
  it("includes swarm_setup and empty-roles messaging", () => {
    const empty = roleConnectorGuideFromEntries([]);
    expect(empty.code).toBe("role_connector_required");
    expect(empty.swarm_setup.some((s) => /assign agent roles/i.test(s))).toBe(true);
    expect(empty.role_connectors).toEqual([]);
  });

  it("lists connector urls", () => {
    const guide = roleConnectorGuideFromEntries([
      {
        role_id: "copy_editor",
        label: "Copy Editor",
        description: "Draft copy",
        url: "https://example.com/mcp/role/copy_editor",
        agentic: true,
      },
    ]);
    expect(guide.role_connectors[0].url).toContain("/mcp/role/copy_editor");
    expect(guide.swarm_setup.some((s) => /separate MCP/i.test(s))).toBe(true);
  });
});

describe("mcpWriteDisabledGuide", () => {
  it("includes staff_path and course_of_action", () => {
    const g = mcpWriteDisabledGuide();
    expect(g.code).toBe("mcp_write_disabled");
    expect(g.staff_path).toMatch(/Security → Users/);
    expect(g.course_of_action.length).toBeGreaterThan(0);
    expect(g.non_effects.length).toBeGreaterThan(0);
  });
});

describe("oauthPlainMcpNotice", () => {
  it("warns read-only in production", () => {
    const n = oauthPlainMcpNotice("production");
    expect(n.isProduction).toBe(true);
    expect(n.title).toMatch(/read-only/i);
    expect(n.body).toMatch(/swarm/i);
  });

  it("allows writes in development with production caveat", () => {
    const n = oauthPlainMcpNotice("development");
    expect(n.isProduction).toBe(false);
    expect(n.body).toMatch(/development/i);
    expect(n.body).toMatch(/read-only in production/i);
  });
});
