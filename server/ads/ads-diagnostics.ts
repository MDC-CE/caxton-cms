/**
 * Ads diagnostics: gathers Meta sync state, the Meta paid-traffic report, a
 * trailing baseline, creative URL params, landing probes and consent counters,
 * then applies the pure rules in shared/ads-diagnostics-rules.ts.
 * Issues auto-resolve on the next build once the condition clears.
 */

import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../db-cache";
import { getAdsSettings } from "../settings";
import { child } from "../logger";
import {
  clicksVisitsIssue,
  consentRateDrop,
  currenciesMissingFloor,
  droppedParams,
  ga4LedgerGapIssue,
  hasNonPaidMedium,
  leadGapPct,
  missingTemplateParams,
  parseTrackingParams,
  severityForSpend,
  unclearShareIssue,
  type AdsIssue,
} from "@shared/ads-diagnostics-rules";
import { META_UTM_TEMPLATE } from "@shared/ads-settings";
import { buildAdsReport, getAdsReport, type AdsReport, type MoneyByCurrency } from "./ads-report";
import { addDays, loadMetaCreatives, loadMetaRows, loadMetaState, utcDate } from "./meta-ads-days";
import { lastCompleteGa4Date } from "./paid-detection";
import { listConsentDaily, type ConsentDailyRow } from "./consent-store";
import { isMetaConnected } from "./ads-refresh";

const log = child({ module: "ads/ads-diagnostics" });

const PROBE_TTL_MS = 6 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;
const MAX_PROBES = 10;

export type ConsentRegionRate = {
  region: "ask" | "notice" | "unknown";
  shown: number;
  accept_pct: number | null;
  reject_pct: number | null;
  ignore_pct: number | null;
};

export type AdsDiagnostics = {
  generated_at: string;
  window_days: number;
  status: "not_connected" | "ok" | "warnings" | "errors";
  meta: AdsReport["meta"];
  ga4: AdsReport["ga4"];
  refreshing: boolean;
  collecting_since: string | null;
  kpis: {
    tracked_spend: MoneyByCurrency;
    spend: MoneyByCurrency;
    open_errors: number;
    open_warnings: number;
    meta_leads: number;
    site_leads: number;
    repeat_submissions: number;
    clicks_to_visits_pct: number | null;
    meta_unclear_pct: number | null;
    consent_accept_pct: number | null;
  };
  consent: ConsentRegionRate[];
  missing_floor_currencies: string[];
  issues: AdsIssue[];
  resolved: Array<{ id: string; title: string; severity: AdsIssue["severity"]; resolved_at: string }>;
  utm_template: string;
  warnings: AdsReport["warnings"];
};

// ── Landing probes ──────────────────────────────────────────────────────────
type ProbeResult = { status: number | null; final_url: string; error?: string };
const probeCache = new Map<string, { at: number; result: ProbeResult }>();

async function probeUrl(url: string): Promise<ProbeResult> {
  const hit = probeCache.get(url);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.result;
  let current = url;
  let result: ProbeResult = { status: null, final_url: url };
  try {
    for (let hop = 0; hop < 6; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": "4GeeksAdsDiagnostics/1.0 (+landing check)" },
        });
      } finally {
        clearTimeout(timer);
      }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current).toString();
        continue;
      }
      result = { status: res.status, final_url: current };
      break;
    }
  } catch (err) {
    result = { status: null, final_url: current, error: err instanceof Error ? err.message : String(err) };
  }
  probeCache.set(url, { at: Date.now(), result });
  return result;
}

function withTags(link: string, urlTags?: string): string {
  if (!urlTags) return link;
  const sample = urlTags.replace(/\{\{[^}]+\}\}/g, "1");
  return link.includes("?") ? `${link}&${sample}` : `${link}?${sample}`;
}

// ── Issue state (Issues | Resolved) ─────────────────────────────────────────
type IssueState = {
  open: Record<string, { first_seen: string; title: string; severity: AdsIssue["severity"] }>;
  resolved: AdsDiagnostics["resolved"];
};

function issueStatePath(site: string): string {
  return path.join(CACHE_DIR, site, "ads-issues.json");
}

function loadIssueState(site: string): IssueState {
  try {
    const f = issueStatePath(site);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8")) as IssueState;
  } catch {
    /* ignore */
  }
  return { open: {}, resolved: [] };
}

