import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../live-entry-seo-gate", () => ({ assertLiveEntrySeoAndRequiredFields: () => null }));
vi.mock("../locale-url-slug", () => ({ assertLocaleUrlAvailable: () => ({ ok: true }) }));
vi.mock("../services/onSaveValidation", () => ({ scheduleOnSaveValidation: () => {} }));
vi.mock("../routes/_helpers", () => ({ invalidateContentCaches: () => {} }));
vi.mock("../content-events", () => ({ emitEntryLocalePromoted: () => {} }));
vi.mock("../sitemap", () => ({ refreshSitemapEntriesForContentKey: () => {} }));
vi.mock("../ssr-schema", () => ({ clearSsrSchemaCache: () => {} }));
vi.mock("../seo-index", () => ({ syncSeoIndexEntryFromLiveDisk: () => {} }));
vi.mock("../published-at", () => ({ ensurePublishedAtOnce: () => {} }));
vi.mock("../product/funnel-audience-gates", () => ({
  assertFunnelAudienceGates: () => ({ ok: true, warnings: [] }),
}));

import { resetRegistry } from "../content-types";
import { markFileAsModified } from "../sync-state";
import { promoteVariantWithOptionalTeardown, routeSharedFieldsOnPromote } from "./promote-with-teardown";
import { recordDraftBase, createMemoryDraftBaseStore, setDraftBaseStore } from "./draft-base";
import { writeDraftMeta } from "./draft-meta";

vi.mock("../sync-state", () => ({ markFileAsModified: vi.fn() }));

const ORIGINAL_CWD = process.cwd();
let tempDir: string;
let contentRoot: string;
let entryDir: string;

function write(rel: string, content: string) {
  const p = path.join(entryDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
}
function read(rel: string): string {
  return fs.readFileSync(path.join(entryDir, rel), "utf-8");
}
function load(rel: string): Record<string, any> {
  return yaml.load(read(rel)) as Record<string, any>;
}

function versioningManagerStub() {
  const vPath = () => path.join(entryDir, "versioning.yml");
  return {
    getVersioningContentDir: () => entryDir,
    getVariantFilePath: (_t: string, _s: string, v: string, l: string) => path.join(entryDir, `${v}.${l}.yml`),
    getVersioningForContent: () => (fs.existsSync(vPath()) ? (yaml.load(fs.readFileSync(vPath(), "utf-8")) as any) : null),
    updateVersioning: (_t: string, _s: string, data: unknown) => fs.writeFileSync(vPath(), yaml.dump(data)),
    deleteVersioningConfig: () => {
      if (!fs.existsSync(vPath())) return false;
      fs.unlinkSync(vPath());
      return true;
    },
  };
}

const ciStub = {
  safeYamlLoad: (raw: string) => yaml.load(raw) as Record<string, unknown>,
  loadCommonData: () => {
    const p = path.join(entryDir, "_common.yml");
    return fs.existsSync(p) ? (yaml.load(fs.readFileSync(p, "utf-8")) as Record<string, unknown>) : null;
  },
  invalidateCommonFields: () => {},
  refresh: () => {},
};
const cacheStub = { clearEntryKey: () => {}, flush: async () => {} };

function promote(extra: Record<string, unknown> = {}) {
  return promoteVariantWithOptionalTeardown({
    contentType: "blog",
    slug: "post-a",
    locale: "en",
    variantSlug: "draft",
    author: "tester",
    contentRoot,
    contentRootName: "site_test",
    folder: "blog",
    templateMode: false,
    versioningManager: versioningManagerStub() as never,
    ci: ciStub as never,
    cache: cacheStub as never,
    ...extra,
  });
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "promote-teardown-"));
  contentRoot = path.join(tempDir, "site_test");
  entryDir = path.join(contentRoot, "blog", "post-a");
  fs.mkdirSync(entryDir, { recursive: true });
  fs.writeFileSync(
    path.join(contentRoot, "content-types.yml"),
    `blog:
  directory: blog
  url_pattern:
    en: /en/blog/:slug
`,
    "utf-8",
  );
  process.chdir(tempDir);
  resetRegistry(contentRoot);
  setDraftBaseStore(createMemoryDraftBaseStore());
  write("_common.yml", "meta:\n  robots: noindex\n  priority: 0.5\nfunnel:\n  stage: awareness\n");
  write("en.yml", "slug: post-a\ntitle: Live title\nseo:\n  main_keyword: live-kw\nsections: []\n");
  write("versioning.yml", "en:\n  variants:\n    - slug: draft\n      allocation: 0\n");
  vi.mocked(markFileAsModified).mockClear();
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  resetRegistry(contentRoot);
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("routeSharedFieldsOnPromote", () => {
  it("moves page-level fields to _common and deletes null markers", () => {
    const routed = routeSharedFieldsOnPromote({
      draftRaw: "title: T\nfunnel:\n  stage: decision\nmeta:\n  robots: null\n  page_title: P\n",
      commonRaw: "meta:\n  robots: noindex\nfunnel:\n  stage: awareness\n",
    });
    const common = yaml.load(routed.commonRaw!) as Record<string, any>;
    const locale = yaml.load(routed.localeRaw) as Record<string, any>;
    expect(common.funnel.stage).toBe("decision");
    expect(common.meta).toBeUndefined();
    expect(locale.funnel).toBeUndefined();
    expect(locale.meta).toEqual({ page_title: "P" });
    expect(routed.localeRaw).not.toContain("null");
  });
});

