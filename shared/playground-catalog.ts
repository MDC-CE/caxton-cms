/**
 * HTTP client for the MDC Playground catalog.
 * Caxton never opens the playground database. List rows use the same shape as detail.
 */

export const CATALOG_LANGS = ["en", "es", "ht"] as const;
export type CatalogLang = (typeof CATALOG_LANGS)[number];
export type CatalogKind = "course" | "content_piece";

export const DEFAULT_PLAYGROUND_CATALOG_BASE_URL = "http://127.0.0.1:3000";
export const CATALOG_PAGE_LIMIT = 100;
export const CATALOG_DB_NAME = "ce-catalog";

const NY_TZ = "America/New_York";

export interface CatalogSection {
  crn?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  campus?: string | null;
  is_available?: boolean | null;
  contact_hours?: number | string | null;
  delivery_options?: string | string[] | null;
  language_of_delivery?: string | null;
  days?: string | null;
}

export interface CatalogItem {
  kind: CatalogKind;
  destiny_code: string;
  code?: string | null;
  title?: string | null;
  slug?: string | null;
  is_active?: boolean | null;
  program_area_name?: string | null;
  program_stream_name?: string | null;
  source_url?: string | null;
  sections?: CatalogSection[] | null;
  description?: string | null;
  description_source?: "landing_yaml" | "database" | null;
  landing_slug?: string | null;
  landing_version?: number | null;
  lang: CatalogLang;
}

export interface CatalogListPage {
  count?: number;
  first?: string | null;
  next?: string | null;
  previous?: string | null;
  last?: string | null;
  results: CatalogItem[];
}

export interface CatalogQuery {
  kind?: CatalogKind;
  offset?: number;
  limit?: number;
  program_area_id?: number;
  destiny_code?: string;
  lang?: CatalogLang;
}

export interface PlaygroundOffering {
  start_date: string;
  course_title: string;
  course_url: string;
  campus: string;
  program_area_name: string;
  is_available: boolean;
  duration?: string;
  format?: string;
  image_id: string;
  image_alt?: string;
}

type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export function playgroundCatalogBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PLAYGROUND_CATALOG_BASE_URL?.trim() || DEFAULT_PLAYGROUND_CATALOG_BASE_URL;
  return raw.replace(/\/$/, "");
}

export function catalogAuthHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function catalogListUrl(baseUrl: string, query: CatalogQuery = {}): string {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/v2/destiny/catalog`);
  if (query.kind) url.searchParams.set("kind", query.kind);
  if (query.offset != null) url.searchParams.set("offset", String(query.offset));
  if (query.limit != null) url.searchParams.set("limit", String(query.limit));
  if (query.program_area_id != null) url.searchParams.set("program_area_id", String(query.program_area_id));
  if (query.destiny_code) url.searchParams.set("destiny_code", query.destiny_code);
  if (query.lang) url.searchParams.set("lang", query.lang);
  return url.toString();
}

export function catalogDetailUrl(
  baseUrl: string,
  kind: CatalogKind,
  destinyCode: string,
  lang?: CatalogLang,
): string {
  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/api/v2/destiny/catalog/${kind}/${encodeURIComponent(destinyCode)}`,
  );
  if (lang) url.searchParams.set("lang", lang);
  return url.toString();
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

function addCalendarDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/** Next 03:00 America/New_York. If that instant has passed, the following day. */
export function nextCatalogPollAt(now = new Date()): Date {
  const parts = nyParts(now);
  let target = zonedToUtc(parts.year, parts.month, parts.day, 3, 0);
  if (target.getTime() <= now.getTime()) {
    const next = addCalendarDays(parts.year, parts.month, parts.day, 1);
    target = zonedToUtc(next.year, next.month, next.day, 3, 0);
  }
  return target;
}

export function msUntilCatalogPoll(now = new Date()): number {
  return Math.max(0, nextCatalogPollAt(now).getTime() - now.getTime());
}

export function nyDateKey(now = new Date()): string {
  const parts = nyParts(now);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

async function readError(response: { text: () => Promise<string> }): Promise<string> {
  try {
    const body = await response.text();
    if (!body) return "";
    try {
      const parsed = JSON.parse(body) as { message?: string };
      return parsed.message || body.slice(0, 300);
    } catch {
      return body.slice(0, 300);
    }
  } catch {
    return "";
  }
}

function asItem(raw: unknown, lang: CatalogLang): CatalogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<CatalogItem>;
  if (row.kind !== "course" && row.kind !== "content_piece") return null;
  if (!row.destiny_code || typeof row.destiny_code !== "string") return null;
  return { ...(row as CatalogItem), kind: row.kind, destiny_code: row.destiny_code, lang };
}

