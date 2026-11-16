import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { FAQ_SYNC_ORIGIN, type FaqBankRow } from "@shared/playground-faqs";
import { readExistingFaqBank, writeFaqBankYaml } from "./playground-faq-sync";

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
        fecha: "2026-11-13",
        last_updated: "2026-11-13",
        active: true,
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
