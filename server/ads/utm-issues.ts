/**
 * utm_* issues: UTM values outside the convention (ads-config.yml → utm_convention) or the GA4
 * standard. Evidence comes from declared tags (Meta url_tags / Google final URL suffix), GA4
 * paid-landing visits and lead records over the issue window, merged into one issue per
 * campaign and code. Rules are pure in shared/ads-diagnostics-rules.ts (`utmViolations`).
 */

import {
  isUtmMacro,
  unrecognizedCampaignKey,
  utmIssueSeverity,
  utmViolations,
  type AdsGa4SeenRow,
  type AdsIssue,
  type AdsIssueAd,
  type AdsIssueDetails,
  type AdsUtmValue,
  type UtmGrace,
  type UtmIssueCode,
  type UtmViolation,
} from "@shared/ads-diagnostics-rules";
import { isKnownExternalCampaign, type AdsAlertThresholds, type KnownExternalCampaign, type UtmConvention } from "@shared/ads-settings";
import { classifyTraffic, type AdPlatform } from "@shared/paid-traffic";
import { EXPECTED_PAID_CHANNELS, ga4ChannelFor, GA4_PAID_MEDIUM_RE } from "@shared/utm-standards";
import { listLedgerRows } from "./lead-ledger";
import { loadPaidLandingDays } from "./paid-detection";

type Money = Record<string, number>;

/** Paid visits (GA4) and leads (ledger) sharing one set of UTM values. */
export type ObservedUtmGroup = {
  platform: AdPlatform | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  utm_id: string | null;
  utm_term: string | null;
  utm_content: string | null;
  visits: number;
  leads: number;
  first_seen: string;
  last_seen: string;
};

const GA4_EMPTY = new Set(["(direct)", "(none)", "(not set)", ""]);

function tag(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return GA4_EMPTY.has(s) ? null : s;
}

function groupKey(g: Pick<ObservedUtmGroup, "platform" | "source" | "medium" | "campaign" | "utm_id" | "utm_term">): string {
  return [g.platform ?? "", g.source ?? "", g.medium ?? "", g.campaign ?? "", g.utm_id ?? "", g.utm_term ? "t" : ""].join("\u0001");
}

/** Paid GA4 visits + non-test ledger leads with any UTM tag, grouped by their UTM values. */
export function loadObservedUtmGroups(site: string, since: string, until: string): ObservedUtmGroup[] {
  const groups = new Map<string, ObservedUtmGroup>();
  const add = (g: Omit<ObservedUtmGroup, "visits" | "leads" | "first_seen" | "last_seen">, date: string, visits: number, leads: number) => {
    if (!g.source && !g.medium && !g.campaign && !g.utm_id && !g.utm_term && !g.utm_content) return;
    const k = groupKey(g);
    const cur = groups.get(k) ?? { ...g, visits: 0, leads: 0, first_seen: date, last_seen: date };
    cur.visits += visits;
    cur.leads += leads;
    if (date < cur.first_seen) cur.first_seen = date;
    if (date > cur.last_seen) cur.last_seen = date;
    groups.set(k, cur);
  };

  for (const day of loadPaidLandingDays(site, since, until)) {
    for (const c of day.candidates) {
      const source = tag(c.source);
      const medium = tag(c.medium);
      const cls = classifyTraffic({ utm_source: source, utm_medium: medium, click_ids: c.click_id_type ? { [c.click_id_type]: "1" } : undefined });
      if (cls.status !== "paid") continue;
      add(
        {
          platform: cls.platform,
          source,
          medium,
          // GA4 fills the campaign from the Google Ads link when the URL had none; that's not a UTM value.
          campaign: source || medium ? tag(c.campaign) : null,
          utm_id: tag(c.utm_id),
          utm_term: tag(c.utm_term),
          utm_content: tag(c.utm_content),
        },
        day.date,
        c.sessions,
        0,
      );
    }
  }

  let rows: ReturnType<typeof listLedgerRows> = [];
  try {
    rows = listLedgerRows(site, Date.parse(`${since}T00:00:00Z`));
  } catch {
    /* ledger optional */
  }
  const untilMs = Date.parse(`${until}T23:59:59.999Z`);
  for (const r of rows) {
    if (r.is_test || !r.platform || r.created_at > untilMs) continue;
    add(
      {
        platform: r.platform as AdPlatform,
        source: tag(r.utm_source),
        medium: tag(r.utm_medium),
        campaign: tag(r.utm_campaign),
        utm_id: tag(r.campaign_id),
        utm_term: tag(r.utm_term),
        utm_content: tag(r.utm_content),
      },
      new Date(r.created_at).toISOString().slice(0, 10),
      0,
      1,
    );
  }
  return Array.from(groups.values());
}

