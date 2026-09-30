/**
 * Paid-traffic report: joins Meta ad days (spend/clicks/Meta leads), GA4
 * paid-landing days (visits/engagement/GA4 leads) and credited ledger leads
 * (unique leads/submissions) per landing page. Totals are per currency — never
 * summed across currencies. Meta and site lead counts are never added together.
 */

import { getSiteConfigs } from "../site-config";
import { getAdsSettings } from "../settings";
import { loadSeoIndex, type SeoIndex } from "../seo-index";
import { lookupRedirect } from "../redirects";
import { child } from "../logger";
import { classifyTraffic, normalizeLandingPath, type AdPlatform } from "@shared/paid-traffic";
import {
  creditLead,
  coveredDays,
  isLowSample,
  landingKey,
  totalsByLanding,
  type AttributionModel,
} from "@shared/paid-attribution";
import type { AdsAlertThresholds } from "@shared/ads-settings";
import { addDays, loadMetaCreatives, loadMetaRows, loadMetaState, utcDate } from "./meta-ads-days";
import type { MetaAdDayRow } from "./meta-client";
import { isGa4Configured, loadPaidLandingDays, loadPaidLandingState, type PaidLandingCandidateRow } from "./paid-detection";
import { ledgerCollectingSince, listLedgerRows, type LedgerRow } from "./lead-ledger";
import { listConsentDaily, summarizeConsentRates } from "./consent-store";
import { isAdsRefreshing, isMetaConnected, triggerAdsRefreshIfStale } from "./ads-refresh";

const log = child({ module: "ads/ads-report" });

export const ADS_REPORT_MAX_DAYS = 90;

export type AdsReportOpts = {
  site: string;
  contentRoot?: string;
  days?: number;
  platform?: AdPlatform | "all";
  currency?: string | null;
  account?: string | null;
  content_type?: string | null;
  model?: AttributionModel;
  split_by_version?: boolean;
  /** Skip the stale-read refresh trigger (tests / diagnostics fan-out). */
  noRefresh?: boolean;
  now?: Date;
};

export type DestinationKind = "entry" | "instant_form" | "off_site" | "other_site" | "missing_page" | "unknown_destination";

export type MoneyByCurrency = Record<string, number>;

export type AdsVersionRow = {
  variant: string;
  paid_visits: number;
  unique_leads: number;
  submissions: number;
  conversion_rate: number | null;
  low_sample: boolean;
};

export type AdsCampaignRef = {
  platform: AdPlatform | null;
  campaign_id: string | null;
  campaign_name: string;
  paid_visits: number;
  spend: MoneyByCurrency;
};

export type AdsPageRow = {
  key: string;
  kind: DestinationKind;
  kind_label: string;
  host: string;
  path: string;
  url: string;
  content_type: string | null;
  slug: string | null;
  locale: string | null;
  title: string;
  redirected_from: string[];
  paid_visits: number;
  unclear_visits: number;
  engaged_sessions: number;
  bounce_rate: number | null;
  avg_engaged_seconds: number | null;
  ga4_leads: number;
  spend: MoneyByCurrency;
  clicks: number;
  landing_page_views: number;
  meta_leads: number;
  instant_form_leads: number;
  unique_leads: number;
  submissions: number;
  repeat_submissions: number;
  last_visit_organic: number;
  started_here: number;
  closed_here: number;
  conversion_rate: number | null;
  cost_per_visit: MoneyByCurrency;
  cost_per_lead: MoneyByCurrency;
  clicks_to_visits: number | null;
  organic: { sessions: number; bounce_rate: number | null; lead_rate: number | null } | null;
  low_sample: boolean;
  platforms: AdPlatform[];
  campaigns: AdsCampaignRef[];
  versions?: AdsVersionRow[];
};

export type AdsCampaignGroup = {
  key: string;
  platform: AdPlatform | null;
  campaign_id: string | null;
  campaign_name: string;
  spend: MoneyByCurrency;
  clicks: number;
  meta_leads: number;
  paid_visits: number;
  pages: Array<{ key: string; title: string; path: string; paid_visits: number }>;
};

export type AdsWarning = { code: string; message: string };

