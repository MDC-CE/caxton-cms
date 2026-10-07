import fs from "fs";
import { listTypePages } from "./entry-layer";
import path from "path";
import yaml from "js-yaml";
import { getDefaultContentFolder, getDefaultContentRoot } from "./site-config";
import { getAllConfigs, getFolder, type ContentTypeEntry } from "./content-types";
import { contentIndex } from "./content-index";
import {
  isEntryDetached,
  isSharedLayoutType,
} from "./shared-layout-entry";
import type {
  ComponentInsightsData,
  ComponentPairing,
  ComponentSequence,
  ComponentUsageStat,
  ContentTypeUsageStat,
  InsightPageRecord,
  InsightSection,
  IntentCluster,
  PageIntent,
  VariantUsageStat,
} from "@shared/schema";
import { CACHE_DIR } from "./db-cache";
import { child } from "./logger";
import { getDefaultLocale } from "./settings";
import { loadSchemaForSection } from "./component-registry";
import {
  resolveLayoutTraits,
  type ComponentLayoutBlock,
  type ResolvedLayoutTraits,
} from "@shared/component-layout-traits";
import { deliveredFingerprint } from "./design/fingerprint";
import { loadSiteTheme } from "./theme-config";
import { classifyThemeValue } from "@shared/theme-palette";
import {
  INSIGHTS_REVIEW_KEY,
  parseInsightsReview,
  reconcileLayoutLedger,
  resolveApproval,
  templateLayoutKey,
  type InsightsReview,
} from "./design/layout-approval";
import {
  pagePerformanceIsStale,
  readPagePerformance,
  runPagePerformanceJob,
} from "./analytics/page-performance";

const log = child({ module: "component-insights" });

const DEBOUNCE_MS = 45_000;
const INSIGHTS_FILENAME = "component-insights.json";

function settingsPath(): string {
  return path.join(process.cwd(), getDefaultContentFolder(), "settings.yml");
}

/** Regenerable cache — outside content folders so GitHub sync never tracks it. */
function outputPath(): string {
  return path.join(CACHE_DIR, getDefaultContentFolder(), INSIGHTS_FILENAME);
}

/** Pre-move location under the site content root (synced by mistake). */
function legacyOutputPath(): string {
  return path.join(process.cwd(), getDefaultContentFolder(), INSIGHTS_FILENAME);
}

function removeLegacyInsightsFile(): void {
  const legacy = legacyOutputPath();
  try {
    if (fs.existsSync(legacy)) {
      fs.unlinkSync(legacy);
      log.info(`[ComponentInsights] Removed legacy ${legacy}`);
    }
  } catch (err) {
    log.warn({ err }, `[ComponentInsights] Failed to remove legacy ${legacy}`);
  }
}

/** One-time: copy content-folder cache into .cache/ then delete the old file. */
function migrateLegacyInsightsFile(): boolean {
  const dest = outputPath();
  if (fs.existsSync(dest)) {
    removeLegacyInsightsFile();
    return false;
  }
  const legacy = legacyOutputPath();
  if (!fs.existsSync(legacy)) return false;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(legacy, dest);
    fs.unlinkSync(legacy);
    log.info(`[ComponentInsights] Migrated ${legacy} → ${dest}`);
    return true;
  } catch (err) {
    log.warn({ err }, `[ComponentInsights] Failed to migrate ${legacy}`);
    return false;
  }
}

const DEFAULT_INTENT = "brand_corporate";
const FALLBACK_CLUSTER_MIN = 3;
const PMI_EPSILON = 0.01;

/** Internal scan row — same as persisted InsightPageRecord. */
type PageRecord = InsightPageRecord;

// ─── Rebuild status / debounce ─────────────────────────────────────────────

type RebuildStatus = "idle" | "scheduled" | "running";

let dirty = false;
let dirtySince: number | null = null;
let nextRebuildAt: number | null = null;
let status: RebuildStatus = "idle";
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let rebuildInFlight: Promise<ComponentInsightsData> | null = null;
let queuedAfterCurrent = false;
let bootRebuildDone = false;

export interface InsightsStatus {
  generatedAt: string | null;
  dirty: boolean;
  dirtySince: string | null;
  nextRebuildAt: string | null;
  status: RebuildStatus;
  debounceMs: number;
}

export function getInsightsStatus(): InsightsStatus {
  const data = readInsightsFile();
  // Stale/missing cache: kick a one-shot rebuild so gallery counts can appear.
  if (!data && status === "idle" && !rebuildInFlight) {
    void scheduleRebuild("lazy-missing").catch(() => {});
  }
  const effectiveStatus: RebuildStatus =
    !data && (status === "running" || rebuildInFlight) ? "running" : status;
  return {
    generatedAt: data?.generatedAt ?? null,
    dirty,
    dirtySince: dirtySince ? new Date(dirtySince).toISOString() : null,
    nextRebuildAt: nextRebuildAt ? new Date(nextRebuildAt).toISOString() : null,
    status: effectiveStatus,
    debounceMs: DEBOUNCE_MS,
  };
}

