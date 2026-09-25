import { describe, expect, it } from "vitest";
import { BULK_DELETE_MAX_IDS, checkBulkDeleteRequest } from "./bulk-delete-gate";

const steward = { actorType: "ui", username: "steward", hasDeleteCapability: true };

describe("checkBulkDeleteRequest", () => {
  it("rejects MCP callers even with the capability", () => {
    expect(checkBulkDeleteRequest({ ...steward, actorType: "mcp", ids: ["a"] })).toMatchObject({
      ok: false,
      status: 403,
      code: "staff_ui_only",
    });
  });

  it("rejects staff without proposals_delete", () => {
    expect(
      checkBulkDeleteRequest({ ...steward, hasDeleteCapability: false, ids: ["a"] }),
    ).toMatchObject({ ok: false, status: 403, code: "delete_required" });
    expect(checkBulkDeleteRequest({ ...steward, username: null, ids: ["a"] })).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("accepts a steward and de-duplicates ids", () => {
    expect(checkBulkDeleteRequest({ ...steward, ids: ["a", " b ", "a"] })).toEqual({
      ok: true,
      ids: ["a", "b"],
    });
  });

  it("rejects empty, oversize or non-string ids", () => {
    expect(checkBulkDeleteRequest({ ...steward, ids: [] })).toMatchObject({ status: 400 });
    expect(checkBulkDeleteRequest({ ...steward, ids: "a" })).toMatchObject({ status: 400 });
    expect(checkBulkDeleteRequest({ ...steward, ids: ["a", 3] })).toMatchObject({ status: 400 });
    const tooMany = Array.from({ length: BULK_DELETE_MAX_IDS + 1 }, (_, i) => `p${i}`);
    expect(checkBulkDeleteRequest({ ...steward, ids: tooMany })).toMatchObject({
      status: 400,
      code: "too_many_ids",
    });
  });
});
