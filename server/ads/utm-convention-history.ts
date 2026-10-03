/**
 * UTM convention change history, per environment: `.cache/{site}/utm-convention-history.json`.
 * Each read of the parsed convention is hashed (stable key order, sorted value lists, so
 * formatting / reordering is not a change); a hash different from the latest appends a version.
 * The first read is the baseline (no grace). Values from versions replaced within the last
 * 28 days stay accepted at info severity. Included in "Download from production" so local
 * copies see the same grace as production.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { NO_UTM_GRACE, type UtmGrace } from "@shared/ads-diagnostics-rules";
import { UTM_CONVENTION_PLATFORMS, type UtmConvention } from "@shared/ads-settings";

export const UTM_CONVENTION_HISTORY_FILE = "utm-convention-history.json";
export const UTM_GRACE_DAYS = 28;
const MAX_VERSIONS = 50;
const DAY_MS = 86_400_000;

export type UtmConventionVersion = { hash: string; convention: UtmConvention; seen_at: string };
export type UtmConventionHistory = { versions: UtmConventionVersion[] };

export type UtmGraceState = UtmGrace & {
  /** Flat list of old values still accepted (sources, mediums, campaign patterns). */
  accepted_old_values: string[];
};

function historyPath(site: string): string {
  return path.join(CACHE_DIR, site, UTM_CONVENTION_HISTORY_FILE);
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = v.map(stable);
    return items.every((x) => typeof x === "string") ? [...(items as string[])].sort() : items;
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** What counts as a convention change: the parsed values, not YAML formatting or list order. */
export function conventionHash(c: UtmConvention): string {
  return crypto.createHash("sha1").update(JSON.stringify(stable(c))).digest("hex").slice(0, 16);
}

export function loadUtmConventionHistory(site: string): UtmConventionHistory {
  try {
    const raw = JSON.parse(fs.readFileSync(historyPath(site), "utf-8")) as UtmConventionHistory;
    return Array.isArray(raw?.versions) ? { versions: raw.versions.filter((v) => v && typeof v.hash === "string" && typeof v.seen_at === "string") } : { versions: [] };
  } catch {
    return { versions: [] };
  }
}

function writeHistory(site: string, h: UtmConventionHistory): void {
  const file = historyPath(site);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(h), "utf-8");
  fs.renameSync(tmp, file);
}

/** Appends a version when the parsed convention differs from the latest one seen here. */
export function recordUtmConvention(site: string, c: UtmConvention, now = new Date()): UtmConventionHistory {
  const h = loadUtmConventionHistory(site);
  const hash = conventionHash(c);
  if (h.versions[h.versions.length - 1]?.hash === hash) return h;
  h.versions.push({ hash, convention: c, seen_at: now.toISOString() });
  if (h.versions.length > MAX_VERSIONS) h.versions = h.versions.slice(-MAX_VERSIONS);
  try {
    writeHistory(site, h);
  } catch {
    /* read-only cache: grace is computed from memory for this read */
  }
  return h;
}

/** Pure: grace from a history and the current convention. */
export function graceFromHistory(h: UtmConventionHistory, current: UtmConvention, now = new Date()): UtmGraceState {
  const versions = [...h.versions].sort((a, b) => a.seen_at.localeCompare(b.seen_at));
  const accepted: UtmGrace["accepted"] = {};
  const patterns = new Set<string>();
  let endsAt: number | null = null;
  let changedAt: string | null = null;
  for (let i = 0; i < versions.length - 1; i++) {
    const successorAt = Date.parse(versions[i + 1]!.seen_at);
    const ends = successorAt + UTM_GRACE_DAYS * DAY_MS;
    if (!Number.isFinite(successorAt) || ends <= now.getTime()) continue;
    const old = versions[i]!.convention;
    for (const p of UTM_CONVENTION_PLATFORMS) {
      const sources = (old.sources?.[p]?.canonical ?? []).filter((v) => !current.sources[p].canonical.includes(v));
      const mediums = old.mediums?.[p] && old.mediums[p] !== current.mediums[p] ? [old.mediums[p]] : [];
      if (sources.length === 0 && mediums.length === 0) continue;
      const cur = accepted[p] ?? { sources: [], mediums: [] };
      accepted[p] = { sources: Array.from(new Set([...cur.sources, ...sources])), mediums: Array.from(new Set([...cur.mediums, ...mediums])) };
    }
    if (old.campaign_pattern && old.campaign_pattern !== current.campaign_pattern) patterns.add(old.campaign_pattern);
    if (endsAt == null || ends > endsAt) {
      endsAt = ends;
      changedAt = versions[i + 1]!.seen_at;
    }
  }
  if (endsAt == null) return { ...NO_UTM_GRACE, accepted_old_values: [] };
  const flat = new Set<string>();
  for (const p of UTM_CONVENTION_PLATFORMS) {
    for (const v of accepted[p]?.sources ?? []) flat.add(`utm_source=${v}`);
    for (const v of accepted[p]?.mediums ?? []) flat.add(`utm_medium=${v}`);
  }
  for (const v of Array.from(patterns)) flat.add(`utm_campaign~${v}`);
  return {
    active: true,
    changed_at: changedAt,
    ends_at: new Date(endsAt).toISOString(),
    accepted,
    campaign_patterns: Array.from(patterns),
    accepted_old_values: Array.from(flat),
  };
}

/** Records the current convention (change detection happens on read) and returns the grace state. */
export function utmGraceState(site: string, current: UtmConvention, now = new Date()): UtmGraceState {
  return graceFromHistory(recordUtmConvention(site, current, now), current, now);
}

// ── Download from production ────────────────────────────────────────────────

export type UtmConventionSnapshot = { utm_convention_history?: UtmConventionHistory };

export function exportUtmConventionSnapshot(site: string): UtmConventionSnapshot {
  const h = loadUtmConventionHistory(site);
  return h.versions.length > 0 ? { utm_convention_history: h } : {};
}

export function parseUtmConventionSnapshot(v: unknown): UtmConventionHistory | undefined {
  if (!v || typeof v !== "object" || !Array.isArray((v as UtmConventionHistory).versions)) return undefined;
  const versions = (v as UtmConventionHistory).versions.filter(
    (x) => x && typeof x.hash === "string" && typeof x.seen_at === "string" && x.convention && typeof x.convention === "object",
  );
  return { versions: versions.slice(-MAX_VERSIONS) };
}

/** Writes the history under `stagingRoot` (live layout); the caller swaps it in. */
export function stageUtmConventionSnapshot(stagingRoot: string, h: UtmConventionHistory): void {
  fs.mkdirSync(stagingRoot, { recursive: true });
  fs.writeFileSync(path.join(stagingRoot, UTM_CONVENTION_HISTORY_FILE), JSON.stringify(h), "utf-8");
}
