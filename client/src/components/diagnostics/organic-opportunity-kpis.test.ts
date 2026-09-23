import { describe, expect, it } from "vitest";
import {
  PAGE2_TARGET_CTR,
  summarizeDecay,
  summarizeLinkGaps,
  summarizeLowCtr,
  summarizePage2,
} from "./organic-opportunity-kpis";

describe("summarizeLowCtr", () => {
  it("returns empty subline when no rows", () => {
    expect(summarizeLowCtr([])).toEqual({
      kind: "low_ctr",
      count: 0,
      impact: 0,
      subline: "No listings to fix in this window.",
    });
  });

  it("sums impressions × gap and builds actionable subline", () => {
    const s = summarizeLowCtr([
      { impressions: 1000, gap: 0.05 },
      { impressions: 200, gap: 0.1 },
    ]);
    expect(s.count).toBe(2);
    expect(s.impact).toBe(70); // 50 + 20
    expect(s.subline).toBe("Rewrite 2 titles → ~70 more clicks / 7d");
  });
});

describe("summarizePage2", () => {
  it("returns empty subline when no rows", () => {
    expect(summarizePage2([])).toEqual({
      kind: "page2",
      count: 0,
      impact: 0,
      subline: "No listings to fix in this window.",
    });
  });

  it("estimates lift vs PAGE2_TARGET_CTR and clamps negative", () => {
    expect(PAGE2_TARGET_CTR).toBe(0.035);
    const s = summarizePage2([
      { impressions: 1000, ctr: 0.015 }, // +0.02 → 20
      { impressions: 500, ctr: 0.05 }, // max(0, -0.015) → 0
    ]);
    expect(s.count).toBe(2);
    expect(s.impact).toBe(20);
    expect(s.subline).toBe("Push 2 queries to page 1 → ~20 more clicks / 7d");
  });
});

describe("summarizeDecay", () => {
  it("returns empty subline when no rows", () => {
    expect(summarizeDecay([])).toEqual({
      kind: "decay",
      count: 0,
      impact: 0,
      subline: "No decaying pages in this window.",
    });
  });

  it("sums click_drop", () => {
    const s = summarizeDecay([{ click_drop: 40 }, { click_drop: 12.4 }]);
    expect(s.count).toBe(2);
    expect(s.impact).toBe(52);
    expect(s.subline).toBe("Refresh 2 pages → stop losing ~52 clicks");
  });
});

describe("summarizeLinkGaps", () => {
  it("returns empty subline when no rows", () => {
    expect(summarizeLinkGaps([])).toEqual({
      kind: "link_gaps",
      count: 0,
      impact: 0,
      subline: "No link-gap pages in this window.",
    });
  });

  it("sums impressions without inventing click lift", () => {
    const s = summarizeLinkGaps([{ impressions: 1200 }, { impressions: 300 }]);
    expect(s.count).toBe(2);
    expect(s.impact).toBe(1500);
    expect(s.subline).toBe("Add links to 2 pages ranking with 1,500 impressions");
  });
});
