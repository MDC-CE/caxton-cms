import { afterEach, describe, expect, it, vi } from "vitest";

const LIVE = new Set(["/en/apply", "/en/blog/salaries/software-engineer-salary", "/es/premios"]);
const REDIRECTS: Record<string, string> = { "/en/old-apply": "/en/apply" };
const DRAFTS = new Set(["/en/blog/ai/new-post"]);

vi.mock("./redirects", () => ({
  createPublicUrlResolver: () => ({
    test: (raw: string) => {
      if (LIVE.has(raw)) return { match: false, pageExists: true };
      const to = REDIRECTS[raw];
      if (to) return { match: true, resolvedTo: to, destinationExists: true, pageExists: false };
      return { match: false, pageExists: false };
    },
  }),
}));

vi.mock("./draft-entry", () => ({
  getEntryContentDir: (_t: string, slug: string) => `/virtual/${slug}`,
  hasLiveLocaleFile: () => false,
  listDraftLocales: (dir: string) => (dir === "/virtual/new-post" ? ["en"] : []),
}));

vi.mock("fs", async (orig) => {
  const actual = (await orig()) as typeof import("fs");
  return {
    ...actual,
    default: { ...actual, existsSync: (p: string) => p.startsWith("/virtual/") || actual.existsSync(p) },
    existsSync: (p: string) => p.startsWith("/virtual/") || actual.existsSync(p),
  };
});

import {
  evaluateInternalLinks,
  findClosestLiveMatch,
  runInternalLinkGate,
  setInternalLinkGateEnforcementForTests,
} from "./internal-link-gate";

const ci = {
  parseContentUrl: (url: string) => {
    if (!DRAFTS.has(url)) return null;
    return { contentType: "blog", slug: "new-post", locale: "en" };
  },
  getAllValidUrls: () => new Set(LIVE),
} as unknown as import("./content-index").ContentIndex;

const page = (content: string) => ({ sections: [{ type: "article", data: { content } }] });

afterEach(() => setInternalLinkGateEnforcementForTests(null));

describe("evaluateInternalLinks", () => {
  it("classifies live, redirected, draft and broken links", () => {
    const res = evaluateInternalLinks({
      ci,
      locale: "en",
      pageData: page(
        "[a](/en/apply) [b](/en/old-apply) [c](/en/blog/ai/new-post) [d](/en/blog/wrong-cat/software-engineer-salary)",
      ),
    });
    expect(res.redirected).toEqual([
      expect.objectContaining({ link: "/en/old-apply", final_url: "/en/apply", component: "article" }),
    ]);
    expect(res.draftTargets.map((l) => l.link)).toEqual(["/en/blog/ai/new-post"]);
    expect(res.broken).toEqual([
      expect.objectContaining({
        link: "/en/blog/wrong-cat/software-engineer-salary",
        field_path: "sections[0].data.content",
        closest_live_match: "/en/blog/salaries/software-engineer-salary",
      }),
    ]);
  });
});

describe("runInternalLinkGate", () => {
  const broken = page("[x](/en/does-not-exist-anywhere)");

  it("blocks a live save on any broken link in the page once enforced", () => {
    setInternalLinkGateEnforcementForTests(() => true);
    const res = runInternalLinkGate({ ci, locale: "en", pageData: broken, pageIsDraft: false, intent: "save" });
    expect(res.failure?.code).toBe("broken_internal_links");
    expect(res.failure?.broken_internal_links[0]?.link).toBe("/en/does-not-exist-anywhere");
  });

  it("only warns before the cleanup migration completed", () => {
    setInternalLinkGateEnforcementForTests(() => false);
    const res = runInternalLinkGate({ ci, locale: "en", pageData: broken, pageIsDraft: false, intent: "save" });
    expect(res.failure).toBeNull();
    expect(res.warnings.map((w) => w.code)).toEqual(["broken_internal_links_not_enforced"]);
  });

  it("draft saves warn on draft targets and broken links", () => {
    setInternalLinkGateEnforcementForTests(() => true);
    const res = runInternalLinkGate({
      ci,
      locale: "en",
      pageData: page("[c](/en/blog/ai/new-post) [x](/en/does-not-exist-anywhere)"),
      pageIsDraft: true,
      intent: "save",
    });
    expect(res.failure).toBeNull();
    expect(res.warnings.map((w) => w.code).sort()).toEqual([
      "broken_internal_links_on_draft",
      "internal_link_draft_target",
    ]);
  });

  it("publishing blocks on targets that are still drafts", () => {
    setInternalLinkGateEnforcementForTests(() => true);
    const res = runInternalLinkGate({
      ci,
      locale: "en",
      pageData: page("[c](/en/blog/ai/new-post)"),
      pageIsDraft: true,
      intent: "publish",
    });
    expect(res.failure?.broken_internal_links[0]).toMatchObject({ link: "/en/blog/ai/new-post", draft_target: true });
  });

  it("redirecting links pass with a warning", () => {
    setInternalLinkGateEnforcementForTests(() => true);
    const res = runInternalLinkGate({
      ci,
      locale: "en",
      pageData: page("[b](/en/old-apply)"),
      pageIsDraft: false,
      intent: "save",
    });
    expect(res.failure).toBeNull();
    expect(res.warnings[0]?.code).toBe("internal_link_redirects");
  });
});

describe("findClosestLiveMatch", () => {
  it("prefers same slug in another category, then near typos", () => {
    const urls = ["/en/blog/a/coding-bootcamp-cost", "/es/blog/a/foo"];
    expect(findClosestLiveMatch("/en/blog/b/coding-bootcamp-cost", urls)).toBe("/en/blog/a/coding-bootcamp-cost");
    expect(findClosestLiveMatch("/en/blog/a/coding-botcamp-cost", urls)).toBe("/en/blog/a/coding-bootcamp-cost");
    expect(findClosestLiveMatch("/en/blog/a/totally-different", urls)).toBeNull();
  });
});
