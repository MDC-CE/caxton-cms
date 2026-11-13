/**
 * Load MDC playground FAQ samples (+ Open Door official page FAQs) into the
 * CE site bank `frequently_asked_questions`, then optionally reindex vectors.
 *
 * Usage:
 *   npx tsx scripts/load-mdc-playground-faqs.ts
 *   npx tsx scripts/load-mdc-playground-faqs.ts --reindex
 *   npx tsx scripts/load-mdc-playground-faqs.ts --playground "C:/path/to/mdc-playground-main"
 *
 * Does not push content GitHub. Pending answers stay marked "Pending from CE".
 */
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

const FAQ_DB = "frequently_asked_questions";
const CONTENT_ROOT_NAME = "site_learning-mdc-edu";
const PENDING_MARK = "Pending from CE";
const TODAY = new Date().toISOString().slice(0, 10);
const OPEN_DOOR_URL =
  "https://ce.mdc.edu/contentManagement.do?method=load&code=CM000019";

/** Spanish question text for locale=es rows. Answers are never invented. */
const ES_QUESTIONS: Record<string, string> = {
  "sample-faq-financial-aid":
    "¿Puedo obtener ayuda financiera para cursos de Educación Continua?",
  "sample-faq-register": "¿Cómo me inscribo en un curso?",
  "sample-faq-payment": "¿Cómo pago un curso?",
  "sample-faq-refunds": "¿Puedo obtener un reembolso si cancelo un curso?",
  "sample-faq-admission":
    "¿Tengo que ser estudiante de MDC para tomar un curso de Educación Continua?",
  "sample-faq-length": "¿Cuánto dura un curso de Educación Continua?",
  "sample-faq-cost": "¿Cuánto cuesta un curso de Educación Continua?",
};

export type FaqBankItem = {
  id?: string;
  question: string;
  answer: string;
  locale: "en" | "es";
  fuente: string;
  fecha: string;
  last_updated: string;
  priority: number;
  locations: string[];
  status?: string;
  topic?: string;
};

type DemoFaq = {
  id: string;
  question: string;
  answer: string;
  status?: string;
  source_url?: string;
  topic?: string;
  last_reviewed?: string;
  related_links?: Array<{ label: string; url: string; scope?: string }>;
};

function defaultPlaygroundRoot(): string {
  const sibling = path.resolve(
    process.cwd(),
    "..",
    "OneDrive",
    "Desktop",
    "mdc-playground-main",
  );
  const desktop = path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    "OneDrive",
    "Desktop",
    "mdc-playground-main",
  );
  for (const candidate of [desktop, sibling]) {
    if (
      fs.existsSync(
        path.join(candidate, "apps", "destiny", "data", "search_demo_samples.json"),
      )
    ) {
      return candidate;
    }
  }
  return desktop;
}

function parseArgs(argv: string[]): {
  playground: string;
  reindex: boolean;
  contentRoot: string;
} {
  let playground = defaultPlaygroundRoot();
  let reindex = false;
  let contentRoot = path.resolve(process.cwd(), CONTENT_ROOT_NAME);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reindex") reindex = true;
    else if (a === "--playground" && argv[i + 1]) playground = argv[++i];
    else if (a === "--content-root" && argv[i + 1]) contentRoot = path.resolve(argv[++i]);
  }
  return { playground, reindex, contentRoot };
}

function flattenOpenDoorAnswer(answer: unknown): string {
  if (typeof answer === "string") return answer.trim();
  if (answer && typeof answer === "object") {
    const obj = answer as { heading?: string; list?: Array<{ text?: string } | string> };
    const heading = (obj.heading || "").trim();
    const items = (obj.list || [])
      .map((item) => (typeof item === "string" ? item : String(item?.text || "")).trim())
      .filter(Boolean)
      .map((t) => `- ${t}`);
    return [heading, ...items].filter(Boolean).join("\n");
  }
  return "";
}

