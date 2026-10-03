import { beforeEach, describe, expect, it } from "vitest";
import {
  _setUsersStateForTests,
  addPendingUser,
  countActiveUsersWithCapability,
  findActiveDuplicates,
  getActiveUsers,
  getDeletedUsers,
  getStaffDirectory,
  getUser,
  getUserByStaffId,
  hardDeleteDuplicate,
  recordDeletedUserSignInAttempt,
  getPendingUsers,
  renameUser,
  restoreUser,
  softDeleteUser,
  type UserRecord,
} from "./user-store";

function user(over: Partial<UserRecord> & { username: string }): UserRecord {
  return { id: over.username, roles: [], ...over };
}

describe("soft delete and restore", () => {
  beforeEach(() => {
    _setUsersStateForTests({
      users: {
        alice: user({
          username: "alice",
          email: "alice@example.com",
          roles: ["content_viewer"],
          identities: [{ provider: "github", providerUserId: "1", handle: "alice" }],
        }),
        admin: user({ username: "admin", email: "admin@example.com", roles: ["user_admin"] }),
      },
    });
  });

  it("keeps the identity, clears roles, and stamps who/when", () => {
    const result = softDeleteUser("alice", "admin");
    expect(result.ok).toBe(true);
    const alice = getUser("alice")!;
    expect(alice.roles).toEqual([]);
    expect(alice.deletedAt).toBeTruthy();
    expect(alice.deletedBy).toBe("admin");
    expect(alice.identities).toHaveLength(1);
    expect(getUserByStaffId("alice")?.username).toBe("alice");
    expect(getActiveUsers().map((u) => u.username)).toEqual(["admin"]);
    expect(getDeletedUsers().map((u) => u.username)).toEqual(["alice"]);
    expect(getStaffDirectory().map((u) => u.username)).toEqual(["admin"]);
  });

  it("restores the same record with only the picked roles", () => {
    softDeleteUser("alice", "admin");
    const result = restoreUser("alice", ["platform_ops"]);
    expect(result.ok).toBe(true);
    const alice = getUser("alice")!;
    expect(alice.id).toBe("alice");
    expect(alice.roles).toEqual(["platform_ops"]);
    expect(alice.deletedAt).toBeUndefined();
    expect(alice.deletedBy).toBeUndefined();
  });

  it("requires at least one known role to restore, and only deleted users", () => {
    expect(restoreUser("alice", ["content_viewer"]).ok).toBe(false);
    softDeleteUser("alice");
    expect(restoreUser("alice", []).ok).toBe(false);
    expect(restoreUser("alice", ["nope"]).ok).toBe(false);
  });

  it("refuses to rename deleted users", () => {
    softDeleteUser("alice");
    expect(renameUser("alice", "alice2").ok).toBe(false);
  });

  it("keeps one Previously Deleted pending entry and refreshes lastAttemptAt", () => {
    softDeleteUser("alice", "admin");
    const first = recordDeletedUserSignInAttempt("alice");
    const second = recordDeletedUserSignInAttempt("alice");
    const pending = getPendingUsers();
    expect(pending).toHaveLength(1);
    expect(pending[0].role).toBeUndefined();
    expect(pending[0].previouslyDeleted).toMatchObject({ username: "alice", staffId: "alice", deletedBy: "admin" });
    expect(second!.createdAt).toBe(first!.createdAt);
    expect(second!.lastAttemptAt).toBeTruthy();
  });

  it("restoring removes the Previously Deleted pending entry", () => {
    softDeleteUser("alice");
    recordDeletedUserSignInAttempt("alice");
    restoreUser("alice", ["content_viewer"]);
    expect(getPendingUsers()).toHaveLength(0);
  });

  it("does not count deleted users toward user management", () => {
    expect(countActiveUsersWithCapability("users_manage")).toBe(1);
    expect(countActiveUsersWithCapability("users_manage", "admin")).toBe(0);
  });
});

describe("adding people who already exist", () => {
  beforeEach(() => {
    _setUsersStateForTests({
      users: {
        alice: user({ username: "alice", email: "alice@example.com", roles: ["content_viewer"] }),
        bob: user({ username: "bob", email: "bob@example.com", deletedAt: "2026-01-01T00:00:00.000Z" }),
      },
    });
  });

  it("blocks an email that belongs to an active user", () => {
    const result = addPendingUser("Alice@Example.com", "content_viewer");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("user_exists");
  });

  it("points to restore for an email that belongs to a deleted user", () => {
    const result = addPendingUser("bob@example.com", "content_viewer");
    expect(result.ok).toBe(false);
    if (!result.ok && result.code === "user_previously_deleted") {
      expect(result.user.username).toBe("bob");
    } else {
      throw new Error("expected user_previously_deleted");
    }
  });

  it("allows a brand-new email", () => {
    expect(addPendingUser("carol@example.com", "content_viewer").ok).toBe(true);
  });
});

describe("duplicates", () => {
  beforeEach(() => {
    _setUsersStateForTests({
      users: {
        "alice@example.com": user({
          username: "alice@example.com",
          id: "alice-old",
          email: "alice@example.com",
          roles: ["content_viewer", "ads_manager"],
          lastLoginAt: "2025-01-01T00:00:00.000Z",
        }),
        alice: user({
          username: "alice",
          id: "alice",
          email: "alice@example.com",
          roles: ["content_viewer"],
          lastLoginAt: "2026-06-01T00:00:00.000Z",
          identities: [{ provider: "github", providerUserId: "1" }],
        }),
        alicegh: user({
          username: "alicegh",
          id: "alice-gh",
          roles: ["content_viewer"],
          lastLoginAt: "2026-01-01T00:00:00.000Z",
          identities: [{ provider: "github", providerUserId: "1" }],
        }),
        ghost: user({ username: "ghost", email: "alice@example.com", deletedAt: "2026-01-01" }),
        bob: user({ username: "bob", email: "bob@example.com" }),
      },
    });
  });

  it("matches on email or identity, ignores deleted records, newest sign-in first", () => {
    expect(findActiveDuplicates("alice@example.com").map((d) => d.key)).toEqual(["alice"]);
    expect(findActiveDuplicates("alice").map((d) => d.key)).toEqual(["alicegh", "alice@example.com"]);
    expect(findActiveDuplicates("bob")).toEqual([]);
  });

  it("removes only that key, aliases its staff id, and reports roles lost", () => {
    const result = hardDeleteDuplicate("alice@example.com", "alice");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rolesLost).toEqual(["ads_manager"]);
    expect(getUser("alice@example.com")).toBeNull();
    expect(getUser("alice")?.roles).toEqual(["content_viewer"]);
    expect(getUserByStaffId("alice-old")?.username).toBe("alice");
  });

  it("resolves history through two hops and re-points chains", () => {
    hardDeleteDuplicate("alice@example.com", "alicegh");
    hardDeleteDuplicate("alicegh", "alice");
    expect(getUserByStaffId("alice-old")?.username).toBe("alice");
    expect(getUserByStaffId("alice-gh")?.username).toBe("alice");
  });
});