/** Strip `#` comments (simple) then test for a sections key. */
export function fileLikelyHasSections(raw: string): boolean {
  const noComments = raw.replace(/(^|\s)#.*$/gm, "\n");
  return /(^|\n)\s*sections\s*:/m.test(noComments);
}

export function markInsightsDirty(filePath?: string): void {
  if (filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const isOverlays = normalized.endsWith("/overlays.yml") || normalized.endsWith("overlays.yml");
    if (!isOverlays) {
      try {
        const abs = path.isAbsolute(filePath)
          ? filePath
          : path.join(process.cwd(), filePath);
        if (!fs.existsSync(abs)) return;
        const raw = fs.readFileSync(abs, "utf-8");
        if (!fileLikelyHasSections(raw)) return;
      } catch {
        return;
      }
    }
  }

  if (!dirty) dirtySince = Date.now();
  dirty = true;
  nextRebuildAt = Date.now() + DEBOUNCE_MS;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void scheduleRebuild("debounce");
  }, DEBOUNCE_MS);

  status = status === "running" ? "running" : "scheduled";
}

async function scheduleRebuild(reason: string): Promise<ComponentInsightsData | null> {
  if (rebuildInFlight) {
    queuedAfterCurrent = true;
    log.info(`[ComponentInsights] Rebuild queued (reason=${reason}, in-flight)`);
    return rebuildInFlight;
  }

  status = "running";
  nextRebuildAt = null;
  rebuildInFlight = Promise.resolve()
    .then(() => runScan())
    .then((data) => {
      dirty = false;
      dirtySince = null;
      status = "idle";
      return data;
    })
    .catch((err) => {
      log.error({ err }, `[ComponentInsights] Rebuild failed (reason=${reason})`);
      status = dirty ? "scheduled" : "idle";
      throw err;
    })
    .finally(() => {
      rebuildInFlight = null;
      if (queuedAfterCurrent) {
        queuedAfterCurrent = false;
        if (dirty) {
          void scheduleRebuild("queued");
        }
      }
    });

  return rebuildInFlight;
}

/** Startup: one rebuild; coalesce with debounce. */
export async function runStartupInsightsRebuild(): Promise<void> {
  if (bootRebuildDone) return;
  bootRebuildDone = true;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  dirty = false;
  dirtySince = null;
  nextRebuildAt = null;
  try {
    await scheduleRebuild("startup");
  } catch {
    /* logged */
  }
  startPagePerformanceScheduler();
}

const PERFORMANCE_CHECK_MS = 60 * 60 * 1000;
let performanceTimer: ReturnType<typeof setInterval> | null = null;
let performanceRunning = false;

/** Refresh GA4 page performance at most daily, then rebuild insights weights. */
export async function refreshPagePerformance(force = false): Promise<{ ok: boolean; pages?: number; skipped?: string; error?: string }> {
  const folder = getDefaultContentFolder();
  if (performanceRunning) return { ok: true, skipped: "already_running" };
  if (!force && !pagePerformanceIsStale(folder)) return { ok: true, skipped: "fresh" };
  const data = readInsightsFile();
  if (!data) return { ok: true, skipped: "no_insights_yet" };
  performanceRunning = true;
  try {
    const result = await runPagePerformanceJob({
      contentFolder: folder,
      contentRoot: getDefaultContentRoot(),
      records: data.pages,
      urlsFor: (ct, slug) => contentIndex.getAlternateUrls(slug, ct) ?? {},
    });
    if (result.ok && result.pages) markInsightsDirty();
    return result;
  } finally {
    performanceRunning = false;
  }
}

function startPagePerformanceScheduler(): void {
  if (performanceTimer) return;
  const tick = () => void refreshPagePerformance().catch((err) => log.warn({ err }, "[ComponentInsights] performance refresh failed"));
  setTimeout(tick, 5 * 60 * 1000).unref?.();
  performanceTimer = setInterval(tick, PERFORMANCE_CHECK_MS);
  performanceTimer.unref?.();
}

export async function requestInsightsRebuild(): Promise<ComponentInsightsData> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  nextRebuildAt = null;
  const result = await scheduleRebuild("manual");
  if (!result) throw new Error("Rebuild failed");
  return result;
}

// ─── YAML helpers ──────────────────────────────────────────────────────────

function loadPageIntents(): PageIntent[] {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown> | null;
    if (!parsed?.page_intents || !Array.isArray(parsed.page_intents)) return [];
    return (parsed.page_intents as Array<{ id: string; what_for: string }>)
      .filter((e) => typeof e.id === "string" && typeof e.what_for === "string");
  } catch {
    return [];
  }
}

const traitsCache = new Map<string, ResolvedLayoutTraits>();

