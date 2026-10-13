/**
 * Render review: open a signed /private/page-preview URL in Cloudflare
 * Browser Rendering per viewport, keep a full-page screenshot and the
 * in-page measurement JSON, filter candidate findings with component layout
 * traits (and learned rules when present), and write the result into the
 * validation issue store (validator `render-review`, category `design`).
 *
 * Each completed review records the page's structural fingerprint so the
 * agent publish gate can tell whether the review is still fresh.
 * Jobs, images and the review index live under .cache/render-reviews/
 * (persistent across deploys).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { CACHE_DIR } from "../db-cache";
import {
  captureFullPageWebp,
  cloudflareBrowserConfigError,
  fetchRenderedHtml,
  type ReviewViewport,
} from "../cloudflare-browser";
import { buildSignedPagePreviewUrl, type PagePreviewSource } from "../entry-preview-capture-auth";
import { loadPagePreviewData } from "./page-preview";
import { loadSchemaForSection } from "../component-registry";
import { resolveLayoutTraits, type ResolvedLayoutTraits } from "@shared/component-layout-traits";
import type { ContentIndex } from "../content-index";
import type { ValidationCacheService } from "../services/validationCacheService";
import type { ValidationIssue } from "../../scripts/validation/shared/types";
import { RENDER_REVIEW_VALIDATOR_NAME } from "../../scripts/validation/validators/render-review.issueCodes";
import { child } from "../logger";

const log = child({ module: "render-review" });

export const RENDER_REVIEW_DIR = path.join(CACHE_DIR, "render-reviews");
const INDEX_FILE = path.join(RENDER_REVIEW_DIR, "index.json");
const MAX_JOBS_IN_MEMORY = 50;

export type RenderReviewStatus = "queued" | "running" | "completed" | "failed";

export interface RenderFinding {
  code: string;
  severity: "error" | "warning";
  viewport: ReviewViewport;
  section_path: string | null;
  section_type?: string;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface RenderReviewImage {
  viewport: ReviewViewport;
  file: string;
  width: number;
  height: number;
  cropped: boolean;
}

export interface RenderReviewJob {
  id: string;
  site: string;
  status: RenderReviewStatus;
  created_at: string;
  finished_at?: string;
  source: PagePreviewSource;
  viewports: ReviewViewport[];
  fingerprint?: string;
  findings?: RenderFinding[];
  images?: RenderReviewImage[];
  /** Per-viewport section geometry (for crops). */
  sections?: Record<string, Array<{ index: number; path: string; type: string; top: number; height: number }>>;
  issue_store?: { written: boolean; entry_key?: string; reason?: string };
  dropped_by_traits?: number;
  error?: string;
}

export interface ReviewRecord {
  fingerprint: string;
  reviewed_at: string;
  job_id: string;
  errors: number;
  warnings: number;
}

const jobs = new Map<string, RenderReviewJob>();

function jobDir(id: string): string {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error("Invalid review job id");
  return path.join(RENDER_REVIEW_DIR, id);
}

function persistJob(job: RenderReviewJob): void {
  fs.mkdirSync(jobDir(job.id), { recursive: true });
  fs.writeFileSync(path.join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2));
}

export function getRenderReviewJob(id: string): RenderReviewJob | null {
  const mem = jobs.get(id);
  if (mem) return mem;
  try {
    return JSON.parse(fs.readFileSync(path.join(jobDir(id), "job.json"), "utf8")) as RenderReviewJob;
  } catch {
    return null;
  }
}

export function renderReviewImagePath(id: string, viewport: ReviewViewport): string {
  return path.join(jobDir(id), `${viewport}.webp`);
}

/** Why a review cannot run here (no Cloudflare credentials / no public SITE_URL), or null. */
export function renderReviewUnavailableReason(contentRoot?: string): string | null {
  return cloudflareBrowserConfigError(contentRoot);
}

export function reviewKey(site: string, p: PagePreviewSource): string | null {
  if (p.source !== "entry") return null;
  return `${site}|${p.contentType}|${p.slug}|${p.locale}|${p.variant ?? ""}`;
}

function readIndex(): Record<string, ReviewRecord> {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) as Record<string, ReviewRecord>;
  } catch {
    return {};
  }
}

export function getReviewRecord(site: string, p: PagePreviewSource): ReviewRecord | null {
  const key = reviewKey(site, p);
  return key ? readIndex()[key] ?? null : null;
}