describe("promoteVariantWithOptionalTeardown", () => {
  it("routes funnel/robots to _common, applies draft seo, strips _draft, deletes the last versioning.yml", async () => {
    write(
      "draft.en.yml",
      "slug: post-a\ntitle: Draft title\nseo:\n  main_keyword: draft-kw\nfunnel:\n  stage: decision\nmeta:\n  robots: null\nsections: []\n",
    );
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    const res = await promote();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const common = load("_common.yml");
    expect(common.funnel.stage).toBe("decision");
    expect(common.meta).toEqual({ priority: 0.5 });
    const live = read("en.yml");
    expect(live).not.toContain("_draft");
    expect(live).not.toContain("funnel");
    expect(live).not.toContain("null");
    expect(load("en.yml").seo.main_keyword).toBe("draft-kw");
    expect(load("en.yml").title).toBe("Draft title");
    expect(fs.existsSync(path.join(entryDir, "versioning.yml"))).toBe(false);
    expect(fs.existsSync(path.join(entryDir, "draft.en.yml"))).toBe(false);
    expect(res.versioningDeleted).toBe(true);
    expect(res.publishedDiff.map((c) => c.field_path)).toEqual(
      expect.arrayContaining(["funnel", "meta.robots", "seo.main_keyword", "title"]),
    );
    expect(res.preApplySnapshot.live).toContain("Live title");
  });

  it("keeps live seo when the draft has none", async () => {
    write("draft.en.yml", "slug: post-a\ntitle: Draft title\nsections: []\n");
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    const res = await promote();
    expect(res.ok).toBe(true);
    expect(load("en.yml").seo.main_keyword).toBe("live-kw");
  });

  it("rejects direct publish for swarm roles and drafts linked to a proposal", async () => {
    write("draft.en.yml", "slug: post-a\ntitle: Draft\nsections: []\n");
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    const swarm = await promote({ callerIsSwarm: true });
    expect(swarm.ok).toBe(false);
    if (!swarm.ok) expect(swarm.code).toBe("proposal_required");

    writeDraftMeta(path.join(entryDir, "draft.en.yml"), { proposal: { id: "p-1", env: "production" } }, { skipMark: true });
    const linked = await promote();
    expect(linked.ok).toBe(false);
    if (!linked.ok) {
      expect(linked.code).toBe("draft_in_proposal");
      expect(linked.details).toMatchObject({ proposal_id: "p-1", env: "production" });
    }
    const viaApply = await promote({ viaProposalApply: true });
    expect(viaApply.ok).toBe(true);
  });

  it("rebuilds a stale draft when fields do not overlap", async () => {
    write("draft.en.yml", "slug: post-a\ntitle: Draft title\nsections: []\nseo:\n  main_keyword: live-kw\n");
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    write("en.yml", "slug: post-a\ntitle: Live title\ndescription: Added on live\nseo:\n  main_keyword: live-kw\nsections: []\n");
    const res = await promote();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.map((w) => w.code)).toContain("draft_rebuilt");
    expect(load("en.yml").title).toBe("Draft title");
    expect(load("en.yml").description).toBe("Added on live");
  });

  it("rejects a stale draft with conflicting fields unless confirmed", async () => {
    write("draft.en.yml", "slug: post-a\ntitle: Draft title\nsections: []\nseo:\n  main_keyword: live-kw\n");
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    write("en.yml", "slug: post-a\ntitle: Staff fixed title\nseo:\n  main_keyword: live-kw\nsections: []\n");
    const res = await promote();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("draft_base_stale");
      expect((res.details?.conflicting_fields as Array<{ field_path: string }>)[0]!.field_path).toBe("title");
    }
    const forced = await promote({ confirmOverwriteNewerLive: true });
    expect(forced.ok).toBe(true);
    expect(load("en.yml").title).toBe("Draft title");
  });

  it("asks for confirmation when the draft has no recorded base and live exists", async () => {
    write("draft.en.yml", "slug: post-a\ntitle: Draft\nsections: []\n");
    const res = await promote();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("draft_base_unknown");
  });

  it("publishes a first locale without a recorded base", async () => {
    fs.unlinkSync(path.join(entryDir, "en.yml"));
    write("draft.en.yml", "slug: post-a\ntitle: Draft\nsections: []\n");
    const res = await promote();
    expect(res.ok).toBe(true);
  });

  it("dry run writes nothing", async () => {
    write("draft.en.yml", "slug: post-a\ntitle: Draft title\nsections: []\n");
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    const before = read("en.yml");
    const res = await promote({ dryRun: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dryRun).toBe(true);
    expect(read("en.yml")).toBe(before);
    expect(fs.existsSync(path.join(entryDir, "draft.en.yml"))).toBe(true);
  });

  it("restores _common.yml when the live write fails", async () => {
    write("draft.en.yml", "slug: post-a\ntitle: Draft\nfunnel:\n  stage: decision\nsections: []\n");
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    const commonBefore = read("_common.yml");
    const realWrite = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(p).endsWith(`${path.sep}en.yml`)) throw new Error("disk full");
      return (realWrite as (...a: unknown[]) => void)(p, ...rest);
    }) as typeof fs.writeFileSync);
    const res = await promote();
    expect(res.ok).toBe(false);
    vi.restoreAllMocks();
    expect(read("_common.yml")).toBe(commonBefore);
    expect(fs.existsSync(path.join(entryDir, "draft.en.yml"))).toBe(true);
  });

  it("rejects attached drafts that carry structure", async () => {
    fs.writeFileSync(
      path.join(contentRoot, "content-types.yml"),
      `blog:
  directory: blog
  single_template: true
  url_pattern:
    en: /en/blog/:slug
`,
      "utf-8",
    );
    resetRegistry(contentRoot);
    write("draft.en.yml", "slug: post-a\ntitle: Draft\nsections:\n  - type: hero\n");
    recordDraftBase({ contentType: "blog", slug: "post-a", locale: "en", variant: "draft", contentRoot });
    const res = await promote();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("attached_draft_structure");
      expect(res.details?.property_path).toBe("sections");
    }
  });
});
