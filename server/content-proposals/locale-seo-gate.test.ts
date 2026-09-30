import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContentIndex } from "../content-index";

const hubs: Record<string, { path: string; live: boolean }> = {};
let origin: { id: string; title: string; demand_label: string | null; locale: string } | null = null;

vi.mock("../seo-fields", () => ({
  canonicalizePillarPath: (raw: string) => hubs[raw] ?? { path: raw, live: false },
}));
vi.mock("./idea-origin", () => ({
  findOriginIdeaForEntry: () => origin,
}));

import { checkLocaleSeoTarget, LOCALE_SEO_TARGET_REQUIRED } from "./locale-seo-gate";

const REASON = "Spanish readers only search this as breaking news; no evergreen hub fits.";
const base = { site: "s", contentType: "blog", slug: "post", locale: "es", ci: {} as ContentIndex };

describe("checkLocaleSeoTarget (new language on a monitored page)", () => {
  beforeEach(() => {
    for (const k of Object.keys(hubs)) delete hubs[k];
    hubs["/es/blog/hub"] = { path: "/es/blog/hub", live: true };
    hubs["/en/blog/hub"] = { path: "/en/blog/hub", live: true };
    origin = null;
  });

  it("requires a keyword", () => {
    const r = checkLocaleSeoTarget({ ...base, draftSeo: { pillar_path: "/es/blog/hub" } });
    expect(!r.ok && r.code).toBe(LOCALE_SEO_TARGET_REQUIRED);
  });

  it("accepts a live same-locale hub or is_pillar", () => {
    expect(checkLocaleSeoTarget({ ...base, draftSeo: { main_keyword: "k", pillar_path: "/es/blog/hub" } }).ok).toBe(true);
    expect(checkLocaleSeoTarget({ ...base, draftSeo: { main_keyword: "k", is_pillar: true } }).ok).toBe(true);
  });

  it("refuses another-language hub, dead hub, or no cluster decision", () => {
    const other = checkLocaleSeoTarget({ ...base, draftSeo: { main_keyword: "k", pillar_path: "/en/blog/hub" } });
    expect(!other.ok && other.details.hub_locale).toBe("en");
    expect(checkLocaleSeoTarget({ ...base, draftSeo: { main_keyword: "k", pillar_path: "/es/blog/gone" } }).ok).toBe(false);
    expect(checkLocaleSeoTarget({ ...base, draftSeo: { main_keyword: "k" } }).ok).toBe(false);
  });

  it("standalone: reason only when there is no origin idea", () => {
    const seo = { main_keyword: "k", pillar_path: null };
    expect(checkLocaleSeoTarget({ ...base, draftSeo: seo }).ok).toBe(false);
    expect(checkLocaleSeoTarget({ ...base, draftSeo: seo, standaloneReason: REASON }).ok).toBe(true);
  });

  it("standalone on an idea-born page follows the demand rule", () => {
    const seo = { main_keyword: "k", pillar_path: null };
    origin = { id: "idea-1", title: "T", demand_label: "existing_demand", locale: "en" };
    const refused = checkLocaleSeoTarget({ ...base, draftSeo: seo, standaloneReason: REASON });
    expect(!refused.ok && refused.details.origin_idea_id).toBe("idea-1");
    origin = { id: "idea-2", title: "T", demand_label: "fast_decay_news", locale: "en" };
    expect(checkLocaleSeoTarget({ ...base, draftSeo: seo, standaloneReason: REASON }).ok).toBe(true);
  });
});
