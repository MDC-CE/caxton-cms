import { describe, expect, it, vi } from "vitest";
import {
  FAQ_DB_NAME,
  FAQ_SYNC_ORIGIN,
  apiRowToBankItem,
  assessFaqSyncPayload,
  isFaqIndexable,
  itemsForVectorIndex,
  mergeFaqBankFromApi,
  parseFaqApiRows,
  playgroundFaqsUrl,
  fetchPlaygroundFaqs,
  type FaqBankRow,
  type PlaygroundFaqApiRow,
} from "./playground-faqs";

const PENDING =
  "[Pending from CE. The official answer for Continuing Education is not published yet; nothing is shown in its place.]";

const sampleRows: PlaygroundFaqApiRow[] = [
  {
    id: "sample-faq-cost",
    question: "How much does a Continuing Education course cost?",
    answer: PENDING,
    locale: "en",
    source: "",
    date: null,
    differs_by_course: true,
  },
  {
    id: "sample-faq-cost-es",
    question: "¿Cuánto cuesta un curso de Educación Continua?",
    answer: PENDING,
    locale: "es",
    source: "",
    date: null,
    differs_by_course: true,
  },
];

const officialApiRow: PlaygroundFaqApiRow = {
  id: "sample-faq-register",
  question: "How do I register for a course?",
  answer: "Register online at ce.mdc.edu.",
  locale: "en",
  source: "https://ce.mdc.edu/register",
  date: "2026-11-01",
  differs_by_course: false,
};

