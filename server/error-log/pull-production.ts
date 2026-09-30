/**
 * Dev-only: fetch the production error log (last 48h) so staff can save it as
 * a JSON file. Never writes to the local error_log table and never uploads.
 */

import {
  fetchProductionAdmin,
  resolveProductionOrigin,
  type ProductionStaffTokenRequiredPayload,
} from "../dev-production-fetch";

export type ErrorLogExportRow = {
  id: number;
  ts: number;
  level: "error" | "warn";
  module: string;
  message: string;
  err_name: string | null;
  err_stack: string | null;
  context: Record<string, unknown> | null;
};

export type FetchProductionErrorLogResult = {
  success: boolean;
  productionOrigin: string;
  reason?: string;
  exportedAt?: string;
  total?: number;
  windowHours?: number;
  rows?: ErrorLogExportRow[];
} & Partial<ProductionStaffTokenRequiredPayload>;

function parseExportPayload(body: unknown): { rows: ErrorLogExportRow[]; windowHours?: number } {
  if (!body || typeof body !== "object") return { rows: [] };
  const { rows, windowHours } = body as { rows?: unknown; windowHours?: unknown };
  const parsed = Array.isArray(rows)
    ? rows.filter(
        (r): r is ErrorLogExportRow =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as ErrorLogExportRow).id === "number" &&
          typeof (r as ErrorLogExportRow).ts === "number" &&
          typeof (r as ErrorLogExportRow).message === "string",
      )
    : [];
  return {
    rows: parsed,
    windowHours: typeof windowHours === "number" ? windowHours : undefined,
  };
}

export async function fetchProductionErrorLog(
  site: string,
  productionOriginOverride?: string,
): Promise<FetchProductionErrorLogResult> {
  const productionOrigin =
    productionOriginOverride?.replace(/\/$/, "") || resolveProductionOrigin(site);

  if (!productionOrigin) {
    return {
      success: false,
      productionOrigin: "",
      reason:
        "Could not resolve production URL for this site. Set PRODUCTION_SITE_URL or configure the site domain in sites.yml.",
    };
  }

  const url = new URL("/api/admin/error-log/export", productionOrigin);
  const result = await fetchProductionAdmin(url, { method: "GET" }, productionOrigin);

  if (!result.ok) {
    if (result.kind === "token_required") {
      return {
        ...result.payload,
        success: false,
        reason: result.payload.error,
      };
    }
    if (result.kind === "network") {
      return { success: false, productionOrigin, reason: result.error };
    }
    return {
      success: false,
      productionOrigin,
      reason: `Production returned HTTP ${result.status}${
        result.body ? `: ${result.body.slice(0, 200)}` : ""
      }`,
    };
  }

  let body: unknown;
  try {
    body = await result.response.json();
  } catch {
    return {
      success: false,
      productionOrigin,
      reason: "Production returned a non-JSON response for the error log export.",
    };
  }

  const { rows, windowHours } = parseExportPayload(body);
  return {
    success: true,
    productionOrigin,
    exportedAt: new Date().toISOString(),
    total: rows.length,
    windowHours: windowHours ?? 48,
    rows,
  };
}
