import { describe, expect, it } from "vitest";
import {
  IDEA_SEO_TARGET_HUB_MEMBERS_REQUIRED,
  IDEA_SEO_TARGET_INCOMPLETE,
  IDEA_SEO_TARGET_STANDALONE_NOT_ALLOWED,
  SEO_TARGET_OVERRIDE_INVALID,
  hasSeoTargetFieldOps,
  ideaDemandLabel,
  ideaSeoTargetsEqual,
  parseIdeaSeoTarget,
  seoBlockFromTarget,
  seoTargetDiff,
  standaloneAllowedForDemand,
  validateIdeaSeoTarget,
  validateSeoTargetOverride,
  type IdeaSeoTarget,
} from "./idea-seo-target";

const REASON = "Breaking launch news that will fade within weeks; no hub fits.";

const join: IdeaSeoTarget = {
  main_keyword: "ai code review",
  cluster: { mode: "join", pillar_path: "/en/blog/ai-engineer/what-is-an-ai-engineer" },
};

describe("validateIdeaSeoTarget", () => {
  it("accepts a join target", () => {
    expect(validateIdeaSeoTarget(join)).toEqual({ ok: true, target: join });
  });

  it("requires main_keyword", () => {
    const r = validateIdeaSeoTarget({ cluster: join.cluster });
    expect(r).toMatchObject({ ok: false, code: IDEA_SEO_TARGET_INCOMPLETE });
  });

  it("requires a public path for join", () => {
    expect(
      validateIdeaSeoTarget({ main_keyword: "x", cluster: { mode: "join", pillar_path: "" } }),
    ).toMatchObject({ ok: false, code: IDEA_SEO_TARGET_INCOMPLETE });
    expect(
      validateIdeaSeoTarget({ main_keyword: "x", cluster: { mode: "join", pillar_path: "en/blog" } }),
    ).toMatchObject({ ok: false, code: IDEA_SEO_TARGET_INCOMPLETE });
  });

  it("requires at least one hub member", () => {
    expect(
      validateIdeaSeoTarget({ main_keyword: "x", cluster: { mode: "hub", members: [] } }),
    ).toMatchObject({ ok: false, code: IDEA_SEO_TARGET_HUB_MEMBERS_REQUIRED });
    const ok = validateIdeaSeoTarget({
      main_keyword: "x",
      cluster: { mode: "hub", members: [{ contentType: "blog", slug: "a" }, { content_type: "blog", slug: "a" }] },
    });
    expect(ok).toMatchObject({ ok: true });
    if (ok.ok && ok.target.cluster.mode === "hub") expect(ok.target.cluster.members).toHaveLength(1);
  });

  it("requires a long standalone reason", () => {
    expect(
      validateIdeaSeoTarget({ main_keyword: "x", cluster: { mode: "standalone", reason: "news" } }),
    ).toMatchObject({ ok: false, code: IDEA_SEO_TARGET_INCOMPLETE });
  });

  it("enforces the demand rule for standalone when asked", () => {
    const standalone = { main_keyword: "x", cluster: { mode: "standalone", reason: REASON } };
    expect(validateIdeaSeoTarget(standalone, { enforceDemand: true, demandLabel: "existing_demand" })).toMatchObject({
      ok: false,
      code: IDEA_SEO_TARGET_STANDALONE_NOT_ALLOWED,
    });
    expect(validateIdeaSeoTarget(standalone, { enforceDemand: true, demandLabel: null })).toMatchObject({
      ok: false,
      code: IDEA_SEO_TARGET_STANDALONE_NOT_ALLOWED,
    });
    expect(validateIdeaSeoTarget(standalone, { enforceDemand: true, demandLabel: "fast_decay_news" })).toMatchObject({
      ok: true,
    });
    expect(validateIdeaSeoTarget(standalone, { enforceDemand: true, demandLabel: "broken_url" })).toMatchObject({
      ok: true,
    });
    expect(validateIdeaSeoTarget(standalone)).toMatchObject({ ok: true });
  });
});

