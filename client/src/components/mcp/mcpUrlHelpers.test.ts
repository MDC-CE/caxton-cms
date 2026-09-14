import { describe, expect, it } from "vitest";
import {
  buildClaudeCodeCli,
  buildClaudeCodeCliForRoles,
  buildHttpMcpConfig,
  buildHttpMcpConfigForRoles,
  mcpServerConfigKey,
  resolveCloudConnectorUrl,
  resolveCloudConnectorUrls,
} from "./mcpUrlHelpers";

describe("mcpUrlHelpers role paths", () => {
  it("uses distinct config keys per role", () => {
    expect(mcpServerConfigKey()).toBe("4geeks-cms");
    expect(mcpServerConfigKey(null)).toBe("4geeks-cms");
    expect(mcpServerConfigKey("seo_manager")).toBe("4geeks-cms-seo_manager");
  });

  it("embeds role path in HTTP MCP config", () => {
    const json = buildHttpMcpConfig("https://example.com/mcp/role/seo_manager", "seo_manager");
    const parsed = JSON.parse(json) as { mcpServers: Record<string, { url: string }> };
    expect(parsed.mcpServers["4geeks-cms-seo_manager"].url).toBe(
      "https://example.com/mcp/role/seo_manager",
    );
    expect(parsed.mcpServers["4geeks-cms"]).toBeUndefined();
  });

  it("merges multiple roles into one mcpServers object", () => {
    const json = buildHttpMcpConfigForRoles([
      { roleId: "layout_editor", label: "Layout", url: "https://example.com/mcp/role/layout_editor" },
      { roleId: "seo_manager", label: "SEO", url: "https://example.com/mcp/role/seo_manager" },
    ]);
    const parsed = JSON.parse(json) as { mcpServers: Record<string, { url: string }> };
    expect(Object.keys(parsed.mcpServers).sort()).toEqual([
      "4geeks-cms-layout_editor",
      "4geeks-cms-seo_manager",
    ]);
  });

  it("builds Claude Code CLI with role key", () => {
    expect(buildClaudeCodeCli("https://example.com/mcp", null)).toContain("4geeks-cms https://");
    expect(buildClaudeCodeCli("https://example.com/mcp/role/blog", "blog")).toContain(
      "4geeks-cms-blog https://example.com/mcp/role/blog",
    );
  });

  it("builds one Claude Code CLI line per role", () => {
    const cli = buildClaudeCodeCliForRoles([
      { roleId: "a", label: "A", url: "https://example.com/mcp/role/a" },
      { roleId: "b", label: "B", url: "https://example.com/mcp/role/b" },
    ]);
    expect(cli.split("\n")).toHaveLength(2);
    expect(cli).toContain("4geeks-cms-a");
    expect(cli).toContain("4geeks-cms-b");
  });

  it("resolveCloudConnectorUrl appends role path", () => {
    expect(
      resolveCloudConnectorUrl({
        siteUrl: "https://site.example",
        siteDomain: null,
        localDev: false,
        publicUrl: "https://fallback/mcp",
        roleId: "metrics_viewer",
      }),
    ).toBe("https://site.example/mcp/role/metrics_viewer");
  });

  it("resolveCloudConnectorUrls maps each role", () => {
    const rows = resolveCloudConnectorUrls(
      { siteUrl: "https://site.example", siteDomain: null, localDev: false },
      [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    );
    expect(rows.map((r) => r.url)).toEqual([
      "https://site.example/mcp/role/a",
      "https://site.example/mcp/role/b",
    ]);
  });
});