function pendingFuente(faq: DemoFaq): string {
  const openDoor = (faq.related_links || []).find(
    (l) => /open door/i.test(l.label) || l.scope === "official_ce",
  );
  const bits = [
    "mdc-playground apps/destiny/data/search_demo_samples.json",
    `status=${faq.status || "pending_from_ce"}`,
  ];
  if (openDoor?.url) bits.push(`related=${openDoor.label} ${openDoor.url}`);
  if (faq.source_url) bits.push(faq.source_url);
  return bits.join(" | ");
}

export function buildPendingFaqs(demoFaqs: DemoFaq[]): FaqBankItem[] {
  const out: FaqBankItem[] = [];
  for (const faq of demoFaqs) {
    const answer = String(faq.answer || "").trim();
    if (!answer.includes(PENDING_MARK) && faq.status === "pending_from_ce") {
      throw new Error(`Pending FAQ ${faq.id} is missing "${PENDING_MARK}" in answer`);
    }
    const fecha = (faq.last_reviewed || "").trim() || TODAY;
    const fuente = pendingFuente(faq);
    const base = {
      id: faq.id,
      answer,
      fuente,
      fecha,
      last_updated: fecha,
      priority: 2,
      locations: ["all"] as string[],
      status: faq.status || "pending_from_ce",
      topic: faq.topic,
    };
    out.push({
      ...base,
      question: faq.question.trim(),
      locale: "en",
    });
    const esQ = ES_QUESTIONS[faq.id];
    if (!esQ) {
      throw new Error(`Missing Spanish question mapping for ${faq.id}`);
    }
    out.push({
      ...base,
      id: `${faq.id}-es`,
      question: esQ,
      locale: "es",
    });
  }
  return out;
}

/**
 * Official Spanish Open Door FAQ answers, when CE publishes them.
 * Checked: playground only has English `opendoor.yml`; live CE CM000019 is EN-only;
 * `mdc.edu/es/opendoor` 404. Leave empty → ES rows stay Pending from CE (no machine translation).
 */
export const OPEN_DOOR_OFFICIAL_ES: Record<
  string,
  { question: string; answer: string }
> = {};

const OPEN_DOOR_PENDING_ANSWER =
  "[Pending from CE. The official answer for Continuing Education is not published yet; nothing is shown in its place.]";

export function buildOpenDoorFaqs(
  opendoorYml: Record<string, unknown>,
  fecha: string,
): FaqBankItem[] {
  const landing = (opendoorYml.landing_info || {}) as {
    components?: Array<{ id?: string; data?: { questions?: Array<{ question?: string; answer?: unknown }> } }>;
  };
  const components = landing.components || [];
  const accordion = components.find((c) => c.id === "accordion_plus_minus");
  const questions = accordion?.data?.questions || [];
  const out: FaqBankItem[] = [];
  let n = 0;
  for (const item of questions) {
    const question = String(item.question || "").trim();
    if (!question.includes("?")) continue;
    const answer = flattenOpenDoorAnswer(item.answer);
    if (!answer) continue;
    n += 1;
    const id = `opendoor#${n}`;
    out.push({
      id,
      question,
      answer,
      locale: "en",
      fuente: `playground:apps/playground/data/opendoor.yml (official_ce) | ${OPEN_DOOR_URL}`,
      fecha,
      last_updated: fecha,
      priority: 1,
      locations: ["all"],
      status: "official_ce",
      topic: "open_door_grant",
    });

    const officialEs = OPEN_DOOR_OFFICIAL_ES[id];
    if (officialEs?.answer?.trim() && !officialEs.answer.includes(PENDING_MARK)) {
      out.push({
        id: `${id}-es`,
        question: officialEs.question.trim() || question,
        answer: officialEs.answer.trim(),
        locale: "es",
        fuente: `official Spanish Open Door CE page | ${OPEN_DOOR_URL}`,
        fecha,
        last_updated: fecha,
        priority: 1,
        locations: ["all"],
        status: "official_ce",
        topic: "open_door_grant",
      });
    } else {
      // No official ES copy found — keep EN question (do not machine-translate), Pending answer.
      out.push({
        id: `${id}-es`,
        question,
        answer: OPEN_DOOR_PENDING_ANSWER,
        locale: "es",
        fuente:
          "no official Spanish Open Door FAQ found (playground opendoor.yml EN-only; ce.mdc.edu CM000019 EN-only; mdc.edu/es/opendoor 404) | pending_from_ce",
        fecha: TODAY,
        last_updated: TODAY,
        priority: 1,
        locations: ["all"],
        status: "pending_from_ce",
        topic: "open_door_grant",
      });
    }
  }
  return out;
}