describe("playgroundFaqsUrl", () => {
  it("uses PLAYGROUND_FAQS_URL when set", () => {
    expect(
      playgroundFaqsUrl({
        PLAYGROUND_FAQS_URL: "https://example.test/api/search/faqs/",
      }),
    ).toBe("https://example.test/api/search/faqs");
  });

  it("returns null when PLAYGROUND_FAQS_URL is missing (no default host)", () => {
    expect(
      playgroundFaqsUrl({
        PLAYGROUND_CATALOG_BASE_URL: "https://mdc-playground.herokuapp.com",
      }),
    ).toBeNull();
    expect(playgroundFaqsUrl({})).toBeNull();
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
  it("maps pending placeholders to active:false and sets source_url", () => {
    const row = apiRowToBankItem(sampleRows[0], new Date("2026-11-13T12:00:00Z"));
    expect(row.answer).toBe(sampleRows[0].answer);
    expect(row.fuente).toBe("");
    expect(row.source_url).toBe("");
    expect(row.fecha).toBe("2026-11-13");
    expect(row.status).toBe("pending_from_ce");
    expect(row.active).toBe(false);
    expect(isFaqIndexable(row)).toBe(false);
    expect(row.sync_origin).toBe(FAQ_SYNC_ORIGIN);
  });

  it("uses ET calendar date when API date is null", () => {
    // 2026-11-13 03:30 UTC → still 2026-11-12 in America/New_York
    const row = apiRowToBankItem(sampleRows[0], new Date("2026-11-13T03:30:00Z"));
    expect(row.fecha).toBe("2026-11-12");
  });

  it("maps official rows with source_url and active true", () => {
    const row = apiRowToBankItem(officialApiRow);
    expect(row.fuente).toBe("https://ce.mdc.edu/register");
    expect(row.source_url).toBe("https://ce.mdc.edu/register");
    expect(row.fecha).toBe("2026-11-01");
    expect(row.status).toBe("official_ce");
    expect(row.active).toBe(true);
    expect(isFaqIndexable(row)).toBe(true);
  });

  it("treats empty answer as pending inactive", () => {
    const row = apiRowToBankItem({
      id: "sample-faq-empty",
      question: "Empty?",
      answer: "  ",
      locale: "en",
      source: "https://example.test",
      date: "2026-11-01",
    });
    expect(row.active).toBe(false);
    expect(row.status).toBe("pending_from_ce");
    expect(isFaqIndexable(row)).toBe(false);
  });
});

describe("assessFaqSyncPayload", () => {
  it("aborts on notModified (304)", () => {
    const g = assessFaqSyncPayload([], sampleRows, { notModified: true });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe("not_modified");
  });

  it("aborts on empty payload", () => {
    const g = assessFaqSyncPayload([], []);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe("empty_payload");
  });

  it("aborts when incoming is under 50% of managed rows", () => {
    const existing: FaqBankRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sample-faq-${i}`,
      question: `Q${i}?`,
      answer: "Official answer.",
      locale: "en",
      sync_origin: FAQ_SYNC_ORIGIN,
      active: true,
      status: "official_ce",
    }));
    const g = assessFaqSyncPayload(existing, [officialApiRow]);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe("too_few_rows");
  });

  it("allows a full enough payload", () => {
    const existing: FaqBankRow[] = [
      {
        id: "sample-faq-cost",
        question: "q",
        answer: PENDING,
        locale: "en",
        sync_origin: FAQ_SYNC_ORIGIN,
        active: false,
        status: "pending_from_ce",
      },
    ];
    expect(assessFaqSyncPayload(existing, sampleRows).ok).toBe(true);
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
        status: "official_ce",
        active: true,
      },
      {
        id: "sample-faq-gone",
        question: "Removed from playground?",
        answer: PENDING,
        locale: "en",
        sync_origin: FAQ_SYNC_ORIGIN,
        active: true,
        status: "pending_from_ce",
      },
    ];

    const merged = mergeFaqBankFromApi(existing, sampleRows, new Date("2026-11-13T12:00:00Z"));
    expect(merged.fetched).toBe(2);
    expect(merged.upserted).toBe(1); // only -es is new; -cost keeps official
    expect(merged.deactivated).toBe(1);
    expect(merged.preservedOfficial).toBe(1);

    const byId = Object.fromEntries(merged.faqs.map((f) => [f.id!, f]));
    // Official existing is preserved when API sends pending for same id
    expect(byId["sample-faq-cost"].answer).toBe("old answer");
    expect(byId["sample-faq-cost"].active).toBe(true);
    expect(byId["sample-faq-cost-es"].active).toBe(false);
    expect(byId["sample-faq-cost-es"].status).toBe("pending_from_ce");
    expect(byId["sample-faq-gone"].active).toBe(false);
    expect(byId["opendoor#1"].answer).toBe("Be a Florida resident.");
  });

  it("does not deactivate or overwrite manual sample-faq rows without sync_origin", () => {
    const existing: FaqBankRow[] = [
      {
        id: "sample-faq-orphan",
        question: "Manual row",
        answer: "Staff wrote this.",
        locale: "en",
        active: true,
        status: "official_ce",
      },
    ];
    const merged = mergeFaqBankFromApi(existing, [], new Date("2026-11-13T12:00:00Z"));
    expect(merged.deactivated).toBe(0);
    expect(merged.faqs[0].active).toBe(true);
    expect(merged.faqs[0].answer).toBe("Staff wrote this.");
  });

  it("does not overwrite a manual row when API sends the same colliding id", () => {
    const existing: FaqBankRow[] = [
      {
        id: "sample-faq-register",
        question: "Manual register FAQ",
        answer: "Ask an advisor in person.",
        locale: "en",
        active: true,
        status: "official_ce",
      },
    ];
    const merged = mergeFaqBankFromApi(existing, [officialApiRow]);
    expect(merged.upserted).toBe(0);
    expect(merged.faqs).toHaveLength(1);
    expect(merged.faqs[0].answer).toBe("Ask an advisor in person.");
    expect(merged.faqs[0].sync_origin).toBeUndefined();
  });

  it("does not let pending API overwrite an official managed answer", () => {
    const existing: FaqBankRow[] = [
      {
        id: "sample-faq-cost",
        question: "How much?",
        answer: "It depends on the course and campus.",
        locale: "en",
        sync_origin: FAQ_SYNC_ORIGIN,
        status: "official_ce",
        active: true,
        fuente: "https://ce.mdc.edu",
        source_url: "https://ce.mdc.edu",
      },
    ];
    const merged = mergeFaqBankFromApi(existing, sampleRows.slice(0, 1));
    expect(merged.preservedOfficial).toBe(1);
    expect(merged.faqs[0].answer).toBe("It depends on the course and campus.");
    expect(merged.faqs[0].active).toBe(true);
    expect(isFaqIndexable(merged.faqs[0])).toBe(true);
  });

  it("upserts official API rows as indexable", () => {
    const merged = mergeFaqBankFromApi([], [officialApiRow]);
    expect(merged.upserted).toBe(1);
    expect(isFaqIndexable(merged.faqs[0])).toBe(true);
    expect(merged.faqs[0].source_url).toBe("https://ce.mdc.edu/register");
  });
});

describe("itemsForVectorIndex (generic reindex / DatabaseManager)", () => {
  it("drops pending and inactive FAQ rows before indexing", () => {
    const items = [
      {
        id: "sample-faq-pending",
        question: "Pending?",
        answer: PENDING,
        status: "pending_from_ce",
        active: false,
      },
      {
        id: "sample-faq-register",
        question: "How do I register?",
        answer: "Register online.",
        status: "official_ce",
        active: true,
      },
      {
        id: "sample-faq-empty",
        question: "Empty?",
        answer: "",
        status: "pending_from_ce",
        active: true,
      },
    ];
    const indexed = itemsForVectorIndex(FAQ_DB_NAME, items);
    expect(indexed.map((i) => i.id)).toEqual(["sample-faq-register"]);
  });

  it("leaves non-FAQ databases unchanged", () => {
    const items = [{ id: "a", answer: PENDING }];
    expect(itemsForVectorIndex("ce-catalog", items)).toEqual(items);
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