function saveIssueState(site: string, state: IssueState): void {
  fs.mkdirSync(path.dirname(issueStatePath(site)), { recursive: true });
  fs.writeFileSync(issueStatePath(site), JSON.stringify(state), "utf-8");
}

// ── Consent ─────────────────────────────────────────────────────────────────
function consentRates(rows: ConsentDailyRow[]): ConsentRegionRate[] {
  const regions: ConsentRegionRate["region"][] = ["ask", "notice", "unknown"];
  return regions.map((region) => {
    const subset = rows.filter((r) => (region === "unknown" ? r.country === "??" : r.country !== "??" && r.mode === region));
    const shown = subset.reduce((s, r) => s + r.shown, 0);
    const granted = subset.reduce((s, r) => s + r.granted_explicit + r.granted_implied, 0);
    const denied = subset.reduce((s, r) => s + r.denied, 0);
    const pct = (n: number) => (shown > 0 ? Math.round((n / shown) * 1000) / 10 : null);
    return {
      region,
      shown,
      accept_pct: pct(granted),
      reject_pct: pct(denied),
      ignore_pct: shown > 0 ? pct(Math.max(0, shown - granted - denied)) : null,
    };
  });
}

function askRate(rows: ConsentDailyRow[]): { shown: number; granted: number; decided: number } {
  const ask = rows.filter((r) => r.mode === "ask");
  const granted = ask.reduce((s, r) => s + r.granted_explicit + r.granted_implied, 0);
  const denied = ask.reduce((s, r) => s + r.denied, 0);
  return { shown: ask.reduce((s, r) => s + r.shown, 0), granted, decided: granted + denied };
}