/** Counts for Open Door locale=es rows after build. */
export function summarizeOpenDoorEs(faqs: FaqBankItem[]): {
  total: number;
  official: number;
  pending: number;
} {
  const es = faqs.filter(
    (f) => f.locale === "es" && String(f.id || "").startsWith("opendoor#"),
  );
  const official = es.filter((f) => f.status === "official_ce").length;
  const pending = es.filter((f) => f.status === "pending_from_ce").length;
  return { total: es.length, official, pending };
}

export function buildFaqBank(opts: {
  demoSamples: { faqs?: DemoFaq[] };
  opendoorYml?: Record<string, unknown> | null;
  openDoorFecha?: string;
}): FaqBankItem[] {
  const pending = buildPendingFaqs(opts.demoSamples.faqs || []);
  const openDoor = opts.opendoorYml
    ? buildOpenDoorFaqs(opts.opendoorYml, opts.openDoorFecha || TODAY)
    : [];
  return [...openDoor, ...pending];
}

export function faqDbConfig(): Record<string, unknown> {
  return {
    name: FAQ_DB,
    description:
      "Continuing Education FAQs for learning.mdc.edu (playground samples + Open Door). Pending answers stay marked Pending from CE.",
    source: {
      type: "local",
      local: {
        filename: "faqs.yml",
        results_path: "faqs",
      },
    },
    cache: { ttl_minutes: 60 },
    filter_by_locale: true,
    vector_search: {
      enabled: true,
      fields: ["question", "answer", "fuente"],
    },
    search_fields: ["question", "answer", "fuente", "topic", "id"],
    editor: {
      question: { type: "text", description: "Question visitors ask" },
      answer: { type: "textarea", description: "Answer shown (Pending from CE until CE publishes)" },
      locale: {
        type: "select",
        options: ["en", "es"],
        description: "Language of this FAQ row",
      },
      fuente: { type: "text", description: "Source of this answer" },
      fecha: { type: "text", description: "Source date (YYYY-MM-DD)" },
      last_updated: { type: "text", description: "Last reviewed (YYYY-MM-DD)" },
      priority: { type: "number", description: "Lower numbers sort first" },
      locations: { type: "tags", description: "Campus/location tags (all = everywhere)" },
      status: {
        type: "select",
        options: ["official_ce", "pending_from_ce"],
        description: "Official CE answer or still pending",
      },
      topic: { type: "text", description: "Topic label" },
      id: { type: "text", description: "Stable id from playground" },
    },
  };
}

export function writeFaqBank(contentRoot: string, faqs: FaqBankItem[]): {
  configPath: string;
  faqsPath: string;
  count: number;
} {
  const dbDir = path.join(contentRoot, "db", FAQ_DB);
  fs.mkdirSync(dbDir, { recursive: true });
  const configPath = path.join(dbDir, "config.yml");
  const faqsPath = path.join(dbDir, "faqs.yml");
  fs.writeFileSync(
    configPath,
    yaml.dump(faqDbConfig(), { lineWidth: 100, noRefs: true }),
    "utf8",
  );
  fs.writeFileSync(
    faqsPath,
    yaml.dump({ faqs }, { lineWidth: 100, noRefs: true, quotingType: '"' }),
    "utf8",
  );
  return { configPath, faqsPath, count: faqs.length };
}

function readOpenDoorFecha(playground: string): string {
  const datesPath = path.join(
    playground,
    "apps",
    "destiny",
    "data",
    "search_faq_dates.json",
  );
  if (!fs.existsSync(datesPath)) return TODAY;
  try {
    const raw = JSON.parse(fs.readFileSync(datesPath, "utf8")) as {
      pages?: Record<string, { date?: string }>;
    };
    return raw.pages?.opendoor?.date || TODAY;
  } catch {
    return TODAY;
  }
}

