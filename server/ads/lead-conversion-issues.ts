/**
 * Meta lead conversion checks: picked conversions that count the same lead twice,
 * pixel events that always fire together, and picked conversions Meta stopped reporting.
 * Inputs are local caches (day rows, custom conversions, pixel event stats) — no Meta calls.
 */

import type { AdsIssue, AdsIssueEvidence } from "@shared/ads-diagnostics-rules";
import { isExpectedEventPair, META_STANDARD_LEAD_KEY, type AdsAlertThresholds, type ExpectedEventPair } from "@shared/ads-settings";
import type { MetaAdCreativeInfo, MetaAdDayRow } from "./meta-client";
import type { MetaCustomConversionsFile, MetaPixelEventsFile } from "./meta-ads-days";

/** Fewer ad-days with results than this can't show a pattern. */
export const OVERLAP_MIN_AD_DAYS = 3;
/** Share of active hours with identical counts for two events to count as firing together. */
export const LOCKSTEP_HOUR_MATCH_PCT = 80;
const SKIPPED_EVENTS = new Set(["pageview"]);

const STANDARD_LEAD_NAME = "Standard Lead event";

export function leadConversionName(key: string, names: Map<string, string>): string {
  return key === META_STANDARD_LEAD_KEY ? STANDARD_LEAD_NAME : names.get(key) ?? key;
}

