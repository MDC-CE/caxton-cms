import { describe, expect, it } from "vitest";
import {
  applyMcpAccessToGrants,
  mcpAccessAllowsCapability,
  normalizeMcpAccess,
  type CapabilityGrant,
} from "./user-store";
import { allowedToolNames } from "../shared/mcp-tool-catalog";

describe("normalizeMcpAccess", () => {
  it("defaults missing flags to read on and write off", () => {
    expect(normalizeMcpAccess(null)).toEqual({
      mcpReadEnabled: true,
      mcpWriteEnabled: false,
    });
    expect(normalizeMcpAccess({})).toEqual({
      mcpReadEnabled: true,
      mcpWriteEnabled: false,
    });
  });

  it("forces write off when read is off", () => {
    expect(
      normalizeMcpAccess({ mcpReadEnabled: false, mcpWriteEnabled: true }),
    ).toEqual({ mcpReadEnabled: false, mcpWriteEnabled: false });
  });

  it("allows write only when explicitly true", () => {
    expect(
      normalizeMcpAccess({ mcpReadEnabled: true, mcpWriteEnabled: true }),
    ).toEqual({ mcpReadEnabled: true, mcpWriteEnabled: true });
  });

  it("keeps write off when write is explicitly false", () => {
    expect(
      normalizeMcpAccess({ mcpReadEnabled: true, mcpWriteEnabled: false }),
    ).toEqual({ mcpReadEnabled: true, mcpWriteEnabled: false });
  });
});

describe("applyMcpAccessToGrants", () => {
  const grants: CapabilityGrant[] = [
    { name: "content_view", contentTypes: "*" },
    { name: "content_edit_text", contentTypes: "*" },
    { name: "metrics_view" },
    { name: "seo_edit", contentTypes: ["blog"] },
    { name: "read_redirects" },
    { name: "proposals_create" },
    { name: "proposals_review" },
  ];

  it("returns empty when read is off", () => {
    expect(
      applyMcpAccessToGrants(grants, { mcpReadEnabled: false, mcpWriteEnabled: false }),
    ).toEqual([]);
  });

  it("keeps view + proposals_create when write is off (propose-only)", () => {
    expect(
      applyMcpAccessToGrants(grants, { mcpReadEnabled: true, mcpWriteEnabled: false }),
    ).toEqual([
      { name: "content_view", contentTypes: "*" },
      { name: "metrics_view" },
      { name: "read_redirects" },
      { name: "proposals_create" },
    ]);
  });

  it("strips proposals_review and edit caps when write is off", () => {
    const filtered = applyMcpAccessToGrants(grants, {
      mcpReadEnabled: true,
      mcpWriteEnabled: false,
    });
    const names = new Set(filtered.map((g) => g.name));
    expect(names.has("proposals_review")).toBe(false);
    expect(names.has("content_edit_text")).toBe(false);
    expect(names.has("seo_edit")).toBe(false);
  });

  it("passes through all grants when write is on", () => {
    expect(
      applyMcpAccessToGrants(grants, { mcpReadEnabled: true, mcpWriteEnabled: true }),
    ).toEqual(grants);
  });
});

describe("mcpAccessAllowsCapability", () => {
  it("denies everything when read is off", () => {
    const access = { mcpReadEnabled: false, mcpWriteEnabled: false };
    expect(mcpAccessAllowsCapability(access, "content_view")).toBe(false);
    expect(mcpAccessAllowsCapability(access, "content_edit_text")).toBe(false);
    expect(mcpAccessAllowsCapability(access, "proposals_create")).toBe(false);
  });

  it("allows propose-only caps when write is off", () => {
    const access = { mcpReadEnabled: true, mcpWriteEnabled: false };
    expect(mcpAccessAllowsCapability(access, "content_view")).toBe(true);
    expect(mcpAccessAllowsCapability(access, "metrics_view")).toBe(true);
    expect(mcpAccessAllowsCapability(access, "read_redirects")).toBe(true);
    expect(mcpAccessAllowsCapability(access, "proposals_create")).toBe(true);
    expect(mcpAccessAllowsCapability(access, "content_edit_text")).toBe(false);
    expect(mcpAccessAllowsCapability(access, "seo_edit")).toBe(false);
    expect(mcpAccessAllowsCapability(access, "proposals_review")).toBe(false);
  });

  it("allows any cap name when write is on", () => {
    const access = { mcpReadEnabled: true, mcpWriteEnabled: true };
    expect(mcpAccessAllowsCapability(access, "content_edit_text")).toBe(true);
    expect(mcpAccessAllowsCapability(access, "users_manage")).toBe(true);
    expect(mcpAccessAllowsCapability(access, "proposals_review")).toBe(true);
  });
});

describe("write-off tool catalog", () => {
  it("exposes propose tools but not update_fields", () => {
    const roleGrants: CapabilityGrant[] = [
      { name: "content_view", contentTypes: "*" },
      { name: "content_edit_text", contentTypes: "*" },
      { name: "proposals_create" },
      { name: "proposals_review" },
    ];
    const filtered = applyMcpAccessToGrants(roleGrants, {
      mcpReadEnabled: true,
      mcpWriteEnabled: false,
    });
    const names = new Set(allowedToolNames(filtered));
    expect(names.has("propose_change")).toBe(true);
    expect(names.has("update_proposal")).toBe(true);
    expect(names.has("list_proposals")).toBe(true);
    expect(names.has("update_fields")).toBe(false);
    expect(names.has("create_entry")).toBe(false);
  });
});
