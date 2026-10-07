/**
 * Page-identity schema_org sections (WebPage and siblings): the `url` / `@id`
 * must name the page they sit on. SSR fills them from the page address when
 * blank; this module finds typed values that point at a different page on the
 * same site.
 */

import { getSchemaOrgType, isSchemaOrgSection } from "./schema-org-sections";

/** schema_type values whose url / @id identify the page itself. */
export const PAGE_IDENTITY_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  "WebPage",
  "AboutPage",
  "ContactPage",
  "CollectionPage",
  "ProfilePage",
  "ItemPage",
]);

export function isPageIdentitySchemaType(schemaType: string): boolean {
  return PAGE_IDENTITY_SCHEMA_TYPES.has(schemaType.trim());
}

/** Lowercase hostname without port and without a leading `www.`. */
export function normalizeSchemaHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
}

/** Path-only key: no query/hash, lowercase, no trailing slash (except root). */
export function normalizeSchemaPath(rawPath: string): string {
  let p = rawPath.split("#")[0].split("?")[0].trim();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/**
 * Parse an absolute http(s) URL or a root-relative path.
 * `host` is null for root-relative paths. Returns null for anything else
 * (mailto:, bare words, template vars).
 */
export function normalizeSchemaUrl(value: string): { host: string | null; path: string } | null {
  const raw = value.trim();
  if (!raw || raw.includes("{{")) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return { host: null, path: normalizeSchemaPath(raw) };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return { host: normalizeSchemaHost(parsed.host), path: normalizeSchemaPath(parsed.pathname) };
}

/** Locale home aliases that serve the home page (`/`, `/{locale}`, `/us` for en). */
export function homeAliasPaths(locale: string): string[] {
  const loc = locale === "_common" ? "en" : locale;
  const out = ["/", `/${loc}`];
  if (loc === "en") out.push("/us");
  return out;
}

export type SchemaOrgPageUrlField = "url" | "@id";

export type SchemaOrgPageUrlMismatch = {
  section_id: string | null;
  /** Index in the sections array (stable fallback when section_id is missing). */
  section_index: number;
  schema_type: string;
  field: SchemaOrgPageUrlField;
  /** Key path under the section, e.g. `properties.url` or `properties.locales.es.url`. */
  key_path: string;
  value: string;
  /** Normalized paths that would have passed. */
  expected: string[];
};

type FieldHit = { field: SchemaOrgPageUrlField; key_path: string; value: string };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function collectFieldHits(props: Record<string, unknown>, locale: string | undefined): FieldHit[] {
  const hits = new Map<SchemaOrgPageUrlField, FieldHit>();
  for (const field of ["url", "@id"] as const) {
    const v = props[field];
    if (typeof v === "string" && v.trim()) {
      hits.set(field, { field, key_path: `properties.${field}`, value: v });
    }
  }
  const locales = asRecord(props.locales);
  const overlayKeys = locale ? [locale] : locales ? Object.keys(locales) : [];
  const out: FieldHit[] = [...hits.values()];
  for (const loc of overlayKeys) {
    const overlay = asRecord(locales?.[loc]);
    if (!overlay) continue;
    for (const field of ["url", "@id"] as const) {
      const v = overlay[field];
      if (typeof v === "string" && v.trim()) {
        out.push({ field, key_path: `properties.locales.${loc}.${field}`, value: v });
      }
    }
  }
  return out;
}

/**
 * Typed url / @id on page-identity schema_org sections that point at a same-site
 * path not in `expectedPaths`. External hosts and unparseable values are skipped.
 * Empty `expectedPaths` → no mismatches (caller could not resolve the page address).
 */
export function findSchemaOrgPageUrlMismatches(opts: {
  sections: unknown;
  /** Page paths or absolute URLs that count as correct (own path, canonical, home aliases). */
  expectedPaths: Array<string | null | undefined>;
  /** Hostnames of this deployment (sites.yml domains, aliases, SITE_URL host, localhost). */
  siteHosts: Iterable<string>;
  /** When set, only that locale's `properties.locales` overlay is checked. */
  locale?: string;
}): SchemaOrgPageUrlMismatch[] {
  if (!Array.isArray(opts.sections)) return [];
  const expected = new Set<string>();
  for (const raw of opts.expectedPaths) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const n = normalizeSchemaUrl(raw);
    if (n) expected.add(n.path);
  }
  if (expected.size === 0) return [];
  const hosts = new Set<string>();
  for (const h of opts.siteHosts) {
    if (typeof h === "string" && h.trim()) hosts.add(normalizeSchemaHost(h));
  }
  const expectedList = [...expected];

  const out: SchemaOrgPageUrlMismatch[] = [];
  opts.sections.forEach((section, index) => {
    if (!isSchemaOrgSection(section)) return;
    const rec = section as Record<string, unknown>;
    const schemaType = getSchemaOrgType(rec).trim();
    if (!isPageIdentitySchemaType(schemaType)) return;
    const props = asRecord(rec.properties);
    if (!props) return;
    for (const hit of collectFieldHits(props, opts.locale)) {
      const n = normalizeSchemaUrl(hit.value);
      if (!n) continue;
      if (n.host !== null && !hosts.has(n.host)) continue;
      if (expected.has(n.path)) continue;
      out.push({
        section_id: typeof rec.section_id === "string" ? rec.section_id : null,
        section_index: index,
        schema_type: schemaType,
        field: hit.field,
        key_path: hit.key_path,
        value: hit.value,
        expected: expectedList,
      });
    }
  });
  return out;
}

/** One-line plain-English summary for gate errors / Diagnostics. */
export function formatSchemaOrgPageUrlMismatch(m: SchemaOrgPageUrlMismatch): string {
  const where = m.section_id ? `section ${m.section_id}` : `section #${m.section_index + 1}`;
  return (
    `${m.schema_type} ${where} (sections[${m.section_index}].${m.key_path}) has ${m.field} "${m.value}" ` +
    `but this page is at ${m.expected[0]}`
  );
}
