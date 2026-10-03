/**
 * Campaign change history (history only — nothing reads it for numbers yet).
 *
 * Each catalog entry (campaign / ad set / ad in `ads-setup`) carries a `history` block: the tracked
 * fields plus a fingerprint. When a setup read changes the fingerprint, one entry per changed field
 * is appended to `.cache/{site}/ads-change-log/{platform}-{yyyy-mm}.json` (a JSON array per month;
 * `.json` so the content-repo backup tracks it). The first read of an entity only seeds the block.
 *
 * Tracked: what can move performance or attribution — name, staff-set status (+ disapproved / with
 * issues / account disabled), budgets, bidding, objective, optimization event, targeting (hash +
 * summary), schedule, creative id, Google URL suffix / networks.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { child } from "../logger";

const log = child({ module: "ads/ads-change-log" });

export const ADS_CHANGE_LOG_DIR = "ads-change-log";
export const ADS_CHANGE_LOG_RETENTION_MONTHS = 25;

export type AdsChangePlatform = "meta" | "google";
export type AdsChangeLevel = "campaign" | "adset" | "ad";
export type AdsChangeSource = "sync" | "recheck";

export type AdsChange = {
  at: string;
  platform: AdsChangePlatform;
  level: AdsChangeLevel;
  id: string;
  campaign_id: string;
  field: string;
  from: string | null;
  to: string | null;
  source: AdsChangeSource;
};

export type AdsTrackedFields = Record<string, string | null>;

export type AdsSetupHistory = {
  fields: AdsTrackedFields;
  fingerprint: string;
  /** Last read that saw these values. */
  seen_at: string;
};

export type AdsChangeContext = {
  at: string;
  platform: AdsChangePlatform;
  level: AdsChangeLevel;
  id: string;
  campaign_id: string;
  source: AdsChangeSource;
};

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).sort().join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function hash(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

export function fingerprintOf(fields: AdsTrackedFields): string {
  return hash(stableJson(fields));
}

/**
 * Compare a fresh read with the stored block. First read → seed only. Same fingerprint → bump
 * `seen_at`. Otherwise push one change per differing field into `sink`.
 */
export function trackHistory(
  prev: AdsSetupHistory | undefined,
  fields: AdsTrackedFields,
  ctx: AdsChangeContext,
  sink: AdsChange[] | undefined,
): AdsSetupHistory {
  const fingerprint = fingerprintOf(fields);
  if (!prev) return { fields, fingerprint, seen_at: ctx.at };
  if (prev.fingerprint === fingerprint) return { ...prev, seen_at: ctx.at };
  if (sink) {
    const keys = Array.from(new Set([...Object.keys(prev.fields), ...Object.keys(fields)])).sort();
    for (const field of keys) {
      const from = prev.fields[field] ?? null;
      const to = fields[field] ?? null;
      if (from === to) continue;
      sink.push({ at: ctx.at, platform: ctx.platform, level: ctx.level, id: ctx.id, campaign_id: ctx.campaign_id, field, from, to, source: ctx.source });
    }
  }
  return { fields, fingerprint, seen_at: ctx.at };
}

// ── Field helpers ───────────────────────────────────────────────────────────

const META_LOGGED_DELIVERY = new Set(["DISAPPROVED", "WITH_ISSUES"]);

/**
 * Delivery states worth logging next to the staff-set status: disapproved, with issues, account
 * disabled. In review / learning / parent paused etc. read as null (not logged).
 */
export function metaDeliveryIssue(effectiveStatus: string | null | undefined, accountStatus?: number | null): string | null {
  if (accountStatus != null && accountStatus !== 1) return "ACCOUNT_DISABLED";
  const s = (effectiveStatus ?? "").toUpperCase();
  return META_LOGGED_DELIVERY.has(s) ? s : null;
}

/** Keys Meta adds or flips on its own; left out so they don't log false targeting changes. */
const TARGETING_AUTO_KEYS = new Set(["targeting_automation", "brand_safety_content_filter_levels", "targeting_relaxation_types"]);

export function normalizeTargeting(t: Record<string, unknown> | null | undefined): unknown {
  if (!t) return null;
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (TARGETING_AUTO_KEYS.has(k)) continue;
        out[k] = strip(x);
      }
      return out;
    }
    return v;
  };
  return strip(t);
}

