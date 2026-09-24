/**
 * Staff-facing message for a failed fetch.
 * Proxies (nginx) often return an HTML error page; calling response.json() on that
 * surfaces as "Unexpected token '<' … is not valid JSON".
 */
export async function readFailedResponseMessage(
  resp: Response,
  fallback: string,
): Promise<string> {
  const text = await resp.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed) as { error?: string; message?: string };
      const msg = data.error || data.message;
      if (msg) return msg;
    } catch {
      /* not JSON */
    }
  }

  if (
    resp.status === 413 ||
    /413|request entity too large|entity too large/i.test(trimmed)
  ) {
    return "This file is too large for the site. Use a smaller file (100 MB or less).";
  }

  if (resp.status === 502 || resp.status === 504) {
    return "The upload did not finish. Try a smaller file, or try again in a moment.";
  }

  if (trimmed.startsWith("<")) {
    return `${fallback} (HTTP ${resp.status}).`;
  }

  return trimmed.slice(0, 200) || fallback;
}