// ── Build ───────────────────────────────────────────────────────────────────
export async function buildAdsDiagnostics(opts: {
  site: string;
  contentRoot?: string;
  days?: number;
  probe?: boolean;
  now?: Date;
}): Promise<AdsDiagnostics> {
  const now = opts.now ?? new Date();
  const days = opts.days === 7 ? 7 : 28;
  const settings = getAdsSettings(opts.contentRoot);
  const t = settings.meta.alert_thresholds;
  const report = await getAdsReport({ site: opts.site, contentRoot: opts.contentRoot, days, platform: "meta", now });
  const baseline = buildAdsReport({
    site: opts.site,
    contentRoot: opts.contentRoot,
    days: 28,
    platform: "meta",
    noRefresh: true,
    now: new Date(Date.parse(`${report.window.start}T12:00:00.000Z`)),
  });
  const connected = isMetaConnected(opts.contentRoot);
  const metaState = loadMetaState(opts.site);
  const issues: AdsIssue[] = [];
  const totalSpend = report.totals.spend;

  // Access / sync
  if (metaState.last_error && (metaState.last_error_kind === "auth" || metaState.last_error_kind === "permission")) {
    issues.push({
      id: "meta_access_failed",
      code: "meta_access_failed",
      severity: "error",
      title: "Meta rejected our access",
      why: `Meta said: ${metaState.last_error}. Spend and ad data stop updating until access works again.`,
      how_to_fix:
        "Ask an admin to check the System User token (ads_read) and that it still has access to each ad account, then press Test connection in Settings → Ads.",
      spend_affected: {},
      scope: {},
      site_fixable: false,
    });
  } else if ((metaState.consecutive_failures ?? 0) >= 2) {
    issues.push({
      id: "meta_sync_failing",
      code: "meta_sync_failing",
      severity: "error",
      title: "Meta sync keeps failing",
      why: `The last ${metaState.consecutive_failures} syncs failed (${metaState.last_error ?? "unknown error"}). Numbers here may be out of date.`,
      how_to_fix: "Press Sync now in Settings → Ads. If it fails again, check the error and the ad account ids.",
      spend_affected: {},
      scope: {},
      site_fixable: false,
    });
  }

  // Spend with zero visits over GA4-complete days
  const completeCutoff = lastCompleteGa4Date(now);
  const completeDays = Math.max(
    0,
    Math.round((Date.parse(`${completeCutoff < report.window.end ? completeCutoff : report.window.end}T00:00:00Z`) - Date.parse(`${report.window.start}T00:00:00Z`)) / 86_400_000) + 1,
  );
  if (report.ga4.configured && completeDays >= t.zero_visits_complete_days) {
    for (const row of report.pages) {
      if (Object.keys(row.spend).length === 0 || row.paid_visits > 0 || row.clicks === 0) continue;
      issues.push({
        id: `spend_zero_visits:${row.key}`,
        code: "spend_zero_visits",
        severity: severityForSpend(row.spend, totalSpend, t),
        title: `Ads spend but no visits: ${row.title}`,
        why: `Meta reports ${row.clicks} clicks to ${row.url}, but GA4 saw no paid visits over ${completeDays} complete days. The page may be broken, redirecting, or losing the tracking parameters.`,
        how_to_fix: "Open the ad's URL in a private window and check it loads. Confirm the ad URL parameters use the template below.",
        spend_affected: row.spend,
        scope: { page_key: row.key, url: row.url },
        site_fixable: true,
      });
    }
  }

  // Creative URL params (missing template / non-paid medium) + landing probes
  const creatives = loadMetaCreatives(opts.site).ads;
  const metaRows = connected ? loadMetaRows(opts.site, report.window.start, report.window.end, settings.meta.ad_account_ids) : [];
  const spendByAd = new Map<string, { spend: MoneyByCurrency; campaign_id: string; campaign_name: string; ad_name: string }>();
  for (const r of metaRows) {
    const cur = spendByAd.get(r.ad_id) ?? { spend: {} as MoneyByCurrency, campaign_id: r.campaign_id, campaign_name: r.campaign_name, ad_name: r.ad_name };
    cur.spend[r.currency] = (cur.spend[r.currency] ?? 0) + r.spend;
    spendByAd.set(r.ad_id, cur);
  }
  const missingByCampaign = new Map<string, { spend: MoneyByCurrency; ads: number; missing: Set<string>; name: string }>();
  const nonPaidByCampaign = new Map<string, { spend: MoneyByCurrency; medium: string; name: string }>();
  for (const [adId, info] of Array.from(spendByAd.entries())) {
    const c = creatives[adId];
    if (!c || c.instant_form || c.links.length === 0) continue;
    const params = { ...parseTrackingParams(c.links[0]), ...parseTrackingParams(c.url_tags) };
    const missing = missingTemplateParams(params);
    if (missing.length > 0) {
      const m = missingByCampaign.get(info.campaign_id) ?? { spend: {} as MoneyByCurrency, ads: 0, missing: new Set<string>(), name: info.campaign_name };
      m.ads += 1;
      missing.forEach((k) => m.missing.add(k));
      for (const [cur, v] of Object.entries(info.spend)) m.spend[cur] = (m.spend[cur] ?? 0) + v;
      missingByCampaign.set(info.campaign_id, m);
    }
    if (hasNonPaidMedium(params)) {
      const n = nonPaidByCampaign.get(info.campaign_id) ?? { spend: {} as MoneyByCurrency, medium: params.utm_medium!, name: info.campaign_name };
      for (const [cur, v] of Object.entries(info.spend)) n.spend[cur] = (n.spend[cur] ?? 0) + v;
      nonPaidByCampaign.set(info.campaign_id, n);
    }
  }
  for (const [campaignId, m] of Array.from(missingByCampaign.entries())) {
    issues.push({
      id: `missing_tracking_params:${campaignId}`,
      code: "missing_tracking_params",
      severity: "warning",
      title: `Ads missing tracking parameters: ${m.name}`,
      why: `${m.ads} ad(s) in this campaign are missing ${Array.from(m.missing).join(", ")}. Without them we cannot match visits and leads to the exact campaign and ad.`,
      how_to_fix: "In Ads Manager, paste the URL parameters template below into each ad (Tracking → URL parameters).",
      spend_affected: m.spend,
      scope: { campaign_id: campaignId, campaign_name: m.name },
      site_fixable: false,
    });
  }
  for (const [campaignId, n] of Array.from(nonPaidByCampaign.entries())) {
    issues.push({
      id: `non_paid_medium:${campaignId}`,
      code: "non_paid_medium",
      severity: severityForSpend(n.spend, totalSpend, t),
      title: `Ads tagged as unpaid traffic: ${n.name}`,
      why: `These ads use utm_medium=${n.medium}, which analytics treats as unpaid social. Their visits will not show as paid here or in GA4.`,
      how_to_fix: "Change utm_medium to paid_social (use the template below).",
      spend_affected: n.spend,
      scope: { campaign_id: campaignId, campaign_name: n.name },
      site_fixable: false,
    });
  }

  if (opts.probe !== false) {
    const topAds = Array.from(spendByAd.entries())
      .sort((a, b) => Object.values(b[1].spend).reduce((s, v) => s + v, 0) - Object.values(a[1].spend).reduce((s, v) => s + v, 0))
      .map(([adId, info]) => ({ adId, info, creative: creatives[adId] }))
      .filter((x) => x.creative && !x.creative.instant_form && x.creative.links.length > 0);
    const seen = new Set<string>();
    const probes: Array<{ url: string; adId: string; info: (typeof topAds)[number]["info"] }> = [];
    for (const x of topAds) {
      const url = withTags(x.creative!.links[0]!, x.creative!.url_tags);
      const bare = url.split("?")[0]!;
      if (seen.has(bare)) continue;
      seen.add(bare);
      probes.push({ url, adId: x.adId, info: x.info });
      if (probes.length >= MAX_PROBES) break;
    }
    const results = await Promise.all(probes.map(async (p) => ({ p, r: await probeUrl(p.url) })));
    for (const { p, r } of results) {
      if (r.status == null || r.status >= 400) {
        issues.push({
          id: `landing_http_error:${p.url.split("?")[0]}`,
          code: "landing_http_error",
          severity: severityForSpend(p.info.spend, totalSpend, t),
          title: `Ad landing page is failing: ${p.url.split("?")[0]}`,
          why: r.status ? `The page answered HTTP ${r.status}. People who click the ad do not see the page.` : `The page did not answer (${r.error ?? "timeout"}).`,
          how_to_fix: "Restore the page or point the ad to a working URL. If the page moved, add a redirect.",
          spend_affected: p.info.spend,
          scope: { url: p.url.split("?")[0], ad_id: p.adId, campaign_id: p.info.campaign_id, campaign_name: p.info.campaign_name },
          site_fixable: true,
        });
        continue;
      }
      const dropped = droppedParams(p.url, r.final_url);
      if (dropped.length > 0) {
        issues.push({
          id: `redirect_drops_params:${p.url.split("?")[0]}`,
          code: "redirect_drops_params",
          severity: severityForSpend(p.info.spend, totalSpend, t),
          title: `Redirect removes tracking parameters: ${p.url.split("?")[0]}`,
          why: `The ad URL redirects to ${r.final_url.split("?")[0]} and loses ${dropped.join(", ")}. Visits look unpaid and cannot be matched to the ad.`,
          how_to_fix: "Point the ad straight to the final URL, or make the redirect keep the query string.",
          spend_affected: p.info.spend,
          scope: { url: p.url.split("?")[0], ad_id: p.adId, campaign_id: p.info.campaign_id, campaign_name: p.info.campaign_name },
          site_fixable: true,
        });
      }
    }
  }

  // Pixel not reporting leads while the site records Meta leads
  const floorHit = Object.entries(totalSpend).some(([c, v]) => v >= (t.severity_spend_floor[c] ?? Infinity));
  if (connected && floorHit && report.totals.meta_leads === 0 && report.totals.unique_leads > 0) {
    issues.push({
      id: "pixel_not_reporting_leads",
      code: "pixel_not_reporting_leads",
      severity: "warning",
      title: "Meta pixel is not reporting leads",
      why: `Our site recorded ${report.totals.unique_leads} leads from Meta ads, but Meta reports none. Meta cannot optimize campaigns for leads it does not see.`,
      how_to_fix: "In Tag Manager, check the Meta pixel Lead event fires on the lead form conversion and respects consent.",
      spend_affected: totalSpend,
      scope: {},
      site_fixable: false,
    });
  }

  // GA4 vs ledger gap
  const ledgerAgeDays = report.collecting_since ? (now.getTime() - Date.parse(report.collecting_since)) / 86_400_000 : 0;
  const gap = leadGapPct(report.totals.ga4_leads, report.totals.submissions);
  const baseGap = leadGapPct(baseline.totals.ga4_leads, baseline.totals.submissions);
  if (report.ga4.configured && ga4LedgerGapIssue(gap, baseGap, ledgerAgeDays, t)) {
    issues.push({
      id: "ga4_ledger_gap",
      code: "ga4_ledger_gap",
      severity: "warning",
      title: "GA4 and our lead records disagree",
      why: `GA4 counted ${report.totals.ga4_leads} paid leads and our server recorded ${report.totals.submissions} submissions (${Math.round(gap ?? 0)}% apart). Some leads are not being measured in one of them.`,
      how_to_fix: "Check the GA4 lead event in Tag Manager (consent, trigger) and that forms submit through the site.",
      spend_affected: {},
      scope: {},
      site_fixable: false,
    });
  }

  // Clicks → visits (prefer landing page views when Meta reports them)
  const denom = report.totals.landing_page_views > 0 ? report.totals.landing_page_views : report.totals.clicks;
  const baseDenom = baseline.totals.landing_page_views > 0 ? baseline.totals.landing_page_views : baseline.totals.clicks;
  const baseRatio = baseDenom >= t.ratio_min_clicks ? baseline.totals.paid_visits / baseDenom : null;
  const cv = report.ga4.configured ? clicksVisitsIssue({ clicks: denom, visits: report.totals.paid_visits }, baseRatio, t) : null;
  if (cv) {
    issues.push({
      id: "clicks_visits_low",
      code: "clicks_visits_low",
      severity: "warning",
      title: cv.reason === "floor" ? "Few ad clicks become visits" : "Ad clicks → visits dropped",
      why: `Only ${Math.round(cv.ratio * 100)}% of Meta ${report.totals.landing_page_views > 0 ? "landing page views" : "clicks"} show up as paid visits${
        cv.reason === "drop" && baseRatio ? ` (was ${Math.round(baseRatio * 100)}% in the previous 28 days)` : ""
      }. Slow pages, consent rejections or missing tracking parameters cause this.`,
      how_to_fix: "Check page speed on mobile, the consent rate below, and that ads use the URL template.",
      spend_affected: {},
      scope: {},
      site_fixable: true,
    });
  }

  const unclear = unclearShareIssue(report.totals.paid_visits, report.totals.unclear_visits, t);
  if (unclear != null) {
    issues.push({
      id: "unclear_share_high",
      code: "unclear_share_high",
      severity: "warning",
      title: "Many Meta visits cannot be classified",
      why: `${Math.round(unclear)}% of Meta visits only have Meta's click id and no campaign tags, so we cannot tell paid from organic posts.`,
      how_to_fix: "Add the URL parameters template to every ad.",
      spend_affected: {},
      scope: {},
      site_fixable: false,
    });
  }

  // Consent
  let consentRows: ConsentDailyRow[] = [];
  let trailing: ConsentDailyRow[] = [];
  try {
    const since = addDays(utcDate(now), -(days - 1));
    consentRows = listConsentDaily(opts.site, since);
    trailing = listConsentDaily(opts.site, addDays(since, -28)).filter((r) => r.date < since);
  } catch (err) {
    log.warn({ err }, "[ads-diagnostics] consent counters unavailable");
  }
  const cur = askRate(consentRows);
  const base = askRate(trailing);
  const drop = consentRateDrop(cur, base.decided > 0 ? base.granted / base.decided : null);
  if (drop != null) {
    issues.push({
      id: "consent_rate_drop",
      code: "consent_rate_drop",
      severity: "warning",
      title: "Fewer visitors accept tracking",
      why: `In countries where we ask, the accept rate fell ${Math.round(drop)}% vs the previous 28 days. Fewer accepts means fewer measured visits, not fewer real visits.`,
      how_to_fix: "Review the banner copy in Settings → Legal → Consent Window; keep Accept and Reject equally visible.",
      spend_affected: {},
      scope: {},
      site_fixable: false,
    });
  }

  // Info rows for non-page destinations
  for (const d of report.destinations) {
    const code =
      d.kind === "instant_form" ? "instant_form_destination" : d.kind === "off_site" || d.kind === "other_site" ? "off_site_destination" : "unmanaged_destination";
    if (d.kind === "unknown_destination") continue;
    issues.push({
      id: `${code}:${d.key}`,
      code,
      severity: code === "unmanaged_destination" && (Object.keys(d.spend).length > 0 || d.paid_visits > 0) ? "warning" : "info",
      title: `${d.kind_label}: ${d.kind === "instant_form" ? "Meta Instant Forms" : d.url}`,
      why:
        d.kind === "instant_form"
          ? "These ads collect leads inside Meta. Leads and spend come from Meta; no site visit happens."
          : d.kind === "missing_page"
            ? "Paid visits land on a URL that is not a page we manage (it may have been deleted)."
            : "Paid traffic goes to a site we do not manage here.",
      how_to_fix: d.kind === "missing_page" ? "Point the ads to a live page, or restore / redirect this URL." : "No action needed unless this is unexpected.",
      spend_affected: d.spend,
      scope: { page_key: d.key, url: d.url },
      site_fixable: d.kind === "missing_page",
    });
  }

  // Issues | Resolved bookkeeping (full builds only — probe-less roll-ups would "resolve" landing issues)
  const state = loadIssueState(opts.site);
  const nowIso = now.toISOString();
  if (opts.probe !== false) {
    const openIds = new Set(issues.map((i) => i.id));
    for (const [id, prev] of Object.entries(state.open)) {
      if (!openIds.has(id) && prev.severity !== "info") {
        state.resolved.unshift({ id, title: prev.title, severity: prev.severity, resolved_at: nowIso });
      }
    }
    state.resolved = state.resolved.filter((r) => !openIds.has(r.id)).slice(0, 50);
    state.open = Object.fromEntries(
      issues.map((i) => [i.id, { first_seen: state.open[i.id]?.first_seen ?? nowIso, title: i.title, severity: i.severity }]),
    );
    try {
      saveIssueState(opts.site, state);
    } catch (err) {
      log.warn({ err }, "[ads-diagnostics] failed to persist issue state");
    }
  }

  const rank = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const openErrors = issues.filter((i) => i.severity === "error").length;
  const openWarnings = issues.filter((i) => i.severity === "warning").length;
  const regions = consentRates(consentRows);
  const allShown = regions.reduce((s, r) => s + r.shown, 0);
  const allGranted = consentRows.reduce((s, r) => s + r.granted_explicit + r.granted_implied, 0);

  return {
    generated_at: nowIso,
    window_days: days,
    status: !connected ? "not_connected" : openErrors > 0 ? "errors" : openWarnings > 0 ? "warnings" : "ok",
    meta: report.meta,
    ga4: report.ga4,
    refreshing: report.refreshing,
    collecting_since: report.collecting_since,
    kpis: {
      tracked_spend: report.totals.tracked_spend,
      spend: report.totals.spend,
      open_errors: openErrors,
      open_warnings: openWarnings,
      meta_leads: report.totals.meta_leads,
      site_leads: report.totals.unique_leads,
      repeat_submissions: report.totals.repeat_submissions,
      clicks_to_visits_pct: denom > 0 && report.ga4.configured ? Math.round((report.totals.paid_visits / denom) * 1000) / 10 : null,
      meta_unclear_pct:
        report.totals.paid_visits + report.totals.unclear_visits > 0
          ? Math.round((report.totals.unclear_visits / (report.totals.paid_visits + report.totals.unclear_visits)) * 1000) / 10
          : null,
      consent_accept_pct: allShown > 0 ? Math.round((allGranted / allShown) * 1000) / 10 : null,
    },
    consent: regions,
    missing_floor_currencies: currenciesMissingFloor(totalSpend, t),
    issues,
    resolved: state.resolved,
    utm_template: META_UTM_TEMPLATE,
    warnings: report.warnings,
  };
}

/** Light roll-up for the Global tab (no landing probes). */
export async function adsDiagnosticsSummary(site: string, contentRoot?: string): Promise<{ status: AdsDiagnostics["status"]; open_errors: number; open_warnings: number }> {
  const d = await buildAdsDiagnostics({ site, contentRoot, days: 7, probe: false });
  const severities = new Map<string, AdsIssue["severity"]>();
  for (const [id, prev] of Object.entries(loadIssueState(site).open)) {
    if (id.startsWith("landing_http_error:") || id.startsWith("redirect_drops_params:")) severities.set(id, prev.severity);
  }
  for (const i of d.issues) severities.set(i.id, i.severity);
  const open_errors = Array.from(severities.values()).filter((s) => s === "error").length;
  const open_warnings = Array.from(severities.values()).filter((s) => s === "warning").length;
  const status = d.status === "not_connected" ? d.status : open_errors > 0 ? "errors" : open_warnings > 0 ? "warnings" : "ok";
  return { status, open_errors, open_warnings };
}