export async function fetchCatalogPage(
  baseUrl: string,
  token: string,
  query: CatalogQuery,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CatalogListPage> {
  if (!token.trim()) throw new Error("CAXTON_CATALOG_TOKEN is not set");
  const response = await fetchImpl(catalogListUrl(baseUrl, query), { headers: catalogAuthHeaders(token) });
  if (!response.ok) {
    const message = await readError(response);
    throw new Error(`Playground catalog list returned ${response.status}${message ? `: ${message}` : ""}`);
  }
  const data = (await response.json()) as Partial<CatalogListPage>;
  const lang = query.lang ?? "en";
  const results = Array.isArray(data.results)
    ? data.results.map((row) => asItem(row, lang)).filter((row): row is CatalogItem => row !== null)
    : [];
  return { ...data, results };
}

export async function fetchCatalogDetail(
  baseUrl: string,
  token: string,
  kind: CatalogKind,
  destinyCode: string,
  lang: CatalogLang = "en",
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CatalogItem> {
  if (!token.trim()) throw new Error("CAXTON_CATALOG_TOKEN is not set");
  const response = await fetchImpl(catalogDetailUrl(baseUrl, kind, destinyCode, lang), {
    headers: catalogAuthHeaders(token),
  });
  if (!response.ok) {
    const message = await readError(response);
    throw new Error(`Playground catalog detail returned ${response.status}${message ? `: ${message}` : ""}`);
  }
  const item = asItem(await response.json(), lang);
  if (!item) throw new Error("Playground catalog detail was not a catalog item");
  return item;
}

export async function fetchAllCatalog(
  baseUrl: string,
  token: string,
  langs: readonly CatalogLang[] = CATALOG_LANGS,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  for (const lang of langs) {
    let offset = 0;
    let guard = 0;
    while (guard < 1000) {
      guard += 1;
      const page = await fetchCatalogPage(
        baseUrl,
        token,
        { lang, offset, limit: CATALOG_PAGE_LIMIT },
        fetchImpl,
      );
      items.push(...page.results);
      const short = page.results.length < CATALOG_PAGE_LIMIT;
      if (short || page.next == null || page.results.length === 0) break;
      offset += CATALOG_PAGE_LIMIT;
    }
  }
  return items;
}

export function toSearchDocuments(items: CatalogItem[]): Record<string, unknown>[] {
  return items
    .filter((item) => item.destiny_code)
    .map((item) => ({
      id: `${item.lang}:${item.kind}:${item.destiny_code}`,
      slug: `${item.lang}:${item.kind}:${item.destiny_code}`,
      lang: item.lang,
      locale: item.lang,
      kind: item.kind,
      destiny_code: item.destiny_code,
      code: item.code ?? null,
      title: item.title ?? "",
      description: item.description ?? "",
      program_area_name: item.program_area_name ?? "",
      program_stream_name: item.program_stream_name ?? "",
      landing_slug: item.landing_slug ?? null,
      description_source: item.description_source ?? null,
      is_active: item.is_active !== false,
    }));
}

const THEME_IMAGES: Record<string, string[]> = {
  health: ["ce-topic-nursing", "ce-patient-care", "ce-tile-vitals"],
  language: ["ce-topic-language", "ce-camino"],
  business: ["ce-topic-business"],
  childcare: ["ce-childcare-classroom"],
  youth: ["ce-topic-youth", "ce-childcare-classroom"],
  tech: ["ce-tech-server", "ce-tile-network"],
  trades: ["ce-tile-framing", "ce-jobsite-crew", "ce-hvac"],
  electrical: ["ce-comptia"],
  auto: ["ce-engine-technician"],
  culinary: ["ce-culinary-class", "ce-culinary-skills", "ce-culinary-kitchen", "ce-tile-plating", "ce-pastry-prep", "ce-bakery-owners"],
  fitness: ["ce-topic-fitness"],
  enrichment: ["ce-topic-enrichment"],
  exam: ["ce-sit-exam"],
  credential: ["ce-hero-credential", "ce-sit-exam"],
  aviation: ["ce-topic-aviation"],
};

const TITLE_THEMES: Array<[RegExp, string]> = [
  [/artificial intelligence|chatgpt|\bcopilot\b|machine learning/i, "business"],
  [/aviation|aircraft|\bpilot\b|airframe/i, "aviation"],
  [/nurs|\bcna\b|phlebot|patient care|dental|clinic|emt|pharm/i, "health"],
  [/hvac|plumb|weld|framing|carpenter|mason/i, "trades"],
  [/electric|wiring/i, "electrical"],
  [/\bauto\b|\bengines?\b|mechanic/i, "auto"],
  [/culin|pastry|bakery|\bchef\b|\bcooks?\b|\bcooking\b/i, "culinary"],
  [/yoga|fitness|pilates|zumba|ballet|dance|\bsports?\b|martial|judo|karate/i, "fitness"],
  [/child ?care|preschool|infant|toddler/i, "childcare"],
  [/microsoft office|\bpowerpoint\b|\boutlook\b|\bquickbooks\b/i, "business"],
  [/spanish|esol|\besl\b|english|language|conversation|french|german|italian|portuguese|creole/i, "language"],
  [/contabil|negocio|marketing|\bexcel\b|administraci|finanza|emprend/i, "business"],
  [/comput|programaci|\bredes\b/i, "tech"],
];

function hash(text: string): number {
  let total = 0;
  for (let index = 0; index < text.length; index += 1) total = (total + text.charCodeAt(index) * (index + 1)) % 997;
  return total;
}

function themeFor(areaName: string, title: string): string {
  for (const [pattern, theme] of TITLE_THEMES) {
    if (pattern.test(title)) return theme;
  }
  const area = (areaName || "").toLowerCase();
  if (area.includes("health")) return "health";
  if (area.includes("english") || area.includes("language") || area.includes("español")) return "language";
  if (area.includes("business")) return "business";
  if (area.includes("child")) return "childcare";
  if (area.includes("technolog")) return "tech";
  if (area.includes("fitness") || area.includes("sport")) return "fitness";
  if (area.includes("kid") || area.includes("teen") || area.includes("summer") || area.includes("camp")) return "youth";
  if (area.includes("construction") || area.includes("trade")) return "trades";
  if (area.includes("aviation")) return "aviation";
  if (area.includes("test")) return "exam";
  if (area.includes("certification") || area.includes("licens")) return "credential";
  if (area.includes("parent")) return "childcare";
  if (area.includes("enrich")) return "enrichment";
  return "credential";
}

function imageFor(areaName: string, title: string): string {
  const theme = themeFor(areaName, title);
  const pool = THEME_IMAGES[theme] || THEME_IMAGES.credential;
  return pool[hash(`${theme}:${title}`) % pool.length];
}

function campusName(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+Campus$/i, "").replace(/^MDC\s+/i, "").trim();
}

function formatLabel(value: string | string[] | null | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const first = String(raw).split(",")[0].trim();
  if (!first || first === "Language not found") return undefined;
  return first.replace(/^MDC\s+/i, "").replace(/In-Person/i, "In person");
}

function durationLabel(hours: number | string | null | undefined): string | undefined {
  if (hours == null || hours === "") return undefined;
  const amount = Number(hours);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return `${Number.isInteger(amount) ? String(amount) : String(amount)} hours`;
}

function courseUrl(item: CatalogItem): string {
  const source = item.source_url?.trim();
  if (source && source.startsWith("http")) return source;
  return `https://ce.mdc.edu/search/publicCourseSearchDetails.do?method=load&courseId=${encodeURIComponent(item.destiny_code)}`;
}

function sectionStillOpen(section: CatalogSection, today: string): boolean {
  const start = section.start_date || "";
  const end = section.end_date || "";
  return Boolean((start && start >= today) || (end && end >= today));
}

const LANG_RANK: Record<CatalogLang, number> = { en: 0, es: 1, ht: 2 };

/** Date-grid rows from course sections. Content pieces stay in search and are not date rows. */
export function offeringsFromCatalog(items: CatalogItem[], today: string): PlaygroundOffering[] {
  const ranked = [...items].sort((a, b) => LANG_RANK[a.lang] - LANG_RANK[b.lang]);
  const seen = new Set<string>();
  const offerings: PlaygroundOffering[] = [];
  for (const item of ranked) {
    if (item.kind !== "course" || item.is_active === false) continue;
    const title = (item.title || "").trim();
    if (!title) continue;
    const areaName = item.program_area_name?.trim() || item.program_stream_name?.trim() || "Continuing Education";
    for (const section of item.sections ?? []) {
      if (section.is_available === false) continue;
      if (!sectionStillOpen(section, today)) continue;
      const start = section.start_date?.trim();
      if (!start) continue;
      const campus = campusName(section.campus) || "Campus";
      const key = `${item.destiny_code}|${start}|${campus}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offerings.push({
        start_date: start,
        course_title: title,
        course_url: courseUrl(item),
        campus,
        program_area_name: areaName,
        is_available: true,
        duration: durationLabel(section.contact_hours),
        format: formatLabel(section.delivery_options) || formatLabel(section.language_of_delivery),
        image_id: imageFor(areaName, title),
        image_alt: title,
      });
    }
  }
  offerings.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.course_title.localeCompare(b.course_title));
  return offerings;
}
