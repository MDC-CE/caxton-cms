import {
  expandOrganizationRefs,
  getOrganizationId,
  transformToJsonLd,
} from "../schema-org";
import { isPageIdentitySchemaType } from "@shared/schema-org-page-url";
import type { SchemaComponentContributor, SchemaContribution } from "./types";

/**
 * Emits one JSON-LD document from a schema_org section.
 * Marks `needsStandaloneOrganization` when `@organization` refs are expanded
 * so collectSectionSchemas can dual-emit the site Organization once.
 *
 * For Person and page-identity types (WebPage, AboutPage, …), fills `url` / `@id`
 * from `context.pageUrl` when missing. Typed values are emitted as-is.
 */
export const contributeSchemaOrg: SchemaComponentContributor = (section, context) => {
  const schemaType = typeof section.schema_type === "string" ? section.schema_type.trim() : "";
  if (!schemaType) return [];

  const rawProps =
    section.properties && typeof section.properties === "object" && !Array.isArray(section.properties)
      ? (section.properties as Record<string, unknown>)
      : {};

  const transformed = transformToJsonLd(rawProps, context.locale);
  // Prefer explicit schema_type over nested `type` in properties.
  transformed["@type"] = schemaType;

  if ((schemaType === "Person" || isPageIdentitySchemaType(schemaType)) && context.pageUrl) {
    if (typeof transformed.url !== "string" || !transformed.url.trim()) {
      transformed.url = context.pageUrl;
    }
    if (typeof transformed["@id"] !== "string" || !String(transformed["@id"]).trim()) {
      transformed["@id"] =
        typeof transformed.url === "string" && transformed.url.trim()
          ? transformed.url
          : context.pageUrl;
    }
  }

  const doc: Record<string, unknown> = {
    "@context": "https://schema.org",
    ...transformed,
  };

  const expanded = expandOrganizationRefs(doc, context.locale, context.contentRoot);
  const contributions: SchemaContribution[] = [
    {
      kind: "document",
      schema: doc,
      dedupeKey: `schema_org:${String(section.section_id ?? "")}:${schemaType}:${JSON.stringify(doc)}`,
      source: "schema_org",
      needsStandaloneOrganization: expanded,
    },
  ];

  if (expanded) {
    contributions.push({
      kind: "standalone-organization",
      organizationId: getOrganizationId(context.contentRoot),
    });
  }

  return contributions;
};
