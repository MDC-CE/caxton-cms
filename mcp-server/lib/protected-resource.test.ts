import { describe, expect, it } from "vitest";
import {
  buildProtectedResourceMetadata,
  isValidRoleId,
  mcpResourcePathFromPath,
  resolveMcpRoleId,
  resolveRequestPublicBase,
  wwwAuthenticateHeader,
} from "./protected-resource.js";

const fallback = () => "https://fallback.example.com/";

describe("resolveRequestPublicBase", () => {
  it("prefers forwarded host and proto from the main-app proxy", () => {
    const base = resolveRequestPublicBase(
      {
        headers: {
          host: "127.0.0.1:3001",
          "x-forwarded-host": "www.example.com",
          "x-forwarded-proto": "https",
        },
        protocol: "http",
      },
      fallback,
    );
    expect(base).toBe("https://www.example.com");
  });

  it("uses the first value of comma-separated forwarded headers", () => {
    const base = resolveRequestPublicBase(
      {
        headers: {
          "x-forwarded-host": "example.com, proxy.internal",
          "x-forwarded-proto": "https,http",
        },
      },
      fallback,
    );
    expect(base).toBe("https://example.com");
  });

  it("falls back to the direct Host header (localhost:3001)", () => {
    const base = resolveRequestPublicBase(
      { headers: { host: "localhost:3001" }, protocol: "http" },
      fallback,
    );
    expect(base).toBe("http://localhost:3001");
  });

  it("falls back to env base when no host headers exist", () => {
    expect(resolveRequestPublicBase({ headers: {} }, fallback)).toBe(
      "https://fallback.example.com",
    );
  });
});

describe("mcpResourcePathFromPath", () => {
  it("maps plain /mcp", () => {
    expect(mcpResourcePathFromPath("/mcp")).toBe("/mcp");
    expect(mcpResourcePathFromPath("/mcp/")).toBe("/mcp");
  });

  it("maps role paths as typed", () => {
    expect(mcpResourcePathFromPath("/mcp/role/copy_editor")).toBe("/mcp/role/copy_editor");
  });

  it("does not resolve deprecated aliases in the published path", () => {
    expect(mcpResourcePathFromPath("/mcp/role/webmaster")).toBe("/mcp/role/webmaster");
    expect(resolveMcpRoleId("webmaster")).toBe("user_admin");
  });

  it("rejects non-MCP paths and malformed slugs", () => {
    expect(mcpResourcePathFromPath("/oauth/authorize")).toBeNull();
    expect(mcpResourcePathFromPath("/mcp/role/9bad")).toBeNull();
    expect(mcpResourcePathFromPath("/mcp/role/a/b")).toBeNull();
    expect(isValidRoleId("_x")).toBe(false);
  });
});

describe("buildProtectedResourceMetadata", () => {
  it("builds metadata for plain /mcp", () => {
    expect(buildProtectedResourceMetadata("https://example.com/", "/mcp")).toEqual({
      resource: "https://example.com/mcp",
      authorization_servers: ["https://example.com"],
      bearer_methods_supported: ["header"],
    });
  });

  it("builds metadata for a role connector", () => {
    const meta = buildProtectedResourceMetadata("https://example.com", "/mcp/role/copy_editor");
    expect(meta.resource).toBe("https://example.com/mcp/role/copy_editor");
    expect(meta.authorization_servers).toEqual(["https://example.com"]);
  });
});

describe("wwwAuthenticateHeader", () => {
  it("points at the path-aware metadata URL", () => {
    expect(wwwAuthenticateHeader("https://example.com", "/mcp/role/copy_editor")).toBe(
      'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/mcp/role/copy_editor"',
    );
  });
});
