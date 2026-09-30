import { getDefaultLocale, getSupportedLocales } from "./settings";
import type { VariableContext, VariableDefinition } from "./variable-manager";
import { resolvePageAudience, siteLocationRegions } from "./page-audience";
import {
  buildVariableCatalog,
  buildVariableDetail,
  unknownContextValues,
  type SiteContextValues,
} from "./variable-catalog";

export const MAX_DETAIL_NAMES = 20;

type Vm = {
  getDefinitions(): Record<string, VariableDefinition>;
  resolveVariable(name: string, ctx: VariableContext): { value: string; source: string } | null;
};

type Ci = {
  getVariableUsageSummary(): Record<string, number>;
  loadMergedContent(contentType: string, slug: string, locale: string): { data: Record<string, unknown> | null };
  listContentSlugs(contentType: never): string[];
};

function list(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return raw
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

function flag(v: unknown): boolean {
  return v === true || v === "true" || v === "1";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Regions a site knows: location entries' `region` plus regions named in variable conditions. */
export function siteContextValues(
  defs: Record<string, VariableDefinition>,
  locationRegions: Map<string, string>,
  locales: string[],
): SiteContextValues {
  const regions = new Set(locationRegions.values());
  const locations = new Set(locationRegions.keys());
  for (const def of Object.values(defs)) {
    for (const c of def.conditions ?? []) {
      if (c.query?.region) regions.add(c.query.region);
      if (c.query?.location) locations.add(c.query.location);
    }
    for (const r of Object.keys(def.by_region ?? {})) regions.add(r);
    for (const l of Object.keys(def.by_location ?? {})) locations.add(l);
  }
  return {
    regions: [...regions].sort(),
    locations: [...locations].sort(),
    locales,
  };
}

export function handleVariableCatalogRequest(
  query: Record<string, unknown>,
  deps: { vm: Vm; ci: Ci; contentRoot: string; locales?: string[]; defaultLocale?: string },
): { status: number; body: Record<string, unknown> } {
  const defs = deps.vm.getDefinitions();
  const names = list(query.names);

  if (names.length === 0) {
    const catalog = buildVariableCatalog(defs, {
      category: list(query.category),
      figures_only: flag(query.figures_only),
      facts_only: flag(query.facts_only),
      query: str(query.query),
      include_deprecated: flag(query.include_deprecated),
    });
    const contextPassed = !!(str(query.region) || str(query.location) || str(query.locale) || str(query.entry_slug));
    return { status: 200, body: { mode: "catalog", ...catalog, context_ignored: contextPassed } };
  }

  if (names.length > MAX_DETAIL_NAMES) {
    return {
      status: 400,
      body: { error: `At most ${MAX_DETAIL_NAMES} names per call.`, code: "too_many_names" },
    };
  }

  const locales = deps.locales ?? getSupportedLocales(deps.contentRoot);
  const defaultLocale = deps.defaultLocale ?? (deps.locales ? locales[0] : getDefaultLocale(deps.contentRoot)) ?? "en";
  const entryType = str(query.entry_type);
  const entrySlug = str(query.entry_slug);
  const entryLocale = str(query.entry_locale);
  const context = { region: str(query.region), location: str(query.location), locale: str(query.locale) };
  const locationRegions = siteLocationRegions(deps.ci, entryLocale ?? context.locale ?? defaultLocale);
  const site = siteContextValues(defs, locationRegions, locales);

  const bad = unknownContextValues({ ...context, locale: context.locale ?? entryLocale }, site);
  if (bad.length) {
    return {
      status: 400,
      body: {
        error: `Unknown context value(s): ${bad.join(", ")}`,
        code: "unknown_context_value",
        unknown: bad,
        valid_regions: site.regions,
        valid_locations: site.locations,
        valid_locales: site.locales,
      },
    };
  }

  let audience: Parameters<typeof buildVariableDetail>[0]["audience"];
  let audiencePayload: Record<string, unknown> | undefined;
  if (entryType || entrySlug) {
    if (context.region || context.location) {
      return {
        status: 400,
        body: {
          error: "context.entry cannot be combined with region or location; the entry decides the audience.",
          code: "context_conflict",
        },
      };
    }
    if (!entryType || !entrySlug) {
      return {
        status: 400,
        body: { error: "context.entry needs contentType and slug.", code: "entry_not_found" },
      };
    }
    const locale = entryLocale ?? context.locale ?? defaultLocale;
    const resolved = resolvePageAudience({
      ci: deps.ci,
      contentType: entryType,
      slug: entrySlug,
      locale,
      locationRegions,
    });
    if (!resolved.found) {
      return {
        status: 404,
        body: {
          error: `Entry not found: ${entryType}/${entrySlug} (${locale}).`,
          code: "entry_not_found",
        },
      };
    }
    audience = { audience: resolved.audience, locale, locationRegions };
    audiencePayload = {
      regions: resolved.audience.regions,
      locations: resolved.audience.locations,
      source: resolved.audience.source,
      warnings: resolved.audience.warnings,
    };
  }

  let usageCounts: Record<string, number> = {};
  try {
    usageCounts = deps.ci.getVariableUsageSummary();
  } catch {
    usageCounts = {};
  }

  const detail = buildVariableDetail({
    defs,
    names,
    usageCounts,
    resolve: (name, ctx) => deps.vm.resolveVariable(name, ctx),
    context,
    audience,
  });

  return {
    status: 200,
    body: {
      mode: "detail",
      ...detail,
      site_context: site,
      ...(audiencePayload ? { audience: audiencePayload } : {}),
    },
  };
}
