import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  owner: "entry" as "entry" | "shared_template",
  record: null as null | { fingerprint: string; reviewed_at: string; job_id: string; errors: number; warnings: number },
  unavailable: null as string | null,
}));

vi.mock("../layout-owner", () => ({ layoutInfoForEntry: () => ({ layout_owner: state.owner }) }));
vi.mock("../component-registry", () => ({ applyComponentSectionDefaults: () => {} }));
vi.mock("./render-review", () => ({
  getReviewRecord: () => state.record,
  renderReviewUnavailableReason: () => state.unavailable,
}));
vi.mock("./page-preview", () => ({ loadPagePreviewData: vi.fn() }));

import { evaluateRenderReviewGate } from "./review-freshness";
import { deliveredFingerprint } from "./fingerprint";

const draft = [{ type: "hero", variant: "split" }, { type: "faq", background: "muted" }];
const base = {
  callerIsMcp: true,
  templateMode: false,
  contentType: "landing",
  slug: "x",
  locale: "en",
  variantSlug: "draft",
  site: "site_a",
  contentRoot: "/tmp/site_a",
  draftSections: draft,
  liveSections: null,
};

describe("evaluateRenderReviewGate", () => {
  beforeEach(() => {
    state.owner = "entry";
    state.record = null;
    state.unavailable = null;
  });

  it("does not gate staff, template mode, or template-attached entries", () => {
    expect(evaluateRenderReviewGate({ ...base, callerIsMcp: false }).status).toBe("not_gated");
    expect(evaluateRenderReviewGate({ ...base, templateMode: true }).status).toBe("not_gated");
    state.owner = "shared_template";
    expect(evaluateRenderReviewGate(base).status).toBe("not_gated");
  });

  it("does not gate copy-only edits of a live page", () => {
    const live = draft.map((s) => ({ ...s, title: "old copy" }));
    expect(evaluateRenderReviewGate({ ...base, liveSections: live }).status).toBe("not_gated");
  });

  it("requires a review for new pages and passes with a matching fingerprint", () => {
    const r = evaluateRenderReviewGate(base);
    expect(r.status).toBe("required");
    expect(r.status === "required" && r.reason).toBe("never_reviewed");
    state.record = { fingerprint: deliveredFingerprint(draft), reviewed_at: "now", job_id: "j", errors: 0, warnings: 0 };
    expect(evaluateRenderReviewGate(base).status).toBe("fresh");
  });

  it("reports structure_changed when the layout moved since the review", () => {
    state.record = { fingerprint: "stale", reviewed_at: "now", job_id: "j", errors: 0, warnings: 0 };
    const r = evaluateRenderReviewGate({ ...base, liveSections: [{ type: "hero" }] });
    expect(r.status === "required" && r.reason).toBe("structure_changed");
  });

  it("warns instead of blocking when reviews cannot run", () => {
    state.unavailable = "SITE_URL is required";
    expect(evaluateRenderReviewGate(base)).toEqual({ status: "unavailable", reason: "SITE_URL is required" });
  });
});
