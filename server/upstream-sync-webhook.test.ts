import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { decideUpstreamSync, handleUpstreamSyncWebhook } from "./upstream-sync-webhook";

function sign(payload: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("decideUpstreamSync", () => {
  const secret = "test-secret";
  const payload = JSON.stringify({
    ref: "refs/heads/main",
    repository: { full_name: "breatheco-de/caxton-cms" },
  });

  it("rejects a missing secret before checking the signature", () => {
    const result = decideUpstreamSync({
      event: "push",
      signature: sign(payload, secret),
      payload,
      body: JSON.parse(payload),
      secret: "",
    });
    expect(result).toEqual({ status: 503, body: { error: "Upstream sync webhook is not configured" } });
  });

  it("rejects a bad signature", () => {
    const result = decideUpstreamSync({
      event: "ping",
      signature: "sha256=00",
      payload: "{}",
      body: {},
      secret,
    });
    expect(result.status).toBe(401);
  });

  it("answers ping and ignores other repos", () => {
    expect(
      decideUpstreamSync({
        event: "ping",
        signature: sign("{}", secret),
        payload: "{}",
        body: {},
        secret,
      }),
    ).toEqual({ status: 200, body: { ok: true, message: "pong" } });

    const other = JSON.stringify({
      ref: "refs/heads/main",
      repository: { full_name: "breatheco-de/website-v3" },
    });
    expect(
      decideUpstreamSync({
        event: "push",
        signature: sign(other, secret),
        payload: other,
        body: JSON.parse(other),
        secret,
      }),
    ).toEqual({ status: 200, body: { ok: true, message: "Ignored push" } });
  });

  it("dispatches only a signed main push and starts the workflow", async () => {
    expect(
      decideUpstreamSync({
        event: "push",
        signature: sign(payload, secret),
        payload,
        body: JSON.parse(payload),
        secret,
      }),
    ).toEqual({ dispatch: true });

    const calls: string[] = [];
    const result = await handleUpstreamSyncWebhook({
      event: "push",
      signature: sign(payload, secret),
      payload,
      body: JSON.parse(payload),
      secret,
      dispatchToken: "token",
      dispatch: async (token) => {
        calls.push(token);
      },
    });
    expect(result).toEqual({ status: 200, body: { ok: true, message: "Sync started" } });
    expect(calls).toEqual(["token"]);
  });
});
