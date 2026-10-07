import { describe, expect, it } from "vitest";
import { audienceFromEntryData, audienceValuesFor, resolvePageAudience } from "./page-audience";
import type { VariableContext } from "./variable-manager";

const LOC_REGIONS = new Map([
  ["miami-usa", "usa-canada"],
  ["toronto-canada", "usa-canada"],
  ["madrid-spain", "europe"],
  ["santiago-chile", "latam"],
]);

const placement = (_name: string, ctx: VariableContext) => {
  if (ctx.region === "europe") return { value: "75" };
  if (ctx.region === "latam") return { value: "81" };
  return { value: "84" };
};
const phone = () => ({ value: "+1 555" });

describe("audienceFromEntryData", () => {
  it("uses region when set", () => {
    const a = audienceFromEntryData({ region: "europe", locations: ["miami-usa"] }, LOC_REGIONS);
    expect(a).toMatchObject({ regions: ["europe"], locations: [], source: "region" });
  });

  it("maps locations to their regions and warns on unknown slugs", () => {
    const a = audienceFromEntryData({ locations: ["miami-usa", "atlantis"] }, LOC_REGIONS);
    expect(a.source).toBe("locations");
    expect(a.locations).toEqual(["miami-usa"]);
    expect(a.regions).toEqual(["usa-canada"]);
    expect(a.warnings[0]).toContain("atlantis");
  });

  it("returns none when neither field is set", () => {
    expect(audienceFromEntryData({ title: "x" }, LOC_REGIONS).source).toBe("none");
  });
});

describe("audienceValuesFor", () => {
  it("gives literal_ok for a single-region audience", () => {
    const a = audienceFromEntryData({ region: "europe" }, LOC_REGIONS);
    const v = audienceValuesFor("global.rate", placement, a, "en", LOC_REGIONS);
    expect(v.literal_ok).toBe("75");
  });

  it("gives literal_ok when all audience locations share a value", () => {
    const a = audienceFromEntryData({ locations: ["miami-usa", "toronto-canada"] }, LOC_REGIONS);
    expect(audienceValuesFor("global.rate", placement, a, "en", LOC_REGIONS).literal_ok).toBe("84");
  });

  it("is null for a mixed audience on a region-varying fact", () => {
    const a = audienceFromEntryData({ locations: ["miami-usa", "madrid-spain"] }, LOC_REGIONS);
    const v = audienceValuesFor("global.rate", placement, a, "en", LOC_REGIONS);
    expect(v.literal_ok).toBeNull();
    expect(v.values).toHaveLength(2);
  });

  it("is null for an unset audience on a region-varying fact", () => {
    const a = audienceFromEntryData({}, LOC_REGIONS);
    expect(audienceValuesFor("global.rate", placement, a, "en", LOC_REGIONS).literal_ok).toBeNull();
  });

  it("always has one value for a fact that does not vary", () => {
    const a = audienceFromEntryData({}, LOC_REGIONS);
    expect(audienceValuesFor("global.phone", phone, a, "en", LOC_REGIONS).literal_ok).toBe("+1 555");
  });
});

describe("resolvePageAudience", () => {
  it("reads any content type the same way and reports missing entries", () => {
    const ci = {
      loadMergedContent: (type: string, slug: string) => {
        if (type === "location") return { data: { region: LOC_REGIONS.get(slug) } };
        if (slug === "missing") return { data: null };
        return { data: { locations: ["santiago-chile"] } };
      },
      listContentSlugs: () => [...LOC_REGIONS.keys()],
    };
    for (const contentType of ["landing", "page", "program"]) {
      const r = resolvePageAudience({ ci, contentType, slug: "x", locale: "en" });
      expect(r.found).toBe(true);
      expect(r.audience).toMatchObject({ source: "locations", regions: ["latam"] });
    }
    expect(resolvePageAudience({ ci, contentType: "page", slug: "missing", locale: "en" }).found).toBe(false);
  });
});
