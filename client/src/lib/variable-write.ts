import { apiFetch } from "@/lib/queryClient";

export class VariableWriteError extends Error {
  status: number;
  code?: string;
  details: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details ?? {};
  }
}

export interface FigureChangeDetails {
  usage_count: number;
  old_value: string | null;
  new_value: string;
  condition?: Record<string, string>;
}

/** Variables write that keeps the server's `code` / `details` (e.g. confirm_figure_change). */
export async function variableWrite(
  method: "PUT" | "POST",
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    throw new VariableWriteError(
      res.status,
      typeof data.error === "string" ? data.error : res.statusText,
      typeof data.code === "string" ? data.code : undefined,
      (data.details as Record<string, unknown> | undefined) ?? undefined,
    );
  }
  return data;
}
