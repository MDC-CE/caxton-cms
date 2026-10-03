import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./staff-session", () => ({
  revokeAllStaffSessions: vi.fn().mockResolvedValue(0),
}));

vi.mock("./github-user-tokens", () => ({
  deleteUserGitHubToken: vi.fn().mockResolvedValue(undefined),
}));

import { _setUsersStateForTests, getUser, getUserByStaffId, type UserRecord } from "./user-store";
import { revokeAllStaffSessions } from "./staff-session";
import { deleteUserGitHubToken } from "./github-user-tokens";
import { deleteStaffUser, getDuplicatePreview } from "./staff-user-deletion";

function user(over: Partial<UserRecord> & { username: string }): UserRecord {
  return { id: over.username, roles: [], ...over };
}

const fetchMock = vi.fn();

describe("deleteStaffUser", () => {
  beforeEach(() => {
    vi.mocked(revokeAllStaffSessions).mockClear();
    vi.mocked(deleteUserGitHubToken).mockClear();
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MCP_SERVER_SECRET", "test-secret");
    _setUsersStateForTests({
      users: {
        admin: user({ username: "admin", email: "admin@example.com", roles: ["user_admin"] }),
        alice: user({ username: "alice", email: "alice@example.com", roles: ["content_viewer"] }),
        "alice@example.com": user({
          username: "alice@example.com",
          id: "alice-old",
          email: "alice@example.com",
          roles: ["ads_manager"],
        }),
        carol: user({ username: "carol", email: "carol@example.com", roles: ["platform_ops"] }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refuses to delete your own account", async () => {
    const result = await deleteStaffUser({ username: "admin", actorUsername: "admin" });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(getUser("admin")?.deletedAt).toBeUndefined();
  });

  it("refuses to delete the last user manager", async () => {
    const result = await deleteStaffUser({ username: "admin", actorUsername: "carol" });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(getUser("admin")?.roles).toEqual(["user_admin"]);
  });

  it("soft-deletes the only record and disconnects everything", async () => {
    const result = await deleteStaffUser({ username: "carol", actorUsername: "admin" });
    expect(result).toMatchObject({ ok: true, mode: "soft_deleted", agentsDisconnected: true });
    expect(getUser("carol")?.deletedAt).toBeTruthy();
    expect(getUser("carol")?.deletedBy).toBe("admin");
    expect(revokeAllStaffSessions).toHaveBeenCalledWith("carol");
    expect(deleteUserGitHubToken).toHaveBeenCalledWith("carol");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/internal/revoke-user"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-secret" }),
        body: JSON.stringify({ username: "carol" }),
      }),
    );
  });

  it("removes only the duplicate copy, aliases history, and still disconnects it", async () => {
    expect(getDuplicatePreview("alice@example.com")).toEqual({
      survivor: { username: "alice", displayName: "alice" },
      rolesLost: ["ads_manager"],
    });
    const result = await deleteStaffUser({ username: "alice@example.com", actorUsername: "admin" });
    expect(result).toMatchObject({
      ok: true,
      mode: "duplicate_removed",
      survivor: { username: "alice" },
      rolesLost: ["ads_manager"],
    });
    expect(getUser("alice@example.com")).toBeNull();
    expect(getUser("alice")?.roles).toEqual(["content_viewer"]);
    expect(getUser("alice")?.deletedAt).toBeUndefined();
    expect(getUserByStaffId("alice-old")?.username).toBe("alice");
    expect(revokeAllStaffSessions).toHaveBeenCalledWith("alice@example.com");
    expect(deleteUserGitHubToken).toHaveBeenCalledWith("alice@example.com");
  });

  it("still deletes when the agent server is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await deleteStaffUser({ username: "carol", actorUsername: "admin" });
    expect(result).toMatchObject({ ok: true, mode: "soft_deleted", agentsDisconnected: false });
    expect(getUser("carol")?.deletedAt).toBeTruthy();
  });

  it("returns 404 for unknown and 409 for already-deleted users", async () => {
    expect(await deleteStaffUser({ username: "nobody" })).toMatchObject({ ok: false, status: 404 });
    await deleteStaffUser({ username: "carol", actorUsername: "admin" });
    expect(await deleteStaffUser({ username: "carol" })).toMatchObject({ ok: false, status: 409 });
  });
});