function writeReviewRecord(site: string, p: PagePreviewSource, rec: ReviewRecord): void {
  const key = reviewKey(site, p);
  if (!key) return;
  const index = readIndex();
  index[key] = rec;
  fs.mkdirSync(RENDER_REVIEW_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

export function extractMeasurementsJson(html: string): Record<string, unknown> | null {
  const m = /<script[^>]*id="__page_measurements__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type RawFinding = { code: string; severity: "error" | "warning"; section_path: string | null; message: string; evidence?: Record<string, unknown> };

/** Drop candidate findings that component layout traits explain (out-of-flow, self-padded). */
export function filterFindingsByTraits(
  findings: RawFinding[],
  traitsByIndex: Map<number, ResolvedLayoutTraits>,
): { kept: RawFinding[]; dropped: number } {
  const kept: RawFinding[] = [];
  let dropped = 0;
  for (const f of findings) {
    const idx = f.section_path ? Number(/sections\[(\d+)\]/.exec(f.section_path)?.[1]) : NaN;
    const traits = Number.isFinite(idx) ? traitsByIndex.get(idx) : undefined;
    if (traits?.flow === "out") {
      dropped++;
      continue;
    }
    if (traits?.self_padded && f.code === "color_edge_without_padding") {
      dropped++;
      continue;
    }
    kept.push(f);
  }
  return { kept, dropped };
}

export type LearnedRuleCheck = (sections: Array<Record<string, unknown>>) => RawFinding[];
let learnedRuleCheck: LearnedRuleCheck | null = null;
/** Insights registers learned layout rules here (design-rules); reviews add them as warnings. */
export function setLearnedRuleCheck(fn: LearnedRuleCheck | null): void {
  learnedRuleCheck = fn;
}

function toIssue(f: RenderFinding, file: string): ValidationIssue {
  return {
    type: f.severity,
    code: `RENDER_${f.code.toUpperCase()}`,
    message: `[${f.viewport}] ${f.section_path ?? "page"}${f.section_type ? ` (${f.section_type})` : ""}: ${f.message}`,
    file,
    category: "design",
    validator: RENDER_REVIEW_VALIDATOR_NAME,
  };
}

async function writeIssues(
  job: RenderReviewJob,
  ctx: { contentRoot: string; ci: ContentIndex; cache: ValidationCacheService },
): Promise<RenderReviewJob["issue_store"]> {
  const p = job.source;
  if (p.source !== "entry") return { written: false, reason: "page demos are not stored as issues" };
  const { entryKeyFromContentFile } = await import("../../scripts/validation/shared/entryKey");
  const merged = ctx.ci.loadMergedContent(p.contentType, p.slug, p.locale, p.variant);
  if (!merged.data) {
    return { written: false, reason: "entry file not indexed for validation (unpublished draft variants are not tracked)" };
  }
  const urls = ctx.ci.getLocaleUrls(p.slug, p.contentType);
  const target = {
    slug: p.slug,
    title: typeof merged.data.title === "string" ? merged.data.title : p.slug,
    type: p.contentType,
    locale: p.locale,
    filePath: merged.filePath,
    url: urls[p.locale] || ctx.ci.buildUrl(p.contentType, p.locale, p.slug),
    variant: p.variant,
  };
  const entryKey = entryKeyFromContentFile(target);
  const issues = (job.findings ?? []).map((f) => toIssue(f, target.filePath));
  ctx.cache.applyValidatorResults(
    [
      {
        name: RENDER_REVIEW_VALIDATOR_NAME,
        description: "Render review (screenshots + layout measurements)",
        status: issues.some((i) => i.type === "error") ? "failed" : issues.length ? "warning" : "passed",
        errors: issues.filter((i) => i.type === "error"),
        warnings: issues.filter((i) => i.type === "warning"),
        duration: 0,
        category: "design",
      },
    ],
    { contentFiles: [target], entryKeys: [entryKey], markSiteWide: false },
  );
  await ctx.cache.flush();
  return { written: true, entry_key: entryKey };
}

async function runJob(
  job: RenderReviewJob,
  ctx: { contentRoot: string; contentFolder: string; ci: ContentIndex; cache: ValidationCacheService },
): Promise<void> {
  job.status = "running";
  persistJob(job);
  try {
    const preview = await loadPagePreviewData(ctx.ci, job.source);
    if (!preview.ok) throw new Error(preview.error);
    job.fingerprint = preview.data.fingerprint;
    const traitsByIndex = new Map<number, ResolvedLayoutTraits>();
    preview.data.sections.forEach((s, i) => {
      const type = typeof s.type === "string" ? s.type : "";
      if (!type) return;
      const schema = loadSchemaForSection(type, s.version, ctx.contentFolder);
      traitsByIndex.set(i, resolveLayoutTraits(schema?.layout, typeof s.variant === "string" ? s.variant : undefined));
    });

    const findings: RenderFinding[] = [];
    const images: RenderReviewImage[] = [];
    const sections: NonNullable<RenderReviewJob["sections"]> = {};
    let dropped = 0;
    for (const viewport of job.viewports) {
      const url = buildSignedPagePreviewUrl(job.source, viewport, { ttlSec: 15 * 60 });
      const shot = await captureFullPageWebp({ url, viewport, contentRoot: ctx.contentRoot });
      fs.writeFileSync(renderReviewImagePath(job.id, viewport), shot.webp);
      images.push({ viewport, file: `${viewport}.webp`, width: shot.width, height: shot.height, cropped: shot.cropped });

      const html = await fetchRenderedHtml({ url, viewport, contentRoot: ctx.contentRoot });
      const measured = extractMeasurementsJson(html);
      if (!measured) {
        findings.push({
          code: "measurements_missing",
          severity: "warning",
          viewport,
          section_path: null,
          message: "The preview did not publish layout measurements (page may have failed to render).",
        });
        continue;
      }
      const rows = Array.isArray(measured.sections) ? (measured.sections as Array<Record<string, unknown>>) : [];
      sections[viewport] = rows.map((r) => ({
        index: Number(r.index),
        path: String(r.path),
        type: String(r.type ?? ""),
        top: Number(r.top),
        height: Number(r.height),
      }));
      const raw = Array.isArray(measured.findings) ? (measured.findings as RawFinding[]) : [];
      const { kept, dropped: d } = filterFindingsByTraits(raw, traitsByIndex);
      dropped += d;
      const typeByPath = new Map(sections[viewport]!.map((s) => [s.path, s.type]));
      for (const f of kept) {
        findings.push({ ...f, viewport, ...(f.section_path && typeByPath.get(f.section_path) ? { section_type: typeByPath.get(f.section_path) } : {}) });
      }
    }
    if (learnedRuleCheck) {
      for (const f of learnedRuleCheck(preview.data.sections)) {
        findings.push({ ...f, code: "learned_rule", viewport: "desktop" });
      }
    }

    job.findings = findings;
    job.images = images;
    job.sections = sections;
    job.dropped_by_traits = dropped;
    job.issue_store = await writeIssues(job, ctx).catch((err) => ({
      written: false,
      reason: err instanceof Error ? err.message : String(err),
    }));
    job.status = "completed";
    job.finished_at = new Date().toISOString();
    writeReviewRecord(job.site, job.source, {
      fingerprint: job.fingerprint!,
      reviewed_at: job.finished_at,
      job_id: job.id,
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
    });
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    job.finished_at = new Date().toISOString();
    log.warn({ err, jobId: job.id }, "[render-review] job failed");
  }
  persistJob(job);
}

export function startRenderReview(opts: {
  site: string;
  source: PagePreviewSource;
  viewports?: ReviewViewport[];
  contentRoot: string;
  contentFolder: string;
  ci: ContentIndex;
  cache: ValidationCacheService;
}): RenderReviewJob {
  const id = crypto.randomBytes(12).toString("hex");
  const job: RenderReviewJob = {
    id,
    site: opts.site,
    status: "queued",
    created_at: new Date().toISOString(),
    source: opts.source,
    viewports: opts.viewports?.length ? opts.viewports : ["desktop", "mobile"],
  };
  jobs.set(id, job);
  if (jobs.size > MAX_JOBS_IN_MEMORY) {
    const oldest = jobs.keys().next().value;
    if (oldest) jobs.delete(oldest);
  }
  persistJob(job);
  void runJob(job, opts);
  return job;
}

/** Downscaled overview (or one section crop) of a review screenshot as WebP. */
export async function renderReviewImage(opts: {
  jobId: string;
  viewport: ReviewViewport;
  sectionIndex?: number;
  maxWidth?: number;
}): Promise<Buffer | null> {
  const job = getRenderReviewJob(opts.jobId);
  const file = renderReviewImagePath(opts.jobId, opts.viewport);
  if (!job || !fs.existsSync(file)) return null;
  let img = sharp(file, { limitInputPixels: false });
  if (opts.sectionIndex !== undefined) {
    const row = job.sections?.[opts.viewport]?.find((s) => s.index === opts.sectionIndex);
    const meta = await img.metadata();
    if (!row || !meta.width || !meta.height || row.top >= meta.height) return null;
    const top = Math.max(0, Math.floor(row.top));
    const height = Math.max(1, Math.min(Math.ceil(row.height), meta.height - top));
    img = sharp(await img.extract({ left: 0, top, width: meta.width, height }).toBuffer());
  }
  return img
    .resize({ width: opts.maxWidth ?? (opts.sectionIndex !== undefined ? 900 : 600), withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
}
