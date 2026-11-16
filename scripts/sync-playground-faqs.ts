/**
 * Sync CE FAQ bank from playground GET /api/search/faqs.
 *
 * Usage:
 *   npx tsx scripts/sync-playground-faqs.ts
 *   npx tsx scripts/sync-playground-faqs.ts --no-reindex
 *   npx tsx scripts/sync-playground-faqs.ts --url "https://mdc-playground.herokuapp.com/api/search/faqs"
 *   npx tsx scripts/sync-playground-faqs.ts --content-root "C:/path/to/site_learning-mdc-edu"
 *
 * Env:
 *   PLAYGROUND_FAQS_URL — full URL (preferred)
 *   PLAYGROUND_CATALOG_BASE_URL — host only; path /api/search/faqs is appended
 *
 * No secrets. Public endpoint. Does not invent FAQ answers.
 *
 * Daily schedule (Edwin): Sidequest job `playground_faq_sync` at 01:00 America/New_York
 * when the app schedules it on boot — see content/.../frequently_asked_questions/README.md
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  FAQ_DB_NAME,
  fetchPlaygroundFaqs,
  mergeFaqBankFromApi,
  playgroundFaqsUrl,
  type FaqBankRow,
} from "../shared/playground-faqs";
import {
  FAQ_CONTENT_ROOT_NAME,
  readExistingFaqBank,
  writeFaqBankYaml,
} from "../server/playground-faq-sync";

function parseArgs(argv: string[]): {
  url: string;
  contentRoot: string;
  reindex: boolean;
} {
  let url = playgroundFaqsUrl();
  let contentRoot = path.resolve(process.cwd(), FAQ_CONTENT_ROOT_NAME);
  let reindex = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-reindex") reindex = false;
    else if (a === "--reindex") reindex = true;
    else if (a === "--url" && argv[i + 1]) url = argv[++i];
    else if (a === "--content-root" && argv[i + 1]) contentRoot = path.resolve(argv[++i]);
  }
  return { url, contentRoot, reindex };
}

async function reindexFromYaml(contentRoot: string, faqs: FaqBankRow[]): Promise<void> {
  process.env.WEBLIFY_PROJECT_ROOT = process.env.WEBLIFY_PROJECT_ROOT || process.cwd();
  const configPath = path.join(contentRoot, "db", FAQ_DB_NAME, "config.yml");
  let fields = ["question", "answer", "fuente"];
  if (fs.existsSync(configPath)) {
    const cfg = yaml.load(fs.readFileSync(configPath, "utf8")) as {
      vector_search?: { fields?: string[] };
    };
    if (cfg?.vector_search?.fields?.length) fields = cfg.vector_search.fields;
  }
  const { indexItems, isAvailable, getStatus } = await import("../server/vector-search");
  if (!(await isAvailable())) {
    const status = await getStatus();
    console.warn(
      `[sync-playground-faqs] Qdrant not available (${status.error || status.url}). YAML written (${faqs.length} rows); run POST /api/databases/${FAQ_DB_NAME}/reindex when Qdrant is up.`,
    );
    return;
  }
  const active = faqs.filter((f) => f.active !== false);
  await indexItems(FAQ_DB_NAME, active, fields);
  console.log(`[sync-playground-faqs] reindex ok (${active.length} active items)`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`[sync-playground-faqs] GET ${opts.url}`);
  const { rows } = await fetchPlaygroundFaqs(opts.url);
  const existing = readExistingFaqBank(opts.contentRoot);
  const merged = mergeFaqBankFromApi(existing, rows);
  const faqsPath = writeFaqBankYaml(opts.contentRoot, merged.faqs);
  console.log(
    `[sync-playground-faqs] wrote ${merged.faqs.length} rows (upserted=${merged.upserted}, deactivated=${merged.deactivated}) → ${faqsPath}`,
  );

  if (!opts.reindex) {
    console.log("[sync-playground-faqs] skipped reindex (--no-reindex)");
    return;
  }

  try {
    await reindexFromYaml(opts.contentRoot, merged.faqs);
  } catch (err) {
    console.warn(
      `[sync-playground-faqs] reindex failed (${err instanceof Error ? err.message : err}). YAML is written; call /reindex later.`,
    );
  }
}

main().catch((err) => {
  console.error("[sync-playground-faqs] failed:", err);
  process.exit(1);
});
