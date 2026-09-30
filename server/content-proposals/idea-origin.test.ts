import { describe, it, expect } from "vitest";
import { agentOptOutAllowed, isSeoClusterOptOutOp, SEO_OPTOUT_IDEA_BORN } from "./idea-origin";

const REASON = "Release-week news; traffic is gone in ten days and no hub fits it.";

describe("idea-born opt-out helpers", () => {
  it("only an explicit pillar_path: null counts as opt-out", () => {
    expect(isSeoClusterOptOutOp({ field_path: "seo.pillar_path", value: null })).toBe(true);
    expect(isSeoClusterOptOutOp({ field_path: "seo.pillar_path", value: "/en/hub" })).toBe(false);
    expect(isSeoClusterOptOutOp({ field_path: "seo.pillar_path", value: null, reset: true })).toBe(false);
    expect(isSeoClusterOptOutOp({ field_path: "seo.main_keyword", value: null })).toBe(false);
  });

  it("allows news / broken-URL ideas with a reason; refuses everything else", () => {
    const news = { id: "i1", title: "T", demand_label: "fast_decay_news", locale: "en" };
    expect(agentOptOutAllowed(news, REASON).ok).toBe(true);
    expect(agentOptOutAllowed(news, "short").ok).toBe(false);
    const evergreen = { ...news, demand_label: "existing_demand" };
    const r = agentOptOutAllowed(evergreen, REASON);
    expect(!r.ok && r.code).toBe(SEO_OPTOUT_IDEA_BORN);
    if (!r.ok) expect(r.details.origin_idea_id).toBe("i1");
  });
});
