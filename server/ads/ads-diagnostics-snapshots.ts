/**
 * Short-lived snapshots of an Ads diagnostics build so "show all ads" / MCP
 * `issue_ids` follow-ups read the same issues the list showed (like site
 * diagnostics job envelopes, but synchronous — no polling).
 * `.cache/{site}/ads-diagnostics-snapshots/{id}.json`, last 50, 30 min TTL.
 * The id hashes the issues + sync markers, so repeated identical builds reuse one file.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsDiagnostics } from "./ads-diagnostics";
import type { AdsIdFilters } from "./ads-report";
import { loadMetaState } from "./meta-ads-days";
import { loadPaidLandingState } from "./paid-detection";

export const ADS_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
export const ADS_SNAPSHOT_MAX = 50;
export const ADS_LIST_ADS_LIMIT = 3;
export const ADS_DETAIL_ADS_LIMIT = 50;
export const ADS_MAX_ADS_LIMIT = 200;
export const ADS_MAX_ISSUE_IDS = 10;
export const ADS_FILTER_MAX_IDS = 20;

const ID_RE = /^ads_[a-f0-9]{16}$/;

/** Data freshness at build time; a later sync means the snapshot may be behind. */
export type AdsSnapshotMarkers = {
  meta_last_synced_at: string | null;
  ga4_last_export_date: string | null;
};

export type AdsDiagnosticsSnapshot = {
  id: string;
  created_at: string;
  expires_at: string;
  markers: AdsSnapshotMarkers;
  diagnostics: AdsDiagnostics;
};

function dir(site: string): string {
  return path.join(CACHE_DIR, site, "ads-diagnostics-snapshots");
}

export function currentSnapshotMarkers(site: string): AdsSnapshotMarkers {
  return {
    meta_last_synced_at: loadMetaState(site).last_success_at ?? null,
    ga4_last_export_date: loadPaidLandingState(site).last_export_date ?? null,
  };
}

export function snapshotIdFor(d: AdsDiagnostics, markers: AdsSnapshotMarkers): string {
  const body = JSON.stringify({ window_days: d.window_days, issues: d.issues, markers });
  return `ads_${crypto.createHash("sha256").update(body).digest("hex").slice(0, 16)}`;
}

export function isSnapshotId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

