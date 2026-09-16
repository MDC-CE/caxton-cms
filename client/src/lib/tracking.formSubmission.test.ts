import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { trackFormSubmission } from "./tracking";

describe("trackFormSubmission extras", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { dataLayer: [] as Record<string, unknown>[] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps known fields and merges scalar extras", async () => {
    await trackFormSubmission("event_order", {
      email: "A@B.com",
      first_name: "Ada",
      program: "ai",
      event_id: "99",
      event_slug: "ai-lab",
    });
    const pushes = (window as unknown as { dataLayer: Record<string, unknown>[] })
      .dataLayer;
    const last = pushes[pushes.length - 1];
    expect(last.event).toBe("event_order");
    expect(last.email).toBe("a@b.com");
    expect(typeof last.email_hash).toBe("string");
    expect(last.first_name).toBe("Ada");
    expect(last.program).toBe("ai");
    expect(last.event_id).toBe("99");
    expect(last.event_slug).toBe("ai-lab");
  });

  it("merges numeric extras like event_id from resolveDeep", async () => {
    await trackFormSubmission("event_order", {
      email: "a@b.com",
      event_id: 2537,
    });
    const pushes = (window as unknown as { dataLayer: Record<string, unknown>[] })
      .dataLayer;
    const last = pushes[pushes.length - 1];
    expect(last.event_id).toBe(2537);
  });
});
