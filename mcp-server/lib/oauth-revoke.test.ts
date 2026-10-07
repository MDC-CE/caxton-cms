import { describe, expect, it, vi } from "vitest";

vi.mock("fs", () => {
  const m = {
    existsSync: () => false,
    readFileSync: () => "{}",
    writeFileSync: () => undefined,
    mkdirSync: () => undefined,
  };
  return { default: m, ...m };
});

vi.mock("./gcs-store.js", () => ({
  encryptedWrite: vi.fn().mockResolvedValue(undefined),
  encryptedRead: vi.fn().mockResolvedValue(null),
  isGcsAvailable: () => false,
}));

import {
  exchangeCode,
  generateCode,
  getCachedBreathecodeUsername,
  registerBreathecodeToken,
  registerClient,
  revokeMcpAccessForUser,
  updateClientStaffUser,
  validateToken,
} from "./oauth";
import { isInternalRequestAuthorized } from "./internal-auth";

function issueTokenFor(username: string): string {
  const redirect = "https://client.example/callback";
  const { clientId, clientSecret } = registerClient(`client-${username}`, [redirect]);
  updateClientStaffUser(clientId, "First", "Last", username);
  const code = generateCode(clientId, redirect);
  const token = exchangeCode(code, clientId, clientSecret, redirect);
  if (!token) throw new Error("token exchange failed");
  return token;
}

describe("revokeMcpAccessForUser", () => {
  it("drops only that user's agent tokens and cached session entries", () => {
    const aliceToken = issueTokenFor("alice");
    const bobToken = issueTokenFor("bob");
    registerBreathecodeToken("alice-session", "alice");
    registerBreathecodeToken("bob-session", "bob");

    const result = revokeMcpAccessForUser("alice");

    expect(result).toEqual({ accessTokensRevoked: 1, cachedTokensRevoked: 1 });
    expect(validateToken(aliceToken)).toBe(false);
    expect(getCachedBreathecodeUsername("alice-session")).toBeNull();
    expect(validateToken(bobToken)).toBe(true);
    expect(getCachedBreathecodeUsername("bob-session")).toBe("bob");
  });

  it("is a no-op for an empty username", () => {
    expect(revokeMcpAccessForUser("  ")).toEqual({ accessTokensRevoked: 0, cachedTokensRevoked: 0 });
  });
});

describe("isInternalRequestAuthorized", () => {
  const base = { remoteAddress: "127.0.0.1", authorization: "Bearer s3cret", serverSecret: "s3cret" };

  it("accepts a loopback caller with the server secret", () => {
    expect(isInternalRequestAuthorized(base)).toBe(true);
    expect(isInternalRequestAuthorized({ ...base, remoteAddress: "::ffff:127.0.0.1" })).toBe(true);
  });

  it("rejects a missing or wrong secret", () => {
    expect(isInternalRequestAuthorized({ ...base, authorization: undefined })).toBe(false);
    expect(isInternalRequestAuthorized({ ...base, authorization: "Bearer nope" })).toBe(false);
    expect(isInternalRequestAuthorized({ ...base, serverSecret: "" , authorization: "Bearer " })).toBe(false);
  });

  it("rejects non-loopback callers even with the secret", () => {
    expect(isInternalRequestAuthorized({ ...base, remoteAddress: "10.0.0.5" })).toBe(false);
  });
});