export type AdsReport = {
  window: { start: string; end: string; days: number };
  platform: AdPlatform | "all";
  attribution: { model: AttributionModel; lookback_days: 30; basis: "browser_observed" };
  meta: {
    connected: boolean;
    last_synced_at: string | null;
    last_error: string | null;
    consecutive_failures: number;
    accounts: Array<{ id: string; name?: string; currency?: string }>;
  };
  ga4: { configured: boolean; last_synced_at: string | null; last_export_date: string | null; last_error: string | null };
  refreshing: boolean;
  collecting_since: string | null;
  covered_days: { covered: number; total: number };
  consent: { mode: "advanced"; ask_region_reject_pct: number | null; ask_region_shown: number };
  totals: {
    spend: MoneyByCurrency;
    tracked_spend: MoneyByCurrency;
    clicks: number;
    landing_page_views: number;
    paid_visits: number;
    unclear_visits: number;
    meta_leads: number;
    instant_form_leads: number;
    ga4_leads: number;
    unique_leads: number;
    submissions: number;
    repeat_submissions: number;
    test_submissions: number;
  };
  pages: AdsPageRow[];
  destinations: AdsPageRow[];
  campaigns: AdsCampaignGroup[];
  thresholds: AdsAlertThresholds;
  warnings: AdsWarning[];
};

type Agg = {
  row: AdsPageRow;
  engagementMs: number;
  organicSessions: number;
  organicEngaged: number;
  organicWithLead: number;
  campaigns: Map<string, AdsCampaignRef>;
  platforms: Set<AdPlatform>;
  versions: Map<string, { paid_visits: number; unique_leads: number; submissions: number }>;
};

function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 28;
  return Math.min(ADS_REPORT_MAX_DAYS, Math.max(1, Math.floor(n)));
}

function addMoney(target: MoneyByCurrency, currency: string, amount: number): void {
  if (!currency || !amount) return;
  target[currency] = Math.round(((target[currency] ?? 0) + amount) * 100) / 100;
}

function divMoney(money: MoneyByCurrency, denom: number): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  if (denom <= 0) return out;
  for (const [c, v] of Object.entries(money)) out[c] = Math.round((v / denom) * 100) / 100;
  return out;
}

function humanizeSlug(slug: string): string {
  const s = slug.replace(/[-_]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : slug;
}

function parseUrl(raw: string): { host: string; path: string } | null {
  try {
    const u = new URL(raw);
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: normalizeLandingPath(u.pathname) };
  } catch {
    return null;
  }
}

type HostSets = { own: Set<string>; primary: string; sister: Set<string> };

function hostSets(site: string): HostSets {
  const own = new Set<string>();
  const sister = new Set<string>();
  let primary = "";
  for (const cfg of getSiteConfigs()) {
    const hosts = [cfg.domain, ...(cfg.aliases ?? [])].map((h) => h.toLowerCase().replace(/^www\./, ""));
    if (cfg.contentFolder === site) {
      primary = hosts[0] ?? "";
      hosts.forEach((h) => own.add(h));
    } else {
      hosts.forEach((h) => sister.add(h));
    }
  }
  const siteUrl = process.env.SITE_URL ? parseUrl(process.env.SITE_URL) : null;
  if (siteUrl?.host) own.add(siteUrl.host);
  return { own, primary, sister };
}

type Resolved = {
  kind: DestinationKind;
  key: string;
  host: string;
  path: string;
  content_type: string | null;
  slug: string | null;
  locale: string | null;
  redirected_from?: string;
};

export const DESTINATION_LABELS: Record<DestinationKind, string> = {
  entry: "Page",
  instant_form: "Instant form",
  off_site: "Off-site",
  other_site: "Another of our sites",
  missing_page: "Page no longer exists or isn't managed here",
  unknown_destination: "Destination unknown",
};

