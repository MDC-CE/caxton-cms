import { apiFetch } from "@/lib/queryClient";

export class AdsActionError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

/** POST /api/diagnostics/ads/{run|recheck|mark-fixed|undo}; throws AdsActionError with the server's plain message. */
export async function postAdsAction<T = Record<string, unknown>>(path: "run" | "recheck" | "mark-fixed" | "undo", body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(`/api/diagnostics/ads/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AdsActionError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`, typeof data.code === "string" ? data.code : null, res.status);
  }
  return data as T;
}
