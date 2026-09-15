import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { clearSiteSqliteCacheForTests } from "../db";
import { ensurePipelineDb, resetPipelineDbCache } from "../pipeline-db/runner";
import { fingerprintEdits, fingerprintNotes } from "./fingerprint";
import {
  createProposalService,
  listOpenProposalsForVariant,
  parseProposerActorType,
  PROPOSAL_CLAIM_TTL_MS,
  toProposalSummary,
  type ProposalEntryInput,
} from "./service";

const SITE = `site_proposal-test-${Date.now()}`;

function rmSite(): void {
  const dir = path.join("data", SITE.replace(/\//g, "-"));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function sampleEntry(overrides: Partial<ProposalEntryInput> = {}): ProposalEntryInput {
  return {
    contentType: "blog",
    slug: "hello",
    locale: "es",
    updates: [{ field_path: "call_to_action.title", value: "New title" }],
    ...overrides,
  };
}

function makeService(opts?: {
  issueExists?: (id: string) => boolean;
  liveValues?: Record<string, unknown>;
  applyOk?: boolean;
  applyError?: string;
}) {
  const live = { ...(opts?.liveValues ?? { "call_to_action.title": "Old title" }) };
  return createProposalService({
    site: SITE,
    issueExists: opts?.issueExists ?? (() => true),
    captureBaseline: (entry) => {
      const values: Record<string, unknown> = {};
      for (const u of entry.updates) values[u.field_path] = live[u.field_path];
      return { values };
    },
    applyUpdates: async (entry) => {
      if (opts?.applyOk === false) return { ok: false, error: opts.applyError ?? "fail" };
      for (const u of entry.ops) {
        live[u.field_path] = u.reset ? undefined : u.value;
      }
      return { ok: true };
    },
  });
}

describe("content proposals", () => {
  beforeEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
    ensurePipelineDb(SITE, { skipBackup: true });
  });

  afterEach(() => {
    resetPipelineDbCache();
    clearSiteSqliteCacheForTests();
    rmSite();
  });

  it("fingerprints edits ignoring prose and notes by issue+summary", () => {
    const a = fingerprintEdits({
      site: "s",
      category: "content.field",
      entries: [sampleEntry()],
    });
    const b = fingerprintEdits({
      site: "s",
      category: "content.field",
      entries: [sampleEntry({ updates: [{ field_path: "call_to_action.title", value: "New title" }] })],
    });
    expect(a).toBe(b);
    const n1 = fingerprintNotes({
      site: "s",
      category: "content.field",
      relatedIssueIds: ["b", "a"],
      summary: "Tried X then Y because Z ".repeat(8),
    });
    const n2 = fingerprintNotes({
      site: "s",
      category: "content.field",
      relatedIssueIds: ["a", "b"],
      summary: "  tried x then y because z ".repeat(8),
    });
    expect(n1).toBe(n2);
  });

  it("rejects unknown issue ids", async () => {
    const svc = makeService({ issueExists: () => false });
    const res = await svc.create(
      {
        title: "Fix CTA",
        summary: "I could not complete the issue so here is the plan of what I tried and recommend next. ".repeat(2),
        related_issue_ids: ["missing"],
      },
      { username: "alice" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("unknown_issue_id");
  });

  it("returns existing open proposal on same fingerprint", async () => {
    const svc = makeService();
    const payload = {
      title: "CTA",
      summary: "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2),
      entries: [sampleEntry()],
    };
    const first = await svc.create(payload, { username: "alice" });
    const second = await svc.create(payload, { username: "bob" });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.duplicate).toBe(true);
      expect(second.proposal.id).toBe(first.proposal.id);
    }
  });

  it("blocks four-eyes apply; close allows proposer with a reason", async () => {
    const svc = makeService();
    const created = await svc.create(
      {
        title: "CTA",
        summary: "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2),
        entries: [sampleEntry()],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const self = await svc.update(created.proposal.id, "apply", { username: "alice" });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.code).toBe("four_eyes");

    const notes = await svc.create(
      {
        title: "Handoff",
        summary: "Tried updating meta then hit a permission wall; recommend setting the title from H1. ".repeat(2),
        related_issue_ids: ["abc"],
      },
      { username: "alice" },
    );
    expect(notes.ok).toBe(true);
    if (!notes.ok) return;
    expect(notes.proposal.no_auto_retry).toBe(true);
    const closeSelf = await svc.update(notes.proposal.id, "close", {
      username: "alice",
      close_reason: "wont_fix",
    });
    expect(closeSelf.ok).toBe(true);
    if (!closeSelf.ok) return;
    expect(closeSelf.proposal.status).toBe("finished");
    expect(closeSelf.proposal.close_reason).toBe("wont_fix");
  });

  it("applies remaining entries, skips done, marks stale, and rolls up partial then finished", async () => {
    const live: Record<string, unknown> = {
      "call_to_action.title": "Old A",
      "meta.page_title": "Old B",
    };
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: (entry) => {
        const values: Record<string, unknown> = {};
        for (const u of entry.updates) values[u.field_path] = live[u.field_path];
        return { values };
      },
      applyUpdates: async (entry) => {
        if (entry.slug === "b") return { ok: false, error: "boom" };
        for (const u of entry.ops) live[u.field_path] = u.value;
        return { ok: true };
      },
    });
    const created = await svc.create(
      {
        title: "Two posts",
        summary: "Align CTA and SEO title across two related blog posts in Spanish locale. ".repeat(2),
        entries: [
          sampleEntry({ slug: "a", updates: [{ field_path: "call_to_action.title", value: "New A" }] }),
          {
            contentType: "blog",
            slug: "b",
            locale: "es",
            updates: [{ field_path: "meta.page_title", value: "New B" }],
          },
        ],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.proposal.status).toBe("partial");
    expect(first.proposal.entries.find((e) => e.slug === "a")?.status).toBe("done");
    expect(first.proposal.entries.find((e) => e.slug === "b")?.status).toBe("failed");

    const svc2 = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: (entry) => {
        const values: Record<string, unknown> = {};
        for (const u of entry.updates) values[u.field_path] = live[u.field_path];
        return { values };
      },
      applyUpdates: async (entry) => {
        for (const u of entry.ops) live[u.field_path] = u.value;
        return { ok: true };
      },
    });
    const second = await svc2.update(created.proposal.id, "apply", { username: "bob" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.proposal.status).toBe("finished");
    expect(second.proposal.entries.every((e) => e.status === "done")).toBe(true);
  });

  it("marks context_stale when live diverged", async () => {
    let liveTitle = "Old title";
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: (entry) => {
        const values: Record<string, unknown> = {};
        for (const u of entry.updates) values[u.field_path] = liveTitle;
        return { values };
      },
      applyUpdates: async () => ({ ok: true }),
    });
    const created = await svc.create(
      {
        title: "CTA",
        summary: "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2),
        entries: [sampleEntry()],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    liveTitle = "Someone else changed it";
    const applied = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.proposal.entries[0]?.status).toBe("failed");
    expect(applied.proposal.entries[0]?.last_error).toMatch(/context_stale/);
  });

  it("soft-blocks similar proposals until confirm_distinct", async () => {
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: () => ({ values: { "call_to_action.title": "Old title" } }),
      applyUpdates: async () => ({ ok: true }),
      findSimilar: async () => [{ id: "other", title: "Nearby", score: 0.9 }],
    });
    const payload = {
      title: "CTA",
      summary: "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2),
      entries: [sampleEntry()],
    };
    const blocked = await svc.create(payload, { username: "alice" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("similar_proposals");
    const created = await svc.create({ ...payload, confirm_distinct: true }, { username: "alice" });
    expect(created.ok).toBe(true);
  });

  it("closes notes with reason; acknowledge alias requires same fields", async () => {
    const svc = makeService();
    const created = await svc.create(
      {
        title: "Handoff",
        summary: "Tried updating meta then hit a permission wall; recommend setting the title from H1. ".repeat(2),
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.proposal.kind).toBe("notes");
    const missing = await svc.update(created.proposal.id, "acknowledge", { username: "bob" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("close_reason_required");

    const ack = await svc.update(created.proposal.id, "acknowledge", {
      username: "bob",
      close_reason: "fixed_elsewhere",
      close_note: "Shipped via edits proposal abc-123 after manual cluster fix.",
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.proposal.status).toBe("finished");
    expect(ack.proposal.close_reason).toBe("fixed_elsewhere");
    expect(ack.proposal.closed_by).toBe("bob");
  });

  it("blocks duplicate notes on same issue when no_auto_retry; edits still allowed", async () => {
    const svc = makeService();
    const summary =
      "Tried updating meta then hit a permission wall; recommend setting the title from H1. ".repeat(2);
    const first = await svc.create(
      { title: "Handoff A", summary, related_issue_ids: ["iss-1"] },
      { username: "alice" },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await svc.create(
      {
        title: "Handoff B",
        summary: `${summary} Different wording to bypass fingerprint.`,
        related_issue_ids: ["iss-1"],
      },
      { username: "bob" },
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("notes_no_auto_retry");
      expect(second.existing_proposal?.id).toBe(first.proposal.id);
    }
    const edits = await svc.create(
      {
        title: "Fix",
        summary: "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2),
        related_issue_ids: ["iss-1"],
        entries: [sampleEntry()],
      },
      { username: "bob" },
    );
    expect(edits.ok).toBe(true);
  });

  it("allows freestanding duplicate-ish notes without related issues", async () => {
    const svc = makeService();
    const summary =
      "Tried updating meta then hit a permission wall; recommend setting the title from H1. ".repeat(2);
    const first = await svc.create({ title: "Handoff A", summary }, { username: "alice" });
    const second = await svc.create(
      { title: "Handoff B", summary: `${summary} Extra.` },
      { username: "bob" },
    );
    expect(first.ok && second.ok).toBe(true);
  });

  it("MCP must claim before clearing no_auto_retry; staff UI need not", async () => {
    const svc = makeService();
    const created = await svc.create(
      {
        title: "Handoff",
        summary: "Tried updating meta then hit a permission wall; recommend setting the title from H1. ".repeat(2),
        related_issue_ids: ["iss-2"],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const mcpDenied = await svc.update(created.proposal.id, "set_no_auto_retry", {
      username: "bob",
      actor: { type: "mcp", client: "cursor" },
      no_auto_retry: false,
    });
    expect(mcpDenied.ok).toBe(false);
    if (!mcpDenied.ok) expect(mcpDenied.code).toBe("not_claimant");

    await svc.update(created.proposal.id, "claim", {
      username: "bob",
      actor: { type: "mcp", client: "cursor" },
    });
    const mcpOk = await svc.update(created.proposal.id, "set_no_auto_retry", {
      username: "bob",
      actor: { type: "mcp", client: "cursor" },
      no_auto_retry: false,
    });
    expect(mcpOk.ok).toBe(true);
    if (!mcpOk.ok) return;
    expect(mcpOk.proposal.no_auto_retry).toBe(false);

    const staffOk = await svc.update(created.proposal.id, "set_no_auto_retry", {
      username: "carol",
      actor: { type: "ui" },
      no_auto_retry: true,
    });
    expect(staffOk.ok).toBe(true);
    if (!staffOk.ok) return;
    expect(staffOk.proposal.no_auto_retry).toBe(true);
  });

  it("stats counts by status and kind; list supports offset", async () => {
    const svc = makeService();
    const summary =
      "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2);
    for (let i = 0; i < 3; i++) {
      const created = await svc.create(
        {
          title: `CTA ${i}`,
          summary,
          entries: [sampleEntry({ slug: `post-${i}` })],
        },
        { username: "alice" },
      );
      expect(created.ok).toBe(true);
    }
    const notes = await svc.create(
      {
        title: "Handoff",
        summary: "Tried updating meta then hit a permission wall; recommend setting the title from H1. ".repeat(2),
      },
      { username: "alice" },
    );
    expect(notes.ok).toBe(true);

    const s = svc.stats();
    expect(s.total).toBe(4);
    expect(s.by_kind.edits).toBe(3);
    expect(s.by_kind.notes).toBe(1);
    expect(s.by_status.open).toBe(4);

    const page = svc.list({ kind: "edits", limit: 2, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.proposals).toHaveLength(2);
    const page2 = svc.list({ kind: "edits", limit: 2, offset: 2 });
    expect(page2.proposals).toHaveLength(1);
  });

  it("list sorts by created_at asc with id tie-break", async () => {
    const svc = makeService();
    const summary =
      "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2);
    for (let i = 0; i < 3; i++) {
      const created = await svc.create(
        {
          title: `Order ${i}`,
          summary,
          entries: [sampleEntry({ slug: `order-${i}` })],
        },
        { username: "alice" },
      );
      expect(created.ok).toBe(true);
    }
    const asc = svc.list({ kind: "edits", sort: "created_at", sortDir: "asc", limit: 10 });
    expect(asc.proposals).toHaveLength(3);
    expect(asc.proposals[0]!.created_at).toBeLessThanOrEqual(asc.proposals[1]!.created_at);
    expect(asc.proposals[1]!.created_at).toBeLessThanOrEqual(asc.proposals[2]!.created_at);
    const desc = svc.list({ kind: "edits", sort: "updated_at", sortDir: "desc", limit: 10 });
    expect(desc.proposals[0]!.updated_at).toBeGreaterThanOrEqual(desc.proposals[1]!.updated_at);
  });

  it("parseProposerActorType accepts enums and rejects invalid", () => {
    expect(parseProposerActorType(undefined)).toEqual({ ok: true, type: undefined });
    expect(parseProposerActorType("")).toEqual({ ok: true, type: undefined });
    expect(parseProposerActorType("ui")).toEqual({ ok: true, type: "ui" });
    expect(parseProposerActorType("mcp")).toEqual({ ok: true, type: "mcp" });
    expect(parseProposerActorType("staff").ok).toBe(false);
  });

  it("list filters by proposer_username, actor type/role, and agent_session_id", async () => {
    const svc = makeService();
    const summary =
      "Replace the live CTA title with a clearer next step for this Spanish blog post. ".repeat(2);

    const staff = await svc.create(
      {
        title: "Staff CTA",
        summary,
        entries: [sampleEntry({ slug: "staff-post" })],
      },
      { username: "Alice@4geeks.com", actor: { type: "ui" } },
    );
    expect(staff.ok).toBe(true);

    const copyEditor = await svc.create(
      {
        title: "Copy editor CTA",
        summary,
        entries: [sampleEntry({ slug: "copy-post" })],
        agent_session_id: "sess-copy-1",
      },
      {
        username: "bob@4geeks.com",
        actor: { type: "mcp", role: "copy_editor", model: "claude/sonnet-4.5", client: "Cursor" },
      },
    );
    expect(copyEditor.ok).toBe(true);

    const seo = await svc.create(
      {
        title: "SEO CTA",
        summary,
        entries: [sampleEntry({ slug: "seo-post" })],
        agent_session_id: "sess-seo-1",
      },
      {
        username: "carol@4geeks.com",
        actor: { type: "mcp", role: "seo_specialist", model: "claude/sonnet-4.5", client: "Cursor" },
      },
    );
    expect(seo.ok).toBe(true);

    const byUser = svc.list({ proposer_username: "alice@4geeks.com" });
    expect(byUser.total).toBe(1);
    expect(byUser.proposals[0]!.proposer_username).toBe("Alice@4geeks.com");
    expect(svc.list({ proposer_username: "alice" }).total).toBe(0);

    const staffOnly = svc.list({ proposer_actor_type: "ui" });
    expect(staffOnly.total).toBe(1);
    expect(staffOnly.proposals[0]!.id).toBe(staff.ok ? staff.proposal.id : "");

    const byRole = svc.list({ proposer_actor_role: "copy_editor" });
    expect(byRole.total).toBe(1);
    expect(byRole.proposals[0]!.id).toBe(copyEditor.ok ? copyEditor.proposal.id : "");

    const roleAndType = svc.list({
      proposer_actor_type: "mcp",
      proposer_actor_role: "seo_specialist",
    });
    expect(roleAndType.total).toBe(1);
    expect(roleAndType.proposals[0]!.id).toBe(seo.ok ? seo.proposal.id : "");

    const bySession = svc.list({ agent_session_id: "sess-copy-1" });
    expect(bySession.total).toBe(1);
    expect(bySession.proposals[0]!.created_agent_session_id).toBe("sess-copy-1");
    expect(svc.list({ agent_session_id: "sess-missing" }).total).toBe(0);

    const combined = svc.list({
      status: "open",
      proposer_username: "bob@4geeks.com",
    });
    expect(combined.total).toBe(1);
    expect(combined.proposals[0]!.id).toBe(copyEditor.ok ? copyEditor.proposal.id : "");
  });

  it("enforces one open proposal per variant", async () => {
    const svc = makeService({
      liveValues: { "call_to_action.title": "Old" },
    });
    const fps = new Map<string, string>([["agent-fix", "fp1"]]);
    const svcFp = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: (entry) => {
        const values: Record<string, unknown> = {};
        for (const u of entry.updates ?? []) values[u.field_path] = "Old";
        return { values };
      },
      applyUpdates: async () => ({ ok: true }),
      readVariantFingerprint: ({ variant }) => {
        const fp = fps.get(variant);
        if (!fp) return { fingerprint: "", error: "missing" };
        return { fingerprint: fp };
      },
    });
    const summary =
      "Prepare a clearer CTA on the agent-fix draft for this Spanish blog post review. ".repeat(2);
    const first = await svcFp.create(
      {
        title: "Draft CTA",
        summary,
        entries: [
          sampleEntry({
            variant: "agent-fix",
            updates: [{ field_path: "call_to_action.title", value: "New" }],
          }),
        ],
      },
      { username: "alice" },
    );
    expect(first.ok).toBe(true);
    const second = await svcFp.create(
      {
        title: "Draft CTA 2",
        summary: summary + "x",
        confirm_distinct: true,
        entries: [
          sampleEntry({
            variant: "agent-fix",
            updates: [{ field_path: "call_to_action.title", value: "Other" }],
          }),
        ],
      },
      { username: "bob" },
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(["competing_entry_edits", "proposal_exists"]).toContain(second.code);
      expect(second.existing_proposal?.id).toBe(first.ok ? first.proposal.id : "");
    }
  });

  it("allows draft_backed empty ops and blocks apply while blockers open; reject ignores blockers", async () => {
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: () => ({ values: {} }),
      applyUpdates: async () => ({ ok: true }),
      readVariantFingerprint: () => ({ fingerprint: "abc123" }),
      promoteEntry: async () => ({ ok: true }),
    });
    const summary =
      "Ship the prepared agent-fix draft for the Spanish blog after review and four-eyes approve. ".repeat(2);
    const created = await svc.create(
      {
        title: "Go live",
        summary,
        promote_on_apply: true,
        agent_session_id: "sess-1",
        entries: [{ contentType: "blog", slug: "hello", locale: "es", variant: "agent-fix", updates: [] }],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.proposal.review_mode).toBe("draft_backed");
    expect(created.proposal.entries[0]?.ops).toEqual([]);

    const short = await svc.update(created.proposal.id, "add_blocker", {
      username: "blake",
      body: "too short",
    });
    expect(short.ok).toBe(false);

    const body =
      "On draft agent-fix (es), hero CTA still goes to Coding Bootcamp. Must use AI Flex because leads go to the wrong funnel.";
    const blocked = await svc.update(created.proposal.id, "add_blocker", {
      username: "blake",
      body,
    });
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.proposal.open_blocker_count).toBe(1);

    const applyBlocked = await svc.update(created.proposal.id, "apply", { username: "casey" });
    expect(applyBlocked.ok).toBe(false);
    if (!applyBlocked.ok) expect(applyBlocked.code).toBe("proposal_blocked");

    const rejected = await svc.update(created.proposal.id, "reject", {
      username: "casey",
      confirm_reject: true,
      reject_kind: "bad_idea",
      close_note:
        "This approach is fundamentally wrong for brand and SEO and must not ship even if polished.",
    });
    expect(rejected.ok).toBe(true);
    if (rejected.ok) {
      expect(rejected.proposal.status).toBe("rejected");
      expect(rejected.proposal.close_reason).toBe("bad_idea");
      expect(rejected.proposal.close_note).toContain("fundamentally wrong");
    }
  });

  it("claimant-only resolve; expired claim hints claim first; soft apply into variant", async () => {
    const live: Record<string, unknown> = { "call_to_action.title": "Old" };
    const fps = new Map([["agent-fix", "fp-stable"]]);
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: (entry) => {
        const values: Record<string, unknown> = {};
        for (const u of entry.updates ?? []) values[u.field_path] = live[u.field_path];
        return { values };
      },
      applyUpdates: async (entry) => {
        for (const u of entry.ops) live[u.field_path] = u.value;
        return { ok: true };
      },
      readVariantFingerprint: ({ variant }) => ({ fingerprint: fps.get(variant) ?? "" }),
    });
    const summary =
      "Patch the CTA title on the agent-fix draft for this Spanish blog before go-live. ".repeat(2);
    const created = await svc.create(
      {
        title: "Soft draft",
        summary,
        agent_session_id: "sess-a",
        entries: [
          sampleEntry({
            variant: "agent-fix",
            updates: [{ field_path: "call_to_action.title", value: "New" }],
          }),
        ],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.proposal.review_mode).toBe("soft_variant");

    const body =
      "On draft agent-fix, CTA title is too vague. Must say Enroll now for AI Flex because conversion copy must match the product.";
    await svc.update(created.proposal.id, "add_blocker", { username: "blake", body });

    const resolveNoClaim = await svc.update(created.proposal.id, "resolve_blocker", {
      username: "alice",
      blocker_id: created.proposal.blockers[0]?.id ?? 1,
      resolve_note: "Updated CTA title to Enroll now for AI Flex on the draft.",
    });
    // blocker id from refreshed proposal
    const afterBlock = svc.get(created.proposal.id)!;
    const bid = afterBlock.blockers[0]!.id;
    const stillNo = await svc.update(created.proposal.id, "resolve_blocker", {
      username: "alice",
      blocker_id: bid,
      resolve_note: "Updated CTA title to Enroll now for AI Flex on the draft.",
    });
    expect(stillNo.ok).toBe(false);
    if (!stillNo.ok) expect(stillNo.code).toBe("not_claimant");

    await svc.update(created.proposal.id, "claim", { username: "alice" });
    const resolved = await svc.update(created.proposal.id, "resolve_blocker", {
      username: "alice",
      blocker_id: bid,
      resolve_note: "Updated CTA title to Enroll now for AI Flex on the draft.",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.warnings?.some((w) => w.code === "blockers_cleared_repreview")).toBe(true);
    }

    const applied = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.proposal.status).toBe("finished");
      expect(live["call_to_action.title"]).toBe("New");
    }
    void resolveNoClaim;
  });

  it("expired claim cannot resolve until reclaim; withdraw ignores open blockers", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    try {
      const svc = createProposalService({
        site: SITE,
        issueExists: () => true,
        captureBaseline: () => ({ values: {} }),
        applyUpdates: async () => ({ ok: true }),
        readVariantFingerprint: () => ({ fingerprint: "fp" }),
      });
      const summary =
        "Soft suggestion on agent-fix draft for Spanish blog CTA copy review after feedback. ".repeat(2);
      const created = await svc.create(
        {
          title: "Expire claim",
          summary,
          entries: [
            sampleEntry({
              variant: "agent-fix",
              updates: [{ field_path: "call_to_action.title", value: "New" }],
            }),
          ],
        },
        { username: "alice" },
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const body =
        "On draft agent-fix, CTA title is too vague. Must say Enroll now for AI Flex because conversion copy must match the product.";
      await svc.update(created.proposal.id, "add_blocker", { username: "blake", body });
      await svc.update(created.proposal.id, "claim", { username: "alice" });
      const bid = svc.get(created.proposal.id)!.blockers[0]!.id;

      vi.setSystemTime(now + PROPOSAL_CLAIM_TTL_MS + 1000);
      const expired = await svc.update(created.proposal.id, "resolve_blocker", {
        username: "alice",
        blocker_id: bid,
        resolve_note: "Updated CTA title to Enroll now for AI Flex on the draft.",
      });
      expect(expired.ok).toBe(false);
      if (!expired.ok) {
        expect(expired.code).toBe("not_claimant");
        expect(expired.claim_expired).toBe(true);
      }

      const withdrawn = await svc.update(created.proposal.id, "withdraw", {
        username: "alice",
        close_note: "Pulling back while open blockers remain; will refile later.",
      });
      expect(withdrawn.ok).toBe(true);
      if (withdrawn.ok) expect(withdrawn.proposal.status).toBe("withdrawn");
    } finally {
      vi.useRealTimers();
    }
  });

  it("listOpenProposalsForVariant returns open proposals referencing a draft", async () => {
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: () => ({ values: {} }),
      applyUpdates: async () => ({ ok: true }),
      readVariantFingerprint: () => ({ fingerprint: "fp" }),
    });
    const summary =
      "List helper finds open proposals that still reference agent-fix for delete warnings. ".repeat(2);
    const created = await svc.create(
      {
        title: "Open on variant",
        summary,
        entries: [
          sampleEntry({
            variant: "agent-fix",
            updates: [{ field_path: "call_to_action.title", value: "New" }],
          }),
        ],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const listed = listOpenProposalsForVariant(SITE, "blog", "hello", "es", "agent-fix");
    expect(listed.some((p) => p.id === created.proposal.id)).toBe(true);
    expect(listOpenProposalsForVariant(SITE, "blog", "hello", "es", "other").length).toBe(0);
  });

  it("promote apply requires confirm_end_experiment when siblings have traffic", async () => {
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: () => ({ values: {} }),
      applyUpdates: async () => ({ ok: true }),
      readVariantFingerprint: () => ({ fingerprint: "fp" }),
      promoteEntry: async (_e, _a, opts) => {
        if (!opts.confirm_end_experiment) {
          return {
            ok: false,
            code: "confirm_end_experiment",
            error: "need confirm",
            traffic_siblings: [{ slug: "hero-b", locale: "es", allocation: 30 }],
          };
        }
        return { ok: true };
      },
    });
    const summary =
      "Promote agent-fix over live and end the hero-b experiment after four-eyes review. ".repeat(2);
    const created = await svc.create(
      {
        title: "Promote",
        summary,
        promote_on_apply: true,
        entries: [{ contentType: "blog", slug: "hello", locale: "es", variant: "agent-fix" }],
      },
      { username: "alice" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const need = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(need.ok).toBe(false);
    if (!need.ok) {
      expect(need.code).toBe("confirm_end_experiment");
      expect(need.traffic_siblings?.[0]?.slug).toBe("hero-b");
    }
    const done = await svc.update(created.proposal.id, "apply", {
      username: "bob",
      confirm_end_experiment: true,
    });
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.proposal.status).toBe("finished");
  });

  it("persists proposer and claim actor provenance", async () => {
    const svc = makeService();
    const summary =
      "Store MCP client and model on the proposal so staff can see which agent acted on behalf of which human. ".repeat(
        1,
      );
    const created = await svc.create(
      {
        title: "Actor provenance",
        summary,
        entries: [sampleEntry()],
      },
      {
        username: "alice@4geeks.com",
        actor: { type: "mcp", client: "Cursor", model: "claude-4-sonnet" },
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.proposal.proposer_username).toBe("alice@4geeks.com");
    expect(created.proposal.proposer_actor).toEqual({
      type: "mcp",
      client: "Cursor",
      model: "claude-4-sonnet",
    });

    const claimed = await svc.update(created.proposal.id, "claim", {
      username: "alice@4geeks.com",
      actor: { type: "mcp", client: "Cursor", model: "claude-4-sonnet" },
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.proposal.claim?.by).toBe("alice@4geeks.com");
    expect(claimed.proposal.claim?.actor).toEqual({
      type: "mcp",
      client: "Cursor",
      model: "claude-4-sonnet",
    });

    // Same user can refresh claim with a different actor (UI).
    const staffClaim = await svc.update(created.proposal.id, "claim", {
      username: "alice@4geeks.com",
      actor: { type: "ui" },
    });
    expect(staffClaim.ok).toBe(true);
    if (!staffClaim.ok) return;
    expect(staffClaim.proposal.claim?.actor).toEqual({ type: "ui" });
  });

  it("creates idea, accepts with next_step (four-eyes), parks with tracked_elsewhere", async () => {
    const svc = makeService();
    const summary =
      "Pitch a new Miami spoke landing for the AI bootcamp with a short brief for later edits work. ".repeat(
        2,
      );
    const mcpAlice = {
      username: "alice",
      actor: {
        type: "mcp" as const,
        client: "Cursor",
        role: "copy_editor",
        model: "claude/sonnet-4.5",
      },
    };
    const mcpBob = {
      username: "bob",
      actor: {
        type: "mcp" as const,
        client: "Cursor",
        role: "seo_specialist",
        model: "claude/sonnet-4.5",
      },
    };
    const created = await svc.create(
      {
        kind: "idea",
        title: "New Miami AI spoke",
        summary,
        related_entries: [{ contentType: "landing", slug: "miami-ai-bootcamp-new" }],
      },
      mcpAlice,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.proposal.kind).toBe("idea");
    expect(created.proposal.related_entries?.[0]?.slug).toBe("miami-ai-bootcamp-new");

    const selfAccept = await svc.update(created.proposal.id, "accept", {
      ...mcpAlice,
      next_step: "Draft the landing hero and CTA in a follow-up edits proposal.",
    });
    expect(selfAccept.ok).toBe(false);
    if (!selfAccept.ok) expect(selfAccept.code).toBe("four_eyes");

    const short = await svc.update(created.proposal.id, "accept", {
      ...mcpBob,
      next_step: "too short",
    });
    expect(short.ok).toBe(false);

    const accepted = await svc.update(created.proposal.id, "accept", {
      ...mcpBob,
      next_step: "Open an edits proposal for landing/miami-ai-bootcamp-new after research.",
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.proposal.status).toBe("finished");
    expect(accepted.proposal.close_reason).toBe("accepted");
    expect(accepted.proposal.close_note).toContain("edits proposal");

    const park = await svc.create(
      {
        kind: "idea",
        title: "Duplicate-ish pitch B",
        summary:
          "Another brief about a catalog config change we may track in Linear instead of here. ".repeat(2),
      },
      mcpAlice,
    );
    expect(park.ok).toBe(true);
    if (!park.ok) return;
    const closed = await svc.update(park.proposal.id, "close", {
      ...mcpAlice,
      close_reason: "tracked_elsewhere",
      close_note: "Already tracked as LINEAR-123 for the catalog work.",
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.proposal.close_reason).toBe("tracked_elsewhere");
  });

  it("blocks idea accept while blockers open; same role cannot four-eyes", async () => {
    const svc = makeService();
    const summary =
      "Brief for updating scholarship FAQ structure before any YAML changes are filed. ".repeat(2);
    const aliceCopy = {
      username: "alice",
      actor: {
        type: "mcp" as const,
        role: "copy_editor",
        model: "claude/sonnet-4.5",
        client: "Cursor",
      },
    };
    const aliceSeo = {
      username: "alice",
      actor: {
        type: "mcp" as const,
        role: "seo_specialist",
        model: "claude/opus-4",
        client: "Cursor",
      },
    };
    const created = await svc.create(
      { kind: "idea", title: "Scholarship FAQ brief", summary },
      aliceCopy,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sameRole = await svc.update(created.proposal.id, "accept", {
      username: "alice",
      actor: {
        type: "mcp",
        role: "copy_editor",
        model: "claude/fable-1.5",
        client: "Cursor",
      },
      next_step: "File an edits proposal after the FAQ outline is approved by staff.",
    });
    expect(sameRole.ok).toBe(false);
    if (!sameRole.ok) expect(sameRole.code).toBe("four_eyes");

    const blocked = await svc.update(created.proposal.id, "add_blocker", {
      ...aliceSeo,
      body:
        "Needs clearer acceptance criteria for which locales ship first and why ES is out of scope. ".repeat(
          2,
        ),
    });
    expect(blocked.ok).toBe(true);

    const withBlocker = await svc.update(created.proposal.id, "accept", {
      ...aliceSeo,
      next_step: "File an edits proposal after the FAQ outline is approved by staff.",
    });
    expect(withBlocker.ok).toBe(false);
    if (!withBlocker.ok) expect(withBlocker.code).toBe("proposal_blocked");
  });

  it("toProposalSummary strips ops/baselines and aggregates unique field_paths", async () => {
    const svc = makeService({
      liveValues: {
        "seo.main_keyword": "old",
        "meta.page_title": "Old title",
      },
    });
    const summary =
      "Bulk SEO keyword updates across location landing pages for a regional campaign review. ".repeat(
        2,
      );
    const created = await svc.create(
      {
        title: "Location SEO keywords",
        summary,
        entries: [
          {
            contentType: "landing",
            slug: "miami",
            locale: "en",
            updates: [
              { field_path: "seo.main_keyword", value: "miami bootcamp" },
              { field_path: "meta.page_title", value: "Miami" },
            ],
          },
          {
            contentType: "landing",
            slug: "chicago",
            locale: "en",
            updates: [{ field_path: "seo.main_keyword", value: "chicago bootcamp" }],
          },
        ],
      },
      { username: "alice", actor: { type: "ui" } },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const slim = toProposalSummary(created.proposal);
    expect(slim.detail).toBe("summary");
    expect(slim.entry_count).toBe(2);
    expect(slim.field_paths).toEqual(["meta.page_title", "seo.main_keyword"]);
    expect(slim.entries).toHaveLength(2);
    for (const e of slim.entries) {
      expect(e).toMatchObject({
        contentType: "landing",
        locale: "en",
        status: "pending",
      });
      expect(e).not.toHaveProperty("ops");
      expect(e).not.toHaveProperty("baseline_context");
    }
    expect(slim).not.toHaveProperty("blockers");
    expect(slim).not.toHaveProperty("documentation");
    expect(slim).not.toHaveProperty("search_text");
    expect(slim).not.toHaveProperty("fingerprint");
    expect(created.proposal.entries[0]!.ops.length).toBeGreaterThan(0);
    expect(created.proposal.entries[0]!.baseline_context.values).toBeTruthy();
  });

  it("rejects without confirm_reject / kind / note; withdraw requires note; revise and supersedes", async () => {
    const live: Record<string, unknown> = { "meta.title": "Old" };
    const svc = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: (entry) => {
        const values: Record<string, unknown> = {};
        for (const u of entry.updates ?? []) values[u.field_path] = live[u.field_path];
        return { values };
      },
      applyUpdates: async (entry) => {
        for (const u of entry.ops) live[u.field_path] = u.value;
        return { ok: true };
      },
      resolveRecentActivity: () => ({
        ok: true,
        activity: [],
        gateWriteCount: 0,
      }),
    });
    const summary = "Soft title tweak for blog hello after review of live meta. ".repeat(2);
    const created = await svc.create(
      {
        title: "Title tweak",
        summary,
        entries: [
          sampleEntry({
            locale: "en",
            updates: [{ field_path: "meta.title", value: "New" }],
          }),
        ],
      },
      { username: "alice", actor: { type: "mcp", role: "content" } },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const noConfirm = await svc.update(created.proposal.id, "reject", { username: "casey" });
    expect(noConfirm.ok).toBe(false);
    if (!noConfirm.ok) expect(noConfirm.code).toBe("confirm_reject");

    const noKind = await svc.update(created.proposal.id, "reject", {
      username: "casey",
      confirm_reject: true,
      close_note: "x".repeat(80),
    });
    expect(noKind.ok).toBe(false);
    if (!noKind.ok) expect(noKind.code).toBe("reject_kind_required");

    const shortNote = await svc.update(created.proposal.id, "reject", {
      username: "casey",
      confirm_reject: true,
      reject_kind: "bad_idea",
      close_note: "too short",
    });
    expect(shortNote.ok).toBe(false);
    if (!shortNote.ok) expect(shortNote.code).toBe("reject_note_too_short");

    const body =
      "On soft meta.title, proposed New is fine but value should be Newer for brand. Must match H1.";
    await svc.update(created.proposal.id, "add_blocker", { username: "blake", body });

    const foreignClaim = await svc.update(created.proposal.id, "claim", {
      username: "blake",
      actor: { type: "mcp", role: "reviewer" },
    });
    expect(foreignClaim.ok).toBe(true);

    const reviseBlocked = await svc.update(created.proposal.id, "revise_entries", {
      username: "alice",
      actor: { type: "mcp", role: "content" },
      entries: [
        sampleEntry({
          locale: "en",
          updates: [{ field_path: "meta.title", value: "Newer" }],
        }),
      ],
    });
    expect(reviseBlocked.ok).toBe(false);
    if (!reviseBlocked.ok) expect(reviseBlocked.code).toBe("claimed");

    await svc.update(created.proposal.id, "release", { username: "blake" });

    const revised = await svc.update(created.proposal.id, "revise_entries", {
      username: "alice",
      actor: { type: "mcp", role: "content" },
      entries: [
        sampleEntry({
          locale: "en",
          updates: [{ field_path: "meta.title", value: "Newer" }],
        }),
      ],
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.proposal.entries[0]?.ops[0]?.value).toBe("Newer");
    expect(revised.proposal.open_blocker_count).toBe(1);

    const rejected = await svc.update(created.proposal.id, "reject", {
      username: "casey",
      confirm_reject: true,
      reject_kind: "harmful",
      close_note:
        "Shipping this keyword change would mislead local pack users and must not go live.",
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.proposal.close_reason).toBe("harmful");

    const replacement = await svc.create(
      {
        title: "Better title",
        summary: "Replacement after harmful reject with city-only chip and skip remote. ".repeat(2),
        supersedes_proposal_id: created.proposal.id,
        entries: [
          sampleEntry({
            locale: "en",
            updates: [{ field_path: "meta.title", value: "Best" }],
          }),
        ],
      },
      { username: "dana" },
    );
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    expect(replacement.proposal.supersedes_proposal_id).toBe(created.proposal.id);
    const old = svc.get(created.proposal.id)!;
    expect(old.replaced_by_proposal_id).toBe(replacement.proposal.id);

    const secondLink = await svc.create(
      {
        title: "Another",
        summary: "Second replacement attempt should fail because predecessor already linked. ".repeat(2),
        supersedes_proposal_id: created.proposal.id,
        entries: [
          sampleEntry({
            slug: "other",
            locale: "en",
            updates: [{ field_path: "meta.title", value: "X" }],
          }),
        ],
      },
      { username: "erin" },
    );
    expect(secondLink.ok).toBe(false);
    if (!secondLink.ok) expect(secondLink.code).toBe("supersedes_already_replaced");

    const forWithdraw = await svc.create(
      {
        title: "Withdraw me",
        summary: "Will withdraw with a note after filing for the withdraw-note gate. ".repeat(2),
        entries: [
          sampleEntry({
            slug: "withdraw-me",
            locale: "en",
            updates: [{ field_path: "meta.title", value: "W" }],
          }),
        ],
      },
      { username: "alice" },
    );
    expect(forWithdraw.ok).toBe(true);
    if (!forWithdraw.ok) return;
    const noNote = await svc.update(forWithdraw.proposal.id, "withdraw", { username: "alice" });
    expect(noNote.ok).toBe(false);
    if (!noNote.ok) expect(noNote.code).toBe("withdraw_note_required");
    const withdrawn = await svc.update(forWithdraw.proposal.id, "withdraw", {
      username: "alice",
      close_note: "Filing again with a corrected scope after review feedback.",
    });
    expect(withdrawn.ok).toBe(true);
    if (withdrawn.ok) {
      expect(withdrawn.proposal.status).toBe("withdrawn");
      expect(withdrawn.proposal.close_reason).toBe("withdrawn");
    }
  });

  it("escalates with note, clears claim, freezes MCP, keeps note after deescalate", async () => {
    const svc = makeService();
    const summary =
      "Update the landing CTA copy so the product name matches the live funnel offer. ".repeat(2);
    const created = await svc.create(
      {
        title: "CTA product name",
        summary,
        entries: [sampleEntry()],
      },
      { username: "alice", actor: { type: "mcp", role: "copy_editor" } },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await svc.update(created.proposal.id, "claim", {
      username: "blake",
      actor: { type: "mcp", role: "proposal_reviewer" },
      report: "Reviewing the CTA product naming suggestion before apply. ".repeat(2),
    });
    expect(svc.get(created.proposal.id)?.claim?.by).toBe("blake");

    const short = await svc.update(created.proposal.id, "escalate", {
      username: "steward",
      actor: { type: "ui" },
      escalated_note: "too short",
    });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe("escalated_note_required");

    const note =
      "Grok added a blocker that invents a product claim we do not make — pause agents until review rules are fixed.";
    const escalated = await svc.update(created.proposal.id, "escalate", {
      username: "steward",
      actor: { type: "ui" },
      escalated_note: note,
    });
    expect(escalated.ok).toBe(true);
    if (!escalated.ok) return;
    expect(escalated.proposal.status).toBe("open");
    expect(escalated.proposal.escalated).toBe(true);
    expect(escalated.proposal.escalated_note).toBe(note);
    expect(escalated.proposal.escalated_by).toBe("steward");
    expect(escalated.proposal.claim).toBeNull();
    expect(svc.stats().escalated_count).toBe(1);

    const mcpBlocked = await svc.update(created.proposal.id, "add_blocker", {
      username: "grok",
      actor: { type: "mcp", role: "proposal_reviewer" },
      body:
        "On live es blog hello, CTA should mention Coding Bootcamp because the form currently misroutes leads to the wrong product funnel.",
    });
    expect(mcpBlocked.ok).toBe(false);
    if (!mcpBlocked.ok) expect(mcpBlocked.code).toBe("escalated");

    const mcpEscalate = await svc.update(created.proposal.id, "deescalate", {
      username: "grok",
      actor: { type: "mcp", role: "proposal_reviewer" },
    });
    expect(mcpEscalate.ok).toBe(false);
    if (!mcpEscalate.ok) expect(mcpEscalate.code).toBe("steward_ui_only");

    const staffStill = await svc.update(created.proposal.id, "add_blocker", {
      username: "casey",
      actor: { type: "ui" },
      body:
        "On live es blog hello, CTA should mention Coding Bootcamp because the form currently misroutes leads to the wrong product funnel.",
    });
    expect(staffStill.ok).toBe(true);
    if (staffStill.ok) expect(staffStill.proposal.open_blocker_count).toBe(1);

    const released = await svc.update(created.proposal.id, "deescalate", {
      username: "steward",
      actor: { type: "ui" },
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.proposal.escalated).toBe(false);
    expect(released.proposal.escalated_note).toBe(note);
    expect(released.proposal.status).toBe("open");

    const listed = svc.list({ escalated: true });
    expect(listed.total).toBe(0);
    const withHistory = svc.list({ status: "open" });
    expect(withHistory.proposals.some((p) => p.id === created.proposal.id && p.escalated_note === note)).toBe(
      true,
    );
  });
});