function diffPct(a: number, b: number): number {
  const max = Math.max(a, b);
  return max > 0 ? (Math.abs(a - b) / max) * 100 : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type ConversionOverlap = {
  keys: [string, string];
  counts: [number, number];
  ad_days: number;
  both_days_pct: number;
  count_diff_pct: number;
};

/** Pairs of picked conversions that report on the same ad-days with near-equal counts. */
export function findConversionOverlaps(
  rows: Array<Pick<MetaAdDayRow, "conversions" | "pixel_leads">>,
  picked: readonly string[],
  t: Pick<AdsAlertThresholds, "conversion_overlap_days_pct" | "conversion_overlap_count_pct">,
): ConversionOverlap[] {
  if (picked.length < 2) return [];
  const out: ConversionOverlap[] = [];
  const countOf = (r: Pick<MetaAdDayRow, "conversions" | "pixel_leads">, k: string) =>
    r.conversions ? (r.conversions[k] ?? 0) : null;
  for (let i = 0; i < picked.length; i++) {
    for (let j = i + 1; j < picked.length; j++) {
      const a = picked[i]!;
      const b = picked[j]!;
      let either = 0;
      let both = 0;
      let ta = 0;
      let tb = 0;
      for (const r of rows) {
        const ca = countOf(r, a);
        const cb = countOf(r, b);
        if (ca == null || cb == null) continue;
        if (ca <= 0 && cb <= 0) continue;
        either++;
        if (ca > 0 && cb > 0) both++;
        ta += ca;
        tb += cb;
      }
      if (either < OVERLAP_MIN_AD_DAYS) continue;
      const bothPct = (both / either) * 100;
      const diff = diffPct(ta, tb);
      if (bothPct >= t.conversion_overlap_days_pct && diff <= t.conversion_overlap_count_pct) {
        out.push({ keys: [a, b], counts: [ta, tb], ad_days: either, both_days_pct: round1(bothPct), count_diff_pct: round1(diff) });
      }
    }
  }
  return out;
}

/** Ads (with rows in the window) whose ad set optimizes for each lead key. */
function optimizedAdsByKey(rows: Array<Pick<MetaAdDayRow, "ad_id">>, creatives: Record<string, MetaAdCreativeInfo>): Map<string, number> {
  const seen = new Set<string>();
  const out = new Map<string, number>();
  for (const r of rows) {
    if (seen.has(r.ad_id)) continue;
    seen.add(r.ad_id);
    const k = creatives[r.ad_id]?.optimization_event;
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export function conversionOverlapIssues(input: {
  rows: MetaAdDayRow[];
  picked: readonly string[];
  names: Map<string, string>;
  creatives: Record<string, MetaAdCreativeInfo>;
  t: AdsAlertThresholds;
}): AdsIssue[] {
  const overlaps = findConversionOverlaps(input.rows, input.picked, input.t);
  if (overlaps.length === 0) return [];
  const optimized = optimizedAdsByKey(input.rows, input.creatives);
  return overlaps.map((o) => {
    const [a, b] = o.keys;
    const [na, nb] = [leadConversionName(a, input.names), leadConversionName(b, input.names)];
    const [oa, ob] = [optimized.get(a) ?? 0, optimized.get(b) ?? 0];
    // Keep what ad sets optimize for; with no signal, unpick the smaller count.
    const unpickB = oa !== ob ? oa > ob : o.counts[0] >= o.counts[1];
    const drop = unpickB ? b : a;
    const dropName = unpickB ? nb : na;
    const keepName = unpickB ? na : nb;
    const extra = Math.min(o.counts[0], o.counts[1]);
    const optimizedNote =
      oa + ob > 0
        ? `Your ad sets optimize for ${keepName} (${Math.max(oa, ob)} ad${Math.max(oa, ob) === 1 ? "" : "s"}), so keep that one.`
        : `No ad set optimizes for either, so we suggest keeping ${keepName} (the larger count).`;
    const evidence: AdsIssueEvidence = {
      kind: "conversion_overlap",
      conversions: [
        { key: a, name: na, count: o.counts[0], optimized_ads: oa },
        { key: b, name: nb, count: o.counts[1], optimized_ads: ob },
      ],
      ad_days: o.ad_days,
      both_days_pct: o.both_days_pct,
      count_diff_pct: o.count_diff_pct,
      estimated_extra: extra,
    };
    return {
      id: `lead_conversions_overlap:${[a, b].sort().join("|")}`,
      code: "lead_conversions_overlap",
      severity: "warning",
      title: `Meta may count the same lead twice: ${na} and ${nb}`,
      why: `Both picked conversions report on ${o.both_days_pct}% of the ad-days where either has results, with counts ${o.counts[0]} and ${o.counts[1]}. The Meta leads number adds them, so it is likely about ${extra} too high.`,
      how_to_fix: `${optimizedNote} Unpick ${dropName} in Settings → Ads → Meta (Conversions that count as leads).`,
      spend_affected: {},
      scope: {},
      site_fixable: false,
      action: {
        kind: "unpick_lead_conversion",
        label: `Unpick ${dropName}`,
        confirm: `Stop counting ${dropName} as a Meta lead? Every window is recalculated with the remaining picks. Nothing changes in Meta.`,
        conversion_key: drop,
        conversion_name: dropName,
      },
      evidence,
    } satisfies AdsIssue;
  });
}

/** Two events on one pixel with near-equal totals and identical counts in most active hours. */
export function pixelLockstepIssues(input: {
  pixels: MetaPixelEventsFile;
  expected: ExpectedEventPair[];
  t: Pick<AdsAlertThresholds, "lockstep_min_events" | "lockstep_count_pct">;
}): AdsIssue[] {
  const issues: AdsIssue[] = [];
  for (const [pixelId, px] of Object.entries(input.pixels.pixels)) {
    if (px.error) continue;
    const events = px.events.filter((e) => !SKIPPED_EVENTS.has(e.event.toLowerCase()) && e.total >= input.t.lockstep_min_events);
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const [ea, eb] = [events[i]!, events[j]!].sort((x, y) => x.event.localeCompare(y.event));
        if (isExpectedEventPair(input.expected, pixelId, ea.event, eb.event)) continue;
        const diff = diffPct(ea.total, eb.total);
        if (diff > input.t.lockstep_count_pct) continue;
        const hours = new Set([...Object.keys(ea.hourly), ...Object.keys(eb.hourly)]);
        let active = 0;
        let same = 0;
        for (const h of Array.from(hours)) {
          const [ca, cb] = [ea.hourly[h] ?? 0, eb.hourly[h] ?? 0];
          if (ca <= 0 && cb <= 0) continue;
          active++;
          if (ca === cb) same++;
        }
        if (active === 0) continue;
        const matchPct = (same / active) * 100;
        if (matchPct < LOCKSTEP_HOUR_MATCH_PCT) continue;
        const pixelName = px.name || pixelId;
        issues.push({
          id: `pixel_events_lockstep:${pixelId}:${ea.event}|${eb.event}`,
          code: "pixel_events_lockstep",
          severity: "warning",
          title: `${ea.event} and ${eb.event} always fire together on ${pixelName}`,
          why: `Over the last 7 days ${ea.event} fired ${ea.total} times and ${eb.event} ${eb.total} times, with identical counts in ${round1(matchPct)}% of active hours. Usually one Tag Manager trigger fires both tags, so every form counts as both events.`,
          how_to_fix:
            "In Tag Manager, give each Meta tag its own trigger condition (the site pushes one dataLayer event per form, with its conversion name). If both events are meant to fire together, mark the pair as expected.",
          spend_affected: {},
          scope: {},
          site_fixable: false,
          action: {
            kind: "mark_expected_event_pair",
            label: "Mark as expected",
            confirm: `Stop flagging ${ea.event} + ${eb.event} on ${pixelName}? Saved in Settings → Ads → Meta; nothing changes in Meta or Tag Manager.`,
            pixel_id: pixelId,
            events: [ea.event, eb.event],
          },
          evidence: {
            kind: "event_lockstep",
            pixel_id: pixelId,
            pixel_name: pixelName,
            since: input.pixels.since,
            events: [
              { event: ea.event, total: ea.total },
              { event: eb.event, total: eb.total },
            ],
            hours_compared: active,
            hours_matching_pct: round1(matchPct),
            count_diff_pct: round1(diff),
          },
        });
      }
    }
  }
  return issues;
}

export type StoppedConversion = { key: string; name: string; reason: "missing" | "archived" | "not_shared"; accounts: string[] };

/** Picked custom conversions Meta no longer lists, archived, or not shared with a selected account that has spend. */
export function findStoppedConversions(input: {
  picked: readonly string[];
  customConversions: MetaCustomConversionsFile;
  accountIds: readonly string[];
  accountsWithSpend: ReadonlySet<string>;
}): StoppedConversion[] {
  const readable = input.accountIds.filter((id) => {
    const a = input.customConversions.accounts[id];
    return a && !a.error;
  });
  if (readable.length === 0) return [];
  const out: StoppedConversion[] = [];
  for (const key of input.picked) {
    if (key === META_STANDARD_LEAD_KEY) continue;
    const hits = readable
      .map((id) => ({ id, c: input.customConversions.accounts[id]!.conversions.find((x) => x.id === key) }))
      .filter((h) => !!h.c);
    const name = hits[0]?.c?.name ?? key;
    if (hits.length === 0) {
      out.push({ key, name, reason: "missing", accounts: [] });
      continue;
    }
    if (hits.every((h) => h.c!.archived)) {
      out.push({ key, name, reason: "archived", accounts: [] });
      continue;
    }
    const seen = new Set(hits.map((h) => h.id));
    const unshared = readable.filter((id) => !seen.has(id) && input.accountsWithSpend.has(id));
    if (unshared.length > 0) out.push({ key, name, reason: "not_shared", accounts: unshared });
  }
  return out;
}

export function conversionStoppedIssues(input: {
  stopped: StoppedConversion[];
  accountNames: Record<string, string | undefined>;
}): AdsIssue[] {
  return input.stopped.map((s) => {
    const accountList = s.accounts.map((id) => input.accountNames[id] || id).join(", ");
    const why =
      s.reason === "missing"
        ? `${s.name} is picked as a lead conversion, but none of the selected ad accounts list it anymore. It now adds 0 to the Meta leads number.`
        : s.reason === "archived"
          ? `${s.name} is picked as a lead conversion, but it is archived in Meta. Archived conversions stop reporting new results.`
          : `${s.name} is picked as a lead conversion, but ${accountList} can't see it, so leads from those ads are not counted.`;
    const how =
      s.reason === "not_shared"
        ? `In Meta Events Manager, share the conversion's pixel with ${accountList}, or pick a conversion those accounts can see.`
        : "Restore it in Meta Events Manager, or pick the conversion that replaced it in Settings → Ads → Meta.";
    return {
      id: `lead_conversion_stopped:${s.key}`,
      code: "lead_conversion_stopped",
      severity: "warning",
      title: `Picked lead conversion ${s.reason === "not_shared" ? "not shared" : "stopped reporting"}: ${s.name}`,
      why,
      how_to_fix: how,
      spend_affected: {},
      scope: s.accounts.length === 1 ? { account_id: s.accounts[0] } : {},
      site_fixable: false,
      ...(s.reason !== "not_shared"
        ? {
            action: {
              kind: "unpick_lead_conversion" as const,
              label: `Unpick ${s.name}`,
              confirm: `Stop counting ${s.name} as a Meta lead? Every window is recalculated with the remaining picks. Nothing changes in Meta.`,
              conversion_key: s.key,
              conversion_name: s.name,
            },
          }
        : {}),
      evidence: { kind: "conversion_stopped", conversion_key: s.key, conversion_name: s.name, reason: s.reason, accounts: s.accounts },
    } satisfies AdsIssue;
  });
}