function makeResolver(index: SeoIndex, hosts: HostSets) {
  const cache = new Map<string, Resolved>();
  const byPath = new Map<string, string>();
  for (const [p, id] of Object.entries(index.by_path)) byPath.set(normalizeLandingPath(p).toLowerCase(), id);

  const entryFor = (p: string) => {
    const id = byPath.get(normalizeLandingPath(p).toLowerCase());
    return id ? index.entries[id] : undefined;
  };

  return (hostRaw: string, pathRaw: string): Resolved => {
    const host = (hostRaw || hosts.primary).toLowerCase().replace(/^www\./, "");
    const p = normalizeLandingPath(pathRaw || "/");
    const cacheKey = `${host}|${p}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    let out: Resolved;
    const base = { host, path: p, content_type: null, slug: null, locale: null };
    if (host && !hosts.own.has(host) && hosts.own.size > 0) {
      out = { ...base, kind: hosts.sister.has(host) ? "other_site" : "off_site", key: `dest:${host}|${p}` };
    } else {
      let entry = entryFor(p);
      let redirectedFrom: string | undefined;
      if (!entry) {
        const redirect = lookupRedirect(p);
        const to = redirect ? (typeof redirect.to === "string" ? redirect.to : Object.values(redirect.to)[0]) : null;
        if (to) {
          const target = to.startsWith("http") ? parseUrl(to) : { host, path: normalizeLandingPath(to) };
          if (target) {
            entry = entryFor(target.path);
            if (entry) redirectedFrom = p;
          }
        }
      }
      out = entry
        ? {
            kind: "entry",
            key: `entry:${entry.content_type}/${entry.slug}/${entry.locale}`,
            host,
            path: normalizeLandingPath(entry.path || p),
            content_type: entry.content_type,
            slug: entry.slug,
            locale: entry.locale,
            redirected_from: redirectedFrom,
          }
        : { ...base, kind: "missing_page", key: `dest:${host}|${p}` };
    }
    cache.set(cacheKey, out);
    return out;
  };
}

function emptyRow(r: Resolved, primaryHost: string): AdsPageRow {
  const title =
    r.kind === "entry" && r.slug
      ? humanizeSlug(r.slug)
      : r.kind === "instant_form"
        ? "Instant form"
        : r.kind === "unknown_destination"
          ? "Destination unknown"
          : r.path;
  return {
    key: r.key,
    kind: r.kind,
    kind_label: DESTINATION_LABELS[r.kind],
    host: r.host,
    path: r.path,
    url: r.host ? `https://${r.host}${r.path}` : r.path,
    content_type: r.content_type,
    slug: r.slug,
    locale: r.locale,
    title: title || primaryHost,
    redirected_from: r.redirected_from ? [r.redirected_from] : [],
    paid_visits: 0,
    unclear_visits: 0,
    engaged_sessions: 0,
    bounce_rate: null,
    avg_engaged_seconds: null,
    ga4_leads: 0,
    spend: {},
    clicks: 0,
    landing_page_views: 0,
    meta_leads: 0,
    instant_form_leads: 0,
    unique_leads: 0,
    submissions: 0,
    repeat_submissions: 0,
    last_visit_organic: 0,
    started_here: 0,
    closed_here: 0,
    conversion_rate: null,
    cost_per_visit: {},
    cost_per_lead: {},
    clicks_to_visits: null,
    organic: null,
    low_sample: true,
    platforms: [],
    campaigns: [],
  };
}

function classifyCandidate(c: PaidLandingCandidateRow, known: { campaigns: Set<string>; adsets: Set<string>; ads: Set<string> }) {
  const matches =
    (!!c.utm_id && known.campaigns.has(c.utm_id)) ||
    (!!c.utm_term && known.adsets.has(c.utm_term)) ||
    (!!c.utm_content && known.ads.has(c.utm_content));
  return classifyTraffic({
    utm_source: c.source === "(direct)" ? null : c.source,
    utm_medium: c.medium === "(none)" ? null : c.medium,
    click_ids: c.click_id_type ? { [c.click_id_type]: "1" } : undefined,
    matches_known_meta_id: matches,
  });
}