function sectionTraits(type: string, variant: string, version: unknown, contentFolder?: string): ResolvedLayoutTraits {
  const folder = contentFolder ?? getDefaultContentFolder();
  const key = `${folder}|${type}|${variant}|${typeof version === "string" ? version : ""}`;
  let t = traitsCache.get(key);
  if (!t) {
    let block: ComponentLayoutBlock | undefined;
    try {
      block = loadSchemaForSection(type, version, folder)?.layout;
    } catch {
      block = undefined;
    }
    t = resolveLayoutTraits(block, variant);
    traitsCache.set(key, t);
  }
  return t;
}

function spacingToken(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const r = v as Record<string, unknown>;
    const m = spacingToken(r.mobile);
    const d = spacingToken(r.desktop);
    if (m || d) return `${m ?? ""}|${d ?? ""}`;
  }
  return undefined;
}

function rawSectionsOf(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== "object") return [];
  const sections = (data as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) return [];
  return sections.filter(
    (s): s is Record<string, unknown> =>
      !!s && typeof s === "object" && typeof (s as Record<string, unknown>).type === "string",
  );
}

/** Insight view of raw YAML sections (variant, background, spacing, traits). */
export function insightSectionsOf(sections: unknown, contentFolder?: string): InsightSection[] {
  return extractSections({ sections }, contentFolder);
}

/** Legacy CSS that equals a theme color is recorded as its theme ID (what agents must write). */
function normalizeBackground(value: string, contentFolder: string | undefined): string {
  const folder = contentFolder ?? getDefaultContentFolder();
  const theme = loadSiteTheme(path.isAbsolute(folder) ? folder : path.join(process.cwd(), folder));
  const cls = classifyThemeValue(value, theme?.backgrounds);
  return cls.kind === "theme_css" ? cls.id : value;
}

function extractSections(data: unknown, contentFolder?: string): InsightSection[] {
  return rawSectionsOf(data).map((rec) => {
    const variant =
      typeof rec.variant === "string" && rec.variant.trim()
        ? rec.variant.trim()
        : "default";
    const type = String(rec.type);
    const out: InsightSection = { type, variant };
    if (typeof rec.background === "string" && rec.background.trim()) {
      out.background = normalizeBackground(rec.background.trim(), contentFolder);
    }
    const paddingY = spacingToken(rec.paddingY);
    const marginY = spacingToken(rec.marginY);
    if (paddingY || marginY) {
      out.spacing = { ...(paddingY ? { paddingY } : {}), ...(marginY ? { marginY } : {}) };
    }
    const traits = sectionTraits(type, variant, rec.version, contentFolder);
    if (traits.flow !== "in" || traits.self_padded || traits.edge) out.traits = traits;
    return out;
  });
}

const LIVE_LOCALE_FILE = /^[a-z]{2}(-[A-Za-z]{2,4})?\.yml$/;

function funnelStageOf(data: Record<string, unknown> | null | undefined): string | undefined {
  const funnel = data?.funnel;
  if (!funnel || typeof funnel !== "object") return undefined;
  const stage = (funnel as Record<string, unknown>).stage;
  return typeof stage === "string" && stage.trim() ? stage.trim() : undefined;
}

function safeYamlLoad(raw: string): Record<string, unknown> | null {
  try {
    return contentIndex.safeYamlLoad(raw);
  } catch {
    return null;
  }
}

function readInsightsFieldsFromYaml(data: Record<string, unknown>): {
  intent: string | undefined;
  weight: number | undefined;
  review: InsightsReview | null;
} {
  let intent: string | undefined;
  let weight: number | undefined;
  const review = parseInsightsReview(data[INSIGHTS_REVIEW_KEY]);

  if (typeof data.insights_intent === "string") {
    intent = data.insights_intent;
  }
  if (data.insights_weight !== undefined) {
    const raw = data.insights_weight;
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
      weight = raw;
    } else {
      log.warn(
        `[ComponentInsights] insights_weight "${raw}" is not a positive integer — ignoring, using default 1.`,
      );
    }
  }
  return { intent, weight, review };
}

function validateIntent(
  resolved: string,
  validIntentIds: Set<string>,
  pageIntent: string | undefined,
  label: string,
): string {
  if (validIntentIds.has(resolved)) return resolved;
  if (pageIntent) {
    log.warn(
      `[ComponentInsights] Unknown intent "${pageIntent}" on ${label}, falling back to "${DEFAULT_INTENT}"`,
    );
  }
  return DEFAULT_INTENT;
}

export const TEMPLATE_LAYOUT_CANDIDATES = [
  "template.en.yml",
  "template.es.yml",
  "single.en.yml",
  "single.es.yml",
  "_common.template.yml",
  "_common.single.yml",
];

