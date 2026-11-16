/**
 * Pull playground GET /api/search/faqs into frequently_asked_questions, then reindex.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { child } from "./logger";
import { getSiteContextMap } from "./site-manager";
import {
  FAQ_DB_NAME,
  assessFaqSyncPayload,
  fetchPlaygroundFaqs,
  isFaqIndexable,
  mergeFaqBankFromApi,
  playgroundFaqsUrl,
  type FaqBankRow,
} from "@shared/playground-faqs";

const log = child({ module: "playground-faq-sync" });

export const FAQ_CONTENT_ROOT_NAME = "site_learning-mdc-edu";

function learningSite() {
  for (const ctx of getSiteContextMap().values()) {
    if (ctx.contentRootName === FAQ_CONTENT_ROOT_NAME) return ctx;
  }
  return null;
}

export function faqBankPaths(contentRoot: string): { dbDir: string; faqsPath: string; configPath: string } {
  const dbDir = path.join(contentRoot, "db", FAQ_DB_NAME);
  return {
    dbDir,
    faqsPath: path.join(dbDir, "faqs.yml"),
    configPath: path.join(dbDir, "config.yml"),
  };
}

export function readExistingFaqBank(contentRoot: string): FaqBankRow[] {
  const { faqsPath } = faqBankPaths(contentRoot);
  if (!fs.existsSync(faqsPath)) return [];
  const parsed = yaml.load(fs.readFileSync(faqsPath, "utf8")) as { faqs?: FaqBankRow[] } | null;
  return Array.isArray(parsed?.faqs) ? parsed!.faqs! : [];
}

export function writeFaqBankYaml(contentRoot: string, faqs: FaqBankRow[]): string {
  const { dbDir, faqsPath } = faqBankPaths(contentRoot);
  fs.mkdirSync(dbDir, { recursive: true });
  fs.writeFileSync(
    faqsPath,
    yaml.dump({ faqs }, { lineWidth: 100, noRefs: true, quotingType: '"' }),
    "utf8",
  );
  return faqsPath;
}

export async function reindexFaqBank(dbName = FAQ_DB_NAME): Promise<{ ok: boolean; count: number; skipped?: string }> {
  const site = learningSite();
  if (!site) {
    return { ok: false, count: 0, skipped: `Site ${FAQ_CONTENT_ROOT_NAME} is not loaded` };
  }
  site.database.reload();
  const cached = await site.database.fetchItems(dbName, true);
  const config = site.database.get(dbName) as {
    vector_search?: { enabled?: boolean; fields?: string[] };
  };
  const vs = config.vector_search;
  if (!vs?.enabled || !vs.fields?.length) {
    return { ok: false, count: cached.items.length, skipped: "vector_search disabled" };
  }
  const { indexItems, isAvailable } = await import("./vector-search");
  if (!(await isAvailable())) {
    return { ok: false, count: cached.items.length, skipped: "Qdrant not available" };
  }
  const indexable = cached.items.filter((item) => isFaqIndexable(item));
  await indexItems(dbName, indexable, vs.fields);
  return { ok: true, count: indexable.length };
}

export type SyncPlaygroundFaqsReport = {
  url: string;
  contentRoot: string;
  faqsPath?: string;
  fetched: number;
  upserted: number;
  deactivated: number;
  preservedOfficial?: number;
  total: number;
  reindexed: boolean;
  reindexSkipped?: string;
  aborted?: boolean;
  abortReason?: string;
  wrote: boolean;
};

export async function syncPlaygroundFaqs(opts?: {
  url?: string;
  contentRoot?: string;
  reindex?: boolean;
  fetchImpl?: typeof fetch;
  /** When true, require PLAYGROUND_FAQS_URL (job path). */
  requireEnvUrl?: boolean;
}): Promise<SyncPlaygroundFaqsReport> {
  const envUrl = playgroundFaqsUrl();
  if (opts?.requireEnvUrl && !envUrl) {
    const report: SyncPlaygroundFaqsReport = {
      url: "",
      contentRoot: opts?.contentRoot || "",
      fetched: 0,
      upserted: 0,
      deactivated: 0,
      total: 0,
      reindexed: false,
      aborted: true,
      abortReason: "PLAYGROUND_FAQS_URL is not set",
      wrote: false,
    };
    log.warn(report, "[playground-faq-sync] skipped — PLAYGROUND_FAQS_URL is not set");
    return report;
  }

  const url = opts?.url || envUrl;
  if (!url) {
    throw new Error("PLAYGROUND_FAQS_URL is not set (pass --url or set the env var)");
  }

  const site = learningSite();
  const contentRoot =
    opts?.contentRoot ||
    site?.contentRoot ||
    path.resolve(process.cwd(), FAQ_CONTENT_ROOT_NAME);

  const { rows, notModified } = await fetchPlaygroundFaqs(url, { fetchImpl: opts?.fetchImpl });
  const existing = readExistingFaqBank(contentRoot);
  const guard = assessFaqSyncPayload(existing, rows, { notModified });
  if (!guard.ok) {
    const report: SyncPlaygroundFaqsReport = {
      url,
      contentRoot,
      fetched: rows.length,
      upserted: 0,
      deactivated: 0,
      total: existing.length,
      reindexed: false,
      aborted: true,
      abortReason: guard.detail,
      wrote: false,
    };
    log.warn(report, "[playground-faq-sync] aborted — bank unchanged");
    return report;
  }

  const merged = mergeFaqBankFromApi(existing, rows);
  const faqsPath = writeFaqBankYaml(contentRoot, merged.faqs);

  let reindexed = false;
  let reindexSkipped: string | undefined;
  if (opts?.reindex !== false) {
    if (site) {
      const ri = await reindexFaqBank();
      reindexed = ri.ok;
      reindexSkipped = ri.skipped;
    } else {
      reindexSkipped = `Site ${FAQ_CONTENT_ROOT_NAME} is not loaded; YAML written only`;
    }
  } else {
    reindexSkipped = "reindex skipped by option";
  }

  const report: SyncPlaygroundFaqsReport = {
    url,
    contentRoot,
    faqsPath,
    fetched: merged.fetched,
    upserted: merged.upserted,
    deactivated: merged.deactivated,
    preservedOfficial: merged.preservedOfficial,
    total: merged.faqs.length,
    reindexed,
    reindexSkipped,
    wrote: true,
  };
  log.info(report, "[playground-faq-sync] done");
  return report;
}
