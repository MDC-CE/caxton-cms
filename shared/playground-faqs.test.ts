import { describe, expect, it, vi } from "vitest";
import {
  FAQ_SYNC_ORIGIN,
  apiRowToBankItem,
  mergeFaqBankFromApi,
  parseFaqApiRows,
  playgroundFaqsUrl,
  fetchPlaygroundFaqs,
  type FaqBankRow,
  type PlaygroundFaqApiRow,
} from "./playground-faqs";

const sampleRows: PlaygroundFaqApiRow[] = [
  {
    id: "sample-faq-cost",
    question: "How much does a Continuing Education course cost?",
    answer:
      "[Pending from CE. The official answer for Continuing Education is not published yet; nothing is shown in its place.]",
    locale: "en",
    source: "",
    date: null,
    differs_by_course: true,
  },
  {
    id: "sample-faq-cost-es",
    question: "¿Cuánto cuesta un curso de Educación Continua?",
    answer:
      "[Pending from CE. The official answer for Continuing Education is not published yet; nothing is shown in its place.]",
    locale: "es",
    source: "",
    date: null,
    differs_by_course: true,
  },
];

describe("playgroundFaqsUrl", () => {
  it("uses PLAYGROUND_FAQS_URL when set", () => {
    expect(
      playgroundFaqsUrl({
        PLAYGROUND_FAQS_URL: "https://example.test/api/search/faqs/",
      }),
    ).toBe("https://example.test/api/search/faqs");
  });

  it("falls back to catalog base + /api/search/faqs", () => {
    expect(
      playgroundFaqsUrl({
        PLAYGROUND_CATALOG_BASE_URL: "https://mdc-playground.herokuapp.com",
      }),
    ).toBe("https://mdc-playground.herokuapp.com/api/search/faqs");
  });
});

describe("parseFaqApiRows", () => {
  it("keeps contract fields and skips incomplete rows", () => {
    const rows = parseFaqApiRows([
      ...sampleRows,
      { id: "", question: "x", answer: "y", locale: "en", source: "", date: null },
      { question: "no id", answer: "y", locale: "en", source: "", date: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(sampleRows[0]);
  });

  it("rejects non-arrays", () => {
    expect(() => parseFaqApiRows({ error: "nope" })).toThrow(/JSON array/);
  });
});

describe("apiRowToBankItem", () => {
  it("maps source/date to fuente/fecha without inventing answers", () => {
    const row = apiRowToBankItem(sampleRows[0], new Date("2026-11-13T12:00:00Z"));
    expect(row.answer).toBe(sampleRows[0].answer);
    expect(row.fuente).toBe("");
    expect(row.fecha).toBe("2026-11-13");
    expect(row.last_updated).toBe("2026-11-13");
    expect(row.status).toBe("pending_from_ce");
    expect(row.active).toBe(true);
    expect(row.sync_origin).toBe(FAQ_SYNC_ORIGIN);
    expect(row.differs_by_course).toBe(true);
  });

  it("uses API date and official status when source is set", () => {
    const row = apiRowToBankItem({
      id: "sample-faq-aid",
      question: "Can I get aid?",
      answer: "Apply for Open Door.",
      locale: "en",
      source: "https://ce.mdc.edu/opendoor",
      date: "2026-10-22",
      differs_by_course: false,
    });
    expect(row.fuente).toBe("https://ce.mdc.edu/opendoor");
    expect(row.fecha).toBe("2026-10-22");
    expect(row.status).toBe("official_ce");
  });
});

describe("mergeFaqBankFromApi", () => {
  it("upserts by id and deactivates missing playground-managed rows", () => {
    const existing: FaqBankRow[] = [
      {
        id: "opendoor#1",
        question: "What are the eligibility requirements?",
        answer: "Be a Florida resident.",
        locale: "en",
        fuente: "opendoor.yml",
        fecha: "2026-10-22",
        last_updated: "2026-10-22",
        status: "official_ce",
        active: true,
      },
      {
        id: "sample-faq-cost",
        question: "old question",
        answer: "old answer",
        locale: "en",
        fuente: "",
        fecha: "2026-01-01",
        last_updated: "2026-01-01",
        sync_origin: FAQ_SYNC_ORIGIN,
        active: true,
      },
      {
        id: "sample-faq-gone",
        question: "Removed from playground?",
        answer: "[Pending from CE. x]",
        locale: "en",
        sync_origin: FAQ_SYNC_ORIGIN,
        active: true,
      },
    ];

    const merged = mergeFaqBankFromApi(existing, sampleRows, new Date("2026-11-13T12:00:00Z"));
    expect(merged.fetched).toBe(2);
    expect(merged.upserted).toBe(2);
    expect(merged.deactivated).toBe(1);

    const byId = Object.fromEntries(merged.faqs.map((f) => [f.id!, f]));
    expect(byId["sample-faq-cost"].question).toBe(sampleRows[0].question);
    expect(byId["sample-faq-cost"].answer).toBe(sampleRows[0].answer);
    expect(byId["sample-faq-cost"].active).toBe(true);
    expect(byId["sample-faq-cost-es"].locale).toBe("es");
    expect(byId["sample-faq-gone"].active).toBe(false);
    expect(byId["opendoor#1"].answer).toBe("Be a Florida resident.");
    expect(byId["opendoor#1"].active).not.toBe(false);
  });

  it("treats legacy sample-faq ids without sync_origin as managed", () => {
    const existing: FaqBankRow[] = [
      {
        id: "sample-faq-orphan",
        question: "Legacy row",
        answer: "[Pending from CE. x]",
        locale: "en",
        active: true,
      },
    ];
    const merged = mergeFaqBankFromApi(existing, [], new Date("2026-11-13T12:00:00Z"));
    expect(merged.deactivated).toBe(1);
    expect(merged.faqs[0].active).toBe(false);
  });
});

describe("fetchPlaygroundFaqs", () => {
  it("parses a 200 JSON list", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(sampleRows),
    }));
    const result = await fetchPlaygroundFaqs("https://example.test/api/search/faqs", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.notModified).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it("handles 304 Not Modified", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 304,
      text: async () => "",
    }));
    const result = await fetchPlaygroundFaqs("https://example.test/api/search/faqs", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      etag: '"abc"',
    });
    expect(result.notModified).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("throws on HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: "FAQs are not available right now." }),
    }));
    await expect(
      fetchPlaygroundFaqs("https://example.test/api/search/faqs", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/503/);
  });
});