export interface ResolvedLayoutSource {
  sections: InsightSection[];
  fingerprint: string;
  intent?: string;
  weight?: number;
  review: InsightsReview | null;
  /** Absolute file holding the sections (approval is written next to them for templates). */
  file?: string;
  locale?: string;
  locales: string[];
  funnelStage?: string;
}

export function loadTemplateSections(contentType: string, contentRoot: string): ResolvedLayoutSource {
  const folder = getFolder(contentType, contentRoot);
  const dir = path.join(contentRoot, folder);
  for (const name of TEMPLATE_LAYOUT_CANDIDATES) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    try {
      const data = safeYamlLoad(fs.readFileSync(p, "utf-8"));
      if (!data) continue;
      const raw = rawSectionsOf(data);
      if (raw.length === 0) continue;
      const fields = readInsightsFieldsFromYaml(data);
      const localeMatch = /\.([a-z]{2}(?:-[A-Za-z]{2,4})?)\.yml$/.exec(name);
      return {
        sections: extractSections(data),
        fingerprint: deliveredFingerprint(raw),
        intent: fields.intent,
        weight: fields.weight,
        review: fields.review,
        file: p,
        ...(localeMatch ? { locale: localeMatch[1] } : {}),
        locales: fs
          .readdirSync(dir)
          .map((f) => /^(?:template|single)\.([a-z]{2}(?:-[A-Za-z]{2,4})?)\.yml$/.exec(f)?.[1])
          .filter((l): l is string => !!l),
      };
    } catch {
      /* try next */
    }
  }
  return { sections: [], fingerprint: deliveredFingerprint([]), review: null, locales: [] };
}

function listSlugsForContentType(
  contentType: string,
  config: ContentTypeEntry | Record<string, unknown>,
): string[] {
  const dirSlugs = contentIndex.listContentSlugs(
    contentType as Parameters<typeof contentIndex.listContentSlugs>[0],
  );

  const listed = listTypePages(contentIndex, contentType);
  if (!listed) return dirSlugs;
  const fromDb = listed.pages.map((p) => p.slug);
  return Array.from(new Set([...dirSlugs, ...fromDb]));
}

/**
 * Live layout of one entry: `_common.yml` sections, else the first live
 * locale file with sections (site default locale first). Drafts and A/B
 * variant files are ignored; entries with no live locale return no sections.
 */
