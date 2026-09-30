import { describe, expect, it } from "vitest";
import {
  findSchemaOrgPageUrlMismatches,
  homeAliasPaths,
  normalizeSchemaUrl,
} from "./schema-org-page-url";

const hosts = ["4geeks.com", "localhost"];

function webPage(props: Record<string, unknown>, schemaType = "WebPage") {
  return { type: "schema_org", schema_type: schemaType, section_id: "schema_org-1", properties: props };
}

describe("normalizeSchemaUrl", () => {
  it("ignores www, protocol, case, trailing slash, query, hash", () => {
    expect(normalizeSchemaUrl("http://WWW.4geeks.com/Landing/Foo/?a=1#x")).toEqual({
      host: "4geeks.com",
      path: "/landing/foo",
    });
  });

  it("keeps root-relative paths hostless", () => {
    expect(normalizeSchemaUrl("/landing/foo/")).toEqual({ host: null, path: "/landing/foo" });
  });

  it("rejects non-http and template values", () => {
    expect(normalizeSchemaUrl("mailto:a@b.com")).toBeNull();
    expect(normalizeSchemaUrl("{{ entry.url }}")).toBeNull();
  });
});

describe("findSchemaOrgPageUrlMismatches", () => {
  it("flags a locale-prefixed url on a landing that has no locale prefix", () => {
    const out = findSchemaOrgPageUrlMismatches({
      sections: [webPage({ url: "https://4geeks.com/en/landing/foo" })],
      expectedPaths: ["/landing/foo"],
      siteHosts: hosts,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ field: "url", key_path: "properties.url", expected: ["/landing/foo"] });
  });

  it("passes own path and canonical, with spelling differences", () => {
    const out = findSchemaOrgPageUrlMismatches({
      sections: [
        webPage({ url: "http://www.4geeks.com/landing/foo/" }),
        webPage({ url: "https://4geeks.com/en/main-page", "@id": "https://4geeks.com/landing/foo#webpage" }),
      ],
      expectedPaths: ["/landing/foo", "https://4geeks.com/en/main-page"],
      siteHosts: hosts,
    });
    expect(out).toEqual([]);
  });

  it("skips external hosts, non page types, and blank values", () => {
    const out = findSchemaOrgPageUrlMismatches({
      sections: [
        webPage({ url: "https://example.org/other" }),
        webPage({ url: "https://4geeks.com/elsewhere" }, "Organization"),
        webPage({ url: "" }),
        { type: "hero", url: "https://4geeks.com/elsewhere" },
      ],
      expectedPaths: ["/landing/foo"],
      siteHosts: hosts,
    });
    expect(out).toEqual([]);
  });

  it("checks @id and locale overlays", () => {
    const out = findSchemaOrgPageUrlMismatches({
      sections: [webPage({ "@id": "https://4geeks.com/wrong#x", locales: { es: { url: "/es/wrong" } } })],
      expectedPaths: ["/es/landing/foo"],
      siteHosts: hosts,
      locale: "es",
    });
    expect(out.map((m) => m.key_path)).toEqual(["properties.@id", "properties.locales.es.url"]);
  });

  it("returns nothing when the page address is unknown", () => {
    const out = findSchemaOrgPageUrlMismatches({
      sections: [webPage({ url: "https://4geeks.com/anything" })],
      expectedPaths: [null, ""],
      siteHosts: hosts,
    });
    expect(out).toEqual([]);
  });

  it("accepts home aliases when the caller passes them", () => {
    const out = findSchemaOrgPageUrlMismatches({
      sections: [webPage({ url: "https://4geeks.com/us" })],
      expectedPaths: ["/en/home", ...homeAliasPaths("en")],
      siteHosts: hosts,
    });
    expect(out).toEqual([]);
  });
});
