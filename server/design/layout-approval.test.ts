import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseInsightsReview, resolveApproval, surgicalReplaceInsightsReview } from "./layout-approval";

const DAY = 86_400_000;
const now = Date.parse("2026-10-01T00:00:00Z");

describe("resolveApproval", () => {
  const review = { status: "approved" as const, fingerprint: "fp1", by: "ana", at: "2026-09-01" };

  it("explicit approval x2 while the structure matches, stale after a structural change", () => {
    expect(resolveApproval({ review, fingerprint: "fp1", now })).toMatchObject({ state: "approved", factor: 2 });
    expect(resolveApproval({ review, fingerprint: "fp2", now })).toMatchObject({ state: "stale", factor: 1 });
  });

  it("rejected x0 for the same structure; a new structure is neutral again", () => {
    const rejected = { ...review, status: "rejected" as const };
    expect(resolveApproval({ review: rejected, fingerprint: "fp1", now })).toMatchObject({ state: "rejected", factor: 0 });
    expect(resolveApproval({ review: rejected, fingerprint: "fp2", now })).toMatchObject({ state: "none", factor: 1 });
  });

  it("implicit x1.2 after 30 unchanged days unless an agent published it", () => {
    const old = new Date(now - 31 * DAY).toISOString();
    const recent = new Date(now - 5 * DAY).toISOString();
    expect(resolveApproval({ review: null, fingerprint: "fp", ledger: { fingerprint: "fp", since: old }, now })).toMatchObject({
      state: "implicit",
      factor: 1.2,
    });
    expect(resolveApproval({ review: null, fingerprint: "fp", ledger: { fingerprint: "fp", since: recent }, now }).state).toBe("none");
    expect(
      resolveApproval({
        review: null,
        fingerprint: "fp",
        ledger: { fingerprint: "fp", since: old, published_by_agent: true },
        now,
      }).state,
    ).toBe("none");
  });
});

describe("insights_review YAML", () => {
  it("parses only valid reviews", () => {
    expect(parseInsightsReview({ status: "approved", fingerprint: "x", by: "a", at: "t" })?.status).toBe("approved");
    expect(parseInsightsReview({ status: "maybe", fingerprint: "x" })).toBeNull();
    expect(parseInsightsReview({ status: "approved" })).toBeNull();
  });

  it("inserts, replaces and removes without touching other keys", () => {
    const base = "# comment\ninsights_intent: bootcamp\nfunnel:\n  stage: decision\n";
    const review = { status: "approved" as const, fingerprint: "abc", by: "ana", at: "2026-10-01T00:00:00.000Z" };
    const inserted = surgicalReplaceInsightsReview(base, review);
    expect(inserted.startsWith(base)).toBe(true);
    expect((yaml.load(inserted) as Record<string, unknown>).insights_review).toMatchObject({ fingerprint: "abc" });

    const replaced = surgicalReplaceInsightsReview(inserted, { ...review, status: "rejected", fingerprint: "def" });
    const parsed = yaml.load(replaced) as Record<string, unknown>;
    expect(parsed.insights_review).toMatchObject({ status: "rejected", fingerprint: "def" });
    expect(parsed.funnel).toEqual({ stage: "decision" });
    expect(replaced).toContain("# comment");

    expect(surgicalReplaceInsightsReview(replaced, null)).toBe(base);
    expect(surgicalReplaceInsightsReview("{}\n", review).startsWith("insights_review:")).toBe(true);
  });
});
