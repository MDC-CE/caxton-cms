/** Staff bulk delete: who may call it and which ids are accepted (no I/O). */

export const BULK_DELETE_MAX_IDS = 200;

export type BulkDeleteGateInput = {
  actorType?: string | null;
  username: string | null;
  hasDeleteCapability: boolean;
  ids: unknown;
};

export type BulkDeleteGateResult =
  | { ok: true; ids: string[] }
  | { ok: false; status: 400 | 403; code: string; error: string };

export function checkBulkDeleteRequest(input: BulkDeleteGateInput): BulkDeleteGateResult {
  if (input.actorType === "mcp") {
    return {
      ok: false,
      status: 403,
      code: "staff_ui_only",
      error: "Bulk delete is a staff UI action — agents cannot delete proposals.",
    };
  }
  if (!input.username || !input.hasDeleteCapability) {
    return {
      ok: false,
      status: 403,
      code: "delete_required",
      error: "Delete proposals (proposals_delete) is required to delete proposals.",
    };
  }
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    return { ok: false, status: 400, code: "ids_required", error: "ids must be a non-empty array" };
  }
  if (input.ids.length > BULK_DELETE_MAX_IDS) {
    return {
      ok: false,
      status: 400,
      code: "too_many_ids",
      error: `At most ${BULK_DELETE_MAX_IDS} proposals per request`,
    };
  }
  const ids = input.ids.map((id) => (typeof id === "string" ? id.trim() : ""));
  if (ids.some((id) => !id)) {
    return { ok: false, status: 400, code: "invalid_ids", error: "Every id must be a non-empty string" };
  }
  return { ok: true, ids: Array.from(new Set(ids)) };
}
