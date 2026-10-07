/**
 * Staff user delete orchestration (Security → Users).
 *
 * - Only record for a person → soft delete (history kept, roles cleared).
 * - One of several duplicate records → permanent removal of that key; its staff id
 *   is aliased to the most recently signed-in duplicate.
 * - Every delete revokes staff sessions, the saved GitHub connection, and agent (MCP) access.
 */
import * as userStore from "./user-store";
import { revokeAllStaffSessions } from "./staff-session";
import { deleteUserGitHubToken } from "./github-user-tokens";
import { child } from "./logger";

const log = child({ module: "staff-user-deletion" });

const MCP_REVOKE_TIMEOUT_MS = 3_000;

export interface DuplicatePreview {
  survivor: { username: string; displayName: string };
  rolesLost: string[];
}

/** What deleting `username` would do if it has active duplicates (null = soft delete). */
export function getDuplicatePreview(username: string): DuplicatePreview | null {
  const [survivor] = userStore.findActiveDuplicates(username);
  if (!survivor) return null;
  return {
    survivor: {
      username: survivor.key,
      displayName: userStore.formatStaffDisplayName(survivor.user),
    },
    rolesLost: userStore.rolesMissingOnSurvivor(username, survivor.key),
  };
}

/** Ask the MCP server (loopback) to drop the user's agent tokens. Best effort. */
export async function revokeAgentAccess(username: string): Promise<boolean> {
  const secret = process.env.MCP_SERVER_SECRET || process.env.MCP_API_KEY || "";
  if (!secret) return false;
  const port = process.env.MCP_PORT || "3001";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_REVOKE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/internal/revoke-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ username }),
      signal: controller.signal,
    });
    return res.ok;
  } catch (err) {
    log.warn({ err, username }, "[staff-user-deletion] MCP revoke failed");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type DeleteStaffUserResult =
  | {
      ok: true;
      mode: "soft_deleted";
      agentsDisconnected: boolean;
    }
  | {
      ok: true;
      mode: "duplicate_removed";
      survivor: { username: string; displayName: string };
      rolesLost: string[];
      agentsDisconnected: boolean;
    }
  | { ok: false; status: 403 | 404 | 409; error: string };

export async function deleteStaffUser(input: {
  username: string;
  actorUsername?: string | null;
}): Promise<DeleteStaffUserResult> {
  const { username, actorUsername } = input;
  const user = userStore.getUser(username);
  if (!user) return { ok: false, status: 404, error: "User not found" };
  if (user.deletedAt) return { ok: false, status: 409, error: "User is already deleted" };
  if (actorUsername && actorUsername === username) {
    return { ok: false, status: 403, error: "You cannot delete your own account" };
  }

  const isManager = userStore
    .getEffectiveCapabilities(username)
    .some((g) => g.name === "users_manage");
  if (isManager && userStore.countActiveUsersWithCapability("users_manage", username) === 0) {
    return {
      ok: false,
      status: 409,
      error: "At least one user must keep user-management access. Give someone else that access first.",
    };
  }

  const preview = getDuplicatePreview(username);
  let result: DeleteStaffUserResult;
  if (preview) {
    const removed = userStore.hardDeleteDuplicate(username, preview.survivor.username);
    if (!removed.ok) return { ok: false, status: 409, error: removed.error };
    result = {
      ok: true,
      mode: "duplicate_removed",
      survivor: preview.survivor,
      rolesLost: removed.rolesLost,
      agentsDisconnected: false,
    };
  } else {
    const soft = userStore.softDeleteUser(username, actorUsername ?? undefined);
    if (!soft.ok) return { ok: false, status: 409, error: soft.error };
    result = { ok: true, mode: "soft_deleted", agentsDisconnected: false };
  }

  await revokeAllStaffSessions(username);
  try {
    await deleteUserGitHubToken(username);
  } catch (err) {
    log.warn({ err, username }, "[staff-user-deletion] GitHub token delete failed");
  }
  result.agentsDisconnected = await revokeAgentAccess(username);
  return result;
}
