/**
 * Backup of ad history (URL versions, campaign names, tracked-field fingerprints, change log) to the
 * content repo under `{contentFolder}/ads-history/`. Production pushes after each Sync; any server
 * restores from those files when its cache catalog has no history yet. Local machines never push.
 *
 * Files are plain `.json` (no leading dot, not `-state.json`) so `shouldTrackFile` syncs them.
 * Volatile "still current" values (the newest version's `last_seen_at`, the current name's
 * `last_seen`, history `seen_at`) are left out so a file only changes when history does.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { child } from "../logger";
import {
  loadAdsSetup,
  saveAdsSetup,
  type AdsSetupAdVersion,
  type AdsSetupCatalog,
  type AdsSetupCampaignName,
  type AdsSetupPlatform,
} from "./ads-setup";
import {
  ADS_CHANGE_LOG_DIR,
  changeLogCutoffMonth,
  changeLogFileName,
  listChangeLogFiles,
  readChangeLogFile,
  type AdsTrackedFields,
} from "./ads-change-log";

const log = child({ module: "ads/ads-history-backup" });

export const ADS_HISTORY_DIR = "ads-history";
export const ADS_HISTORY_FORMAT = 1;
const PLATFORMS: AdsSetupPlatform[] = ["meta", "google"];

type BackupHistory = { fields: AdsTrackedFields; fingerprint: string };
type BackupVersion = Omit<AdsSetupAdVersion, "last_seen_at"> & { last_seen_at: string | null };
type BackupName = Omit<AdsSetupCampaignName, "last_seen"> & { last_seen: string | null };

export type AdsHistoryBackupFile = {
  format: number;
  platform: AdsSetupPlatform;
  ads: Record<string, { account_id: string; campaign_id: string; adset_id: string; versions?: BackupVersion[]; history?: BackupHistory }>;
  campaigns: Record<string, { account_id: string; name: string; names?: BackupName[]; history?: BackupHistory }>;
  adsets: Record<string, { account_id: string; campaign_id: string; history?: BackupHistory }>;
};

const stripHistory = (h: { fields: AdsTrackedFields; fingerprint: string } | undefined): BackupHistory | undefined =>
  h ? { fields: h.fields, fingerprint: h.fingerprint } : undefined;

function sortedRecord<T>(r: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(r).sort().map((k) => [k, r[k]!]));
}

/** History-only view of a catalog (no metrics, no volatile "still current" timestamps). */
export function exportAdsHistory(catalog: AdsSetupCatalog): AdsHistoryBackupFile {
  const ads: AdsHistoryBackupFile["ads"] = {};
  for (const a of Object.values(catalog.ads)) {
    const versions = a.versions?.map((v, i, list): BackupVersion => (i === list.length - 1 ? { ...v, last_seen_at: null } : v));
    if (!versions && !a.history) continue;
    ads[a.id] = {
      account_id: a.account_id,
      campaign_id: a.campaign_id,
      adset_id: a.adset_id,
      ...(versions ? { versions } : {}),
      ...(a.history ? { history: stripHistory(a.history) } : {}),
    };
  }
  const campaigns: AdsHistoryBackupFile["campaigns"] = {};
  for (const c of Object.values(catalog.campaigns)) {
    const names = c.names?.map((n): BackupName => (n.name === c.name ? { ...n, last_seen: null } : n));
    if (!names && !c.history) continue;
    campaigns[c.id] = {
      account_id: c.account_id,
      name: c.name,
      ...(names ? { names } : {}),
      ...(c.history ? { history: stripHistory(c.history) } : {}),
    };
  }
  const adsets: AdsHistoryBackupFile["adsets"] = {};
  for (const s of Object.values(catalog.adsets)) {
    if (!s.history) continue;
    adsets[s.id] = { account_id: s.account_id, campaign_id: s.campaign_id, history: stripHistory(s.history) };
  }
  return { format: ADS_HISTORY_FORMAT, platform: catalog.platform, ads: sortedRecord(ads), campaigns: sortedRecord(campaigns), adsets: sortedRecord(adsets) };
}

/** True when the catalog carries no recorded history (fresh cache or written before versioning). */
export function catalogLacksHistory(catalog: AdsSetupCatalog): boolean {
  return !Object.values(catalog.ads).some((a) => a.versions?.length) && !Object.values(catalog.campaigns).some((c) => c.names?.length);
}

/**
 * Merge a backup into a catalog without overwriting anything the catalog already recorded. Ads /
 * campaigns missing from the catalog are created from the backup's ids and newest URL.
 */