/** One declared tag set: a Meta ad's link + URL parameters, or a Google campaign's final URL suffix. */
export type DeclaredUtm = {
  campaign_id: string;
  campaign_name: string;
  account_id?: string;
  params: Record<string, string>;
  spend: Money;
  /** Meta ad behind these tags (evidence + Fix via Meta). */
  ad?: AdsIssueAd;
};

type Acc = {
  code: UtmIssueCode;
  key: string;
  campaign_id: string | null;
  campaign_name: string;
  accounts: Set<string>;
  spend: Money;
  ads: Map<string, AdsIssueAd>;
  values: Map<string, AdsUtmValue>;
  visits: number;
  leads: number;
  seen: AdsGa4SeenRow[];
  graceOnly: boolean;
  trafficPlatform: string | null;
  channel: string | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  microsoft: "Microsoft",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
  other: "Other",
};

function addMoney(into: Money, from: Money): void {
  for (const [c, v] of Object.entries(from)) into[c] = Math.round(((into[c] ?? 0) + v) * 100) / 100;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** GA4 channel these values land in when it isn't one the platform expects (null = fine / unknown). */
function channelEffect(platform: string | null, source: string | null, medium: string | null): string | null {
  if (!source || !medium || isUtmMacro(source) || isUtmMacro(medium)) return null;
  const channel = ga4ChannelFor(source, medium);
  const expected = platform ? EXPECTED_PAID_CHANNELS[platform as AdPlatform] : undefined;
  if (expected) return expected.includes(channel) ? null : channel;
  return channel.startsWith("Paid") || channel === "Display" ? null : channel;
}

function copyFor(a: Acc, convention: UtmConvention, platformLabel: string, metaDeclared: boolean): { title: string; why: string; how_to_fix: string; rule: string } {
  const vals = Array.from(a.values.values());
  const first = vals[0]!;
  const list = vals
    .slice(0, 4)
    .map((v) => `${v.param}=${v.value || "(empty)"}`)
    .join(", ");
  const more = vals.length > 4 ? ` and ${vals.length - 4} more` : "";
  const where = [a.ads.size > 0 ? plural(a.ads.size, "ad") : null, a.visits > 0 ? plural(a.visits, "paid visit") : null, a.leads > 0 ? plural(a.leads, "lead") : null]
    .filter(Boolean)
    .join(", ");
  const seenOn = where ? ` (${where})` : "";
  const channel = a.channel ? ` GA4 files these visits as ${a.channel}.` : "";
  const template = platformLabel === "Google" ? "the URL suffix in Settings → Ads → Google Ads" : "the URL parameters template in Settings → Ads";
  const fixVia = metaDeclared ? " Staff with Edit live ads can use Fix via Meta here." : "";
  const name = a.campaign_name;
  switch (a.code) {
    case "utm_unfilled_macro":
      return {
        title: `Tracking placeholder reached GA4 unfilled: ${name}`,
        why: `GA4 received ${list}${more} literally${seenOn}. The ad platform didn't fill in the placeholder, so these visits carry no usable value.`,
        how_to_fix: `Check the placeholder spelling (Meta uses {{...}}, Google uses {...}) or paste ${template}.`,
        rule: "Placeholders must be filled by the ad platform before the click reaches the site.",
      };
    case "utm_case_mixed":
      return {
        title: `Tracking values in mixed case: ${name}`,
        why: `${list}${more}${seenOn} uses capital letters. GA4 treats ${first.value} and ${first.expected} as different values, so this traffic is split across report rows.`,
        how_to_fix: `Use lowercase (${first.param}=${first.expected}).${fixVia}`,
        rule: "utm_source and utm_medium are lowercase (ads-config.yml → utm_convention.case).",
      };
    case "utm_bad_chars":
      return {
        title: `Tracking values with spaces or odd characters: ${name}`,
        why: `${list}${more}${seenOn} has spaces or symbols, which browsers and tools encode differently, so reports split the same traffic.`,
        how_to_fix: `Use ${first.param}=${first.expected}.${fixVia}`,
        rule: "utm_source and utm_medium use only letters, numbers, _, -, . and +.",
      };
    case "utm_medium_nonstandard":
      return {
        title: `Medium GA4 doesn't count as paid: ${name}`,
        why: `We count ${list}${more} as paid${seenOn}, but GA4's channel rules don't, so GA4 reports put this spend's visits outside its paid channels.${channel}`,
        how_to_fix: `Use utm_medium=${first.expected ?? "cpc"} (any medium matching ${GA4_PAID_MEDIUM_RE.source} is paid in GA4).${fixVia}`,
        rule: `GA4 counts a medium as paid when it matches ${GA4_PAID_MEDIUM_RE.source} (or is display, banner, expandable, interstitial or cpm).`,
      };
    case "utm_source_alias":
      return {
        title: `Source outside the UTM convention: ${name}`,
        why: `The convention expects utm_source ${first.expected} for ${platformLabel}, but ${list}${more} was used${seenOn}. Reports count it as a separate source.${channel}`,
        how_to_fix: `Use ${template}.${fixVia}`,
        rule: `ads-config.yml → utm_convention.sources lists the correct values per platform.`,
      };
    case "utm_medium_off_convention":
      return {
        title: `Medium outside the UTM convention: ${name}`,
        why: `GA4 counts ${list}${more} as paid${seenOn}, but the convention uses utm_medium=${first.expected} for ${platformLabel}, so reports split this traffic.`,
        how_to_fix: `Use ${template}.${fixVia}`,
        rule: "ads-config.yml → utm_convention.mediums sets one medium per platform.",
      };
    case "utm_campaign_pattern":
      return {
        title: `Campaign name doesn't match the pattern: ${name}`,
        why: `${list}${more}${seenOn} doesn't match the naming pattern ${convention.campaign_pattern}.`,
        how_to_fix: "Rename the campaign to follow the pattern, or update campaign_pattern in ads-config.yml.",
        rule: "ads-config.yml → utm_convention.campaign_pattern.",
      };
    case "utm_missing_ids":
      return {
        title: `Tracking ids missing: ${name}`,
        why: `${platformLabel} traffic${seenOn} is tagged without numeric ${Array.from(new Set(vals.map((v) => v.param))).join(" / ")}, so visits can't be matched to a campaign or ad group when GA4 isn't linked to Google Ads.`,
        how_to_fix: `Use ${template}.`,
        rule: "Google traffic carries utm_id={campaignid} and utm_term={adgroupid} (ads-config.yml → utm_convention.require_ids).",
      };
  }
}

export type UtmIssueInput = {
  /** Owner of the issues (validator platform). */
  platform: "meta" | "google" | "shared";
  convention: UtmConvention;
  grace: UtmGrace;
  declared: DeclaredUtm[];
  observed: ObservedUtmGroup[];
  totalSpend: Money;
  t: AdsAlertThresholds;
  /** Known external campaigns for this platform (info only, like `exceptions`). */
  known: KnownExternalCampaign[];
  /** Campaign ids with a non_paid_medium issue (medium codes are skipped there). */
  nonPaidCampaigns?: Set<string>;
  detailsFor?: (ads: AdsIssueAd[]) => AdsIssueDetails;
};

const MEDIUM_CODES = new Set<UtmIssueCode>(["utm_medium_nonstandard", "utm_medium_off_convention"]);
const MAX_SEEN_ROWS = 10;

export function utmIssues(input: UtmIssueInput): AdsIssue[] {
  const { convention, grace, t } = input;
  const accs = new Map<string, Acc>();
  const declaredNames = new Map(input.declared.map((d) => [d.campaign_id, d.campaign_name]));

  const accFor = (code: UtmIssueCode, key: string, campaignId: string | null, name: string, trafficPlatform: string | null): Acc => {
    const id = `${code}|${key}`;
    let a = accs.get(id);
    if (!a) {
      a = {
        code,
        key,
        campaign_id: campaignId,
        campaign_name: name,
        accounts: new Set(),
        spend: {},
        ads: new Map(),
        values: new Map(),
        visits: 0,
        leads: 0,
        seen: [],
        graceOnly: true,
        trafficPlatform,
        channel: null,
      };
      accs.set(id, a);
    }
    return a;
  };
  const addValue = (a: Acc, v: UtmViolation, from: "setup" | "ga4" | "leads", visits: number, leads: number) => {
    const k = `${v.param}=${v.value}`;
    const cur = a.values.get(k) ?? { param: v.param, value: v.value, expected: v.expected, seen_in: [], visits: 0, leads: 0, ads: 0 };
    if (!cur.seen_in.includes(from)) cur.seen_in.push(from);
    cur.visits += visits;
    cur.leads += leads;
    if (from === "setup") cur.ads += 1;
    if (v.in_grace) cur.in_grace = true;
    else a.graceOnly = false;
    a.values.set(k, cur);
  };
  const skip = (code: UtmIssueCode, campaignId: string | null) => MEDIUM_CODES.has(code) && !!campaignId && !!input.nonPaidCampaigns?.has(campaignId);

  const ownPlatform = input.platform === "shared" ? null : input.platform;
  for (const d of input.declared) {
    const violations = utmViolations({ params: d.params, platform: ownPlatform, convention, grace, kind: "declared" });
    const spendCounted = new Set<string>();
    for (const v of violations) {
      if (skip(v.code, d.campaign_id)) continue;
      const a = accFor(v.code, d.campaign_id, d.campaign_id, d.campaign_name, ownPlatform);
      addValue(a, v, "setup", 0, 0);
      if (d.account_id) a.accounts.add(d.account_id);
      const adKey = d.ad?.ad_id ?? d.campaign_id;
      if (!spendCounted.has(`${v.code}|${adKey}`) && !a.ads.has(adKey)) {
        addMoney(a.spend, d.spend);
        spendCounted.add(`${v.code}|${adKey}`);
      }
      if (d.ad) a.ads.set(d.ad.ad_id, d.ad);
      a.channel ??= channelEffect(ownPlatform, d.params.utm_source ?? null, d.params.utm_medium ?? null);
    }
  }

  for (const g of input.observed) {
    const params = { utm_source: g.source, utm_medium: g.medium, utm_campaign: g.campaign, utm_id: g.utm_id, utm_term: g.utm_term, utm_content: g.utm_content };
    const violations = utmViolations({ params, platform: g.platform, convention, grace, kind: "observed" });
    if (violations.length === 0) continue;
    const ck = unrecognizedCampaignKey({ utm_id: g.utm_id, campaign: g.campaign });
    const campaignId = ck?.campaign_id ?? null;
    const key = (campaignId && declaredNames.has(campaignId) ? campaignId : ck?.key) ?? "(no campaign)";
    const name = (campaignId && declaredNames.get(campaignId)) || ck?.campaign_name || "(no campaign tag)";
    const from: "ga4" | "leads" = g.visits > 0 ? "ga4" : "leads";
    const seen = new Set<UtmIssueCode>();
    for (const v of violations) {
      if (skip(v.code, campaignId)) continue;
      const fullKey = input.platform === "shared" ? `${g.platform ?? "other"}:${key}` : key;
      const a = accFor(v.code, fullKey, campaignId, name, g.platform);
      addValue(a, v, from, g.visits, g.leads);
      if (g.leads > 0 && from === "ga4") {
        const val = a.values.get(`${v.param}=${v.value}`)!;
        if (!val.seen_in.includes("leads")) val.seen_in.push("leads");
      }
      a.channel ??= channelEffect(g.platform, g.source, g.medium);
      if (seen.has(v.code)) continue;
      seen.add(v.code);
      a.visits += g.visits;
      a.leads += g.leads;
      if (g.visits > 0) {
        a.seen.push({
          platform: g.platform,
          source: g.source ?? "",
          medium: g.medium ?? "",
          campaign: g.campaign ?? "",
          campaign_id: g.utm_id,
          adset_id: g.utm_term,
          ad_id: g.utm_content,
          visits: g.visits,
          leads: g.leads,
          first_seen: g.first_seen,
          last_seen: g.last_seen,
        });
      }
    }
  }

  const exceptions = [...convention.exceptions, ...input.known];
  const out: AdsIssue[] = [];
  for (const a of Array.from(accs.values())) {
    const excepted = isKnownExternalCampaign(exceptions, a.key) || (!!a.campaign_id && isKnownExternalCampaign(exceptions, a.campaign_id)) || isKnownExternalCampaign(exceptions, a.campaign_name);
    const severity = utmIssueSeverity(a.code, { spend: a.spend, totalSpend: input.totalSpend, visits: a.visits, inGrace: a.graceOnly, excepted }, t);
    if (!severity) continue;
    const platformLabel = PLATFORM_LABEL[a.trafficPlatform ?? ""] ?? "this platform";
    const metaDeclared = input.platform === "meta" && a.ads.size > 0;
    const copy = copyFor(a, convention, platformLabel, metaDeclared);
    const ads = Array.from(a.ads.values()).sort((x, y) => sum(y.spend) - sum(x.spend) || x.ad_id.localeCompare(y.ad_id));
    const values = Array.from(a.values.values()).sort((x, y) => y.visits - x.visits || y.ads - x.ads);
    const base: AdsIssueDetails = input.detailsFor ? input.detailsFor(ads) : { ads, ads_total: ads.length, ads_offset: 0 };
    const details: AdsIssueDetails = {
      ...base,
      ...(a.seen.length > 0
        ? { ga4_seen: a.seen.sort((x, y) => y.visits - x.visits).slice(0, MAX_SEEN_ROWS), ga4_totals: { visits: a.visits, leads: a.leads } }
        : {}),
      utm: {
        params: Array.from(new Set(values.map((v) => v.param))),
        values,
        ga4_channel: a.channel,
        rule: copy.rule,
        visits: a.visits,
        leads: a.leads,
      },
    };
    const graceNote = a.graceOnly && grace.ends_at ? ` These values were correct before the convention changed; they're accepted until ${grace.ends_at.slice(0, 10)}.` : "";
    const exceptNote = excepted ? " This campaign is listed as an exception, so it's info only." : "";
    const idKey = input.platform === "google" ? `google:${a.key}` : a.key;
    out.push({
      id: `${a.code}:${idKey}`,
      code: a.code,
      platform: input.platform,
      severity,
      title: copy.title,
      why: `${copy.why}${graceNote}${exceptNote}`,
      how_to_fix: copy.how_to_fix,
      spend_affected: a.spend,
      scope: {
        ...(a.campaign_id ? { campaign_id: a.campaign_id } : {}),
        campaign_name: a.campaign_name,
        ...(a.accounts.size === 1 ? { account_id: Array.from(a.accounts)[0] } : {}),
      },
      site_fixable: false,
      details,
      ...(a.graceOnly && grace.active ? { in_grace: true, ...(grace.ends_at ? { grace_ends_at: grace.ends_at } : {}) } : {}),
    });
  }
  return out;
}

function sum(m: Money): number {
  return Object.values(m).reduce((s, v) => s + v, 0);
}