export function resolvePageSections(
  contentType: string,
  slug: string,
  contentDir: string,
): ResolvedLayoutSource {
  let raw: Array<Record<string, unknown>> = [];
  let sections: InsightSection[] = [];
  let intent: string | undefined;
  let weight: number | undefined;
  let review: InsightsReview | null = null;
  let file: string | undefined;
  let locale: string | undefined;
  let funnelStage: string | undefined;
  const slugDir = path.join(contentDir, slug);

  try {
    const commonData = contentIndex.loadCommonData(
      contentType as Parameters<typeof contentIndex.loadCommonData>[0],
      slug,
    );
    if (commonData) {
      const fields = readInsightsFieldsFromYaml(commonData);
      if (fields.intent) intent = fields.intent;
      if (fields.weight !== undefined) weight = fields.weight;
      if (fields.review) review = fields.review;
      funnelStage = funnelStageOf(commonData);
      raw = rawSectionsOf(commonData);
      if (raw.length > 0) {
        sections = extractSections(commonData);
        file = path.join(slugDir, "_common.yml");
      }
    }
  } catch {
    /* continue */
  }

  let locales: string[] = [];
  try {
    const defaultLocale = getDefaultLocale();
    const files = fs.readdirSync(slugDir).filter((f) => LIVE_LOCALE_FILE.test(f));
    locales = files.map((f) => f.replace(/\.yml$/, ""));
    const ordered = [
      ...files.filter((f) => f === `${defaultLocale}.yml`),
      ...files.filter((f) => f !== `${defaultLocale}.yml`),
    ];
    for (const name of ordered) {
      try {
        const data = safeYamlLoad(fs.readFileSync(path.join(slugDir, name), "utf-8"));
        if (!data) continue;
        const fields = readInsightsFieldsFromYaml(data);
        if (fields.intent) intent = fields.intent;
        if (fields.weight !== undefined) weight = fields.weight;
        if (!review && fields.review) review = fields.review;
        if (raw.length === 0) {
          const found = rawSectionsOf(data);
          if (found.length > 0) {
            raw = found;
            sections = extractSections(data);
            file = path.join(slugDir, name);
            locale = name.replace(/\.yml$/, "");
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no dir */
  }

  if (locales.length === 0) {
    return { sections: [], fingerprint: deliveredFingerprint([]), review: null, locales: [] };
  }
  return {
    sections,
    fingerprint: deliveredFingerprint(raw),
    intent,
    weight,
    review,
    ...(file ? { file } : {}),
    locale: locale ?? (locales.includes(getDefaultLocale()) ? getDefaultLocale() : locales[0]),
    locales,
    ...(funnelStage ? { funnelStage } : {}),
  };
}

export { templateLayoutKey };

function pageRecordFrom(
  contentType: string,
  slug: string,
  resolved: ResolvedLayoutSource,
  intent: string,
): PageRecord & { _review: InsightsReview | null; _file?: string } {
  return {
    key: `${contentType}/${slug}`,
    contentType,
    kind: "page",
    slug,
    intent,
    weight: resolved.weight ?? 1,
    instanceCount: 1,
    sections: resolved.sections,
    fingerprint: resolved.fingerprint,
    ...(resolved.locale ? { locale: resolved.locale } : {}),
    locales: resolved.locales,
    ...(resolved.funnelStage ? { funnelStage: resolved.funnelStage } : {}),
    _review: resolved.review,
    ...(resolved.file ? { _file: resolved.file } : {}),
  };
}

function scanInventory(
  validIntentIds: Set<string>,
  contentTypeIntentMap: Map<string, string>,
): PageRecord[] {
  const records: Array<PageRecord & { _review?: InsightsReview | null; _file?: string }> = [];
  const configs = getAllConfigs();
  const contentRoot = getDefaultContentRoot();
  const contentFolder = getDefaultContentFolder();

  for (const [contentType, config] of Object.entries(configs)) {
    const ctDefault = contentTypeIntentMap.get(contentType) ?? DEFAULT_INTENT;
    const contentDir = path.join(process.cwd(), contentFolder, config.directory);
    const shared = isSharedLayoutType(contentType, contentRoot);
    const slugs = listSlugsForContentType(contentType, config);

    if (shared) {
      const template = loadTemplateSections(contentType, contentRoot);
      if (template.sections.length === 0 && slugs.length === 0) continue;

      // A shared template is ONE layout: attached entries add reach, not weight.
      const attached: string[] = [];
      const entryIntents = new Map<string, number>();
      const stages = new Map<string, number>();
      for (const slug of slugs) {
        if (slug === "single" || slug === "template") continue;
        const detached = isEntryDetached(contentType, slug, contentRoot);
        if (detached) {
          const resolved = resolvePageSections(contentType, slug, contentDir);
          if (resolved.sections.length === 0) continue;
          const intent = validateIntent(
            resolved.intent ?? ctDefault,
            validIntentIds,
            resolved.intent,
            `${contentType}/${slug}`,
          );
          records.push(pageRecordFrom(contentType, slug, resolved, intent));
          continue;
        }
        const entryFields = resolvePageSections(contentType, slug, contentDir);
        if (entryFields.intent) entryIntents.set(entryFields.intent, (entryIntents.get(entryFields.intent) ?? 0) + 1);
        if (entryFields.funnelStage) stages.set(entryFields.funnelStage, (stages.get(entryFields.funnelStage) ?? 0) + 1);
        attached.push(slug);
      }
      if (attached.length === 0 || template.sections.length === 0) continue;
      const topOf = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const pageIntent = template.intent ?? topOf(entryIntents);
      const intent = validateIntent(pageIntent ?? ctDefault, validIntentIds, pageIntent, `${contentType}/template`);
      const funnelStage = template.funnelStage ?? topOf(stages);
      records.push({
        key: templateLayoutKey(contentType),
        contentType,
        kind: "shared_template",
        slugs: attached,
        intent,
        weight: template.weight ?? 1,
        instanceCount: attached.length,
        sections: template.sections,
        fingerprint: template.fingerprint,
        ...(template.locale ? { locale: template.locale } : {}),
        locales: template.locales,
        ...(funnelStage ? { funnelStage } : {}),
        _review: template.review,
        ...(template.file ? { _file: template.file } : {}),
      });
      continue;
    }

    // Non-shared layout types
    for (const slug of slugs) {
      const resolved = resolvePageSections(contentType, slug, contentDir);
      if (resolved.sections.length === 0) continue;
      const intent = validateIntent(
        resolved.intent ?? ctDefault,
        validIntentIds,
        resolved.intent,
        `${contentType}/${slug}`,
      );
      records.push(pageRecordFrom(contentType, slug, resolved, intent));
    }
  }

  // Overlays (reach only; excluded from layout learning)
  const overlaysFile = path.join(contentRoot, "overlays.yml");
  if (fs.existsSync(overlaysFile)) {
    try {
      const data = safeYamlLoad(fs.readFileSync(overlaysFile, "utf-8"));
      const list = Array.isArray(data?.overlays) ? data!.overlays : [];
      list.forEach((item, idx) => {
        if (!item || typeof item !== "object") return;
        const rec = item as Record<string, unknown>;
        let sections = extractSections(rec);
        // Some overlays use component: + content instead of sections
        if (sections.length === 0 && typeof rec.component === "string") {
          sections = [{ type: rec.component, variant: "default" }];
        }
        if (sections.length === 0) return;
        const id = typeof rec.id === "string" ? rec.id : `overlay-${idx}`;
        records.push({
          key: `overlays/${id}`,
          contentType: "overlays",
          kind: "overlay",
          slug: id,
          intent: DEFAULT_INTENT,
          weight: 1,
          instanceCount: 1,
          sections,
          baseWeight: 0,
        });
      });
    } catch (err) {
      log.warn({ err }, "[ComponentInsights] Failed to scan overlays.yml");
    }
  }

  // Approval (explicit insights_review, implicit via the layout ledger) + performance.
  const seen = new Map<string, { fingerprint: string; mtimeMs?: number }>();
  for (const r of records) {
    if (r.kind === "overlay" || !r.fingerprint) continue;
    let mtimeMs: number | undefined;
    try {
      if (r._file) mtimeMs = fs.statSync(r._file).mtimeMs;
    } catch {
      /* ignore */
    }
    seen.set(r.key, { fingerprint: r.fingerprint, ...(mtimeMs ? { mtimeMs } : {}) });
  }
  const ledger = reconcileLayoutLedger(contentFolder, seen);
  const performance = readPagePerformance(contentFolder);
  for (const r of records) {
    const { _review, _file, ...clean } = r;
    void _file;
    if (r.kind === "overlay" || !r.fingerprint) continue;
    clean.approval = resolveApproval({ review: _review ?? null, fingerprint: r.fingerprint, ledger: ledger[r.key] });
    const perf = performance?.[r.key];
    if (perf) clean.performance = perf;
    clean.baseWeight = round3(clean.weight * clean.approval.factor * (perf?.factor ?? 1));
    Object.assign(r, clean);
    delete r._review;
    delete r._file;
  }
  return records;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function sectionTypes(record: PageRecord): string[] {
  return record.sections.map((s) => s.type);
}

/**
 * Learning weight of one layout record: manual insights_weight × approval ×
 * performance (lift vs expected). Shared templates count once. Overlays and
 * rejected layouts weigh 0. Relevance and locale are applied per query.
 */
export function effectiveWeight(record: PageRecord): number {
  if (record.kind === "overlay") return 0;
  return record.baseWeight ?? record.weight;
}

function computePairings(pages: PageRecord[]): ComponentPairing[] {
  const pairMap = new Map<string, { count: number }>();
  const fromMap = new Map<string, number>();
  const toMap = new Map<string, number>();
  let totalTransitions = 0;

  for (const page of pages) {
    const types = sectionTypes(page);
    const w = effectiveWeight(page);
    if (w <= 0) continue;
    for (let i = 0; i < types.length - 1; i++) {
      const from = types[i]!;
      const to = types[i + 1]!;
      const key = `${from}|||${to}`;
      const existing = pairMap.get(key);
      if (existing) existing.count += w;
      else pairMap.set(key, { count: w });
      fromMap.set(from, (fromMap.get(from) ?? 0) + w);
      toMap.set(to, (toMap.get(to) ?? 0) + w);
      totalTransitions += w;
    }
  }

  const pairings: ComponentPairing[] = [];
  for (const [key, { count }] of pairMap.entries()) {
    const [from, to] = key.split("|||");
    const frequency = fromMap.get(from!) ? count / (fromMap.get(from!) ?? 1) : 0;
    const pAB = count / (totalTransitions || 1);
    const pA = (fromMap.get(from!) ?? 0) / (totalTransitions || 1);
    const pB = (toMap.get(to!) ?? 0) / (totalTransitions || 1);
    const rawPmi = pA > 0 && pB > 0 ? Math.log(pAB / (pA * pB)) : -Infinity;
    const pmi = isFinite(rawPmi) ? rawPmi : -10;
    const distance = 1 / Math.max(pmi, PMI_EPSILON);
    pairings.push({
      from: from!,
      to: to!,
      count,
      frequency: Math.round(frequency * 1000) / 1000,
      pmi: Math.round(pmi * 1000) / 1000,
      distance: Math.round(distance * 1000) / 1000,
    });
  }
  return pairings.sort((a, b) => b.count - a.count);
}

function computeTopSequences(pages: PageRecord[], maxSeqs = 20): ComponentSequence[] {
  const seqMap = new Map<string, number>();
  for (const page of pages) {
    const types = sectionTypes(page);
    const w = effectiveWeight(page);
    if (types.length < 2 || w <= 0) continue;
    const key = types.join(" → ");
    seqMap.set(key, (seqMap.get(key) ?? 0) + w);
  }
  return Array.from(seqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSeqs)
    .map(([key, count]) => ({ sequence: key.split(" → "), count }));
}

function computeUsageByType(pages: PageRecord[]): Record<string, ComponentUsageStat> {
  type Acc = {
    totalUses: number;
    pageKeys: Set<string>;
    variants: Map<string, { count: number; pages: Set<string> }>;
    byCt: Map<string, { count: number; pages: Set<string> }>;
  };
  const byType = new Map<string, Acc>();

  const touch = (type: string): Acc => {
    let a = byType.get(type);
    if (!a) {
      a = {
        totalUses: 0,
        pageKeys: new Set(),
        variants: new Map(),
        byCt: new Map(),
      };
      byType.set(type, a);
    }
    return a;
  };

  for (const page of pages) {
    const n = page.instanceCount;
    const pageKey = page.key;
    const typesSeen = new Set<string>();

    for (const sec of page.sections) {
      const acc = touch(sec.type);
      acc.totalUses += n;
      typesSeen.add(sec.type);

      let v = acc.variants.get(sec.variant);
      if (!v) {
        v = { count: 0, pages: new Set() };
        acc.variants.set(sec.variant, v);
      }
      v.count += n;
      v.pages.add(pageKey);

      let ct = acc.byCt.get(page.contentType);
      if (!ct) {
        ct = { count: 0, pages: new Set() };
        acc.byCt.set(page.contentType, ct);
      }
      ct.count += n;
      ct.pages.add(pageKey);
    }

    for (const t of typesSeen) {
      touch(t).pageKeys.add(pageKey);
      // pageCount should reflect instanceCount for shared templates
      // We store unique record keys then expand: pageCount = sum of instanceCount for records that contain type
    }
  }

  // Recompute pageCount as sum of instanceCount for records containing the type
  const pageCountByType = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set(page.sections.map((s) => s.type));
    for (const t of seen) {
      pageCountByType.set(t, (pageCountByType.get(t) ?? 0) + page.instanceCount);
    }
  }

  const out: Record<string, ComponentUsageStat> = {};
  for (const [type, acc] of byType) {
    const variants: VariantUsageStat[] = Array.from(acc.variants.entries())
      .map(([variant, v]) => ({
        variant,
        count: v.count,
        pageCount: v.pages.size, // record count; expand below
      }))
      .sort((a, b) => b.count - a.count);

    // Expand variant pageCount by instanceCount
    for (const vs of variants) {
      let pc = 0;
      for (const page of pages) {
        if (page.sections.some((s) => s.type === type && s.variant === vs.variant)) {
          pc += page.instanceCount;
        }
      }
      vs.pageCount = pc;
    }

    const byContentType: ContentTypeUsageStat[] = Array.from(acc.byCt.entries())
      .map(([contentType, c]) => {
        let pc = 0;
        for (const page of pages) {
          if (page.contentType !== contentType) continue;
          if (page.sections.some((s) => s.type === type)) pc += page.instanceCount;
        }
        return { contentType, count: c.count, pageCount: pc };
      })
      .sort((a, b) => b.count - a.count);

    out[type] = {
      totalUses: acc.totalUses,
      pageCount: pageCountByType.get(type) ?? 0,
      variants,
      byContentType,
    };
  }
  return out;
}

function buildCluster(pages: PageRecord[]): IntentCluster {
  return {
    pairings: computePairings(pages),
    topSequences: computeTopSequences(pages),
    pageCount: pages.reduce((s, p) => s + p.instanceCount, 0),
    usageByType: computeUsageByType(pages),
  };
}

function isCompatibleInsights(data: unknown): data is ComponentInsightsData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.pages) && d.global != null && typeof d.global === "object";
}

export function runScan(): ComponentInsightsData {
  const intents = loadPageIntents();
  const validIntentIds = new Set(intents.map((i) => i.id));
  const configs = getAllConfigs();

  const contentTypeIntentMap = new Map<string, string>();
  for (const [ct, cfg] of Object.entries(configs)) {
    if (typeof cfg.insights_intent === "string") {
      const ctIntent = cfg.insights_intent;
      if (!validIntentIds.has(ctIntent)) {
        log.warn(
          `[ComponentInsights] Content type "${ct}" has insights_intent "${ctIntent}" which is not in settings.yml page_intents. Falling back to "${DEFAULT_INTENT}".`,
        );
      } else {
        contentTypeIntentMap.set(ct, ctIntent);
      }
    }
  }

  const pages = scanInventory(validIntentIds, contentTypeIntentMap);

  const byIntentPages = new Map<string, PageRecord[]>();
  for (const page of pages) {
    if (!byIntentPages.has(page.intent)) byIntentPages.set(page.intent, []);
    byIntentPages.get(page.intent)!.push(page);
  }

  const byIntent: Record<string, IntentCluster> = {};
  for (const [intent, iPages] of byIntentPages.entries()) {
    byIntent[intent] = buildCluster(iPages);
  }

  const totalWeight = pages.reduce((s, p) => s + effectiveWeight(p), 0);
  const weightedPagesCount = pages.filter((p) => p.weight > 1).length;

  const data: ComponentInsightsData = {
    generatedAt: new Date().toISOString(),
    meta: {
      totalPagesScanned: pages.reduce((s, p) => s + p.instanceCount, 0),
      totalWeight,
      weightedPagesCount,
      intents: intents.map((i) => i.id),
      pageIntents: intents,
    },
    pages,
    global: buildCluster(pages),
    byIntent,
  };

  const out = outputPath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2), "utf-8");
  removeLegacyInsightsFile();
  log.info(
    `[ComponentInsights] Wrote ${out} — ${pages.length} inventory rows, ${data.meta.totalPagesScanned} instances`,
  );
  return data;
}

