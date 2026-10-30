import { describe, expect, it, vi } from "vitest";
import {
  catalogDetailUrl,
  catalogListUrl,
  catalogSearchUrl,
  fetchAllCatalog,
  fetchCatalogDetail,
  fetchCatalogSearch,
  msUntilCatalogPoll,
  nextCatalogPollAt,
  offeringsFromCatalog,
  playgroundCatalogBaseUrl,
  toChunkDocuments,
  toDescriptionDocuments,
  toSearchDocuments,
  descriptionEmbeddingText,
  type CatalogItem,
} from "./playground-catalog";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("playground catalog client", () => {
  it("defaults the catalog host to the deployed playground", () => {
    expect(playgroundCatalogBaseUrl({})).toBe("https://mdc-playground.herokuapp.com");
  });

  it("builds list and detail URLs", () => {
    expect(catalogListUrl("http://127.0.0.1:3000", { lang: "es", offset: 0, limit: 100 })).toBe(
      "http://127.0.0.1:3000/api/v2/destiny/catalog?offset=0&limit=100&lang=es",
    );
    expect(catalogDetailUrl("http://127.0.0.1:3000/", "content_piece", "CM000061", "en")).toBe(
      "http://127.0.0.1:3000/api/v2/destiny/catalog/content_piece/CM000061?lang=en",
    );
    expect(catalogDetailUrl("http://127.0.0.1:3000", "course", "20001023")).toBe(
      "http://127.0.0.1:3000/api/v2/destiny/catalog/course/20001023",
    );
  });

  it("pages the list and keeps courses and content pieces", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(url);
      expect(init?.headers?.Authorization).toBe("Bearer test-token");
      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get("offset"));
      if (offset === 0) {
        return jsonResponse({
          count: 2,
          next: "http://127.0.0.1:3000/api/v2/destiny/catalog?offset=100",
          results: Array.from({ length: 100 }, (_, index) => ({
            kind: "course",
            destiny_code: String(1000 + index),
            title: `Course ${index}`,
            is_active: true,
            sections: [],
            description: "course text",
            description_source: "database",
          })),
        });
      }
      return jsonResponse({
        count: 2,
        next: null,
        results: [{
          kind: "content_piece",
          destiny_code: "CM000061",
          title: "ESOL",
          is_active: true,
          sections: [],
          description: "The ESOL program at MDC prepares non-native English speakers.",
          description_source: "landing_yaml",
          landing_slug: "esol",
        }],
      });
    });

    const items = await fetchAllCatalog("http://127.0.0.1:3000", "test-token", ["en"], fetchImpl as never);
    expect(calls).toHaveLength(2);
    expect(items.filter((item) => item.kind === "course")).toHaveLength(100);
    const esol = items.find((item) => item.destiny_code === "CM000061");
    expect(esol?.kind).toBe("content_piece");
    expect(esol?.lang).toBe("en");
  });

  it("searches courses and content pieces without dropping kind", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      expect(init?.headers?.Authorization).toBe("Bearer test-token");
      expect(url).toBe(
        catalogSearchUrl("https://mdc-playground.herokuapp.com", { q: "esol", limit: 20 }),
      );
      expect(catalogSearchUrl("https://mdc-playground.herokuapp.com", {
        q: "esol",
        kind: "content_piece",
        offset: 0,
        limit: 20,
        lang: "es",
      })).toBe(
        "https://mdc-playground.herokuapp.com/api/v2/destiny/catalog/search?q=esol&kind=content_piece&offset=0&limit=20&lang=es",
      );
      expect(new URL(url).searchParams.has("kind")).toBe(false);
      return jsonResponse({
        count: 1,
        q: "esol",
        results: [{
          kind: "content_piece",
          destiny_code: "CM000061",
          title: "ESOL",
          description: "ESOL landing",
          score: 8,
          matched_fields: ["title", "description"],
        }],
      });
    });
    const page = await fetchCatalogSearch(
      "https://mdc-playground.herokuapp.com",
      "test-token",
      { q: "esol", limit: 20 },
      fetchImpl as never,
    );
    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.kind).toBe("content_piece");
    expect(page.results[0]?.score).toBe(8);
    const docs = toSearchDocuments(page.results);
    expect(docs[0]?.kind).toBe("content_piece");
  });

  it("loads one content piece from the detail endpoint", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("/api/v2/destiny/catalog/content_piece/CM000061");
      return jsonResponse({
        kind: "content_piece",
        destiny_code: "CM000061",
        title: "ESOL",
        description: "ESOL landing",
        description_source: "landing_yaml",
        sections: [],
      });
    });
    const item = await fetchCatalogDetail(
      "http://127.0.0.1:3000",
      "test-token",
      "content_piece",
      "CM000061",
      "ht",
      fetchImpl as never,
    );
    expect(item.lang).toBe("ht");
    expect(item.title).toBe("ESOL");
  });

  it("indexes content pieces beside courses and does not turn them into date rows", () => {
    const items: CatalogItem[] = [
      {
        kind: "course",
        destiny_code: "20001023",
        title: "Photoshop",
        lang: "en",
        is_active: true,
        program_area_name: "Business",
        description: "Photo editing",
        sections: [{
          start_date: "2026-11-02",
          end_date: "2026-12-01",
          campus: "Hialeah Campus",
          is_available: true,
          contact_hours: 24,
          delivery_options: "Live",
        }],
      },
      {
        kind: "content_piece",
        destiny_code: "CM000061",
        title: "ESOL",
        lang: "en",
        is_active: true,
        description: "The ESOL program at MDC prepares non-native English speakers.",
        description_source: "landing_yaml",
        landing_slug: "esol",
        sections: [],
      },
    ];
    const docs = toSearchDocuments(items);
    expect(docs.map((doc) => doc.kind)).toEqual(["course", "content_piece"]);
    expect(docs[1]).toMatchObject({ slug: "en:content_piece:CM000061", title: "ESOL" });
    const offerings = offeringsFromCatalog(items, "2026-10-28");
    expect(offerings).toHaveLength(1);
    expect(offerings[0].course_title).toBe("Photoshop");
    expect(offerings[0].campus).toBe("Hialeah");
    expect(offerings[0].course_url).toContain("courseId=20001023");
  });

  it("embeds only the description and keeps one row per language and destiny code", () => {
    const items: CatalogItem[] = [
      {
        kind: "course",
        destiny_code: "1170129",
        title: "Practical Nursing",
        lang: "en",
        program_area_name: "Health",
        description: "Patient care and the Florida exam.",
        sections: [{ campus: "Wolfson", days: "Monday", start_date: "2026-11-02" }],
      },
      {
        kind: "course",
        destiny_code: "1170129",
        title: "Practical Nursing copy",
        lang: "en",
        description: "A second English row for the same code.",
        sections: [],
      },
      {
        kind: "course",
        destiny_code: "1170129",
        title: "Enfermería",
        lang: "es",
        description: "Cuidado de pacientes.",
        sections: [],
      },
      {
        kind: "content_piece",
        destiny_code: "CM000080",
        title: "A blog post",
        lang: "en",
        description: "   ",
        sections: [],
      },
    ];
    const docs = toDescriptionDocuments(items);
    expect(docs).toHaveLength(2);
    expect(docs.map((doc) => doc.slug)).toEqual([
      "en:course:1170129",
      "es:course:1170129",
    ]);
    expect(descriptionEmbeddingText(docs[0])).toBe("Patient care and the Florida exam.");
    expect(descriptionEmbeddingText(docs[0])).not.toContain("1170129");
    expect(descriptionEmbeddingText(docs[0])).not.toContain("Wolfson");
    expect(descriptionEmbeddingText(docs[0])).not.toContain("Practical Nursing");
    expect(docs[0]).not.toHaveProperty("title");
    expect(docs[0]).not.toHaveProperty("program_area_name");
    expect(docs[1]).toMatchObject({ locale: "es", destiny_code: "1170129", kind: "course" });
  });

  it("keeps short chunks and does not split a long page", () => {
    const docs = toChunkDocuments([
      {
        lang: "en",
        kind: "content_piece",
        destiny_code: "CM000080",
        subtype: "module",
        text: "How makeup works on a film set.",
      },
      {
        lang: "en",
        kind: "content_piece",
        destiny_code: "CM000080",
        subtype: "module",
        text: "duplicate",
      },
      {
        lang: "en",
        kind: "course",
        destiny_code: "1170129",
        subtype: "outcomes",
        text: new Array(201).fill("word").join(" "),
      },
      {
        lang: "en",
        kind: "course",
        destiny_code: "1170129",
        subtype: "outcomes",
        text: "   ",
      },
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      slug: "en:content_piece:CM000080:module",
      destiny_code: "CM000080",
      text: "How makeup works on a film set.",
    });
  });

  it("schedules the next poll at 03:00 America/New_York", () => {
    const before = nextCatalogPollAt(new Date("2026-01-15T07:30:00.000Z"));
    expect(before.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    const after = nextCatalogPollAt(new Date("2026-01-15T08:30:00.000Z"));
    expect(after.toISOString()).toBe("2026-01-16T08:00:00.000Z");
    const summer = nextCatalogPollAt(new Date("2026-07-15T06:30:00.000Z"));
    expect(summer.toISOString()).toBe("2026-07-15T07:00:00.000Z");
    expect(msUntilCatalogPoll(new Date("2026-01-15T07:30:00.000Z"))).toBe(30 * 60 * 1000);
  });
});