function prune(site: string, nowMs: number): void {
  const d = dir(site);
  try {
    const files = fs
      .readdirSync(d)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ full: path.join(d, f), mtime: fs.statSync(path.join(d, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    files.forEach((f, i) => {
      if (i >= ADS_SNAPSHOT_MAX || nowMs - f.mtime > ADS_SNAPSHOT_TTL_MS) {
        try {
          fs.unlinkSync(f.full);
        } catch {
          /* ignore */
        }
      }
    });
  } catch {
    /* ignore */
  }
}

/** Save (or refresh the TTL of) the snapshot for this build. */
export function saveAdsSnapshot(site: string, diagnostics: AdsDiagnostics, now = new Date()): AdsDiagnosticsSnapshot {
  const markers = currentSnapshotMarkers(site);
  const id = snapshotIdFor(diagnostics, markers);
  const snap: AdsDiagnosticsSnapshot = {
    id,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ADS_SNAPSHOT_TTL_MS).toISOString(),
    markers,
    diagnostics,
  };
  const d = dir(site);
  fs.mkdirSync(d, { recursive: true });
  const file = path.join(d, `${id}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snap), "utf-8");
  fs.renameSync(tmp, file);
  fs.utimesSync(file, now, now);
  prune(site, now.getTime());
  return snap;
}

export type SnapshotLookup = { status: "ok"; snapshot: AdsDiagnosticsSnapshot } | { status: "expired" };

/** Unknown, pruned and past-TTL ids all read as expired. */
export function loadAdsSnapshot(site: string, id: string, now = new Date()): SnapshotLookup {
  if (!isSnapshotId(id)) return { status: "expired" };
  try {
    const file = path.join(dir(site), `${id}.json`);
    if (!fs.existsSync(file)) return { status: "expired" };
    const snap = JSON.parse(fs.readFileSync(file, "utf-8")) as AdsDiagnosticsSnapshot;
    if (Date.parse(snap.expires_at) <= now.getTime()) return { status: "expired" };
    return { status: "ok", snapshot: snap };
  } catch {
    return { status: "expired" };
  }
}

export function newerDataAvailable(snap: AdsDiagnosticsSnapshot, current: AdsSnapshotMarkers): boolean {
  return (
    (current.meta_last_synced_at ?? "") > (snap.markers.meta_last_synced_at ?? "") ||
    (current.ga4_last_export_date ?? "") > (snap.markers.ga4_last_export_date ?? "")
  );
}

/** Cut each issue's `details.ads` to one page; totals stay whole. */
export function trimIssueAds(issues: AdsIssue[], limit: number, offset: number): AdsIssue[] {
  return issues.map((i) =>
    i.details ? { ...i, details: { ...i.details, ads: i.details.ads.slice(offset, offset + limit), ads_offset: offset } } : i,
  );
}

export function clampAdsLimit(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, ADS_MAX_ADS_LIMIT) : fallback;
}

export function clampAdsOffset(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Comma list (or array) → unique ids, max 10. */
export function parseIssueIds(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean))).slice(0, ADS_MAX_ISSUE_IDS);
}

export class AdsIdFilterError extends Error {}

/** Comma list (or array) of numeric Meta ids → unique ids; throws on non-digits or more than 20. */
export function parseAdIdList(raw: unknown, label: string): string[] | undefined {
  const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  const ids = Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean)));
  if (ids.length === 0) return undefined;
  const bad = ids.filter((id) => !/^\d{1,30}$/.test(id));
  if (bad.length > 0) throw new AdsIdFilterError(`${label} must be numeric Meta ids (got ${bad.slice(0, 3).join(", ")}).`);
  if (ids.length > ADS_FILTER_MAX_IDS) throw new AdsIdFilterError(`${label} accepts at most ${ADS_FILTER_MAX_IDS} ids (got ${ids.length}).`);
  return ids;
}

/** `campaign_ids` / `adset_ids` / `ad_ids` query params (qs arrays or comma strings). */
export function parseAdIdFilters(q: Record<string, unknown>): AdsIdFilters {
  const out: AdsIdFilters = {};
  for (const key of ["campaign_ids", "adset_ids", "ad_ids"] as const) {
    const ids = parseAdIdList(q[key] ?? q[`${key}[]`], key);
    if (ids) out[key] = ids;
  }
  return out;
}

export function hasAdIdFilters(f: AdsIdFilters): boolean {
  return !!(f.campaign_ids?.length || f.adset_ids?.length || f.ad_ids?.length);
}

/**
 * Keep issues touching the filtered ads (or GA4-seen tags) plus issues with no ad
 * scope (sync / setup failures affect every ad); narrow each kept issue's ads to matches.
 */
export function filterIssuesByIds(issues: AdsIssue[], f: AdsIdFilters): AdsIssue[] {
  if (!hasAdIdFilters(f)) return issues;
  const sets = {
    campaign: f.campaign_ids?.length ? new Set(f.campaign_ids) : null,
    adset: f.adset_ids?.length ? new Set(f.adset_ids) : null,
    ad: f.ad_ids?.length ? new Set(f.ad_ids) : null,
  };
  const matches = (campaign: string | null, adset: string | null, ad: string | null) =>
    (!sets.ad || (!!ad && sets.ad.has(ad))) &&
    (!sets.adset || (!!adset && sets.adset.has(adset))) &&
    (!sets.campaign || (!!campaign && sets.campaign.has(campaign)));
  const out: AdsIssue[] = [];
  for (const issue of issues) {
    const d = issue.details;
    if (!d || (d.ads.length === 0 && !d.ga4_seen?.length)) {
      out.push(issue);
      continue;
    }
    const ads = d.ads.filter((a) => matches(a.campaign_id, a.adset_id, a.ad_id));
    const ga4 = d.ga4_seen?.filter(
      (g) => matches(g.campaign_id, g.adset_id, g.ad_id) || (/^\d+$/.test(g.campaign) && matches(g.campaign, g.adset_id, g.ad_id)),
    );
    if (ads.length === 0 && !ga4?.length) continue;
    out.push({ ...issue, details: { ...d, ads, ads_total: ads.length, ...(d.ga4_seen ? { ga4_seen: ga4 } : {}) } });
  }
  return out;
}