export function readInsightsFile(): ComponentInsightsData | null {
  migrateLegacyInsightsFile();
  const out = outputPath();
  if (!fs.existsSync(out)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    if (!isCompatibleInsights(data)) return null;
    // Ensure usageByType exists on clusters (older partial shapes)
    if (!data.global.usageByType) return null;
    return data;
  } catch {
    return null;
  }
}

export function ensureInsightsData(): ComponentInsightsData {
  const existing = readInsightsFile();
  if (existing) return existing;
  return runScan();
}

/** Gallery / list: precomputed summary for one type (zeros if unused). */
export function getUsageSummary(componentType: string): ComponentUsageStat {
  const data = ensureInsightsData();
  return (
    data.global.usageByType[componentType] ?? {
      totalUses: 0,
      pageCount: 0,
      variants: [],
      byContentType: [],
    }
  );
}

export interface ComponentUsageResult {
  componentType: string;
  scope: Record<string, string>;
  totalUses: number;
  pageCount: number;
  pages: Array<{ contentType: string; slug: string; position: number }>;
  neighbors: {
    before: Array<{ type: string; count: number }>;
    after: Array<{ type: string; count: number }>;
  };
  topSequences: Array<{ sequence: string[]; count: number }>;
  variants: VariantUsageStat[];
  byContentType: ContentTypeUsageStat[];
  generatedAt: string;
}

