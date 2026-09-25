/**
 * OAuth Protected Resource Metadata (RFC 9728) for plain /mcp and role connectors.
 * Lets MCP clients send `resource=<connector URL>` on /oauth/authorize so the
 * consent page knows which role connector is signing in.
 */

import { getMcpPublicBase } from "./role-connector-guide.js";

export const PROTECTED_RESOURCE_WELL_KNOWN = "/.well-known/oauth-protected-resource";

export type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  protocol?: string;
};

export type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
};

/** Deprecated connector ids — resolves before role lookup (one-release window). */
const DEPRECATED_MCP_ROLE_ALIASES: Readonly<Record<string, string>> = {
  webmaster: "user_admin",
};

export function isValidRoleId(roleId: string): boolean {
  return /^[a-z][a-z0-9_-]*$/.test(roleId);
}

export function resolveMcpRoleId(roleId: string): string {
  const resolved = DEPRECATED_MCP_ROLE_ALIASES[roleId] ?? roleId;
  if (resolved !== roleId) {
    console.warn(`[MCP] Deprecated role id '${roleId}' — use '/mcp/role/${resolved}' instead`);
  }
  return resolved;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw?.split(",")[0]?.trim();
  return first || undefined;
}

/**
 * Public origin the client used: forwarded headers (main-app proxy) → direct Host
 * (e.g. localhost:3001) → MCP_PUBLIC_URL / SITE_URL. Must match the URL the user
 * typed or MCP clients abort sign-in.
 */
export function resolveRequestPublicBase(
  req: RequestLike,
  fallback: () => string = getMcpPublicBase,
): string {
  const forwardedProto = firstHeader(req.headers["x-forwarded-proto"]);
  const forwardedHost = firstHeader(req.headers["x-forwarded-host"]);
  if (forwardedHost) {
    return `${forwardedProto || req.protocol || "https"}://${forwardedHost}`.replace(/\/$/, "");
  }
  const host = firstHeader(req.headers.host);
  if (host) {
    return `${forwardedProto || req.protocol || "http"}://${host}`.replace(/\/$/, "");
  }
  return fallback().replace(/\/$/, "");
}

/**
 * `/mcp` or `/mcp/role/<slug>` exactly as requested (no alias resolution), or null
 * when the path is not an MCP endpoint or the slug is malformed.
 */
export function mcpResourcePathFromPath(pathname: string): string | null {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/mcp") return "/mcp";
  const m = trimmed.match(/^\/mcp\/role\/([^/]+)$/);
  if (!m) return null;
  if (!isValidRoleId(m[1].toLowerCase())) return null;
  return `/mcp/role/${m[1]}`;
}

export function buildProtectedResourceMetadata(
  base: string,
  resourcePath: string,
): ProtectedResourceMetadata {
  const origin = base.replace(/\/$/, "");
  return {
    resource: `${origin}${resourcePath}`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  };
}

export function wwwAuthenticateHeader(base: string, resourcePath: string): string {
  const origin = base.replace(/\/$/, "");
  return `Bearer resource_metadata="${origin}${PROTECTED_RESOURCE_WELL_KNOWN}${resourcePath}"`;
}
