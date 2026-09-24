import { describe, expect, it } from "vitest";
import {
  ideaFunnelComplete,
  ideaFunnelsEqual,
  ideaRequiresStructuredFunnel,
  looksLikeNewUrlPitch,
  parseIdeaFunnel,
  validateIdeaFunnel,
  IDEA_FUNNEL_ALL_STAGE,
  IDEA_FUNNEL_INCOMPLETE,
  funnelFromFieldOps,
} from "./idea-funnel";

describe("idea-funnel", () => {
  it("parses and validates awareness + all", () => {
    const v = validateIdeaFunnel({ stage: "awareness", products: "all" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.funnel.stage).toBe("awareness");
      expect(v.funnel.products).toBe("all");
    }
  });

  it("rejects all outside awareness", () => {
    const v = validateIdeaFunnel({ stage: "consideration", products: "all" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe(IDEA_FUNNEL_ALL_STAGE);
  });

  it("requires named products for later stages", () => {
    const v = validateIdeaFunnel({
      stage: "decision",
      products: [{ product: "full-stack" }],
    });
    expect(v.ok).toBe(true);
    const empty = validateIdeaFunnel({ stage: "decision", products: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe(IDEA_FUNNEL_INCOMPLETE);
  });

  it("detects new-URL pitch and requires funnel for missing related", () => {
    expect(looksLikeNewUrlPitch("New article on AI", "We should create a page")).toBe(true);
    expect(
      ideaRequiresStructuredFunnel({
        title: "x",
        summary: "refresh the existing hub copy",
        related_entries: [{ contentType: "blog", slug: "hub", existence: "exists" }],
      }),
    ).toBe(false);
    expect(
      ideaRequiresStructuredFunnel({
        title: "New blog post",
        summary: "Create a page about Grok",
        related_entries: [{ contentType: "blog", slug: "what-is-grok", existence: "missing" }],
      }),
    ).toBe(true);
    expect(
      ideaRequiresStructuredFunnel({
        accepted_entry: {
          contentType: "blog",
          slug: "x",
          locale: "en",
          existence: "exists",
        },
      }),
    ).toBe(false);
  });

  it("compares funnels and reads field ops", () => {
    const a = parseIdeaFunnel({ stage: "awareness", products: "all" })!;
    const b = parseIdeaFunnel({ stage: "awareness", products: "all" })!;
    expect(ideaFunnelsEqual(a, b)).toBe(true);
    expect(ideaFunnelComplete(a)).toBe(true);
    const fromOps = funnelFromFieldOps([
      { field_path: "funnel.stage", value: "consideration" },
      { field_path: "funnel.products", value: [{ product: "full-stack" }] },
    ]);
    expect(fromOps?.stage).toBe("consideration");
  });
});
