import { describe, expect, it } from "vitest";
import {
  FUNNEL_CONFLICT_REASON,
  actorTypeLabel,
  summarizeHookFilter,
} from "./eventWebhookFilterSummary";

const group = (s: ReturnType<typeof summarizeHookFilter>, id: string) =>
  s.groups.find((g) => g.id === id);

describe("summarizeHookFilter", () => {
  it("returns no groups for a missing or empty filter", () => {
    expect(summarizeHookFilter(undefined)).toEqual({ groups: [], funnelConflict: false });
    expect(summarizeHookFilter({ locales: [], kinds: [] }).groups).toEqual([]);
  });

  it("groups include and exclude pairs per field", () => {
    const s = summarizeHookFilter({ locales: ["es", "en"], exclude_locales: ["fr"], kinds: ["idea"] });
    expect(s.groups.map((g) => g.id)).toEqual(["kinds", "locales"]);
    expect(group(s, "locales")!.rows).toEqual([
      { field: "locales", label: "Locale", include: ["es", "en"], exclude: ["fr"], format: "plain", mono: true },
    ]);
    expect(group(s, "locales")!.count).toBe(3);
    expect(group(s, "locales")!.conflicts).toEqual([]);
  });

  it("counts writer and trigger values across include and exclude lists", () => {
    const s = summarizeHookFilter({
      proposal_authors: ["alice"],
      exclude_proposal_authors: ["bob"],
      proposal_models: ["grok*"],
      proposal_actor_types: ["mcp"],
      event_clients: ["Cursor"],
      exclude_event_models: ["gpt-5"],
    });
    expect(group(s, "writer")!.count).toBe(4);
    expect(group(s, "writer")!.rows.map((r) => r.label)).toEqual(["Proposer", "Model", "Source"]);
    expect(group(s, "trigger")!.count).toBe(2);
  });

  it("flags funnel filters that can only match ideas when ideas are filtered out", () => {
    expect(summarizeHookFilter({ funnel_stages: ["awareness"], kinds: ["edits"] }).funnelConflict).toBe(true);
    const excluded = summarizeHookFilter({ funnel_products: ["full-stack"], exclude_kinds: ["idea"] });
    expect(excluded.funnelConflict).toBe(true);
    expect(group(excluded, "funnel")!.conflicts[0]).toBe(FUNNEL_CONFLICT_REASON);

    expect(summarizeHookFilter({ funnel_stages: ["awareness"], kinds: ["idea", "edits"] }).funnelConflict).toBe(false);
    expect(summarizeHookFilter({ funnel_stages: ["awareness"] }).funnelConflict).toBe(false);
    expect(summarizeHookFilter({ exclude_funnel_stages: ["decision"], kinds: ["edits"] }).funnelConflict).toBe(false);
  });

  it("flags a value both included and excluded (case-insensitive, exact only)", () => {
    const s = summarizeHookFilter({ locales: ["es"], exclude_locales: ["ES"] });
    expect(group(s, "locales")!.conflicts).toEqual([
      '"es" is both included and excluded; this hook can\'t match.',
    ]);
    const models = summarizeHookFilter({ proposal_models: ["grok*"], exclude_proposal_models: ["grok-4"] });
    expect(group(models, "writer")!.conflicts).toEqual([]);
    const stages = summarizeHookFilter({ funnel_stages: ["decision"], exclude_funnel_stages: ["decision"] });
    expect(group(stages, "funnel")!.conflicts[0]).toContain('"Decision"');
  });
});

describe("actorTypeLabel", () => {
  it("adds a plain label and keeps the stored code", () => {
    expect(actorTypeLabel("mcp")).toBe("Agent (mcp)");
    expect(actorTypeLabel("ui")).toBe("Staff UI (ui)");
    expect(actorTypeLabel("other")).toBe("other");
  });
});
