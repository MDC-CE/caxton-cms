/**
 * Outbound lead webhook header helpers — denylist hop-by-hop / dangerous names.
 */

const DENYLISTED_HEADER_NAMES = new Set([
  "host",
  "cookie",
  "cookie2",
  "set-cookie",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

export function isDenylistedWebhookHeader(name: string): boolean {
  return DENYLISTED_HEADER_NAMES.has(name.trim().toLowerCase());
}

/** Drop denylisted names; keep first occurrence of each canonical name (case-insensitive). */
export function sanitizeWebhookHeaders(
  headers: Record<string, string> | undefined | null,
): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [rawName, value] of Object.entries(headers)) {
    if (typeof rawName !== "string" || typeof value !== "string") continue;
    const name = rawName.trim();
    if (!name || !value) continue;
    if (isDenylistedWebhookHeader(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out[name] = value;
  }
  return out;
}
