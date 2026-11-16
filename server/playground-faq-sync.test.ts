import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { FAQ_SYNC_ORIGIN, type FaqBankRow } from "@shared/playground-faqs";
import { readExistingFaqBank, syncPlaygroundFaqs, writeFaqBankYaml } from "./playground-faq-sync";
import { PlaygroundFaqSyncJob } from "./jobs/definitions/playground-faq-sync";

describe("playground-faq-sync yaml IO", () => {
  it("writes and reads faqs.yml under the content root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "faq-sync-"));
    const faqs: FaqBankRow[] = [
      {
        id: "sample-faq-cost",
        question: "How much?",
        answer: "[Pending from CE. x]",
        locale: "en",
        fuente: "",
        source_url: "",
        fecha: "2026-11-13",
        last_updated: "2026-11-13",
        active: false,
        status: "pending_from_ce",
        sync_origin: FAQ_SYNC_ORIGIN,
      },
    ];
    const faqsPath = writeFaqBankYaml(root, faqs);
    expect(fs.existsSync(faqsPath)).toBe(true);
    const loaded = readExistingFaqBank(root);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("sample-faq-cost");
    const raw = yaml.load(fs.readFileSync(faqsPath, "utf8")) as { faqs: FaqBankRow[] };
    expect(raw.faqs[0].sync_origin).toBe(FAQ_SYNC_ORIGIN);
  });
});

describe("syncPlaygroundFaqs guards", () => {
  it("does not write on empty payload", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "faq-sync-empty-"));
    writeFaqBankYaml(root, [
      {
        id: "sample-faq-keep",
        question: "Keep me?",
        answer: "Yes.",
        locale: "en",
        sync_origin: FAQ_SYNC_ORIGIN,
        active: true,
        status: "official_ce",
      },
    ]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "[]",
    }));
    const report = await syncPlaygroundFaqs({
      url: "https://example.test/api/search/faqs",
      contentRoot: root,
      reindex: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(report.aborted).toBe(true);
    expect(report.wrote).toBe(false);
    expect(readExistingFaqBank(root)).toHaveLength(1);
  });

  it("does not write on HTTP 304", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "faq-sync-304-"));
    writeFaqBankYaml(root, [
      {
        id: "sample-faq-keep",
        question: "Keep me?",
        answer: "Yes.",
        locale: "en",
        sync_origin: FAQ_SYNC_ORIGIN,
        active: true,
        status: "official_ce",
      },
    ]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 304,
      text: async () => "",
    }));
    const report = await syncPlaygroundFaqs({
      url: "https://example.test/api/search/faqs",
      contentRoot: root,
      reindex: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(report.aborted).toBe(true);
    expect(report.abortReason).toMatch(/304/i);
    expect(report.wrote).toBe(false);
  });

  it("aborts when requireEnvUrl and PLAYGROUND_FAQS_URL is missing", async () => {
    const prev = process.env.PLAYGROUND_FAQS_URL;
    delete process.env.PLAYGROUND_FAQS_URL;
    try {
      const report = await syncPlaygroundFaqs({ requireEnvUrl: true, reindex: false });
      expect(report.aborted).toBe(true);
      expect(report.abortReason).toMatch(/PLAYGROUND_FAQS_URL/);
      expect(report.wrote).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PLAYGROUND_FAQS_URL;
      else process.env.PLAYGROUND_FAQS_URL = prev;
    }
  });
});

describe("PlaygroundFaqSyncJob without env", () => {
  it("skips sync when PLAYGROUND_FAQS_URL is not set", async () => {
    const prev = process.env.PLAYGROUND_FAQS_URL;
    delete process.env.PLAYGROUND_FAQS_URL;
    try {
      const job = new PlaygroundFaqSyncJob();
      // Avoid enqueue side effects from finally/reschedule in unit isolation:
      // run() still calls reschedule; stub enqueue by catching — job should return skipped.
      const result = await job.run();
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.PLAYGROUND_FAQS_URL;
      else process.env.PLAYGROUND_FAQS_URL = prev;
    }
  });
});
