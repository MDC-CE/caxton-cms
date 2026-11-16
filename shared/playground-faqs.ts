/**
 * Read-only FAQs from the playground: GET /api/search/faqs.
 * Public JSON (no auth). Caxton upserts into frequently_asked_questions.
 *
 * Contract (playground search_faqs_api): each row has
 * id, question, answer, locale, source, date, differs_by_course.
 */

import { playgroundCatalogBaseUrl } from "./playground-catalog";

export const FAQ_DB_NAME = "frequently_asked_questions";
export const FAQ_SYNC_ORIGIN = "playground_search_faqs";
export const DEFAULT_PLAYGROUND_FAQS_PATH = "/api/search/faqs";

const NY_TZ = "America/New_York";
const FAQ_FETCH_TIMEOUT_MS = 20_000;

export type PlaygroundFaqApiRow = {
  id: string;
  question: string;
  answer: string;
  locale: string;
  source: string;
  date: string | null;
  differs_by_course?: boolean;
};

export type FaqBankRow = {
  id?: string;
  question: string;
  answer: string;
  locale: string;
  fuente?: string;
  fecha?: string;
  last_updated?: string;
  priority?: number;
  locations?: string[];
  status?: string;
  topic?: string;
  active?: boolean;
  differs_by_course?: boolean;
  sync_origin?: string;
};

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

/** Full URL for GET /api/search/faqs. Prefer PLAYGROUND_FAQS_URL; else base + path. */
export function playgroundFaqsUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PLAYGROUND_FAQS_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const base = playgroundCatalogBaseUrl(env);
  return `${base}${DEFAULT_PLAYGROUND_FAQS_PATH}`;
}

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function nyParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  };
}

function offsetMs(date: Date): number {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    bag[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    Number(bag.hour),
    Number(bag.minute),
    Number(bag.second),
  );
  return asUtc - date.getTime();
}

function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = offsetMs(new Date(guess));
  const utc = new Date(guess - first);
  const second = offsetMs(utc);
  return second === first ? utc : new Date(guess - second);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/** Next 01:00 America/New_York (after the catalog poll at 00:30). */
export function nextFaqSyncAt(now = new Date()): Date {
  const parts = nyParts(now);
  let target = zonedToUtc(parts.year, parts.month, parts.day, 1, 0);
  if (target.getTime() <= now.getTime()) {
    const next = addCalendarDays(parts.year, parts.month, parts.day, 1);
    target = zonedToUtc(next.year, next.month, next.day, 1, 0);
  }
  return target;
}

export function msUntilFaqSync(now = new Date()): number {
  return Math.max(0, nextFaqSyncAt(now).getTime() - now.getTime());
}

export function isPlaygroundManagedFaq(row: FaqBankRow): boolean {
  if (row.sync_origin === FAQ_SYNC_ORIGIN) return true;
  const id = String(row.id || "");
  return id.startsWith("sample-faq");
}

export function apiRowToBankItem(row: PlaygroundFaqApiRow, now = new Date()): FaqBankRow {
  const fecha = (row.date && String(row.date).trim()) || todayKey(now);
  const source = row.source == null ? "" : String(row.source);
  const answer = row.answer == null ? "" : String(row.answer);
  const pending = /Pending from CE/i.test(answer) || !source.trim();
  return {
    id: String(row.id),
    question: String(row.question || "").trim(),
    answer,
    locale: String(row.locale || "en").trim() || "en",
    fuente: source,
    fecha,
    last_updated: fecha,
    priority: 2,
    locations: ["all"],
    status: pending ? "pending_from_ce" : "official_ce",
    active: true,
    differs_by_course: Boolean(row.differs_by_course),
    sync_origin: FAQ_SYNC_ORIGIN,
  };
}

export function parseFaqApiRows(payload: unknown): PlaygroundFaqApiRow[] {
  if (!Array.isArray(payload)) {
    throw new Error("Playground FAQs response must be a JSON array");
  }
  const rows: PlaygroundFaqApiRow[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = String(item.id || "").trim();
    const question = String(item.question || "").trim();
    if (!id || !question) continue;
    rows.push({
      id,
      question,
      answer: item.answer == null ? "" : String(item.answer),
      locale: item.locale == null ? "en" : String(item.locale),
      source: item.source == null ? "" : String(item.source),
      date: item.date == null || item.date === "" ? null : String(item.date),
      differs_by_course: Boolean(item.differs_by_course),
    });
  }
  return rows;
}

/**
 * Upsert by id from the playground list. Rows managed by this sync that are
 * missing from the payload are marked active: false (Luma-style deactivate).
 * Open Door and other non-managed rows are left alone.
 */
export function mergeFaqBankFromApi(
  existing: FaqBankRow[],
  incoming: PlaygroundFaqApiRow[],
  now = new Date(),
): { faqs: FaqBankRow[]; upserted: number; deactivated: number; fetched: number } {
  const byId = new Map<string, FaqBankRow>();
  for (const row of existing) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    byId.set(id, { ...row, id });
  }

  const seen = new Set<string>();
  let upserted = 0;
  for (const apiRow of incoming) {
    const mapped = apiRowToBankItem(apiRow, now);
    const id = String(mapped.id);
    seen.add(id);
    const prev = byId.get(id);
    if (prev) {
      byId.set(id, {
        ...prev,
        ...mapped,
        priority: prev.priority ?? mapped.priority,
        locations: prev.locations?.length ? prev.locations : mapped.locations,
        topic: prev.topic ?? mapped.topic,
      });
    } else {
      byId.set(id, mapped);
    }
    upserted += 1;
  }

  let deactivated = 0;
  for (const [id, row] of byId) {
    if (!isPlaygroundManagedFaq(row)) continue;
    if (seen.has(id)) continue;
    if (row.active === false) continue;
    byId.set(id, { ...row, active: false });
    deactivated += 1;
  }

  const faqs = [...byId.values()];
  return { faqs, upserted, deactivated, fetched: incoming.length };
}

export async function fetchPlaygroundFaqs(
  url: string,
  opts?: { fetchImpl?: FetchLike; etag?: string },
): Promise<{ rows: PlaygroundFaqApiRow[]; etag: string | null; notModified: boolean }> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts?.etag) headers["If-None-Match"] = opts.etag;

  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(FAQ_FETCH_TIMEOUT_MS),
  });

  if (response.status === 304) {
    return { rows: [], etag: opts?.etag ?? null, notModified: true };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Playground FAQs fetch failed (${response.status}) ${url}: ${body.slice(0, 300)}`,
    );
  }
  const text = await response.text();
  const payload = JSON.parse(text) as unknown;
  return {
    rows: parseFaqApiRows(payload),
    etag: null,
    notModified: false,
  };
}