export function getComponentUsageData(
  componentType: string,
  filters: { intent?: string; contentType?: string },
): ComponentUsageResult {
  const data = ensureInsightsData();

  let scoped = data.pages;
  if (filters.contentType) {
    scoped = scoped.filter((p) => p.contentType === filters.contentType);
  }
  if (filters.intent) {
    scoped = scoped.filter((p) => p.intent === filters.intent);
  }

  const usagePages: Array<{ contentType: string; slug: string; position: number }> = [];
  let totalUses = 0;

  for (const page of scoped) {
    page.sections.forEach((sec, idx) => {
      if (sec.type !== componentType) return;
      totalUses += page.instanceCount;
      if (page.kind === "shared_template" && page.slugs) {
        for (const slug of page.slugs) {
          usagePages.push({
            contentType: page.contentType,
            slug,
            position: idx + 1,
          });
        }
      } else {
        usagePages.push({
          contentType: page.contentType,
          slug: page.slug || page.key,
          position: idx + 1,
        });
      }
    });
  }

  const beforeMap = new Map<string, number>();
  const afterMap = new Map<string, number>();
  for (const page of scoped) {
    const types = sectionTypes(page);
    const w = effectiveWeight(page);
    for (let i = 0; i < types.length; i++) {
      if (types[i] !== componentType) continue;
      if (i > 0) {
        const prev = types[i - 1]!;
        beforeMap.set(prev, (beforeMap.get(prev) ?? 0) + w);
      }
      if (i < types.length - 1) {
        const next = types[i + 1]!;
        afterMap.set(next, (afterMap.get(next) ?? 0) + w);
      }
    }
  }

  const before = Array.from(beforeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));
  const after = Array.from(afterMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  const topSequences = computeTopSequences(scoped)
    .filter((s) => s.sequence.includes(componentType))
    .slice(0, 5);

  const usage = computeUsageByType(scoped)[componentType] ?? {
    totalUses: 0,
    pageCount: 0,
    variants: [],
    byContentType: [],
  };

  const scope: Record<string, string> = {};
  if (filters.intent) scope.intent = filters.intent;
  if (filters.contentType) scope.contentType = filters.contentType;

  return {
    componentType,
    scope,
    totalUses,
    pageCount: usage.pageCount,
    pages: usagePages,
    neighbors: { before, after },
    topSequences,
    variants: usage.variants,
    byContentType: usage.byContentType,
    generatedAt: data.generatedAt,
  };
}

export function suggestNext(
  after: string,
  intent: string | undefined,
  rankBy: "frequency" | "pmi",
): ComponentPairing[] {
  const data = readInsightsFile();
  if (!data) return [];

  const intentCluster = intent && data.byIntent[intent];
  const cluster: IntentCluster | null =
    intentCluster && intentCluster.pageCount >= FALLBACK_CLUSTER_MIN
      ? intentCluster
      : data.global;

  const matches = cluster.pairings.filter((p) => p.from === after);
  return matches.sort((a, b) =>
    rankBy === "pmi" ? b.pmi - a.pmi : b.frequency - a.frequency,
  );
}
