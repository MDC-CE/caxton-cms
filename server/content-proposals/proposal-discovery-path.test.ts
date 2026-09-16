import { describe, expect, it } from "vitest";
import { TOOL_GATES } from "../../shared/mcp-tool-catalog.js";
import {
  buildProposalDiscoveryPath,
  proposalDiscoveryToolNames,
} from "./proposal-discovery-path.js";

const catalog = new Set(Object.keys(TOOL_GATES));

function assertCatalogToolNames(
  toolNames: string[],
  catalogNames: ReadonlySet<string>,
): { ok: true } | { ok: false; unknown: string[] } {
  const unknown = [...new Set(toolNames.filter((t) => !catalogNames.has(t)))];
  return unknown.length === 0 ? { ok: true } : { ok: false, unknown };
}

const baseEdits = {
  id: "p1",
  status: "open",
  kind: "edits",
  title: "Fix CTA",
  summary: "Update the primary CTA copy on the landing page to match the offer.",
  open_blocker_count: 0,
  entries: [
    { contentType: "landing", slug: "ai-course", locale: "en", status: "pending" },
    { contentType: "landing", slug: "ai-course", locale: "es", status: "pending" },
  ],
};

describe("buildProposalDiscoveryPath", () => {
  it("returns think-only path and warning when escalated", () => {
    const { discovery_path, warnings } = buildProposalDiscoveryPath({
      proposal: {
        ...baseEdits,
        escalated: true,
        escalated_note: "Agent invented a blocker that invents product claims we do not make.",
      },
      allowedTools: catalog,
    });
    expect(discovery_path?.items).toHaveLength(1);
    expect(discovery_path?.items[0]).toMatchObject({ kind: "think", id: "steward_hold" });
    expect(warnings.some((w) => w.code === "proposal_escalated")).toBe(true);
  });

  it("returns null for finished/rejected/withdrawn", () => {
    for (const status of ["finished", "rejected", "withdrawn"] as const) {
      const { discovery_path } = buildProposalDiscoveryPath({
        proposal: { ...baseEdits, status },
        allowedTools: catalog,
      });
      expect(discovery_path).toBeNull();
    }
  });

  it("builds edits path with think-before-tools and ≤6 thinks", () => {
    const { discovery_path, warnings } = buildProposalDiscoveryPath({
      proposal: baseEdits,
      allowedTools: catalog,
      reviewContext: {
        summary: "Selling page edit",
        damage_class: "selling_page",
        agent_preview: {
          think_items: [
            {
              id: "selling_page_figures",
              title: "Verify figures",
              why: "Selling page",
              look_for: ["hire rate"],
            },
            {
              id: "adjacent_findings",
              title: "Park out-of-scope live-page defects",
              why: "Park debt",
              look_for: ["same entry, ops do not touch → notes"],
            },
            {
              id: "disposition",
              title: "Choose a disposition",
              why: "Decide",
              look_for: ["apply only when you would ship"],
            },
          ],
        },
      },
    });
    expect(discovery_path).not.toBeNull();
    const items = discovery_path!.items;
    const thinks = items.filter((i) => i.kind === "think");
    const tools = items.filter((i) => i.kind === "tool");
    expect(thinks.length).toBeGreaterThan(0);
    expect(thinks.length).toBeLessThanOrEqual(6);
    // core 4 + organic + funnel analytics (selling_page) = 6; not the full catalog union
    expect(tools.length).toBe(6);
    const toolIds = tools.map((t) => (t.kind === "tool" ? t.id : ""));
    expect(toolIds).toContain("traffic_risk");
    expect(toolIds).toContain("journey_metrics");
    expect(toolIds).not.toContain("site_ga");
    const firstToolIdx = items.findIndex((i) => i.kind === "tool");
    const lastThinkIdx = items.map((i) => i.kind).lastIndexOf("think");
    expect(lastThinkIdx).toBeLessThan(firstToolIdx);
    expect(tools.every((t) => t.kind === "tool" && t.available)).toBe(true);
    expect(warnings).toEqual([]);

    const figures = thinks.find((t) => t.id === "selling_page_figures");
    expect(figures?.kind).toBe("think");
    const adjacent = thinks.find((t) => t.id === "adjacent_findings");
    expect(adjacent?.kind).toBe("think");

    const toolNames = tools.map((t) => (t.kind === "tool" ? t.tool : "")).filter(Boolean);
    expect(assertCatalogToolNames(toolNames, catalog)).toEqual({ ok: true });

    const previewContent = tools.find((t) => t.kind === "tool" && t.id === "preview_content");
    expect(previewContent?.kind).toBe("tool");
    if (previewContent?.kind === "tool") {
      expect(previewContent.look_for.some((l) => /adjacent_findings|notes/i.test(l))).toBe(true);
      expect(previewContent.look_for.some((l) => /not default add_blocker/i.test(l))).toBe(true);
    }
  });

  it("marks tools unavailable and warns when grants are thin", () => {
    const { discovery_path, warnings } = buildProposalDiscoveryPath({
      proposal: baseEdits,
      allowedTools: new Set(["get_entry_content", "get_entry_activity"]),
    });
    expect(discovery_path).not.toBeNull();
    const tools = discovery_path!.items.filter((i) => i.kind === "tool");
    const capped = tools.filter((t) => t.kind === "tool" && !t.available);
    expect(capped.length).toBeGreaterThan(0);
    expect(capped.every((t) => t.kind === "tool" && t.hint)).toBe(true);
    expect(warnings.some((w) => w.code === "discovery_tool_capped")).toBe(true);
    // think items still present
    expect(discovery_path!.items.some((i) => i.kind === "think")).toBe(true);
  });

  it("passes adjacent_findings think items from agent_preview", () => {
    const { discovery_path } = buildProposalDiscoveryPath({
      proposal: baseEdits,
      allowedTools: catalog,
      reviewContext: {
        agent_preview: {
          think_items: [
            {
              id: "adjacent_findings",
              title: "Park out-of-scope live-page defects",
              why: "Park",
              look_for: ["other entry → notes"],
            },
            {
              id: "verify_copy",
              title: "Check copy",
              why: "Verify",
              look_for: ["proposed value vs live"],
            },
          ],
        },
      },
    });
    const adjacent = discovery_path!.items.find(
      (i) => i.kind === "think" && i.id === "adjacent_findings",
    );
    expect(adjacent?.kind).toBe("think");
  });

  it("uses agent_preview think items when provided", () => {
    const { discovery_path } = buildProposalDiscoveryPath({
      proposal: baseEdits,
      allowedTools: catalog,
      reviewContext: {
        agent_preview: {
          think_items: [
            {
              id: "verify_copy",
              title: "Check copy",
              why: "Verify",
              look_for: ["proposed vs live"],
            },
          ],
        },
      },
    });
    const verify = discovery_path!.items.find((i) => i.kind === "think" && i.id === "verify_copy");
    expect(verify?.kind).toBe("think");
  });

  it("builds idea path without apply-research tools", () => {
    const { discovery_path, warnings } = buildProposalDiscoveryPath({
      proposal: {
        id: "i1",
        status: "open",
        kind: "idea",
        summary: "We should write a new spoke about X with a clear funnel CTA.",
      },
      allowedTools: catalog,
    });
    expect(discovery_path).not.toBeNull();
    expect(discovery_path!.items.every((i) => i.kind === "think")).toBe(true);
    expect(warnings).toEqual([]);
    expect(discovery_path!.goal.toLowerCase()).toMatch(/accept/);
  });

  it("builds short notes path without apply-research tools", () => {
    const { discovery_path, warnings } = buildProposalDiscoveryPath({
      proposal: {
        id: "n1",
        status: "partial",
        kind: "notes",
        summary: "Tried X and Y; need human decision on Z.",
      },
      allowedTools: new Set(),
    });
    expect(discovery_path).not.toBeNull();
    expect(discovery_path!.items.every((i) => i.kind === "think")).toBe(true);
    expect(discovery_path!.items.length).toBeLessThanOrEqual(5);
    expect(warnings).toEqual([]);
    expect(discovery_path!.goal.toLowerCase()).toMatch(/close/);
  });

  it("edits discovery tools are all catalog members", () => {
    expect(assertCatalogToolNames(proposalDiscoveryToolNames(), catalog)).toEqual({ ok: true });
  });

  it("caps traffic tools: existing_content gets organic + site GA, not funnel analytics", () => {
    const { discovery_path } = buildProposalDiscoveryPath({
      proposal: baseEdits,
      allowedTools: catalog,
      reviewContext: { damage_class: "existing_content" },
    });
    const tools = discovery_path!.items.filter((i) => i.kind === "tool");
    const ids = tools.map((t) => (t.kind === "tool" ? t.id : ""));
    expect(ids).toContain("traffic_risk");
    expect(ids).toContain("site_ga");
    expect(ids).not.toContain("journey_metrics");
    const siteGa = tools.find((t) => t.kind === "tool" && t.id === "site_ga");
    expect(siteGa?.kind).toBe("tool");
    if (siteGa?.kind === "tool") {
      expect(siteGa.args_hint).toMatchObject({
        report: "page_detail",
        content_type: "landing",
        slug: "ai-course",
      });
    }
  });

  it("funnel field ops prefer journey metrics over site GA", () => {
    const { discovery_path } = buildProposalDiscoveryPath({
      proposal: {
        ...baseEdits,
        entries: [
          {
            contentType: "landing",
            slug: "ai-course",
            locale: "en",
            status: "pending",
            ops: [{ field_path: "funnel.stage" }],
          },
        ],
      },
      allowedTools: catalog,
      reviewContext: { damage_class: "existing_content" },
    });
    const ids = discovery_path!.items
      .filter((i) => i.kind === "tool")
      .map((t) => (t.kind === "tool" ? t.id : ""));
    expect(ids).toContain("journey_metrics");
    expect(ids).not.toContain("site_ga");
  });
});

describe("assertCatalogToolNames", () => {
  it("flags unknown tools", () => {
    expect(assertCatalogToolNames(["get_entry_content", "validate_content"], catalog)).toEqual({
      ok: false,
      unknown: ["validate_content"],
    });
  });
});
