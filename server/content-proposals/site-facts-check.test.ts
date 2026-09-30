import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { clearSiteSqliteCacheForTests, getSiteSqlite } from "../db";
import { ensurePipelineDb, resetPipelineDbCache } from "../pipeline-db/runner";
import { setDecisionClientForTests, type DecisionClient, type DecideRequest } from "../ai/decisions";
import { readDecisionHealth } from "../ai/decisions/health";
import { createProposalService, type ProposalEntryInput } from "./service";

const SITE = `site_site-facts-test-${Date.now()}`;

function rmSite(): void {
  const dir = path.join("data", SITE.replace(/\//g, "-"));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

const alice = { username: "alice", actor: { type: "mcp" as const, role: "copy_editor", model: "m", client: "c" } };

function makeService() {
  const live: Record<string, unknown> = { "call_to_action.title": "Old title" };
  return createProposalService({
    site: SITE,
    issueExists: () => true,
    captureBaseline: (entry) => {
      const values: Record<string, unknown> = {};
      for (const u of entry.updates) values[u.field_path] = live[u.field_path];
      return { values };
    },
    applyUpdates: async () => ({ ok: true }),
  });
}

function entry(value: string): ProposalEntryInput {
  return {
    contentType: "blog",
    slug: "hello",
    locale: "en",
    updates: [{ field_path: "call_to_action.title", value }],
  };
}

type StubCall = DecideRequest;

function siteFactsStub(
  answers: Record<string, number> | "unavailable",
): { client: DecisionClient; calls: StubCall[] } {
  const calls: StubCall[] = [];
  return {
    calls,
    client: {
      async decide(req) {
        const state = req.state as { decision_id?: string };
        if (state.decision_id === "proposal.touches_site_facts") calls.push(req);
        if (answers === "unavailable") return { status: "unavailable", reason: "timeout" };
        if (state.decision_id !== "proposal.touches_site_facts") {
          return { status: "ok", model: "jev-test", answers: { touches_outcome_figures: { noul: 0 } } };
        }
        return {
          status: "ok",
          model: "jev-test",
          answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { noul: v }])),
        };
      },
    },
  };
}

function storedCheck(id: string): Record<string, unknown> | null {
  const row = getSiteSqlite(SITE)
    .prepare(`SELECT site_facts_check_json, tags_json FROM content_proposals WHERE id = ?`)
    .get(id) as { site_facts_check_json: string | null } | undefined;
  return row?.site_facts_check_json ? JSON.parse(row.site_facts_check_json) : null;
}

describe("site facts Jev check (classifyLive)", () => {
  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
    ensurePipelineDb(SITE, { skipBackup: true });
  });

  afterEach(() => {
    setDecisionClientForTests(null);
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
  });

  it("asks Jev once per text hash, caches categories, and surfaces them on review_context", async () => {
    const stub = siteFactsStub({ contact: 0.9, price: 0.1 });
    setDecisionClientForTests(stub.client);
    const svc = makeService();
    const created = await svc.create(
      {
        title: "Update CTA phone",
        summary: "Change the CTA title to include our admissions phone number for callers. ".repeat(2),
        review_situations: ["body_copy_edit"],
        entries: [entry("Call admissions at (305) 555-0100")],
      },
      alice,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.review_context?.active_checklists).toContain("verify_copy");
    expect(created.review_context?.site_facts).toEqual({ outcome: "ok", categories: ["contact"] });
    expect(stub.calls).toHaveLength(1);
    expect(storedCheck(created.proposal.id)).toMatchObject({ outcome: "ok", categories: ["contact"], model: "jev-test" });

    const again = await svc.classifyLive(svc.get(created.proposal.id)!);
    expect(again?.site_facts?.categories).toEqual(["contact"]);
    expect(stub.calls).toHaveLength(1);
    expect(svc.get(created.proposal.id)!.tags).toContain("used_jev");
    expect(readDecisionHealth(SITE)).toMatchObject({ consecutive_failures: 0, model: "jev-test" });
  });

  it("re-asks when the proposed text changes", async () => {
    const stub = siteFactsStub({ contact: 0.9 });
    setDecisionClientForTests(stub.client);
    const svc = makeService();
    const created = await svc.create(
      {
        title: "Update CTA phone",
        summary: "Change the CTA title to include our admissions phone number for callers. ".repeat(2),
        review_situations: ["body_copy_edit"],
        entries: [entry("Call admissions at (305) 555-0100")],
      },
      alice,
    );
    if (!created.ok) throw new Error("create");
    const db = getSiteSqlite(SITE);
    const stored = storedCheck(created.proposal.id)!;
    db.prepare(`UPDATE content_proposals SET site_facts_check_json = ? WHERE id = ?`).run(
      JSON.stringify({ ...stored, text_hash: "stale" }),
      created.proposal.id,
    );
    await svc.classifyLive(svc.get(created.proposal.id)!);
    expect(stub.calls).toHaveLength(2);
  });

  it("unavailable: warns jev_unavailable, retries next read, counts failures for the health alert", async () => {
    const stub = siteFactsStub("unavailable");
    setDecisionClientForTests(stub.client);
    const svc = makeService();
    const created = await svc.create(
      {
        title: "Update CTA phone",
        summary: "Change the CTA title to include our admissions phone number for callers. ".repeat(2),
        review_situations: ["body_copy_edit"],
        entries: [entry("Call admissions at (305) 555-0100")],
      },
      alice,
    );
    if (!created.ok) throw new Error("create");
    expect(created.review_context?.site_facts).toEqual({ outcome: "unavailable", categories: [] });
    expect(created.review_context?.agent_preview.warnings.some((w) => w.code === "jev_unavailable")).toBe(true);

    await svc.classifyLive(svc.get(created.proposal.id)!);
    expect(stub.calls).toHaveLength(2);
    expect(svc.get(created.proposal.id)!.tags).toContain("used_jev_unavailable");
    expect(readDecisionHealth(SITE).consecutive_failures).toBeGreaterThanOrEqual(2);
  });
});
