/**
 * Options for Settings → Ads → Meta "Conversions that count as leads": the standard Lead event plus
 * custom conversions each selected account can see (live from Meta, cached briefly; falls back to the
 * last sync's file), picked keys Meta no longer lists, and overlap between the picks on cached days.
 */

import { adsThresholds, META_STANDARD_LEAD_KEY, type AdsSettings } from "@shared/ads-settings";
import { fetchCustomConversions, isMetaTokenConfigured, type MetaCustomConversion } from "./meta-client";
import { addDays, loadMetaCustomConversions, loadMetaRows, utcDate } from "./meta-ads-days";
import { findConversionOverlaps, leadConversionName } from "./lead-conversion-issues";

const LIVE_TTL_MS = 5 * 60 * 1000;
const OVERLAP_WINDOW_DAYS = 28;

const liveCache = new Map<string, { at: number; conversions: MetaCustomConversion[] }>();

export function resetConversionOptionsCache(): void {
  liveCache.clear();
}

export type LeadConversionOption = {
  key: string;
  name: string;
  pixel_id: string | null;
  pixel_name: string | null;
  custom_event_type: string | null;
  last_fired_time: string | null;
  archived: boolean;
  /** Selected accounts that can see it. */
  accounts: string[];
  /** Selected, readable accounts that can't see it. */
  missing_accounts: string[];
};

export type LeadConversionOptions = {
  token_configured: boolean;
  options: LeadConversionOption[];
  accounts: Array<{ id: string; source: "live" | "cache" | "none"; error?: string }>;
  /** Picked keys no selected account lists (kept picked; shown as "no longer in Meta"). */
  unlisted_picked: Array<{ key: string; name: string }>;
  /** Pairs among `picked` that report on the same ad-days with near-equal counts (last 28 cached days). */
  overlaps: Array<{ keys: [string, string]; names: [string, string]; both_days_pct: number; count_diff_pct: number }>;
};

async function accountConversions(
  site: string,
  accountId: string,
  live: boolean,
): Promise<{ conversions: MetaCustomConversion[]; source: "live" | "cache" | "none"; error?: string }> {
  const cached = loadMetaCustomConversions(site).accounts[accountId];
  if (live) {
    const hit = liveCache.get(accountId);
    if (hit && Date.now() - hit.at < LIVE_TTL_MS) return { conversions: hit.conversions, source: "live" };
    try {
      const conversions = await fetchCustomConversions(accountId);
      liveCache.set(accountId, { at: Date.now(), conversions });
      return { conversions, source: "live" };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return cached && !cached.error ? { conversions: cached.conversions, source: "cache", error } : { conversions: [], source: "none", error };
    }
  }
  if (cached && !cached.error) return { conversions: cached.conversions, source: "cache" };
  return { conversions: [], source: "none", ...(cached?.error ? { error: cached.error } : {}) };
}

export async function listLeadConversionOptions(input: {
  site: string;
  settings: AdsSettings;
  accountIds: string[];
  /** Picks to check for overlap (the unsaved selection in the form); defaults to saved picks. */
  picked?: string[];
  now?: Date;
}): Promise<LeadConversionOptions> {
  const live = isMetaTokenConfigured();
  const perAccount = await Promise.all(input.accountIds.map(async (id) => ({ id, ...(await accountConversions(input.site, id, live)) })));
  const readable = perAccount.filter((a) => a.source !== "none").map((a) => a.id);
  const byKey = new Map<string, LeadConversionOption>();
  for (const a of perAccount) {
    for (const c of a.conversions) {
      let o = byKey.get(c.id);
      if (!o) {
        o = {
          key: c.id,
          name: c.name,
          pixel_id: c.pixel_id,
          pixel_name: c.pixel_name,
          custom_event_type: c.custom_event_type,
          last_fired_time: c.last_fired_time,
          archived: c.archived,
          accounts: [],
          missing_accounts: [],
        };
        byKey.set(c.id, o);
      }
      o.accounts.push(a.id);
      if (!c.archived) o.archived = false;
    }
  }
  for (const o of Array.from(byKey.values())) o.missing_accounts = readable.filter((id) => !o.accounts.includes(id));
  const standard: LeadConversionOption = {
    key: META_STANDARD_LEAD_KEY,
    name: leadConversionName(META_STANDARD_LEAD_KEY, new Map()),
    pixel_id: null,
    pixel_name: null,
    custom_event_type: "LEAD",
    last_fired_time: null,
    archived: false,
    accounts: readable,
    missing_accounts: [],
  };
  const custom = Array.from(byKey.values()).sort((x, y) => Number(x.archived) - Number(y.archived) || x.name.localeCompare(y.name));
  const names = new Map(custom.map((o) => [o.key, o.name]));
  for (const [id, entry] of Object.entries(loadMetaCustomConversions(input.site).accounts)) {
    if (input.accountIds.includes(id)) continue;
    for (const c of entry.conversions) if (!names.has(c.id)) names.set(c.id, c.name);
  }

  const saved = input.settings.meta.lead_conversions ?? [];
  const unlisted_picked =
    readable.length > 0
      ? saved.filter((k) => k !== META_STANDARD_LEAD_KEY && !byKey.has(k)).map((key) => ({ key, name: names.get(key) ?? key }))
      : [];

  const picked = input.picked ?? saved;
  let overlaps: LeadConversionOptions["overlaps"] = [];
  if (picked.length >= 2) {
    const end = addDays(utcDate(input.now ?? new Date()), -1);
    const rows = loadMetaRows(input.site, addDays(end, -(OVERLAP_WINDOW_DAYS - 1)), end, input.accountIds);
    overlaps = findConversionOverlaps(rows, picked, adsThresholds(input.settings)).map((o) => ({
      keys: o.keys,
      names: [leadConversionName(o.keys[0], names), leadConversionName(o.keys[1], names)],
      both_days_pct: o.both_days_pct,
      count_diff_pct: o.count_diff_pct,
    }));
  }

  return {
    token_configured: live,
    options: [standard, ...custom],
    accounts: perAccount.map((a) => ({ id: a.id, source: a.source, ...(a.error ? { error: a.error } : {}) })),
    unlisted_picked,
    overlaps,
  };
}
