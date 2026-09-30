import type { VariableContext } from "./variable-manager";

export type PageAudienceSource = "region" | "locations" | "none";

export interface PageAudience {
  regions: string[];
  locations: string[];
  source: PageAudienceSource;
  warnings: string[];
}

export interface AudienceValue {
  value: string;
  applies_to: string[];
}

export interface AudienceValues {
  values: AudienceValue[];
  /** The single value a literal may use for this audience; null when values differ. */
  literal_ok: string | null;
}

type EntryReader = {
  loadMergedContent(
    contentType: string,
    slug: string,
    locale: string,
  ): { data: Record<string, unknown> | null };
  listContentSlugs(contentType: never): string[];
};

type Resolver = (name: string, context: VariableContext) => { value: string } | null;

/** Site locations mapped to their hand-set `region` field (location entries only). */
export function siteLocationRegions(ci: EntryReader, locale: string): Map<string, string> {
  const out = new Map<string, string>();
  let slugs: string[] = [];
  try {
    slugs = ci.listContentSlugs("location" as never);
  } catch {
    return out;
  }
  for (const slug of slugs) {
    const { data } = safeLoad(ci, "location", slug, locale);
    const region = typeof data?.region === "string" ? data.region.trim() : "";
    if (region) out.set(slug, region);
  }
  return out;
}

function safeLoad(ci: EntryReader, contentType: string, slug: string, locale: string) {
  try {
    return ci.loadMergedContent(contentType, slug, locale);
  } catch {
    return { data: null };
  }
}

/** Audience from an entry's merged data: `region` wins, then `locations`, else none. */
export function audienceFromEntryData(
  data: Record<string, unknown> | null | undefined,
  locationRegions: Map<string, string>,
): PageAudience {
  const region = typeof data?.region === "string" ? data.region.trim() : "";
  if (region) {
    return { regions: [region], locations: [], source: "region", warnings: [] };
  }
  const raw = Array.isArray(data?.locations) ? (data!.locations as unknown[]) : [];
  const slugs = raw.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim());
  if (slugs.length === 0) {
    return { regions: [], locations: [], source: "none", warnings: [] };
  }
  const locations: string[] = [];
  const regions = new Set<string>();
  const unknown: string[] = [];
  for (const slug of slugs) {
    const r = locationRegions.get(slug);
    if (!r) {
      unknown.push(slug);
      continue;
    }
    locations.push(slug);
    regions.add(r);
  }
  const warnings = unknown.length
    ? [`Unknown location slug(s) in locations: ${unknown.join(", ")} (ignored).`]
    : [];
  if (locations.length === 0) {
    return { regions: [], locations: [], source: "none", warnings };
  }
  return { regions: [...regions], locations, source: "locations", warnings };
}

export function resolvePageAudience(opts: {
  ci: EntryReader;
  contentType: string;
  slug: string;
  locale: string;
  locationRegions?: Map<string, string>;
}): { found: boolean; audience: PageAudience } {
  const { data } = safeLoad(opts.ci, opts.contentType, opts.slug, opts.locale);
  if (!data) {
    return { found: false, audience: { regions: [], locations: [], source: "none", warnings: [] } };
  }
  const regions = opts.locationRegions ?? siteLocationRegions(opts.ci, opts.locale);
  return { found: true, audience: audienceFromEntryData(data, regions) };
}

/**
 * Distinct values a fact shows this audience. With `source: "none"` every site region
 * and location is checked, so a region-varying fact yields several values and no `literal_ok`.
 */
export function audienceValuesFor(
  name: string,
  resolve: Resolver,
  audience: PageAudience,
  locale: string,
  locationRegions: Map<string, string>,
): AudienceValues {
  const contexts: { label: string; ctx: VariableContext }[] = [];
  if (audience.source === "locations") {
    for (const loc of audience.locations) {
      contexts.push({
        label: `location:${loc}`,
        ctx: { location: loc, region: locationRegions.get(loc), locale },
      });
    }
  } else if (audience.source === "region") {
    for (const r of audience.regions) {
      contexts.push({ label: `region:${r}`, ctx: { region: r, locale } });
    }
  } else {
    const allRegions = new Set(locationRegions.values());
    for (const r of allRegions) contexts.push({ label: `region:${r}`, ctx: { region: r, locale } });
    for (const [loc, r] of locationRegions) {
      contexts.push({ label: `location:${loc}`, ctx: { location: loc, region: r, locale } });
    }
    if (contexts.length === 0) contexts.push({ label: "default", ctx: { locale } });
  }

  const byValue = new Map<string, string[]>();
  for (const { label, ctx } of contexts) {
    const res = resolve(name, ctx);
    if (!res) continue;
    const list = byValue.get(res.value) ?? [];
    list.push(label);
    byValue.set(res.value, list);
  }
  const values = [...byValue.entries()].map(([value, applies_to]) => ({ value, applies_to }));
  return { values, literal_ok: values.length === 1 ? values[0].value : null };
}