export function buildAdsReport(opts: AdsReportOpts): AdsReport {
  const now = opts.now ?? new Date();
  const days = clampDays(opts.days);
  const end = addDays(utcDate(now), -1);
  const start = addDays(end, -(days - 1));
  const platform = opts.platform ?? "all";
  const model: AttributionModel = opts.model ?? "last_paid";
  const settings = getAdsSettings(opts.contentRoot);
  const thresholds = settings.meta.alert_thresholds;
  const warnings: AdsWarning[] = [];
  const hosts = hostSets(opts.site);

  let index: SeoIndex;
  try {
    index = loadSeoIndex(opts.contentRoot);
  } catch (err) {
    log.warn({ err }, "[ads-report] seo-index unavailable");
    index = { version: 1, generated_at: "", entries: {}, by_path: {}, clusters: {}, orphans: [], warnings: [] };
  }
  const resolve = makeResolver(index, hosts);

  const aggs = new Map<string, Agg>();
  const aggFor = (r: Resolved): Agg => {
    let a = aggs.get(r.key);
    if (!a) {
      a = {
        row: emptyRow(r, hosts.primary),
        engagementMs: 0,
        organicSessions: 0,
        organicEngaged: 0,
        organicWithLead: 0,
        campaigns: new Map(),
        platforms: new Set(),
        versions: new Map(),
      };
      aggs.set(r.key, a);
    } else if (r.redirected_from && !a.row.redirected_from.includes(r.redirected_from)) {
      a.row.redirected_from.push(r.redirected_from);
    }
    return a;
  };
  const campaignRef = (a: Agg, plat: AdPlatform | null, id: string | null, name: string): AdsCampaignRef => {
    const k = `${plat ?? ""}|${id ?? name}`;
    let c = a.campaigns.get(k);
    if (!c) {
      c = { platform: plat, campaign_id: id, campaign_name: name, paid_visits: 0, spend: {} };
      a.campaigns.set(k, c);
    }
    return c;
  };
  const campaignGroups = new Map<string, AdsCampaignGroup>();
  const groupFor = (plat: AdPlatform | null, id: string | null, name: string): AdsCampaignGroup => {
    const k = `${plat ?? ""}|${id ?? name}`;
    let g = campaignGroups.get(k);
    if (!g) {
      g = { key: k, platform: plat, campaign_id: id, campaign_name: name, spend: {}, clicks: 0, meta_leads: 0, paid_visits: 0, pages: [] };
      campaignGroups.set(k, g);
    }
    return g;
  };
  const groupPage = (g: AdsCampaignGroup, a: Agg, visits: number) => {
    let p = g.pages.find((x) => x.key === a.row.key);
    if (!p) {
      p = { key: a.row.key, title: a.row.title, path: a.row.path, paid_visits: 0 };
      g.pages.push(p);
    }
    p.paid_visits += visits;
  };

  const totals: AdsReport["totals"] = {
    spend: {},
    tracked_spend: {},
    clicks: 0,
    landing_page_views: 0,
    paid_visits: 0,
    unclear_visits: 0,
    meta_leads: 0,
    instant_form_leads: 0,
    ga4_leads: 0,
    unique_leads: 0,
    submissions: 0,
    repeat_submissions: 0,
    test_submissions: 0,
  };

  // ── Meta spend → destination ─────────────────────────────────────────────
  const metaConnected = isMetaConnected(opts.contentRoot);
  const metaState = loadMetaState(opts.site);
  const includeMeta = platform === "all" || platform === "meta";
  const metaRowsAll: MetaAdDayRow[] = metaConnected ? loadMetaRows(opts.site, start, end, settings.meta.ad_account_ids) : [];
  const metaRows = metaRowsAll.filter(
    (r) => (!opts.account || r.account_id === opts.account) && (!opts.currency || r.currency === opts.currency),
  );
  const known = {
    campaigns: new Set(metaRowsAll.map((r) => r.campaign_id).filter(Boolean)),
    adsets: new Set(metaRowsAll.map((r) => r.adset_id).filter(Boolean)),
    ads: new Set(metaRowsAll.map((r) => r.ad_id).filter(Boolean)),
  };

  // ── GA4 paid landings ────────────────────────────────────────────────────
  const ga4Configured = isGa4Configured(opts.contentRoot);
  const ga4State = loadPaidLandingState(opts.site);
  const paidDays = ga4Configured ? loadPaidLandingDays(opts.site, start, end) : [];
  const adLandingVotes = new Map<string, Map<string, number>>();

  for (const day of paidDays) {
    for (const c of day.candidates) {
      const cls = classifyCandidate(c, known);
      if (cls.status === "organic") continue;
      if (platform !== "all" && cls.platform !== platform) continue;
      const r = resolve(c.host, c.path);
      if (opts.content_type && r.content_type !== opts.content_type) continue;
      const a = aggFor(r);
      if (cls.platform) a.platforms.add(cls.platform);
      if (cls.status === "unclear") {
        a.row.unclear_visits += c.sessions;
        totals.unclear_visits += c.sessions;
        continue;
      }
      a.row.paid_visits += c.sessions;
      a.row.engaged_sessions += c.engaged_sessions;
      a.engagementMs += c.engagement_ms;
      a.row.ga4_leads += c.sessions_with_lead;
      totals.paid_visits += c.sessions;
      totals.ga4_leads += c.sessions_with_lead;
      const metaCampaignId = cls.platform === "meta" && c.utm_id && known.campaigns.has(c.utm_id) ? c.utm_id : null;
      campaignRef(a, cls.platform, metaCampaignId, c.campaign).paid_visits += c.sessions;
      const g = groupFor(cls.platform, metaCampaignId, c.campaign);
      g.paid_visits += c.sessions;
      groupPage(g, a, c.sessions);
      if (opts.split_by_version && c.variant) {
        const v = a.versions.get(c.variant) ?? { paid_visits: 0, unique_leads: 0, submissions: 0 };
        v.paid_visits += c.sessions;
        a.versions.set(c.variant, v);
      }
      if (c.utm_content && known.ads.has(c.utm_content)) {
        const votes = adLandingVotes.get(c.utm_content) ?? new Map<string, number>();
        votes.set(`${c.host}|${c.path}`, (votes.get(`${c.host}|${c.path}`) ?? 0) + c.sessions);
        adLandingVotes.set(c.utm_content, votes);
      }
    }
    for (const o of day.organic) {
      const r = resolve(o.host, o.path);
      const a = aggs.get(r.key);
      if (!a) continue;
      a.organicSessions += o.sessions;
      a.organicEngaged += o.engaged_sessions;
      a.organicWithLead += o.sessions_with_lead;
    }
  }

  if (includeMeta && metaRows.length > 0) {
    const creatives = loadMetaCreatives(opts.site).ads;
    for (const m of metaRows) {
      totals.clicks += m.link_clicks;
      totals.landing_page_views += m.landing_page_views;
      totals.meta_leads += m.pixel_leads;
      totals.instant_form_leads += m.instant_form_leads;
      addMoney(totals.spend, m.currency, m.spend);

      const creative = creatives[m.ad_id];
      let r: Resolved;
      if (creative?.instant_form || (m.instant_form_leads > 0 && !creative?.links.length)) {
        r = { kind: "instant_form", key: "dest:instant_form", host: "", path: "", content_type: null, slug: null, locale: null };
      } else {
        const link = creative?.links[0] ? parseUrl(creative.links[0]) : null;
        const votes = adLandingVotes.get(m.ad_id);
        const voted = votes ? Array.from(votes.entries()).sort((x, y) => y[1] - x[1])[0]?.[0] : undefined;
        const target = link ?? (voted ? { host: voted.split("|")[0]!, path: voted.split("|")[1]! } : null);
        r = target
          ? resolve(target.host, target.path)
          : { kind: "unknown_destination", key: "dest:unknown", host: "", path: "", content_type: null, slug: null, locale: null };
      }
      if (opts.content_type && r.content_type !== opts.content_type) continue;
      const a = aggFor(r);
      a.platforms.add("meta");
      addMoney(a.row.spend, m.currency, m.spend);
      a.row.clicks += m.link_clicks;
      a.row.landing_page_views += m.landing_page_views;
      a.row.meta_leads += m.pixel_leads;
      a.row.instant_form_leads += m.instant_form_leads;
      if (r.kind === "entry") addMoney(totals.tracked_spend, m.currency, m.spend);
      addMoney(campaignRef(a, "meta", m.campaign_id, m.campaign_name).spend, m.currency, m.spend);
      const g = groupFor("meta", m.campaign_id, m.campaign_name);
      addMoney(g.spend, m.currency, m.spend);
      g.clicks += m.link_clicks;
      g.meta_leads += m.pixel_leads;
      groupPage(g, a, 0);
    }
  }

  // ── Ledger leads (credited to one paid landing) ──────────────────────────
  const sinceMs = Date.parse(`${start}T00:00:00.000Z`);
  const untilMs = Date.parse(`${addDays(end, 1)}T00:00:00.000Z`);
  let ledger: LedgerRow[] = [];
  try {
    ledger = listLedgerRows(opts.site, sinceMs).filter((r) => r.created_at < untilMs);
  } catch (err) {
    log.warn({ err }, "[ads-report] ledger unavailable");
  }
  const filteredLedger = ledger.filter((r) => platform === "all" || r.platform === platform);
  totals.test_submissions = filteredLedger.filter((r) => r.is_test).length;
  const credits = filteredLedger.map((r) => ({ lead: r, credit: creditLead(r, model) }));
  const byLanding = totalsByLanding(credits.map((c) => c.credit));
  for (const t of Array.from(byLanding.values())) {
    const r = resolve(t.host, t.path);
    if (opts.content_type && r.content_type !== opts.content_type) continue;
    const a = aggFor(r);
    a.row.unique_leads += t.unique_leads;
    a.row.submissions += t.submissions;
    a.row.repeat_submissions += t.repeat_submissions;
    a.row.last_visit_organic += t.last_visit_organic;
    totals.unique_leads += t.unique_leads;
    totals.submissions += t.submissions;
    totals.repeat_submissions += t.repeat_submissions;
  }
  if (opts.split_by_version) {
    for (const { lead, credit } of credits) {
      if (credit.reason !== "credited" || !credit.host || !credit.path) continue;
      const a = aggs.get(resolve(credit.host, credit.path).key);
      if (!a) continue;
      const variant = lead.variant ?? "version unknown";
      const v = a.versions.get(variant) ?? { paid_visits: 0, unique_leads: 0, submissions: 0 };
      v.submissions += 1;
      if (!credit.is_repeat) v.unique_leads += 1;
      a.versions.set(variant, v);
    }
  }
  const paidLedger = credits.filter((c) => c.credit.reason === "credited" && !c.credit.is_repeat).map((c) => c.lead);
  for (const lead of paidLedger) {
    const host = (lead.host ?? hosts.primary).toLowerCase().replace(/^www\./, "");
    const started = lead.landing_path ? aggs.get(resolve(host, lead.landing_path).key) : undefined;
    if (started) started.row.started_here += 1;
    const closed = lead.conversion_path ? aggs.get(resolve(host, lead.conversion_path).key) : undefined;
    if (closed) closed.row.closed_here += 1;
  }

  // ── Finalize rows ─────────────────────────────────────────────────────────
  const minVisits = thresholds.min_paid_visits_for_rates;
  const pages: AdsPageRow[] = [];
  const destinations: AdsPageRow[] = [];
  for (const a of Array.from(aggs.values())) {
    const row = a.row;
    const visits = row.paid_visits;
    row.low_sample = isLowSample(visits, minVisits);
    row.bounce_rate = visits > 0 ? 1 - row.engaged_sessions / visits : null;
    row.avg_engaged_seconds = visits > 0 ? Math.round(a.engagementMs / visits / 100) / 10 : null;
    row.conversion_rate = visits > 0 ? row.unique_leads / visits : null;
    row.cost_per_visit = divMoney(row.spend, visits);
    row.cost_per_lead = divMoney(row.spend, row.unique_leads);
    row.clicks_to_visits = row.clicks > 0 ? visits / row.clicks : null;
    row.organic =
      a.organicSessions > 0
        ? {
            sessions: a.organicSessions,
            bounce_rate: 1 - a.organicEngaged / a.organicSessions,
            lead_rate: a.organicWithLead / a.organicSessions,
          }
        : null;
    row.platforms = Array.from(a.platforms);
    row.campaigns = Array.from(a.campaigns.values()).sort((x, y) => y.paid_visits - x.paid_visits).slice(0, 10);
    if (opts.split_by_version && a.versions.size > 0) {
      row.versions = Array.from(a.versions.entries()).map(([variant, v]) => ({
        variant,
        ...v,
        conversion_rate: v.paid_visits > 0 ? v.unique_leads / v.paid_visits : null,
        low_sample: isLowSample(v.paid_visits, minVisits),
      }));
    }
    const hasActivity = visits + row.unclear_visits + row.submissions + row.clicks + Object.keys(row.spend).length > 0;
    if (!hasActivity) continue;
    (row.kind === "entry" ? pages : destinations).push(row);
  }
  const spendSum = (m: MoneyByCurrency) => Object.values(m).reduce((s, v) => s + v, 0);
  pages.sort((x, y) => spendSum(y.spend) - spendSum(x.spend) || y.paid_visits - x.paid_visits);
  destinations.sort((x, y) => spendSum(y.spend) - spendSum(x.spend) || y.paid_visits - x.paid_visits);

  // ── Consent + coverage ──────────────────────────────────────────────────
  let askRejectPct: number | null = null;
  let askShown = 0;
  try {
    const ask = summarizeConsentRates(listConsentDaily(opts.site, start)).find((m) => m.mode === "ask");
    if (ask) {
      askShown = ask.shown;
      const decided = ask.granted + ask.denied;
      askRejectPct = decided > 0 ? Math.round((ask.denied / decided) * 1000) / 10 : null;
    }
  } catch {
    /* consent table optional */
  }
  let collectingSince: number | null = null;
  try {
    collectingSince = ledgerCollectingSince(opts.site);
  } catch {
    /* ignore */
  }
  const covered = coveredDays(start, end, collectingSince);

  // ── Warnings ────────────────────────────────────────────────────────────
  if (!metaConnected && includeMeta) {
    warnings.push({ code: "meta_not_connected", message: "Meta Ads is not connected; spend, clicks and Meta-reported leads are missing." });
  }
  if (!ga4Configured) {
    warnings.push({ code: "ga4_not_configured", message: "GA4 BigQuery export is not configured; paid visits and engagement are missing." });
  }
  if (Object.keys(totals.spend).length > 1) {
    warnings.push({ code: "mixed_currency", message: `Spend is in ${Object.keys(totals.spend).join(", ")}; totals are shown per currency and never summed.` });
  }
  if (covered.covered < covered.total) {
    warnings.push({
      code: "ledger_collecting",
      message: `Site lead counts are based on ${covered.covered} of ${covered.total} days (collection started ${collectingSince ? new Date(collectingSince).toISOString().slice(0, 10) : "not yet"}).`,
    });
  }
  if (askRejectPct != null && askRejectPct > 0) {
    warnings.push({
      code: "consent_estimates",
      message: `Ask-region numbers include estimates; ${askRejectPct}% of visitors there rejected tracking.`,
    });
  }
  const refreshing = isAdsRefreshing(opts.site);
  if (refreshing) {
    warnings.push({ code: "meta_refresh_in_progress", message: "Ads data is refreshing in the background; re-check in a minute." });
  }

  return {
    window: { start, end, days },
    platform,
    attribution: { model, lookback_days: 30, basis: "browser_observed" },
    meta: {
      connected: metaConnected,
      last_synced_at: metaState.last_success_at ?? null,
      last_error: metaState.last_error ?? null,
      consecutive_failures: metaState.consecutive_failures ?? 0,
      accounts: settings.meta.ad_account_ids.map((id) => ({
        id,
        name: metaState.accounts[id]?.name,
        currency: metaState.accounts[id]?.currency,
      })),
    },
    ga4: {
      configured: ga4Configured,
      last_synced_at: ga4State.last_success_at ?? null,
      last_export_date: ga4State.last_export_date ?? null,
      last_error: ga4State.last_error ?? null,
    },
    refreshing,
    collecting_since: collectingSince ? new Date(collectingSince).toISOString() : null,
    covered_days: covered,
    consent: { mode: "advanced", ask_region_reject_pct: askRejectPct, ask_region_shown: askShown },
    totals,
    pages,
    destinations,
    campaigns: Array.from(campaignGroups.values()).sort((x, y) => spendSum(y.spend) - spendSum(x.spend) || y.paid_visits - x.paid_visits),
    thresholds,
    warnings,
  };
}

/** Build the report and kick a background refresh when data is stale (non-blocking). */
export async function getAdsReport(opts: AdsReportOpts): Promise<AdsReport> {
  let refreshing = false;
  if (!opts.noRefresh) {
    try {
      refreshing = await triggerAdsRefreshIfStale(opts.site, opts.contentRoot);
    } catch (err) {
      log.warn({ err }, "[ads-report] refresh trigger failed");
    }
  }
  const report = buildAdsReport(opts);
  if (refreshing && !report.refreshing) {
    report.refreshing = true;
    report.warnings.push({ code: "meta_refresh_in_progress", message: "Ads data is refreshing in the background; re-check in a minute." });
  }
  return report;
}