describe("demand helpers", () => {
  it("reads the author demand label", () => {
    expect(ideaDemandLabel(["idea_opportunity_harm", "fast_decay_news"])).toBe("fast_decay_news");
    expect(ideaDemandLabel(["idea_opportunity_harm"])).toBeNull();
    expect(ideaDemandLabel(null)).toBeNull();
  });

  it("allows standalone only for news and broken URL", () => {
    expect(standaloneAllowedForDemand("fast_decay_news")).toBe(true);
    expect(standaloneAllowedForDemand("broken_url")).toBe(true);
    expect(standaloneAllowedForDemand("existing_demand")).toBe(false);
    expect(standaloneAllowedForDemand("anticipated_demand")).toBe(false);
    expect(standaloneAllowedForDemand(null)).toBe(false);
  });
});

describe("seoBlockFromTarget", () => {
  it("maps each mode to YAML", () => {
    expect(seoBlockFromTarget(join)).toEqual({
      main_keyword: "ai code review",
      pillar_path: "/en/blog/ai-engineer/what-is-an-ai-engineer",
      is_pillar: false,
    });
    expect(
      seoBlockFromTarget(
        { main_keyword: "k", cluster: { mode: "hub", members: [{ contentType: "blog", slug: "a" }] } },
        { selfPath: "/en/blog/x/k" },
      ),
    ).toEqual({ main_keyword: "k", is_pillar: true, pillar_path: "/en/blog/x/k" });
    expect(seoBlockFromTarget({ main_keyword: "k", cluster: { mode: "standalone", reason: REASON } })).toEqual({
      main_keyword: "k",
      pillar_path: null,
      is_pillar: false,
    });
  });

  it("prefers the resolved hub path", () => {
    expect(seoBlockFromTarget(join, { resolvedPillarPath: "/en/blog/new-hub" }).pillar_path).toBe("/en/blog/new-hub");
  });
});

describe("seoTargetDiff", () => {
  it("does not differ when ops leave seo alone", () => {
    expect(seoTargetDiff([{ field_path: "title", value: "t" }], join).differs).toBe(false);
    expect(hasSeoTargetFieldOps([{ field_path: "title", value: "t" }])).toBe(false);
  });

  it("does not differ when ops match (trailing slash ignored)", () => {
    const d = seoTargetDiff(
      [
        { field_path: "seo.main_keyword", value: "ai code review" },
        { field_path: "seo.pillar_path", value: "/en/blog/ai-engineer/what-is-an-ai-engineer/" },
      ],
      join,
    );
    expect(d.differs).toBe(false);
  });

  it("flags a different keyword", () => {
    const d = seoTargetDiff([{ field_path: "seo.main_keyword", value: "review ai code" }], join);
    expect(d).toMatchObject({ differs: true, fields: ["main_keyword"] });
  });

  it("flags an opt-out as a standalone cluster change", () => {
    const d = seoTargetDiff([{ field_path: "seo.pillar_path", value: null }], join);
    expect(d).toMatchObject({ differs: true, fields: ["cluster"], proposed_mode: "standalone" });
  });

  it("flags a different hub", () => {
    const d = seoTargetDiff([{ field_path: "seo.pillar_path", value: "/en/blog/ai-tools/hub-ai-tools" }], join);
    expect(d).toMatchObject({ differs: true, proposed_mode: "join" });
  });
});

describe("override + equality", () => {
  it("validates override reasons", () => {
    expect(validateSeoTargetOverride(undefined)).toEqual({ ok: true, override: null });
    expect(validateSeoTargetOverride({ reason: "short" })).toMatchObject({ ok: false, code: SEO_TARGET_OVERRIDE_INVALID });
    expect(validateSeoTargetOverride({ reason: REASON })).toEqual({ ok: true, override: { reason: REASON } });
  });

  it("compares targets order-insensitively for hub members", () => {
    const a: IdeaSeoTarget = {
      main_keyword: "k",
      cluster: { mode: "hub", members: [{ contentType: "blog", slug: "a" }, { contentType: "blog", slug: "b" }] },
    };
    const b: IdeaSeoTarget = {
      main_keyword: "k",
      cluster: { mode: "hub", members: [{ contentType: "blog", slug: "b" }, { contentType: "blog", slug: "a" }] },
    };
    expect(ideaSeoTargetsEqual(a, b)).toBe(true);
    expect(ideaSeoTargetsEqual(a, join)).toBe(false);
  });

  it("parses stored targets leniently", () => {
    expect(parseIdeaSeoTarget(null)).toBeNull();
    expect(parseIdeaSeoTarget({ main_keyword: "k" })).toBeNull();
    expect(parseIdeaSeoTarget(join)).toEqual(join);
  });
});
