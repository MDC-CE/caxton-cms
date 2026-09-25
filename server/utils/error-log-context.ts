/**
 * Build the sanitized `error_log.context` JSON from a parsed pino line.
 * Keeps every extra field attached to a log call (url, status, key, detail…)
 * but blanks sensitive-looking keys and caps the size so the SQLite sink
 * never stores PII/secrets verbatim or unbounded payloads.
 */

/** Pino line keys that already have their own `error_log` columns or are noise. */
const STANDARD_KEYS = new Set(["level", "time", "pid", "hostname", "module", "msg", "err", "v"]);

/** Serialized-error keys already stored in `err_name` / `err_stack` (or the log message). */
const ERR_STANDARD_KEYS = new Set(["type", "message", "stack"]);

const SENSITIVE_KEY_RE =
  /email|phone|token|authorization|cookie|password|passwd|secret|body|api[_-]?key|session/i;

const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;

export const ERROR_LOG_CONTEXT_MAX_DEPTH = 3;
export const ERROR_LOG_CONTEXT_MAX_STRING = 500;
export const ERROR_LOG_CONTEXT_MAX_ARRAY = 20;
export const ERROR_LOG_CONTEXT_MAX_BYTES = 4096;

export const REDACTED = "[redacted]";

function sanitizeString(value: string): string {
  const masked = value.replace(BEARER_RE, `$1 ${REDACTED}`);
  if (masked.length <= ERROR_LOG_CONTEXT_MAX_STRING) return masked;
  return `${masked.slice(0, ERROR_LOG_CONTEXT_MAX_STRING)}… (+${masked.length - ERROR_LOG_CONTEXT_MAX_STRING} chars)`;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);

  if (depth >= ERROR_LOG_CONTEXT_MAX_DEPTH) {
    return Array.isArray(value) ? `[array(${value.length})]` : "[object]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, ERROR_LOG_CONTEXT_MAX_ARRAY)
      .map((item) => sanitizeValue(item, depth + 1));
    if (value.length > ERROR_LOG_CONTEXT_MAX_ARRAY) {
      items.push(`… (+${value.length - ERROR_LOG_CONTEXT_MAX_ARRAY} items)`);
    }
    return items;
  }

  return sanitizeObject(value as Record<string, unknown>, depth + 1);
}

function sanitizeObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    out[key] = SENSITIVE_KEY_RE.test(key) ? REDACTED : sanitizeValue(value, depth);
  }
  return out;
}

/** Add entries in order until the serialized size would exceed the byte cap. */
function capSize(context: Record<string, unknown>): Record<string, unknown> {
  if (Buffer.byteLength(JSON.stringify(context)) <= ERROR_LOG_CONTEXT_MAX_BYTES) {
    return context;
  }
  const truncatedMarker = { _truncated: true };
  const budget = ERROR_LOG_CONTEXT_MAX_BYTES - Buffer.byteLength(JSON.stringify(truncatedMarker));
  const capped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    capped[key] = value;
    if (Buffer.byteLength(JSON.stringify(capped)) > budget) {
      delete capped[key];
    }
  }
  return { ...capped, ...truncatedMarker };
}

/**
 * Returns a JSON string for `error_log.context`, or `null` when the line
 * carries nothing beyond the standard pino/error fields.
 */
export function buildErrorLogContext(line: Record<string, unknown>): string | null {
  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(line)) {
    if (STANDARD_KEYS.has(key) || value === undefined) continue;
    extra[key] = value;
  }

  const err = line.err;
  if (typeof err === "string") {
    extra.error = err;
  } else if (err && typeof err === "object" && !Array.isArray(err)) {
    const errProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(err as Record<string, unknown>)) {
      if (ERR_STANDARD_KEYS.has(key) || value === undefined) continue;
      errProps[key] = value;
    }
    if (Object.keys(errProps).length > 0) extra.err_props = errProps;
  }

  if (Object.keys(extra).length === 0) return null;

  return JSON.stringify(capSize(sanitizeObject(extra, 0)));
}
