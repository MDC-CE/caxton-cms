import { describe, expect, it } from "vitest";
import type { VariableContext, VariableDefinition } from "./variable-manager";
import { buildVariableCatalog, closeVariableNames, pasteToken, variesBy } from "./variable-catalog";
import { handleVariableCatalogRequest } from "./variable-catalog-route";

const DEFS: Record<string, VariableDefinition> = {
  "global.global_job_placement_rate": {
    description: "Share of graduates hired within 180 days.",
    category: "outcome_claim",
    unit: "percent",
    default: "84",
    conditions: [
      { query: { region: "europe" }, value: "75" },
      { query: { region: "latam" }, value: "81" },
    ],
  },
  "global.price_fullstack": { description: "Full Stack full price.", category: "price", unit: "usd", default: "16,999" },
  "global.ai_fluency_price": { description: "AI Fluency price.", category: "price", default: "499" },
  "global.ai.fluency.price": {
    description: "Duplicate. Do not use.",
    category: "price",
    deprecated: true,
    replaced_by: "global.ai_fluency_price",
    default: "499",
  },
  "global.campus_phone": { description: "Main phone.", category: "contact", default: "+1 555" },
  "global.undescribed": { default: "x" },
  "global.legal_terms_url": { default: "/terms", isReserved: true },
  "reserved.legal_terms_url": { default: "/terms", isReserved: true },
  "brand.title": { default: "4Geeks", isReserved: true },
};

function resolve(name: string, ctx: VariableContext) {
  const def = DEFS[name];
  if (!def) return null;
  for (const c of def.conditions ?? []) {
    if (Object.entries(c.query).every(([k, v]) => (ctx as Record<string, unknown>)[k] === v)) {
      return { value: c.value, source: "condition" };
    }
  }
  return def.default !== undefined ? { value: def.default, source: "default" } : null;
}

const LOCATIONS: Record<string, string> = {
  "miami-usa": "usa-canada",
  "madrid-spain": "europe",
  "santiago-chile": "latam",
};

const ci = {
  getVariableUsageSummary: () => ({ "global.global_job_placement_rate": 12, "global.ai.fluency.price": 2 }),
  loadMergedContent: (type: string, slug: string) => {
    if (type === "location") return { data: LOCATIONS[slug] ? { region: LOCATIONS[slug] } : null };
    if (type === "landing" && slug === "europe-landing") return { data: { region: "europe" } };
    if (type === "landing" && slug === "mixed") return { data: { locations: ["miami-usa", "madrid-spain"] } };
    return { data: null };
  },
  listContentSlugs: () => Object.keys(LOCATIONS),
};

const deps = { vm: { getDefinitions: () => DEFS, resolveVariable: resolve }, ci, contentRoot: "x", locales: ["en", "es"] };

describe("buildVariableCatalog", () => {
  it("hides reserved.* duplicates and deprecated rows, counts missing metadata", () => {
    const c = buildVariableCatalog(DEFS);
    const names = c.rows.map((r) => r.name);
    expect(names).not.toContain("reserved.legal_terms_url");
    expect(names).toContain("global.legal_terms_url");
    expect(names).not.toContain("global.ai.fluency.price");
    expect(c.deprecated_hidden).toBe(1);
    expect(c.missing_description_count).toBe(1);
    expect(c.rows.find((r) => r.name === "brand.title")).toMatchObject({ read_only: true, category: "system" });
  });

  it("filters figures_only, facts_only, category and query", () => {
    expect(buildVariableCatalog(DEFS, { figures_only: true }).rows.map((r) => r.category)).toEqual([
      "price",
      "outcome_claim",
      "price",
    ]);
    expect(buildVariableCatalog(DEFS, { facts_only: true }).rows.some((r) => r.category === "contact")).toBe(true);
    expect(buildVariableCatalog(DEFS, { category: ["contact"] }).rows).toHaveLength(1);
    expect(buildVariableCatalog(DEFS, { query: "hired" }).rows[0].name).toBe("global.global_job_placement_rate");
    expect(buildVariableCatalog(DEFS, { include_deprecated: true }).rows.some((r) => r.deprecated)).toBe(true);
  });

  it("reports varies_by", () => {
    expect(variesBy(DEFS["global.global_job_placement_rate"])).toEqual(["region"]);
    expect(variesBy(DEFS["global.campus_phone"])).toEqual([]);
  });
});

describe("helpers", () => {
  it("suggests close names", () => {
    expect(closeVariableNames("global.price_fullstak", Object.keys(DEFS))).toContain("global.price_fullstack");
  });
  it("builds paste tokens", () => {
    expect(pasteToken("global.price_fullstack", DEFS["global.price_fullstack"])).toBe(
      "{{ global.price_fullstack | 16,999 }}",
    );
  });
});

describe("handleVariableCatalogRequest", () => {
  it("catalog mode flags ignored context", () => {
    const r = handleVariableCatalogRequest({ region: "europe" }, deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mode: "catalog", context_ignored: true });
  });

  it("detail mode returns conditions, usage, deprecated names and unknown names", () => {
    const r = handleVariableCatalogRequest(
      { names: "global_job_placement_rate,global.ai.fluency.price,global.price_fullstak" },
      deps,
    );
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.variables[0]).toMatchObject({ name: "global.global_job_placement_rate", usage_count: 12 });
    expect(body.variables[0].conditions).toHaveLength(2);
    expect(body.deprecated).toEqual([{ name: "global.ai.fluency.price", replaced_by: "global.ai_fluency_price" }]);
    expect(body.unknown_names[0].close_matches).toContain("global.price_fullstack");
  });

  it("resolves a valid context and rejects unknown values with valid lists", () => {
    const ok = handleVariableCatalogRequest({ names: "global.global_job_placement_rate", region: "europe" }, deps);
    expect((ok.body as any).variables[0].resolved).toEqual({ value: "75", source: "condition" });

    const bad = handleVariableCatalogRequest({ names: "global.global_job_placement_rate", region: "mars" }, deps);
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: "unknown_context_value" });
    expect((bad.body as any).valid_regions).toEqual(["europe", "latam", "usa-canada"]);
    expect((bad.body as any).valid_locales).toEqual(["en", "es"]);
  });

  it("context.entry returns audience, audience_values and literal_ok", () => {
    const eu = handleVariableCatalogRequest(
      { names: "global.global_job_placement_rate", entry_type: "landing", entry_slug: "europe-landing", entry_locale: "en" },
      deps,
    );
    expect((eu.body as any).audience).toMatchObject({ source: "region", regions: ["europe"] });
    expect((eu.body as any).variables[0].literal_ok).toBe("75");

    const mixed = handleVariableCatalogRequest(
      { names: "global.global_job_placement_rate", entry_type: "landing", entry_slug: "mixed", entry_locale: "en" },
      deps,
    );
    expect((mixed.body as any).variables[0].literal_ok).toBeNull();
    expect((mixed.body as any).variables[0].audience_values).toHaveLength(2);
  });

  it("rejects entry + region and missing entries", () => {
    const conflict = handleVariableCatalogRequest(
      { names: "global.campus_phone", entry_type: "landing", entry_slug: "mixed", region: "europe" },
      deps,
    );
    expect(conflict.body).toMatchObject({ code: "context_conflict" });
    const missing = handleVariableCatalogRequest(
      { names: "global.campus_phone", entry_type: "landing", entry_slug: "nope" },
      deps,
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "entry_not_found" });
  });
});
