import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import {
  buildFaqBank,
  buildPendingFaqs,
  faqDbConfig,
  summarizeOpenDoorEs,
  writeFaqBank,
  type FaqBankItem,
} from "./load-mdc-playground-faqs";

const PENDING =
  "[Pending from CE. The official answer for Continuing Education is not published yet; nothing is shown in its place.]";

const demoFaqs = [
  {
    id: "sample-faq-financial-aid",
    question: "Can I get financial aid for Continuing Education courses?",
    answer: PENDING,
    status: "pending_from_ce",
    topic: "payment",
    last_reviewed: "",
    related_links: [
      {
        label: "Open Door Grant",
        url: "https://ce.mdc.edu/contentManagement.do?method=load&code=CM000019",
        scope: "official_ce",
      },
    ],
  },
  {
    id: "sample-faq-length",
    question: "How long does a Continuing Education course take?",
    answer: PENDING,
    status: "pending_from_ce",
    topic: "schedule",
  },
  {
    id: "sample-faq-cost",
    question: "How much does a Continuing Education course cost?",
    answer: PENDING,
    status: "pending_from_ce",
    topic: "payment",
  },
  {
    id: "sample-faq-register",
    question: "How do I register for a course?",
    answer: PENDING,
    status: "pending_from_ce",
    topic: "registration",
  },
  {
    id: "sample-faq-payment",
    question: "How do I pay for a course?",
    answer: PENDING,
    status: "pending_from_ce",
    topic: "payment",
  },
  {
    id: "sample-faq-refunds",
    question: "Can I get a refund if I drop a course?",
    answer: PENDING,
    status: "pending_from_ce",
    topic: "refunds",
  },
  {
    id: "sample-faq-admission",
    question: "Do I need to be an MDC student to take a Continuing Education course?",
    answer: PENDING,
    status: "pending_from_ce",
    topic: "registration",
  },
];

describe("load-mdc-playground-faqs", () => {
  it("builds en+es pending rows without inventing answers", () => {
    const rows = buildPendingFaqs(demoFaqs);
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.answer.includes("Pending from CE"))).toBe(true);
    expect(rows.filter((r) => r.locale === "en")).toHaveLength(7);
    expect(rows.filter((r) => r.locale === "es")).toHaveLength(7);
    const aid = rows.find((r) => r.id === "sample-faq-financial-aid");
    expect(aid?.fuente).toMatch(/Open Door Grant/);
    expect(aid?.fuente).toMatch(/search_demo_samples/);
  });

  it("includes Open Door official answers from playground YAML", () => {
    const opendoorYml = {
      landing_info: {
        components: [
          {
            id: "accordion_plus_minus",
            data: {
              questions: [
                {
                  question: "How much funding can I receive?",
                  answer:
                    "The Open Door Grant provides a maximum award equal to the amount needed to cover up to 100% of tuition and fees for eligible programs.",
                },
                {
                  question: "What are the eligibility requirements?",
                  answer: {
                    heading: "To be considered for Open Door Grant funding, students must:",
                    list: [
                      { text: "Be a Florida resident." },
                      { text: "Be enrolled in an eligible workforce program." },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const rows = buildFaqBank({
      demoSamples: { faqs: demoFaqs },
      opendoorYml,
      openDoorFecha: "2026-10-22",
    });
    const openDoorEn = rows.filter(
      (r) => r.status === "official_ce" && r.locale === "en",
    );
    expect(openDoorEn.length).toBe(2);
    expect(openDoorEn.every((r) => r.fecha === "2026-10-22")).toBe(true);
    expect(openDoorEn[0].answer).not.toMatch(/Pending from CE/);
    expect(openDoorEn.some((r) => r.answer.includes("Be a Florida resident"))).toBe(
      true,
    );

    const openDoorEs = rows.filter(
      (r) => String(r.id || "").startsWith("opendoor#") && r.locale === "es",
    );
    expect(openDoorEs.length).toBe(2);
    // No official Spanish Open Door page → Pending from CE (never machine-translated).
    expect(openDoorEs.every((r) => r.status === "pending_from_ce")).toBe(true);
    expect(openDoorEs.every((r) => r.answer.includes("Pending from CE"))).toBe(true);
    expect(summarizeOpenDoorEs(rows)).toEqual({
      total: 2,
      official: 0,
      pending: 2,
    });
  });

  it("writes config + faqs.yml with required fields", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "faq-bank-"));
    const faqs = buildFaqBank({ demoSamples: { faqs: demoFaqs } });
    const written = writeFaqBank(dir, faqs);
    expect(fs.existsSync(written.configPath)).toBe(true);
    expect(fs.existsSync(written.faqsPath)).toBe(true);
    const cfg = yaml.load(fs.readFileSync(written.configPath, "utf8")) as {
      name: string;
      vector_search: { enabled: boolean; fields: string[] };
      source: { local: { filename: string; results_path: string } };
    };
    expect(cfg.name).toBe("frequently_asked_questions");
    expect(cfg.vector_search.enabled).toBe(true);
    expect(cfg.vector_search.fields).toEqual(["question", "answer", "fuente"]);
    expect(cfg.source.local.filename).toBe("faqs.yml");
    expect(cfg.source.local.results_path).toBe("faqs");
    const parsed = yaml.load(fs.readFileSync(written.faqsPath, "utf8")) as {
      faqs: FaqBankItem[];
    };
    for (const row of parsed.faqs) {
      expect(row.question).toBeTruthy();
      expect(row.answer).toBeTruthy();
      expect(["en", "es"]).toContain(row.locale);
      expect(row.fuente).toBeTruthy();
      expect(row.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.last_updated).toBe(row.fecha);
    }
    expect(faqDbConfig().vector_search).toEqual({
      enabled: true,
      fields: ["question", "answer", "fuente"],
    });
  });
});
