import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { splitByFieldScope } from "@shared/field-scope";
import { setAtPath, deleteAtPath, cloneJson } from "@shared/object-path";
import { clearSiteSqliteCacheForTests, getSiteSqlite } from "../db";
import { ensurePipelineDb, resetPipelineDbCache } from "../pipeline-db/runner";
import type { DraftProposalLink } from "../versioning/draft-meta";
import type { FieldChange } from "../versioning/draft-base";
import type { ProposalDraftRef, ProposalDraftStore } from "./draft-store";
import {
  absorbDraftEdit,
  createProposalService,
  exportAllProposals,
  replaceProposalsFromSnapshot,
  toProposalSummary,
  type PromoteEntryOpts,
  type PromoteEntryResult,
  type ProposalEntryInput,
  type ProposalEntryRow,
} from "./service";

const SITE = `site_proposal-v1-test-${Date.now()}`;
const SUMMARY = "Rewrite the page title so it matches the main keyword and the search intent of the post. ".repeat(2);

function rmSite(): void {
  const dir = path.join("data", SITE.replace(/\//g, "-"));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

type FakeDraft = {
  data: Record<string, unknown>;
  base: Record<string, unknown>;
  link: DraftProposalLink | null;
  alloc: number | null;
  baseStatus: "ok" | "stale" | "unknown";
};

const keyOf = (r: ProposalDraftRef) => `${r.contentType}/${r.slug}/${r.locale}/${r.variant}`;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

function fakeDraftStore(live: Record<string, Record<string, unknown>> = {}) {
  const drafts = new Map<string, FakeDraft>();
  const entries = new Set<string>(["blog/hello", "blog/other"]);
  const liveOf = (r: ProposalDraftRef) => live[`${r.contentType}/${r.slug}/${r.locale}`] ?? null;
  const removed: string[] = [];
  const store: ProposalDraftStore = {
    entryExists: (ct, slug) => entries.has(`${ct}/${slug}`),
    exists: (r) => drafts.has(keyOf(r)),
    liveExists: (e) => live[`${e.contentType}/${e.slug}/${e.locale}`] != null,
    pathOf: (r) => path.join(os.tmpdir(), "fake-drafts", keyOf(r)),
    pickVariant(e, id, o) {
      const free = (v: string) => !drafts.has(keyOf({ ...e, variant: v }));
      if (!o?.ownName && free("draft")) return "draft";
      return `draft-p${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()}`;
    },
    create(r, opts) {
      if (!entries.has(`${r.contentType}/${r.slug}`)) {
        if (!opts.newEntry) return { ok: false, code: "entry_not_found", error: "no page" };
        entries.add(`${r.contentType}/${r.slug}`);
      }
      const base = cloneJson(liveOf(r) ?? {});
      drafts.set(keyOf(r), { data: cloneJson(base), base, link: null, alloc: 0, baseStatus: "ok" });
      return { ok: true };
    },
    allocation: (r) => drafts.get(keyOf(r))?.alloc ?? null,
    isAttached: () => false,
    structureError: (r) => {
      const d = drafts.get(keyOf(r));
      return d && Array.isArray(d.data.layout) ? "layout is not allowed" : null;
    },
    reset(r) {
      const d = drafts.get(keyOf(r))!;
      d.base = cloneJson(liveOf(r) ?? {});
      d.data = cloneJson(d.base);
      d.baseStatus = "ok";
    },
    snapshotRaw: (r) => (drafts.has(keyOf(r)) ? JSON.stringify(drafts.get(keyOf(r))!.data) : null),
    restoreRaw(r, raw) {
      drafts.get(keyOf(r))!.data = JSON.parse(raw);
    },
    async write(r, updates) {
      const d = drafts.get(keyOf(r));
      if (!d) return { ok: false, code: "draft_missing", error: "missing" };
      if (updates.some((u) => u.field_path === "boom")) return { ok: false, code: "write_failed", error: "boom" };
      for (const u of updates) {
        if (u.reset || u.op === "remove") deleteAtPath(d.data, u.field_path);
        else setAtPath(d.data, u.field_path, u.value);
      }
      return { ok: true, warnings: [] };
    },
    fingerprint: (r) => (drafts.has(keyOf(r)) ? hash(drafts.get(keyOf(r))!.data) : null),
    carriesCommon: (r) => {
      const d = drafts.get(keyOf(r));
      return d ? Object.keys(splitByFieldScope(d.data).common).length > 0 : false;
    },
    readLink: (r) => drafts.get(keyOf(r))?.link ?? null,
    link(r, link) {
      const d = drafts.get(keyOf(r));
      if (d) d.link = link;
    },
    async remove(r) {
      drafts.delete(keyOf(r));
      removed.push(keyOf(r));
      return { entryDeleted: false };
    },
    authorDiff(r) {
      const d = drafts.get(keyOf(r));
      if (!d) return null;
      const changes: FieldChange[] = [];
      for (const k of new Set([...Object.keys(d.base), ...Object.keys(d.data)])) {
        const before = d.base[k];
        const after = d.data[k];
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        changes.push({
          field_path: k,
          before,
          after,
          scope: k === "funnel" ? "common" : "locale",
          ...(after === undefined ? { removed: true } : {}),
        });
      }
      return { approximate: false, changes };
    },
    derivedKey: (r) => (drafts.has(keyOf(r)) ? `${hash(drafts.get(keyOf(r))!.data)}|${hash(drafts.get(keyOf(r))!.base)}` : null),
    checkBase: (r) => {
      const s = drafts.get(keyOf(r))?.baseStatus ?? "ok";
      return s === "stale"
        ? { status: "stale", changed: ["locale"], based_on: { locale: "x", common: null, at: "2026-01-01T00:00:00Z" } }
        : { status: s };
    },
    rebuild: () => ({ ok: false, reason: "conflict", conflicting_fields: [{ field_path: "title", author: "A", live: "B" }] }),
    checkSource: () => ({ status: "none" }),
    recordBase() {},
    recordSource() {},
    liveValue: (e, p) => (live[`${e.contentType}/${e.slug}/${e.locale}`] ?? {})[p],
    listLinkedDrafts: () =>
      Array.from(drafts.entries())
        .filter(([, d]) => d.link)
        .map(([k, d]) => {
          const [contentType, slug, locale, variant] = k.split("/") as [string, string, string, string];
          return { ref: { contentType, slug, locale, variant }, link: d.link! };
        }),
  };
  return { store, drafts, entries, removed };
}

function makeService(opts: {
  store: ProposalDraftStore;
  promote?: (entry: ProposalEntryRow, o: PromoteEntryOpts) => PromoteEntryResult;
  extraDeps?: Partial<Parameters<typeof createProposalService>[0]>;
}) {
  const applyUpdates = vi.fn(async () => ({ ok: true }));
  const promoteCalls: Array<{ entry: ProposalEntryRow; opts: PromoteEntryOpts }> = [];
  const svc = createProposalService({
    site: SITE,
    issueExists: () => true,
    captureBaseline: () => ({ values: {} }),
    applyUpdates,
    draftStore: opts.store,
    ...opts.extraDeps,
    promoteEntry: async (entry, _author, o) => {
      promoteCalls.push({ entry, opts: o });
      return (
        opts.promote?.(entry, o) ?? {
          ok: true,
          published_diff: [{ field_path: "title", before: "Old", after: "New", scope: "locale" }],
          pre_apply_snapshot: { live: "title: Old\n", common: null },
        }
      );
    },
  });
  return { svc, applyUpdates, promoteCalls };
}

function entry(overrides: Partial<ProposalEntryInput> = {}): ProposalEntryInput {
  return {
    contentType: "blog",
    slug: "hello",
    locale: "es",
    updates: [{ field_path: "title", value: "New" }],
    ...overrides,
  };
}

describe("proposals v1.0 (draft-first)", () => {
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

  it("create writes updates into a new draft, links it and never touches live", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old", description: "Keep" } });
    const { svc, applyUpdates } = makeService({ store: fake.store });
    const res = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.proposal;
    expect(p.system_version).toBe("1.0");
    expect(p.review_mode).toBe("draft_backed");
    const e = p.entries[0]!;
    expect(e.variant).toBe("draft");
    expect(e.created_draft).toBe(true);
    expect(e.ops).toEqual([{ field_path: "title", value: "New" }]);
    expect(e.baseline_context.values).toEqual({ title: "Old" });
    expect(e.requested_ops).toEqual([{ field_path: "title", value: "New" }]);
    expect(e.ops_match_request).toBe(true);
    const d = fake.drafts.get("blog/hello/es/draft")!;
    expect(d.data).toEqual({ title: "New", description: "Keep" });
    expect(d.link).toMatchObject({ id: p.id, created_by_proposal: true });
    expect(applyUpdates).not.toHaveBeenCalled();
    expect(() => (e.ops as unknown as unknown[]).push({})).toThrow();
  });

  it("does not adopt a free staff draft: picks draft-p{id6} instead", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    fake.store.create({ contentType: "blog", slug: "hello", locale: "es", variant: "draft" }, { author: "staff" });
    const { svc } = makeService({ store: fake.store });
    const res = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = res.proposal.entries[0]!;
    expect(e.variant).toMatch(/^draft-p[a-z0-9]{6}$/);
    expect(fake.drafts.get("blog/hello/es/draft")!.data).toEqual({ title: "Old" });
  });

  it("uses an explicit existing draft without marking it created", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    fake.store.create({ contentType: "blog", slug: "hello", locale: "es", variant: "translation" }, { author: "t" });
    const { svc } = makeService({ store: fake.store });
    const res = await svc.create(
      { title: "Title fix", summary: SUMMARY, entries: [entry({ variant: "translation" })] },
      { username: "alice" },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.entries[0]!.created_draft).toBeUndefined();
    expect(fake.drafts.get("blog/hello/es/translation")!.link?.created_by_proposal).toBeUndefined();
  });

  it("rejects variants with traffic (experiments)", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    fake.store.create({ contentType: "blog", slug: "hello", locale: "es", variant: "exp" }, { author: "s" });
    fake.drafts.get("blog/hello/es/exp")!.alloc = 50;
    const { svc } = makeService({ store: fake.store });
    const res = await svc.create(
      { title: "Title fix", summary: SUMMARY, entries: [entry({ variant: "exp" })] },
      { username: "alice" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("variant_has_traffic");
  });

  it("allows one open proposal with page-level fields per page (competing_shared_fields)", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" }, "blog/hello/en": { title: "Old EN" } });
    const { svc } = makeService({ store: fake.store });
    const a = await svc.create(
      {
        title: "Funnel",
        summary: SUMMARY,
        entries: [entry({ updates: [{ field_path: "funnel.stage", value: "awareness" }] })],
      },
      { username: "alice" },
    );
    expect(a.ok).toBe(true);
    const b = await svc.create(
      {
        title: "Funnel EN",
        summary: SUMMARY,
        entries: [entry({ locale: "en", updates: [{ field_path: "funnel.stage", value: "consideration" }] })],
      },
      { username: "carol" },
    );
    expect(b.ok).toBe(false);
    if (!b.ok && a.ok) {
      expect(b.code).toBe("competing_shared_fields");
      expect(b.duplicate_of).toBe(a.proposal.id);
    }
    expect(fake.drafts.has("blog/hello/en/draft")).toBe(false);
    const c = await svc.create(
      { title: "Title EN", summary: SUMMARY, entries: [entry({ locale: "en" })] },
      { username: "carol" },
    );
    expect(c.ok).toBe(true);
  });

  it("rolls back drafts already written when a later entry fails", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" }, "blog/other/es": { title: "O" } });
    const { svc } = makeService({ store: fake.store });
    const res = await svc.create(
      {
        title: "Two",
        summary: SUMMARY,
        entries: [entry(), entry({ slug: "other", updates: [{ field_path: "boom", value: 1 }] })],
      },
      { username: "alice" },
    );
    expect(res.ok).toBe(false);
    expect(fake.drafts.size).toBe(0);
  });

  describe("new section-built page from an accepted idea", () => {
    const kit = { contentType: "downloadable", slug: "ai-engineering-interview-kit", locale: "en" };
    const sections = [{ type: "hero", version: "1.0", title: "AI Engineering Interview Kit" }];
    const liveKeys = new Set<string>(["downloadable/kit-live/en"]);
    const pageDeps = (validateSections?: () => Array<{ property_path: string; message: string }>) => ({
      resolveExistence: (e: { contentType: string; slug: string; locale: string }) => ({
        live: liveKeys.has(`${e.contentType}/${e.slug}/${e.locale}`) ? ("exists" as const) : ("missing" as const),
        draftExists: false,
      }),
      inspectMissingTarget: () => ({ shape: "page_file" as const, requiredFields: [] }),
      ...(validateSections ? { validateSections } : {}),
    });

    async function acceptKitIdea(svc: ReturnType<typeof makeService>["svc"]) {
      const idea = await svc.create(
        {
          kind: "idea",
          title: "AI Engineering Interview Kit",
          summary: SUMMARY,
          related_entries: [kit],
          idea_funnel: { stage: "awareness", products: "all" },
        },
        { username: "alice" },
      );
      if (!idea.ok) throw new Error(idea.error);
      const accepted = await svc.update(idea.proposal.id, "accept", {
        username: "bob",
        next_step: "File the page with full sections.",
        accepted_entry: kit,
      });
      if (!accepted.ok) throw new Error(accepted.error);
      return idea.proposal.id;
    }

    it("creates the page folder and a draft holding the proposed sections", async () => {
      const fake = fakeDraftStore();
      const { svc } = makeService({ store: fake.store, extraDeps: pageDeps() });
      const ideaId = await acceptKitIdea(svc);
      const res = await svc.create(
        {
          title: "Kit page",
          summary: SUMMARY,
          implements_proposal_id: ideaId,
          review_situations: ["new_public_content"],
          entries: [entry({ ...kit, updates: [{ field_path: "sections", value: sections }] })],
        },
        { username: "alice" },
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(fake.entries.has("downloadable/ai-engineering-interview-kit")).toBe(true);
      const variant = res.proposal.entries[0]!.variant!;
      const d = fake.drafts.get(`downloadable/ai-engineering-interview-kit/en/${variant}`)!;
      expect(d.data.sections).toEqual(sections);
    });

    it("rejects registry-invalid sections before any draft or folder is created", async () => {
      const fake = fakeDraftStore();
      const { svc } = makeService({
        store: fake.store,
        extraDeps: pageDeps(() => [{ property_path: "sections[0].type", message: "Unknown component" }]),
      });
      const ideaId = await acceptKitIdea(svc);
      const res = await svc.create(
        {
          title: "Kit page",
          summary: SUMMARY,
          implements_proposal_id: ideaId,
          entries: [entry({ ...kit, updates: [{ field_path: "sections", value: sections }] })],
        },
        { username: "alice" },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("invalid_sections");
      expect(fake.drafts.size).toBe(0);
      expect(fake.entries.has("downloadable/ai-engineering-interview-kit")).toBe(false);
    });

    it("a new language on an existing page needs no idea", async () => {
      const fake = fakeDraftStore();
      fake.entries.add("downloadable/kit-live");
      const { svc } = makeService({ store: fake.store, extraDeps: pageDeps() });
      const res = await svc.create(
        {
          title: "Spanish kit",
          summary: SUMMARY,
          review_situations: ["locale_translation"],
          entries: [
            entry({
              contentType: "downloadable",
              slug: "kit-live",
              locale: "es",
              updates: [{ field_path: "sections", value: sections }],
            }),
          ],
        },
        { username: "alice" },
      );
      expect(res.ok).toBe(true);
    });
  });

  describe("layout_owner: new languages, accept, templates, reattach", () => {
    const sections = [{ type: "hero", version: "1.0", title: "Hola" }];
    type Info = { layout_owner: "shared_template" | "entry"; detached?: true; is_shared_template?: true };
    let owners: Record<string, Info>;

    function layoutDeps(fake: ReturnType<typeof fakeDraftStore>, live: Record<string, unknown> = {}) {
      fake.store.draftValue = (r, p) => fake.drafts.get(keyOf(r))?.data[p];
      return {
        resolveExistence: (e: { contentType: string; slug: string; locale: string; variant?: string | null }) => ({
          live: live[`${e.contentType}/${e.slug}/${e.locale}`] ? ("exists" as const) : ("missing" as const),
          draftExists: Boolean(e.variant && fake.drafts.has(keyOf({ ...e, variant: e.variant }))),
        }),
        resolveLayoutOwner: ({ contentType, slug }: { contentType: string; slug: string }) =>
          owners[`${contentType}/${slug}`] ??
          (slug === "template"
            ? { layout_owner: "shared_template" as const, is_shared_template: true as const }
            : { layout_owner: "shared_template" as const }),
      };
    }

    beforeEach(() => {
      owners = {
        "landing/ai-bootcamp": { layout_owner: "entry" },
        "blog/custom": { layout_owner: "entry", detached: true },
        "course/custom": { layout_owner: "entry", detached: true },
      };
    });

    const newLocaleCases = [
      { name: "a type without a shared layout", contentType: "landing", slug: "ai-bootcamp", detached: undefined },
      { name: "a detached file-based entry", contentType: "blog", slug: "custom", detached: true },
      { name: "a detached database-backed entry", contentType: "course", slug: "custom", detached: true },
    ];

    for (const c of newLocaleCases) {
      it(`refuses a new language of ${c.name} without full sections (create)`, async () => {
        const fake = fakeDraftStore();
        fake.entries.add(`${c.contentType}/${c.slug}`);
        const { svc } = makeService({ store: fake.store, extraDeps: layoutDeps(fake) });
        const res = await svc.create(
          { title: "Spanish", summary: SUMMARY, entries: [entry({ contentType: c.contentType, slug: c.slug })] },
          { username: "alice" },
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("sections_required");
        expect((res as { details?: Record<string, unknown> }).details).toMatchObject({
          layout_owner: "entry",
          new_locale: true,
          ...(c.detached ? { detached: true } : {}),
        });
        expect(fake.drafts.size).toBe(0);
      });
    }

    it("accepts a new language with one full sections update", async () => {
      const fake = fakeDraftStore();
      fake.entries.add("landing/ai-bootcamp");
      const { svc } = makeService({ store: fake.store, extraDeps: layoutDeps(fake) });
      const res = await svc.create(
        {
          title: "Spanish",
          summary: SUMMARY,
          entries: [entry({ contentType: "landing", slug: "ai-bootcamp", updates: [{ field_path: "sections", value: sections }] })],
        },
        { username: "alice" },
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.proposal.entries[0]!.baseline_context.layout_owner).toBe("entry");
      expect(res.proposal.entries[0]!.layout_owner).toBe("entry");
    });

    it("accepts a named draft that already has sections", async () => {
      const fake = fakeDraftStore();
      fake.entries.add("landing/ai-bootcamp");
      fake.store.create({ contentType: "landing", slug: "ai-bootcamp", locale: "es", variant: "translation" }, { author: "t" });
      fake.drafts.get("landing/ai-bootcamp/es/translation")!.data.sections = sections;
      const { svc } = makeService({ store: fake.store, extraDeps: layoutDeps(fake) });
      const res = await svc.create(
        {
          title: "Spanish",
          summary: SUMMARY,
          entries: [entry({ contentType: "landing", slug: "ai-bootcamp", variant: "translation" })],
        },
        { username: "alice" },
      );
      expect(res.ok).toBe(true);
    });

    it("leaves attached (shared_template) new languages alone", async () => {
      const fake = fakeDraftStore();
      const { svc } = makeService({ store: fake.store, extraDeps: layoutDeps(fake) });
      const res = await svc.create({ title: "Spanish", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
      expect(res.ok).toBe(true);
    });

    it("refuses revise_entries that drops full sections from a new language", async () => {
      const fake = fakeDraftStore();
      fake.entries.add("landing/ai-bootcamp");
      const { svc } = makeService({ store: fake.store, extraDeps: layoutDeps(fake) });
      const target = { contentType: "landing", slug: "ai-bootcamp" };
      const created = await svc.create(
        {
          title: "Spanish",
          summary: SUMMARY,
          entries: [entry({ ...target, updates: [{ field_path: "sections", value: sections }] })],
        },
        { username: "alice" },
      );
      if (!created.ok) throw new Error(created.error);
      const res = await svc.update(created.proposal.id, "revise_entries", {
        username: "alice",
        entries: [entry({ ...target })],
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("sections_required");
        expect((res as { details?: Record<string, unknown> }).details).toMatchObject({ new_locale: true });
      }
    });

    it("accept on a page idea warns accepted_entry_needs_layout", async () => {
      const fake = fakeDraftStore();
      const { svc } = makeService({
        store: fake.store,
        extraDeps: {
          ...layoutDeps(fake),
          inspectMissingTarget: () => ({ shape: "page_file" as const, requiredFields: [] }),
        },
      });
      const target = { contentType: "landing", slug: "new-landing", locale: "en" };
      owners["landing/new-landing"] = { layout_owner: "entry" };
      const idea = await svc.create(
        {
          kind: "idea",
          title: "New landing",
          summary: SUMMARY,
          related_entries: [target],
          idea_funnel: { stage: "awareness", products: "all" },
        },
        { username: "alice" },
      );
      if (!idea.ok) throw new Error(idea.error);
      const accepted = await svc.update(idea.proposal.id, "accept", {
        username: "bob",
        next_step: "File the page with full sections.",
        accepted_entry: target,
      });
      expect(accepted.ok).toBe(true);
      if (!accepted.ok) return;
      const warnings = (accepted as { warnings?: Array<{ code: string; details?: Record<string, unknown> }> }).warnings;
      expect(warnings?.map((w) => w.code)).toContain("accepted_entry_needs_layout");
      expect(warnings?.find((w) => w.code === "accepted_entry_needs_layout")?.details).toMatchObject({
        layout_owner: "entry",
      });
      expect(svc.get(idea.proposal.id)!.accepted_entry_layout_owner).toBe("entry");
    });

    describe("templates", () => {
      function templateService(opts: {
        live: Record<string, Record<string, unknown>>;
        templateLocales: string[];
        scan?: Parameters<typeof createProposalService>[0]["scanTemplatePlaceholders"];
      }) {
        const fake = fakeDraftStore(opts.live);
        fake.entries.add("blog/template");
        fake.store.listTemplateLocales = () => opts.templateLocales;
        fake.store.listAttachedEntries = (ct, locale) => (ct === "blog" ? [`a-${locale}`, `b-${locale}`, `c-${locale}`] : []);
        const deps = { ...layoutDeps(fake, opts.live), ...(opts.scan ? { scanTemplatePlaceholders: opts.scan } : {}) };
        return { fake, ...makeService({ store: fake.store, extraDeps: deps }) };
      }
      const tplEntry = (locale: string, value: unknown = sections) =>
        entry({ slug: "template", locale, updates: [{ field_path: "sections", value }] });

      it("a full-sections template proposal succeeds and warns when languages are missing", async () => {
        const { svc } = templateService({
          live: { "blog/template/en": { sections: [] }, "blog/template/es": { sections: [] } },
          templateLocales: ["en", "es"],
        });
        const partial = await svc.create(
          { title: "Template", summary: SUMMARY, entries: [tplEntry("en")] },
          { username: "alice" },
        );
        expect(partial.ok).toBe(true);
        if (!partial.ok) return;
        const w = (partial as { warnings?: Array<{ code: string; details?: Record<string, unknown> }> }).warnings ?? [];
        expect(w.find((x) => x.code === "template_locales_incomplete")?.details).toMatchObject({
          changed_locales: ["en"],
          missing_locales: ["es"],
        });
        expect(partial.proposal.entries[0]!.is_shared_template).toBe(true);

        const both = await svc.create(
          { title: "Template both", summary: SUMMARY, all_or_nothing: true, entries: [tplEntry("en"), tplEntry("es")] },
          { username: "carol" },
        );
        // en already belongs to the first proposal; only the warning shape matters here.
        const codes = ((both as { warnings?: Array<{ code: string }> }).warnings ?? []).map((x) => x.code);
        expect(codes).not.toContain("template_locales_incomplete");
      });

      it("refuses a new template language without full sections", async () => {
        const { svc } = templateService({ live: { "blog/template/en": { sections } }, templateLocales: ["en"] });
        const res = await svc.create(
          { title: "Template fr", summary: SUMMARY, entries: [entry({ slug: "template", locale: "fr" })] },
          { username: "alice" },
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("sections_required");
        expect((res as { details?: Record<string, unknown> }).details).toMatchObject({
          is_shared_template: true,
          new_locale: true,
        });
      });

      it("dry run and apply warn template_placeholders_unfilled; nothing new → no warning", async () => {
        const { newEntryPlaceholders, summarizeUnfilledPlaceholders } = await import("./template-placeholder-scan");
        const bags: Record<string, Record<string, unknown>> = { "a-es": { hero_image: "a.png" }, "b-es": {}, "c-es": {} };
        const scan = vi.fn(
          (o: { liveSections: unknown; draftSections: unknown; attachedSlugs: string[] }) =>
            summarizeUnfilledPlaceholders(
              newEntryPlaceholders(o.liveSections, o.draftSections),
              o.attachedSlugs.map((slug) => ({ slug, bag: bags[slug] ?? {} })),
            ),
        );
        const liveSections = [{ type: "hero", title: "{{ entry.title }}" }];
        const { svc } = templateService({
          live: { "blog/template/es": { sections: liveSections } },
          templateLocales: ["es"],
          scan,
        });
        const created = await svc.create(
          {
            title: "Template image",
            summary: SUMMARY,
            entries: [tplEntry("es", [{ type: "hero", title: "{{ entry.title }}", image: "{{ entry.hero_image }}" }])],
          },
          { username: "alice" },
        );
        if (!created.ok) throw new Error(created.error);
        const dry = await svc.update(created.proposal.id, "apply", { username: "bob", dry_run: true });
        expect(dry.ok).toBe(true);
        const dryGap = ((dry as { warnings?: Array<{ code: string; details?: Record<string, unknown> }> }).warnings ?? []).find(
          (w) => w.code === "template_placeholders_unfilled",
        );
        expect(dryGap?.details).toMatchObject({
          locale: "es",
          placeholders: [{ name: "hero_image", missing: 2, total: 3, sample: ["b-es", "c-es"] }],
        });
        const applied = await svc.update(created.proposal.id, "apply", { username: "bob", confirm_affected_entries: 3 });
        expect(applied.ok).toBe(true);
        const codes = ((applied as { warnings?: Array<{ code: string }> }).warnings ?? []).map((w) => w.code);
        expect(codes).toContain("template_placeholders_unfilled");

        const same = templateService({
          live: { "blog/template/es": { sections: liveSections } },
          templateLocales: ["es"],
          scan,
        });
        const plain = await same.svc.create(
          { title: "Template copy", summary: SUMMARY, entries: [tplEntry("es", [{ type: "hero", title: "{{ entry.title }}!" }])] },
          { username: "dave" },
        );
        if (!plain.ok) throw new Error(plain.error);
        const dryPlain = await same.svc.update(plain.proposal.id, "apply", { username: "bob", dry_run: true });
        const plainCodes = ((dryPlain as { warnings?: Array<{ code: string }> }).warnings ?? []).map((w) => w.code);
        expect(plainCodes).not.toContain("template_placeholders_unfilled");
      });
    });

    it("apply after a reattach returns context_stale (layout_owner_changed) and needs_author", async () => {
      const live = { "landing/ai-bootcamp/es": { title: "Old", sections: [{ type: "hero", version: "1.0", title: "Old" }] } };
      const fake = fakeDraftStore(live);
      fake.entries.add("landing/ai-bootcamp");
      const { svc, promoteCalls } = makeService({ store: fake.store, extraDeps: layoutDeps(fake, live) });
      const created = await svc.create(
        {
          title: "Layout",
          summary: SUMMARY,
          entries: [entry({ contentType: "landing", slug: "ai-bootcamp", updates: [{ field_path: "sections", value: sections }] })],
        },
        { username: "alice" },
      );
      if (!created.ok) throw new Error(created.error);
      owners["landing/ai-bootcamp"] = { layout_owner: "shared_template" };
      const res = await svc.update(created.proposal.id, "apply", { username: "bob" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.pending?.[0]).toMatchObject({ code: "context_stale", details: { reason: "layout_owner_changed" } });
      expect(promoteCalls).toHaveLength(0);
      expect(res.proposal.stale_since).toBeTruthy();
      expect(toProposalSummary(res.proposal).attention).toBe("needs_author");
    });
  });

  it("apply only promotes the draft and stores what was published", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    const { svc, applyUpdates, promoteCalls } = makeService({ store: fake.store });
    const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
    if (!created.ok) throw new Error(created.error);
    const res = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.status).toBe("finished");
    expect(applyUpdates).not.toHaveBeenCalled();
    expect(promoteCalls.map((c) => c.opts.dry_run === true)).toEqual([true, false]);
    expect(promoteCalls[1]!.opts.confirm_base_unknown).toBeUndefined();
    expect(res.proposal.entries[0]!.published_diff?.[0]?.field_path).toBe("title");
  });

  it("apply dry_run returns the merge preview and writes nothing", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    const { svc, promoteCalls } = makeService({
      store: fake.store,
      promote: (_e, o) =>
        o.dry_run
          ? { ok: true, dry_run: true, rebuilt: { kept_live_fields: ["description"], author_fields: ["title"] } }
          : { ok: true },
    });
    const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
    if (!created.ok) throw new Error(created.error);
    const res = await svc.update(created.proposal.id, "apply", { username: "bob", dry_run: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dry_run).toBe(true);
    expect(res.merge_preview?.[0]).toMatchObject({ ok: true, rebuilt: { kept_live_fields: ["description"] } });
    expect(promoteCalls).toHaveLength(1);
    expect(res.proposal.status).toBe("open");
  });

  it("live moved with conflicting fields → context_stale and needs_author (no overwrite)", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    const { svc, promoteCalls } = makeService({
      store: fake.store,
      promote: () => ({
        ok: false,
        code: "draft_base_stale",
        error: "live changed",
        details: { reason: "conflict", conflicting_fields: [{ field_path: "title", author: "New", live: "Live" }] },
      }),
    });
    const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
    if (!created.ok) throw new Error(created.error);
    const res = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pending?.[0]).toMatchObject({ code: "context_stale", details: { reason: "live_changed" } });
    expect(promoteCalls).toHaveLength(1);
    expect(res.proposal.stale_since).toBeTruthy();
    expect(toProposalSummary(res.proposal).attention).toBe("needs_author");
    expect(res.proposal.entries[0]!.last_error).toMatch(/^context_stale/);
  });

  it("unknown draft base asks for confirm_base_unknown before publishing", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    const { svc, promoteCalls } = makeService({
      store: fake.store,
      promote: (_e, o) =>
        o.confirm_base_unknown ? { ok: true } : { ok: false, code: "draft_base_unknown", error: "no base" },
    });
    const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
    if (!created.ok) throw new Error(created.error);
    const first = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.code).toBe("draft_base_unknown");
    expect(svc.get(created.proposal.id)!.entries[0]!.status).toBe("pending");
    const second = await svc.update(created.proposal.id, "apply", { username: "bob", confirm_base_unknown: true });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.proposal.status).toBe("finished");
    expect(promoteCalls.at(-1)!.opts.confirm_base_unknown).toBe(true);
  });

  it("template proposals report affected pages and need confirm_affected_entries = count", async () => {
    const fake = fakeDraftStore({ "blog/template/es": { title: "Tpl" } });
    fake.entries.add("blog/template");
    fake.store.listAttachedEntries = (ct, locale) => (ct === "blog" && locale === "es" ? ["a", "b", "c", "d"] : []);
    const { svc, promoteCalls } = makeService({ store: fake.store });
    const created = await svc.create(
      { title: "Template copy", summary: SUMMARY, entries: [entry({ slug: "template" })] },
      { username: "alice" },
    );
    if (!created.ok) throw new Error(created.error);
    expect(svc.get(created.proposal.id)!.affected_entries).toMatchObject({ count: 4 });
    expect(svc.get(created.proposal.id)!.affected_entries!.sample).toHaveLength(3);
    const first = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.code).toBe("confirm_affected_entries");
    expect(promoteCalls.filter((c) => !c.opts.dry_run)).toHaveLength(0);
    const wrong = await svc.update(created.proposal.id, "apply", { username: "bob", confirm_affected_entries: 3 });
    expect(wrong.ok).toBe(false);
    const ok = await svc.update(created.proposal.id, "apply", { username: "bob", confirm_affected_entries: 4 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.proposal.status).toBe("finished");
  });

  it("snapshot export/replace keeps v1 columns and the original request", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    const { svc } = makeService({ store: fake.store });
    const created = await svc.create(
      { title: "Title fix", summary: SUMMARY, entries: [entry()], all_or_nothing: true },
      { username: "alice" },
    );
    if (!created.ok) throw new Error(created.error);
    await svc.update(created.proposal.id, "apply", { username: "bob" });
    const snap = exportAllProposals(SITE);
    expect(replaceProposalsFromSnapshot(SITE, snap)).toBe(snap.length);
    const row = getSiteSqlite(SITE)
      .prepare(
        `SELECT p.system_version, p.all_or_nothing, e.created_draft, e.ops_json, e.pre_apply_snapshot_json
         FROM content_proposals p JOIN content_proposal_entries e ON e.proposal_id = p.id WHERE p.id = ?`,
      )
      .get(created.proposal.id) as Record<string, unknown>;
    expect(row).toMatchObject({ system_version: "1.0", all_or_nothing: 1, created_draft: 1 });
    expect(JSON.parse(String(row.ops_json))).toEqual([{ field_path: "title", value: "New" }]);
    expect(JSON.parse(String(row.pre_apply_snapshot_json))).toEqual({ live: "title: Old\n", common: null });
  });

  it("all_or_nothing publishes nothing when one entry fails", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" }, "blog/other/es": { title: "O" } });
    const { svc, promoteCalls } = makeService({
      store: fake.store,
      promote: (e) => (e.slug === "other" ? { ok: false, code: "seo_gate", error: "missing seo" } : { ok: true }),
    });
    const created = await svc.create(
      { title: "Two", summary: SUMMARY, entries: [entry(), entry({ slug: "other" })], all_or_nothing: true },
      { username: "alice" },
    );
    if (!created.ok) throw new Error(created.error);
    expect(created.proposal.all_or_nothing).toBe(true);
    const res = await svc.update(created.proposal.id, "apply", { username: "bob" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("all_or_nothing_blocked");
    expect(promoteCalls.every((c) => c.opts.dry_run)).toBe(true);
  });

  it("reject deletes drafts the proposal created and unlinks pre-existing ones", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" }, "blog/other/es": { title: "O" } });
    fake.store.create({ contentType: "blog", slug: "other", locale: "es", variant: "mine" }, { author: "s" });
    const { svc } = makeService({ store: fake.store });
    const created = await svc.create(
      { title: "Two", summary: SUMMARY, entries: [entry(), entry({ slug: "other", variant: "mine" })] },
      { username: "alice" },
    );
    if (!created.ok) throw new Error(created.error);
    const res = await svc.update(created.proposal.id, "reject", {
      username: "bob",
      confirm_reject: true,
      reject_kind: "harmful",
      close_note: "This change would mislead readers about pricing and must not ship on this page at all.",
    });
    expect(res.ok).toBe(true);
    expect(fake.drafts.has("blog/hello/es/draft")).toBe(false);
    expect(fake.drafts.get("blog/other/es/mine")?.link).toBeNull();
    if (res.ok) expect(res.warnings?.map((w) => w.code)).toEqual(["draft_deleted", "draft_kept"]);
  });

  it("revise_entries restarts a created draft from live and drops removed entries", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old", description: "D" }, "blog/other/es": { title: "O" } });
    const { svc } = makeService({ store: fake.store });
    const created = await svc.create(
      {
        title: "Two",
        summary: SUMMARY,
        entries: [entry({ updates: [{ field_path: "description", value: "New D" }] }), entry({ slug: "other" })],
      },
      { username: "alice" },
    );
    if (!created.ok) throw new Error(created.error);
    const res = await svc.update(created.proposal.id, "revise_entries", {
      username: "alice",
      entries: [entry()],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(fake.drafts.get("blog/hello/es/draft")!.data).toEqual({ title: "New", description: "D" });
    expect(fake.drafts.has("blog/other/es/draft")).toBe(false);
    expect(res.proposal.entries).toHaveLength(1);
  });

  it("direct draft edits by staff make them co-author and block their approval", async () => {
    const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
    const { svc } = makeService({ store: fake.store });
    const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
    if (!created.ok) throw new Error(created.error);
    const tmp = path.join(os.tmpdir(), `v1-coauthor-${Date.now()}`, "hello");
    fs.mkdirSync(tmp, { recursive: true });
    const file = path.join(tmp, "draft.es.yml");
    fs.writeFileSync(file, "title: Staff title\n");
    const absorbed = absorbDraftEdit(SITE, created.proposal.id, file, "staffer");
    expect(absorbed).toEqual({ absorbed: true, co_author: true });
    const p = svc.get(created.proposal.id)!;
    expect(p.co_authors.map((c) => c.username)).toEqual(["staffer"]);
    const res = await svc.update(created.proposal.id, "apply", { username: "staffer" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("four_eyes_co_author");
  });

  it("pre-1.0 proposals are read-only (legacy_version) but can still be withdrawn", async () => {
    const legacy = createProposalService({
      site: SITE,
      issueExists: () => true,
      captureBaseline: () => ({ values: { "call_to_action.title": "Old" } }),
      applyUpdates: async () => ({ ok: true }),
    });
    const created = await legacy.create(
      { title: "Legacy", summary: SUMMARY, entries: [entry({ updates: [{ field_path: "call_to_action.title", value: "N" }] })] },
      { username: "alice" },
    );
    if (!created.ok) throw new Error(created.error);
    expect(created.proposal.system_version).toBeNull();
    const fake = fakeDraftStore();
    const { svc } = makeService({ store: fake.store });
    const claim = await svc.update(created.proposal.id, "claim", { username: "bob" });
    expect(claim.ok).toBe(false);
    if (!claim.ok) expect(claim.code).toBe("legacy_version");
    const withdraw = await svc.update(created.proposal.id, "withdraw", {
      username: "alice",
      close_note: "Superseded by the draft-first flow, refiling as v1.",
    });
    expect(withdraw.ok).toBe(true);
    const row = getSiteSqlite(SITE)
      .prepare(`SELECT system_version FROM content_proposals WHERE id = ?`)
      .get(created.proposal.id) as { system_version: string | null };
    expect(row.system_version).toBeNull();
  });

  describe("legacy cutover", () => {
    async function legacyProposal(entries: ProposalEntryInput[], baseline: Record<string, unknown>) {
      const legacy = createProposalService({
        site: SITE,
        issueExists: () => true,
        captureBaseline: () => ({ values: baseline }),
        applyUpdates: async () => ({ ok: true }),
      });
      const created = await legacy.create({ title: "Legacy", summary: SUMMARY, entries }, { username: "alice" });
      if (!created.ok) throw new Error(created.error);
      return created.proposal.id;
    }

    it("soft edits get their own draft-p{id6} with the ops; existing drafts stay untouched", async () => {
      const id = await legacyProposal([entry()], { title: "Old" });
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      fake.store.create({ contentType: "blog", slug: "hello", locale: "es", variant: "draft" }, { author: "staff" });
      const { svc } = makeService({ store: fake.store });
      const report = await svc.migrateLegacy({ author: "system" });
      expect(report.closed).toEqual([]);
      const variant = report.migrated[0]!.entries[0]!.variant;
      expect(variant).toMatch(/^draft-p[a-z0-9]{6}$/);
      expect(fake.drafts.get(`blog/hello/es/${variant}`)!.data).toEqual({ title: "New" });
      expect(fake.drafts.get(`blog/hello/es/${variant}`)!.link).toMatchObject({ id, created_by_proposal: true });
      expect(fake.drafts.get("blog/hello/es/draft")!.data).toEqual({ title: "Old" });
      const p = svc.get(id)!;
      expect(p.system_version).toBe("1.0");
      expect(p.review_mode).toBe("draft_backed");
      expect(p.entries[0]!.created_draft).toBe(true);
      expect(p.stale_since).toBeNull();
      const claim = await svc.update(id, "claim", { username: "bob" });
      expect(claim.ok).toBe(true);
    });

    it("starts context_stale when live no longer matches the stored baseline", async () => {
      const id = await legacyProposal([entry()], { title: "Older" });
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc } = makeService({ store: fake.store });
      const report = await svc.migrateLegacy({ author: "system" });
      expect(report.migrated[0]!.stale?.[0]?.fields).toEqual(["title"]);
      expect(toProposalSummary(svc.get(id)!).attention).toBe("needs_author");
    });

    it("closes proposals whose page is gone with legacy_version; ideas only change version", async () => {
      const gone = await legacyProposal([entry({ slug: "other" })], { title: "Old" });
      const legacy = createProposalService({
        site: SITE,
        issueExists: () => true,
        captureBaseline: () => ({ values: {} }),
        applyUpdates: async () => ({ ok: true }),
      });
      const idea = await legacy.create(
        { kind: "notes", title: "A note", summary: SUMMARY, entries: [] },
        { username: "alice" },
      );
      if (!idea.ok) throw new Error(idea.error);
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc } = makeService({ store: fake.store });
      const dry = await svc.migrateLegacy({ author: "system", dry_run: true });
      expect(dry.closed.map((c) => c.id)).toEqual([gone]);
      expect(svc.get(gone)!.status).toBe("open");
      const report = await svc.migrateLegacy({ author: "system" });
      expect(report.closed[0]).toMatchObject({ id: gone });
      const closed = svc.get(gone)!;
      expect(closed.status).toBe("withdrawn");
      expect(closed.close_reason).toBe("legacy_version");
      expect(svc.get(idea.proposal.id)!.system_version).toBe("1.0");
      expect(fake.drafts.size).toBe(0);
    });
  });

  describe("phase 3: stale sweep, link check, revert", () => {
    const DAY = 24 * 60 * 60 * 1000;

    it("marks drift, flags at 30 days and closes at 90 (created drafts deleted)", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc } = makeService({ store: fake.store });
      const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
      if (!created.ok) throw new Error(created.error);
      const id = created.proposal.id;
      fake.drafts.get("blog/hello/es/draft")!.baseStatus = "stale";
      const t0 = Date.now();
      expect((await svc.staleSweep({ now: t0 })).marked).toEqual([id]);
      expect(toProposalSummary(svc.get(id)!).attention).toBe("needs_author");
      expect((await svc.staleSweep({ now: t0 + 10 * DAY })).flagged).toEqual([]);
      expect((await svc.staleSweep({ now: t0 + 31 * DAY })).flagged).toEqual([id]);
      expect(svc.get(id)!.stale_flagged_at).toBeTruthy();
      expect((await svc.staleSweep({ now: t0 + 91 * DAY })).closed).toEqual([id]);
      const closed = svc.get(id)!;
      expect(closed.status).toBe("withdrawn");
      expect(closed.close_reason).toBe("abandoned_stale");
      expect(fake.drafts.has("blog/hello/es/draft")).toBe(false);
    });

    it("clears stale_since when the draft is current again", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc } = makeService({ store: fake.store });
      const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
      if (!created.ok) throw new Error(created.error);
      fake.drafts.get("blog/hello/es/draft")!.baseStatus = "stale";
      await svc.staleSweep();
      fake.drafts.get("blog/hello/es/draft")!.baseStatus = "ok";
      expect((await svc.staleSweep()).cleared).toEqual([created.proposal.id]);
      expect(svc.get(created.proposal.id)!.stale_since).toBeNull();
    });

    it("link check: orphan after the proposal is gone, cleanup after 7 days; unreachable production never cleans", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" }, "blog/other/es": { title: "O" } });
      const { svc } = makeService({ store: fake.store });
      const draftA = { contentType: "blog", slug: "hello", locale: "es", variant: "draft" };
      const draftB = { contentType: "blog", slug: "other", locale: "es", variant: "draft" };
      fake.store.create(draftA, { author: "x" });
      fake.store.create(draftB, { author: "x" });
      fake.store.link(draftA, { id: "gone-local", env: "unknown", created_by_proposal: true, created_fingerprint: fake.store.fingerprint(draftA)! }, "x");
      fake.store.link(draftB, { id: "prod-proposal", env: "production" }, "x");
      const t0 = Date.now();
      const first = await svc.verifyDraftLinks({ now: t0, remoteStatus: async (pid) => (pid === "gone-local" ? "closed" : "unknown") });
      expect(first.orphaned).toHaveLength(1);
      expect(first.unverified).toHaveLength(1);
      expect(fake.drafts.get("blog/hello/es/draft")!.link?.orphan_since).toBeTruthy();
      expect(fake.drafts.get("blog/other/es/draft")!.link?.unverified_since).toBeTruthy();
      const later = await svc.verifyDraftLinks({ now: t0 + 8 * DAY, remoteStatus: async (pid) => (pid === "gone-local" ? "closed" : "unknown") });
      expect(later.cleaned).toEqual([{ draft: "blog/hello draft.es", deleted: true }]);
      expect(fake.drafts.has("blog/hello/es/draft")).toBe(false);
      expect(fake.drafts.has("blog/other/es/draft")).toBe(true);
    });

    it("revert opens a proposal that puts back the old values and reports conflicts", async () => {
      const live: Record<string, Record<string, unknown>> = { "blog/hello/es": { title: "Old", description: "D" } };
      const fake = fakeDraftStore(live);
      const { svc } = makeService({
        store: fake.store,
        promote: () => ({
          ok: true,
          published_diff: [
            { field_path: "title", before: "Old", after: "New", scope: "locale" },
            { field_path: "description", before: "D", after: "D2", scope: "locale" },
          ],
        }),
      });
      const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [entry()] }, { username: "alice" });
      if (!created.ok) throw new Error(created.error);
      await svc.update(created.proposal.id, "apply", { username: "bob" });
      live["blog/hello/es"] = { title: "New", description: "Changed later" };
      fake.drafts.clear();
      const res = await svc.update(created.proposal.id, "revert", { username: "carol" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.reverted_from).toBe(created.proposal.id);
      expect(res.proposal.reverts_proposal_id).toBe(created.proposal.id);
      expect(res.conflicting_fields?.map((c) => c.field_path)).toEqual(["description"]);
      expect(fake.drafts.get("blog/hello/es/draft")!.data).toEqual({ title: "Old", description: "Changed later" });
    });
  });

  describe("staff bulk delete", () => {
    const prevEnv = process.env.PIPELINE_ENV;
    afterEach(() => {
      if (prevEnv === undefined) delete process.env.PIPELINE_ENV;
      else process.env.PIPELINE_ENV = prevEnv;
    });

    const staff = { username: "steward" };
    const countRows = (id: string) => {
      const db = getSiteSqlite(SITE);
      const one = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
      return {
        proposals: one(`SELECT COUNT(*) AS n FROM content_proposals WHERE id = ?`),
        entries: one(`SELECT COUNT(*) AS n FROM content_proposal_entries WHERE proposal_id = ?`),
        blockers: one(`SELECT COUNT(*) AS n FROM content_proposal_blockers WHERE proposal_id = ?`),
      };
    };

    async function createOne(fake: ReturnType<typeof fakeDraftStore>, e = entry()) {
      const { svc } = makeService({ store: fake.store });
      const created = await svc.create({ title: "Title fix", summary: SUMMARY, entries: [e] }, { username: "alice" });
      if (!created.ok) throw new Error(created.error);
      return { svc, id: created.proposal.id };
    }

    it("deletes rows in all three tables and removes the draft the proposal created", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc, id } = await createOne(fake);
      getSiteSqlite(SITE)
        .prepare(
          `INSERT INTO content_proposal_blockers (proposal_id, body, author, created_at) VALUES (?, 'stuck', 'bob', ?)`,
        )
        .run(id, Date.now());
      expect(countRows(id).blockers).toBe(1);
      const { results } = await svc.deleteProposals([id], staff);
      expect(results[0]).toMatchObject({ id, status: "deleted" });
      expect(results[0]!.drafts_removed).toHaveLength(1);
      expect(countRows(id)).toEqual({ proposals: 0, entries: 0, blockers: 0 });
      expect(fake.drafts.has("blog/hello/es/draft")).toBe(false);
      expect(fake.removed).toEqual(["blog/hello/es/draft"]);
    });

    it("keeps and unlinks a pre-existing linked draft", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      fake.store.create({ contentType: "blog", slug: "hello", locale: "es", variant: "translation" }, { author: "t" });
      const { svc, id } = await createOne(fake, entry({ variant: "translation" }));
      expect(fake.drafts.get("blog/hello/es/translation")!.link?.id).toBe(id);
      const { results } = await svc.deleteProposals([id], staff);
      expect(results[0]!.status).toBe("deleted");
      expect(results[0]!.drafts_unlinked).toHaveLength(1);
      expect(fake.drafts.has("blog/hello/es/translation")).toBe(true);
      expect(fake.drafts.get("blog/hello/es/translation")!.link).toBeNull();
    });

    it("does not rewrite an older draft that has no link", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      fake.store.create({ contentType: "blog", slug: "hello", locale: "es", variant: "translation" }, { author: "t" });
      const { svc, id } = await createOne(fake, entry({ variant: "translation" }));
      fake.drafts.get("blog/hello/es/translation")!.link = null;
      const linkSpy = vi.spyOn(fake.store, "link");
      const { results } = await svc.deleteProposals([id], staff);
      expect(results[0]!.status).toBe("deleted");
      expect(linkSpy).not.toHaveBeenCalled();
      expect(fake.drafts.has("blog/hello/es/translation")).toBe(true);
    });

    it("keeps (unlinks) a created draft when the proposal has co-authors", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc, id } = await createOne(fake);
      getSiteSqlite(SITE)
        .prepare(`UPDATE content_proposals SET co_authors_json = ? WHERE id = ?`)
        .run(JSON.stringify([{ username: "staffer", at: Date.now() }]), id);
      const { results } = await svc.deleteProposals([id], staff);
      expect(results[0]!.status).toBe("deleted");
      expect(results[0]!.drafts_kept).toHaveLength(1);
      expect(fake.drafts.has("blog/hello/es/draft")).toBe(true);
      expect(fake.drafts.get("blog/hello/es/draft")!.link).toBeNull();
    });

    it("leaves drafts linked to another environment untouched", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc, id } = await createOne(fake);
      fake.drafts.get("blog/hello/es/draft")!.link!.env = "production";
      const { results } = await svc.deleteProposals([id], staff);
      expect(results[0]!.status).toBe("deleted");
      expect(fake.drafts.has("blog/hello/es/draft")).toBe(true);
      expect(fake.drafts.get("blog/hello/es/draft")!.link?.env).toBe("production");
    });

    it("removes a created draft with no link only in production", async () => {
      const local = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const a = await createOne(local);
      local.drafts.get("blog/hello/es/draft")!.link = null;
      await a.svc.deleteProposals([a.id], staff);
      expect(local.drafts.has("blog/hello/es/draft")).toBe(true);

      const prod = fakeDraftStore({ "blog/other/es": { title: "O" } });
      const b = await createOne(prod, entry({ slug: "other" }));
      prod.drafts.get("blog/other/es/draft")!.link = null;
      process.env.PIPELINE_ENV = "production";
      const { results } = await b.svc.deleteProposals([b.id], staff);
      expect(results[0]!.drafts_removed).toHaveLength(1);
      expect(prod.drafts.has("blog/other/es/draft")).toBe(false);
    });

    it("blocks an idea with an open implementing proposal unless both are selected", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" }, "blog/other/es": { title: "O" } });
      const { svc, id: ideaId } = await createOne(fake);
      const { id: implId } = await createOne(fake, entry({ slug: "other" }));
      const db = getSiteSqlite(SITE);
      db.prepare(`UPDATE content_proposals SET kind = 'idea' WHERE id = ?`).run(ideaId);
      db.prepare(`UPDATE content_proposals SET implements_proposal_id = ? WHERE id = ?`).run(ideaId, implId);

      const blocked = await svc.deleteProposals([ideaId], staff);
      expect(blocked.results[0]).toMatchObject({ id: ideaId, status: "blocked_dependents" });
      expect(blocked.results[0]!.dependents).toEqual([{ id: implId, title: "Title fix" }]);
      expect(countRows(ideaId).proposals).toBe(1);

      const both = await svc.deleteProposals([ideaId, implId], staff);
      expect(both.results.map((r) => r.status)).toEqual(["deleted", "deleted"]);
      expect(countRows(ideaId).proposals + countRows(implId).proposals).toBe(0);
    });

    it("stores the full snapshot on the proposal_deleted event and reports proposal_deleted afterwards", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc, id } = await createOne(fake);
      await svc.deleteProposals([id], staff);
      const row = getSiteSqlite(SITE)
        .prepare(`SELECT payload_json FROM events WHERE type = 'proposal_deleted' ORDER BY id DESC LIMIT 1`)
        .get() as { payload_json: string };
      const payload = JSON.parse(row.payload_json) as {
        proposal_id: string;
        snapshot: { id: string; title: string; entries: Array<{ ops: unknown }> };
      };
      expect(payload.proposal_id).toBe(id);
      expect(payload.snapshot.id).toBe(id);
      expect(payload.snapshot.title).toBe("Title fix");
      expect(payload.snapshot.entries[0]!.ops).toEqual([{ field_path: "title", value: "New" }]);

      expect(svc.deletion(id)).toMatchObject({ deleted_by: "steward" });
      const res = await svc.update(id, "withdraw", { username: "alice", close_note: "no longer needed" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("proposal_deleted");
    });

    it("records an error and keeps the row when a draft removal throws", async () => {
      const fake = fakeDraftStore({ "blog/hello/es": { title: "Old" } });
      const { svc, id } = await createOne(fake);
      fake.store.remove = async () => {
        throw new Error("disk full");
      };
      const { results } = await svc.deleteProposals([id], staff);
      expect(results[0]!.status).toBe("error");
      expect(results[0]!.reason).toContain("disk full");
      expect(countRows(id).proposals).toBe(1);
      expect(svc.deletion(id)).toBeNull();
    });

    it("returns not_found for an unknown id", async () => {
      const fake = fakeDraftStore();
      const { svc } = makeService({ store: fake.store });
      const { results } = await svc.deleteProposals(["nope"], staff);
      expect(results).toEqual([
        { id: "nope", status: "not_found", reason: "Proposal not found", drafts_removed: [], drafts_unlinked: [], drafts_kept: [] },
      ]);
    });
  });
});
