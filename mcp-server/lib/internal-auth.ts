/** Auth for main app → MCP `/internal/*` calls: loopback caller plus the shared server secret. */
export function isLoopbackAddress(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function isInternalRequestAuthorized(input: {
  remoteAddress: string | undefined;
  authorization: string | undefined;
  serverSecret: string;
}): boolean {
  if (!input.serverSecret || !isLoopbackAddress(input.remoteAddress)) return false;
  const bearer = (input.authorization || "").replace(/^Bearer\s+/i, "");
  return bearer.length > 0 && bearer === input.serverSecret;
}