async function maybeReindex(contentRoot: string, count: number): Promise<void> {
  process.env.WEBLIFY_PROJECT_ROOT = process.env.WEBLIFY_PROJECT_ROOT || process.cwd();
  const { indexItems, isAvailable, getStatus } = await import("../server/vector-search");
  const available = await isAvailable();
  if (!available) {
    const status = await getStatus();
    console.warn(
      `[load-mdc-playground-faqs] Qdrant not available (${status.error || status.url}). Bank written (${count} rows); run with --reindex when Qdrant is up.`,
    );
    console.warn(
      `  POST /api/databases/${FAQ_DB}/reindex  or: npx tsx scripts/load-mdc-playground-faqs.ts --reindex`,
    );
    return;
  }
  const faqsPath = path.join(contentRoot, "db", FAQ_DB, "faqs.yml");
  const parsed = yaml.load(fs.readFileSync(faqsPath, "utf8")) as { faqs: FaqBankItem[] };
  const fields = ["question", "answer", "fuente"];
  console.log(`[load-mdc-playground-faqs] Indexing ${parsed.faqs.length} rows into Qdrant collection "${FAQ_DB}"...`);
  await indexItems(FAQ_DB, parsed.faqs as unknown as Record<string, unknown>[], fields);
  console.log(`[load-mdc-playground-faqs] Reindex finished.`);
}

async function main(): Promise<void> {
  const { playground, reindex, contentRoot } = parseArgs(process.argv.slice(2));
  const samplesPath = path.join(
    playground,
    "apps",
    "destiny",
    "data",
    "search_demo_samples.json",
  );
  if (!fs.existsSync(samplesPath)) {
    throw new Error(`FAQ source not found: ${samplesPath}`);
  }
  const demoSamples = JSON.parse(fs.readFileSync(samplesPath, "utf8")) as {
    faqs?: DemoFaq[];
  };
  const opendoorPath = path.join(playground, "apps", "playground", "data", "opendoor.yml");
  const opendoorYml = fs.existsSync(opendoorPath)
    ? (yaml.load(fs.readFileSync(opendoorPath, "utf8")) as Record<string, unknown>)
    : null;
  const faqs = buildFaqBank({
    demoSamples,
    opendoorYml,
    openDoorFecha: readOpenDoorFecha(playground),
  });
  for (const row of faqs) {
    if (!row.question?.trim() || !row.answer?.trim() || !row.locale) {
      throw new Error(`Invalid FAQ row: ${JSON.stringify(row)}`);
    }
    if (row.status === "pending_from_ce" && !row.answer.includes(PENDING_MARK)) {
      throw new Error(`Pending row lost Pending from CE marker: ${row.id}`);
    }
  }
  const written = writeFaqBank(contentRoot, faqs);
  const openDoorEs = summarizeOpenDoorEs(faqs);
  console.log(
    `[load-mdc-playground-faqs] Wrote ${written.count} FAQs → ${written.faqsPath}`,
  );
  console.log(`[load-mdc-playground-faqs] Config → ${written.configPath}`);
  console.log(
    `[load-mdc-playground-faqs] Open Door ES: ${openDoorEs.total} total, ${openDoorEs.official} official, ${openDoorEs.pending} Pending from CE`,
  );

  // Checked-in snapshot for PRs (site_* is gitignored in the app repo).
  const fixtureDir = path.resolve(
    process.cwd(),
    "scripts",
    "fixtures",
    "mdc-ce-frequently-asked-questions",
  );
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.copyFileSync(written.configPath, path.join(fixtureDir, "config.yml"));
  fs.copyFileSync(written.faqsPath, path.join(fixtureDir, "faqs.yml"));
  console.log(`[load-mdc-playground-faqs] Fixture snapshot → ${fixtureDir}`);

  if (reindex) {
    await maybeReindex(contentRoot, written.count);
  } else {
    console.log(
      `[load-mdc-playground-faqs] Skipped vector index (pass --reindex). Collection: ${FAQ_DB}`,
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).includes("load-mdc-playground-faqs");

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