export function mergeAdsHistory(catalog: AdsSetupCatalog, backup: AdsHistoryBackupFile, nowIso: string): { ads: number; campaigns: number } {
  const today = nowIso.slice(0, 10);
  let ads = 0;
  let campaigns = 0;
  for (const [id, b] of Object.entries(backup.ads ?? {})) {
    const prev = catalog.ads[id];
    const lastSeen = prev?.last_seen_at ?? nowIso;
    const versions = b.versions?.map((v): AdsSetupAdVersion => ({ ...v, last_seen_at: v.last_seen_at ?? lastSeen }));
    const newest = versions?.at(-1);
    if (!prev) {
      if (!newest) continue;
      catalog.ads[id] = {
        id,
        account_id: b.account_id,
        campaign_id: b.campaign_id,
        adset_id: b.adset_id,
        name: "",
        status: null,
        landing_urls: [...newest.landing_urls],
        url_tags: newest.url_tags ?? null,
        destination: newest.destination,
        last_seen_at: lastSeen,
        versions,
        ...(b.history ? { history: { ...b.history, seen_at: nowIso } } : {}),
      };
      ads++;
      continue;
    }
    let touched = false;
    if (versions && !prev.versions?.length) {
      prev.versions = versions;
      touched = true;
    }
    if (b.history && !prev.history) {
      prev.history = { ...b.history, seen_at: nowIso };
      touched = true;
    }
    if (touched) ads++;
  }
  for (const [id, b] of Object.entries(backup.campaigns ?? {})) {
    const names = b.names?.map((n): AdsSetupCampaignName => ({ ...n, last_seen: n.last_seen ?? today }));
    const prev = catalog.campaigns[id];
    if (!prev) {
      catalog.campaigns[id] = {
        id,
        account_id: b.account_id,
        name: b.name,
        status: null,
        last_seen_at: nowIso,
        ...(names ? { names } : {}),
        ...(b.history ? { history: { ...b.history, seen_at: nowIso } } : {}),
      };
      campaigns++;
      continue;
    }
    let touched = false;
    if (names && !prev.names?.length) {
      prev.names = names;
      touched = true;
    }
    if (b.history && !prev.history) {
      prev.history = { ...b.history, seen_at: nowIso };
      touched = true;
    }
    if (touched) campaigns++;
  }
  for (const [id, b] of Object.entries(backup.adsets ?? {})) {
    const prev = catalog.adsets[id];
    if (!b.history) continue;
    if (!prev) {
      catalog.adsets[id] = { id, account_id: b.account_id, campaign_id: b.campaign_id, name: "", last_seen_at: nowIso, history: { ...b.history, seen_at: nowIso } };
    } else if (!prev.history) {
      prev.history = { ...b.history, seen_at: nowIso };
    }
  }
  return { ads, campaigns };
}

// ── Disk layout ─────────────────────────────────────────────────────────────

/** Content folder relative to the app root (e.g. `site_4geeks-com`), as sync-state expects. */
function contentFolderOf(contentRoot: string | undefined, site: string): string {
  if (!contentRoot) return site;
  return path.isAbsolute(contentRoot) ? path.relative(process.cwd(), contentRoot) : contentRoot;
}

export function adsHistoryRelPaths(folder: string): { setup: (p: AdsSetupPlatform) => string; changesDir: string } {
  return {
    setup: (p) => `${folder}/${ADS_HISTORY_DIR}/${p}.json`,
    changesDir: `${folder}/${ADS_HISTORY_DIR}/changes`,
  };
}

function abs(rel: string): string {
  return path.join(process.cwd(), rel);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Write `value` only when the bytes differ. Returns true when written. */
function writeIfChanged(file: string, value: unknown): boolean {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, "utf-8") === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, next, "utf-8");
  fs.renameSync(tmp, file);
  return true;
}

export type WriteAdsHistoryResult = { changed: string[]; deleted: string[]; versions: number; changes: number };

/**
 * Write the backup files for `site` into its content folder. Returns repo-relative paths that
 * changed (written) or were deleted (months past retention).
 */
