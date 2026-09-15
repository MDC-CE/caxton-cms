import { describe, expect, it } from "vitest";
import { isDenylistedWebhookHeader, sanitizeWebhookHeaders } from "./webhookHeaders";

describe("webhookHeaders", () => {
  it("denylists hop-by-hop and cookie/host headers", () => {
    expect(isDenylistedWebhookHeader("Host")).toBe(true);
    expect(isDenylistedWebhookHeader("Cookie")).toBe(true);
    expect(isDenylistedWebhookHeader("Authorization")).toBe(false);
  });

  it("sanitizeWebhookHeaders drops denylisted names", () => {
    expect(
      sanitizeWebhookHeaders({
        Authorization: "Token abc",
        Host: "evil.example",
        Cookie: "x=1",
        "X-Api-Key": "k",
      }),
    ).toEqual({
      Authorization: "Token abc",
      "X-Api-Key": "k",
    });
  });
});