export function targetingHash(t: Record<string, unknown> | null | undefined): string | null {
  return t ? hash(stableJson(normalizeTargeting(t))) : null;
}

/** Small readable summary: countries, age range, custom audiences, placements automatic vs manual. */
export function targetingSummary(t: Record<string, unknown> | null | undefined): string | null {
  if (!t) return null;
  const geo = (t.geo_locations ?? {}) as { countries?: unknown };
  const countries = Array.isArray(geo.countries) ? (geo.countries as unknown[]).map(String).sort() : [];
  const ageMin = t.age_min != null ? String(t.age_min) : "";
  const ageMax = t.age_max != null ? String(t.age_max) : "";
  const audiences = Array.isArray(t.custom_audiences) ? t.custom_audiences.length : 0;
  const placements = Array.isArray(t.publisher_platforms) && t.publisher_platforms.length > 0 ? "manual" : "automatic";
  const parts = [
    countries.length ? `countries ${countries.slice(0, 10).join(",")}${countries.length > 10 ? ` +${countries.length - 10}` : ""}` : null,
    ageMin || ageMax ? `age ${ageMin || "?"}-${ageMax || "?"}` : null,
    `custom audiences ${audiences}`,
    `placements ${placements}`,
  ].filter(Boolean);
  return parts.join("; ");
}

/** Targeting as one tracked value: summary + hash (a change the summary can't show still differs). */
export function targetingField(t: Record<string, unknown> | null | undefined): string | null {
  const h = targetingHash(t);
  return h ? `${targetingSummary(t)} #${h}` : null;
}

// ── Monthly files ───────────────────────────────────────────────────────────

function logDir(site: string): string {
  return path.join(CACHE_DIR, site, ADS_CHANGE_LOG_DIR);
}

export function changeLogFileName(platform: AdsChangePlatform, month: string): string {
  return `${platform}-${month}.json`;
}

const FILE_RE = /^(meta|google)-(\d{4}-\d{2})\.json$/;

export function listChangeLogFiles(site: string): Array<{ platform: AdsChangePlatform; month: string; file: string }> {
  const d = logDir(site);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .map((f) => {
      const m = FILE_RE.exec(f);
      return m ? { platform: m[1] as AdsChangePlatform, month: m[2]!, file: path.join(d, f) } : null;
    })
    .filter((x): x is { platform: AdsChangePlatform; month: string; file: string } => !!x)
    .sort((a, b) => a.month.localeCompare(b.month) || a.platform.localeCompare(b.platform));
}

export function readChangeLogFile(file: string): AdsChange[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown;
    return Array.isArray(parsed) ? (parsed as AdsChange[]) : [];
  } catch {
    return [];
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1), "utf-8");
  fs.renameSync(tmp, file);
}

/** Append changes to their month files. Returns the files written. */
export function appendChanges(site: string, changes: AdsChange[]): string[] {
  if (changes.length === 0) return [];
  const byFile = new Map<string, AdsChange[]>();
  for (const c of changes) {
    const name = changeLogFileName(c.platform, c.at.slice(0, 7));
    const list = byFile.get(name) ?? [];
    list.push(c);
    byFile.set(name, list);
  }
  const written: string[] = [];
  for (const [name, list] of Array.from(byFile.entries())) {
    const file = path.join(logDir(site), name);
    try {
      writeJsonAtomic(file, [...(fs.existsSync(file) ? readChangeLogFile(file) : []), ...list]);
      written.push(file);
    } catch (err) {
      log.warn({ err, site, file }, "[ads-change-log] could not append changes");
    }
  }
  return written;
}

/** Oldest month kept (inclusive), e.g. 25 months back from `now`. */
export function changeLogCutoffMonth(now: Date, months = ADS_CHANGE_LOG_RETENTION_MONTHS): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return d.toISOString().slice(0, 7);
}

/** Delete month files older than the retention window. Returns the deleted months' files. */
export function pruneChangeLog(site: string, now = new Date()): string[] {
  const cutoff = changeLogCutoffMonth(now);
  const removed: string[] = [];
  for (const f of listChangeLogFiles(site)) {
    if (f.month >= cutoff) continue;
    try {
      fs.unlinkSync(f.file);
      removed.push(f.file);
    } catch {
      /* ignore */
    }
  }
  return removed;
}