export function writeAdsHistoryFiles(site: string, contentRoot: string | undefined, now = new Date()): WriteAdsHistoryResult {
  const folder = contentFolderOf(contentRoot, site);
  const rel = adsHistoryRelPaths(folder);
  const out: WriteAdsHistoryResult = { changed: [], deleted: [], versions: 0, changes: 0 };
  for (const p of PLATFORMS) {
    const catalog = loadAdsSetup(site, p);
    if (Object.keys(catalog.ads).length === 0 && Object.keys(catalog.campaigns).length === 0) continue;
    const file = exportAdsHistory(catalog);
    out.versions += Object.values(file.ads).reduce((n, a) => n + (a.versions?.length ?? 0), 0);
    if (writeIfChanged(abs(rel.setup(p)), file)) out.changed.push(rel.setup(p));
  }
  const cutoff = changeLogCutoffMonth(now);
  const kept = new Set<string>();
  for (const f of listChangeLogFiles(site)) {
    if (f.month < cutoff) continue;
    const name = changeLogFileName(f.platform, f.month);
    kept.add(name);
    const changes = readChangeLogFile(f.file);
    out.changes += changes.length;
    const target = `${rel.changesDir}/${name}`;
    if (writeIfChanged(abs(target), changes)) out.changed.push(target);
  }
  const changesAbs = abs(rel.changesDir);
  if (fs.existsSync(changesAbs)) {
    for (const name of fs.readdirSync(changesAbs)) {
      const m = /^(meta|google)-(\d{4}-\d{2})\.json$/.exec(name);
      if (!m || m[2]! >= cutoff || kept.has(name)) continue;
      fs.unlinkSync(path.join(changesAbs, name));
      out.deleted.push(`${rel.changesDir}/${name}`);
    }
  }
  return out;
}

export type BackupDeps = {
  isProduction?: () => boolean;
  isSnapshot?: (site: string) => boolean;
  push?: (files: string[], message: string, contentRoot: string | undefined) => Promise<{ ok: boolean; error?: string }>;
  now?: Date;
};

async function defaultPush(files: string[], message: string, contentRoot: string | undefined): Promise<{ ok: boolean; error?: string }> {
  const { resolveCommitGitHubToken } = await import("../github-user-tokens");
  const { queueOrCommitFiles } = await import("../github-commit-queue");
  const { token } = await resolveCommitGitHubToken({ purpose: "system" });
  const result = await queueOrCommitFiles({ files, message, author: "ads-sync", contentRoot, token });
  if (result.status === 200 || result.status === 202) return { ok: true };
  return { ok: false, error: result.error };
}

export type BackupResult = { pushed: boolean; skipped?: "not_production" | "snapshot" | "no_changes"; files?: string[]; error?: string };

/**
 * After a production Sync: write changed backup files and push them in one commit (author
 * `ads-sync`). Never throws; the caller stores the outcome in the Meta sync state.
 */
export async function backupAdsHistory(site: string, contentRoot: string | undefined, deps: BackupDeps = {}): Promise<BackupResult> {
  if (!(deps.isProduction ?? (() => process.env.NODE_ENV === "production"))()) return { pushed: false, skipped: "not_production" };
  const isSnapshot = deps.isSnapshot ?? (await import("./ads-refresh")).isProductionSnapshot;
  if (isSnapshot(site)) return { pushed: false, skipped: "snapshot" };
  try {
    const written = writeAdsHistoryFiles(site, contentRoot, deps.now);
    const files = [...written.changed, ...written.deleted];
    if (files.length === 0) return { pushed: false, skipped: "no_changes" };
    const message = `Ads history: ${written.versions} URL versions, ${written.changes} changes`;
    const res = await (deps.push ?? defaultPush)(files, message, contentRoot);
    if (!res.ok) return { pushed: false, files, error: res.error ?? "push failed" };
    return { pushed: true, files };
  } catch (err) {
    return { pushed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Before a Sync records versions: when the cache catalog has no history and the content folder has
 * a backup, merge it in; when the cache change log is empty, copy the backup's monthly files.
 * Returns true when anything was restored.
 */
export function restoreAdsHistoryIfMissing(site: string, contentRoot: string | undefined, platform: AdsSetupPlatform, now = new Date()): boolean {
  const folder = contentFolderOf(contentRoot, site);
  const rel = adsHistoryRelPaths(folder);
  let restored = false;
  try {
    const catalog = loadAdsSetup(site, platform);
    if (catalogLacksHistory(catalog)) {
      const backup = readJson<AdsHistoryBackupFile>(abs(rel.setup(platform)));
      if (backup && backup.platform === platform && backup.format === ADS_HISTORY_FORMAT) {
        const n = mergeAdsHistory(catalog, backup, now.toISOString());
        if (n.ads + n.campaigns > 0) {
          saveAdsSetup(site, catalog);
          restored = true;
          log.info({ site, platform, ...n }, "[ads-history] restored catalog history from content backup");
        }
      }
    }
    if (listChangeLogFiles(site).length === 0) {
      const dir = abs(rel.changesDir);
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          if (!/^(meta|google)-\d{4}-\d{2}\.json$/.test(name)) continue;
          const target = path.join(CACHE_DIR, site, ADS_CHANGE_LOG_DIR, name);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(path.join(dir, name), target);
          restored = true;
        }
      }
    }
  } catch (err) {
    log.warn({ err, site, platform }, "[ads-history] restore from content backup failed (non-fatal)");
  }
  return restored;
}
