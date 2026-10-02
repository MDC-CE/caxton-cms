/**
 * Per-site Ads config at `{contentRoot}/ads-config.yml` (accounts, thresholds, lead conversions,
 * test emails, UTM convention). Authored / synced like seo-config.yml.
 *
 * Read order: ads-config.yml → legacy `ads:` block in settings.yml → defaults.
 * An unreadable ads-config.yml never falls back to "ads disabled": the last good parse is kept
 * and callers that sync check `getAdsConfigStatus` first.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { parseAdsSettings, type AdsSettings } from "@shared/ads-settings";
import { getDefaultContentRoot } from "./site-config";
import { child } from "./logger";

const log = child({ module: "ads-config" });

export const ADS_CONFIG_FILENAME = "ads-config.yml";

export type AdsConfigSource = "ads-config" | "settings" | "defaults";

export type AdsConfigStatus = {
  status: "ok" | "missing" | "unreadable";
  /** Where the settings in use came from. */
  source: AdsConfigSource;
  error?: string;
};

export type AdsConfigLoad = { settings: AdsSettings; status: AdsConfigStatus };

function rootOf(contentRoot?: string): string {
  return contentRoot ?? getDefaultContentRoot();
}

export function adsConfigPath(contentRoot?: string): string {
  return path.join(rootOf(contentRoot), ADS_CONFIG_FILENAME);
}

function fileStamp(file: string): string {
  try {
    const s = fs.statSync(file);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return "missing";
  }
}

type CacheEntry = { stamp: string; load: AdsConfigLoad };
const cache = new Map<string, CacheEntry>();
/** Last successful parse per root, kept while the file is unreadable. */
const lastGood = new Map<string, AdsSettings>();

/** Raw top-level object, or `{ ok: false }` when the file exists but isn't a YAML mapping. */
export function readAdsConfigRaw(contentRoot?: string): { ok: true; exists: boolean; data: Record<string, unknown> } | { ok: false; error: string } {
  const file = adsConfigPath(contentRoot);
  if (!fs.existsSync(file)) return { ok: true, exists: false, data: {} };
  try {
    const parsed = yaml.load(fs.readFileSync(file, "utf-8"));
    if (parsed == null) return { ok: true, exists: true, data: {} };
    if (typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "top level is not a mapping" };
    return { ok: true, exists: true, data: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.split("\n")[0]!.slice(0, 300) : String(err) };
  }
}

/**
 * Ads settings plus where they came from. `legacy` returns the `ads:` block of settings.yml
 * (already parsed); it is only consulted when ads-config.yml does not exist.
 */
export function loadAdsConfig(contentRoot: string | undefined, legacy: () => { present: boolean; settings: AdsSettings }): AdsConfigLoad {
  const key = rootOf(contentRoot);
  const file = adsConfigPath(contentRoot);
  const stamp = fileStamp(file);

  if (stamp === "missing") {
    const fb = legacy();
    return {
      settings: fb.settings,
      status: { status: "missing", source: fb.present ? "settings" : "defaults" },
    };
  }

  const cached = cache.get(key);
  if (cached && cached.stamp === stamp) return cached.load;

  const raw = readAdsConfigRaw(contentRoot);
  let load: AdsConfigLoad;
  if (raw.ok) {
    const settings = parseAdsSettings(raw.data);
    lastGood.set(key, settings);
    load = { settings, status: { status: "ok", source: "ads-config" } };
  } else {
    log.warn({ file, error: raw.error }, "[ads-config] ads-config.yml unreadable; keeping last good settings");
    load = {
      settings: lastGood.get(key) ?? parseAdsSettings(undefined),
      status: { status: "unreadable", source: lastGood.has(key) ? "ads-config" : "defaults", error: raw.error },
    };
  }
  cache.set(key, { stamp, load });
  return load;
}

const readErrorCache = new Map<string, { stamp: string; error: string | null }>();

/** Parse error when ads-config.yml exists but can't be read; null when missing or fine. Syncs skip on non-null. */
export function adsConfigReadError(contentRoot?: string): string | null {
  const file = adsConfigPath(contentRoot);
  const stamp = fileStamp(file);
  if (stamp === "missing") return null;
  const cached = readErrorCache.get(file);
  if (cached && cached.stamp === stamp) return cached.error;
  const raw = readAdsConfigRaw(contentRoot);
  const error = raw.ok ? null : raw.error;
  readErrorCache.set(file, { stamp, error });
  return error;
}

/** Writes the raw object (keys staff edit by hand, like utm_convention, must already be in `data`). */
export function writeAdsConfigRaw(data: Record<string, unknown>, contentRoot?: string): string {
  const file = adsConfigPath(contentRoot);
  const dumped = yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false });
  fs.writeFileSync(file, dumped.endsWith("\n") ? dumped : `${dumped}\n`, "utf-8");
  cache.delete(rootOf(contentRoot));
  return file;
}

export function resetAdsConfig(contentRoot?: string): void {
  if (contentRoot) {
    cache.delete(rootOf(contentRoot));
    lastGood.delete(rootOf(contentRoot));
  } else {
    cache.clear();
    lastGood.clear();
  }
}
