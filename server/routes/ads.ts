/**
 * Ads (paid traffic) routes.
 *
 * Settings (ads_settings):
 *   GET/PUT /api/settings/ads/meta        — accounts, thresholds, known external campaigns, test email patterns, sync status
 *   POST    /api/settings/ads/meta/known-campaigns — mark one campaign as known (idempotent append)
 *   GET     /api/settings/ads/meta/accounts — ad accounts the token can read (picker options)
 *   POST    /api/settings/ads/meta/test   — probe token + accounts (read-only)
 *   POST    /api/ads/meta/sync            — Sync now / Load older history
 * Live-ad edits (ads_edit, staff session only — MCP loopback is refused):
 *   POST /api/ads/meta/tracking-fix/preview — per-ad plan for a missing_tracking_params issue
 *   POST /api/ads/meta/tracking-fix/apply   — add missing URL parameters to the selected ads in Meta
 * Reads (metrics_view):
 *   GET /api/ads/report                   — paid pages / destinations / campaigns;
 *       since / until (≤90 days) and campaign_ids / adset_ids / ad_ids (≤20 each) narrow it
 *   GET /api/content-types/:type/ads-entries — Ads perspective for one content type
 *   GET /api/diagnostics/ads              — Diagnostics Ads tab (or ?summary=1 roll-up);
 *       snapshot_id / issue_ids (≤10) / ads_limit / ads_offset page each issue's affected ads;
 *       campaign_ids / adset_ids / ad_ids keep issues touching those ads
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { api } from "../rate-limit/api";
import { getDefaultContentFolder, getDefaultContentRoot } from "../site-config";
import { getAdsSettings, updateAdsSettings } from "../settings";
import { markFileAsModified } from "../sync-state";
import { isMcpLoopbackRequest, requireCapability } from "./_helpers";
import { child } from "../logger";
import { MAX_KNOWN_EXTERNAL_CAMPAIGNS, META_UTM_TEMPLATE, isKnownExternalCampaign, normalizeAdAccountId } from "@shared/ads-settings";
import { resolveAdsDiagnosticsWindows } from "@shared/ads-diagnostics-rules";
import { parseAttributionModel } from "@shared/paid-attribution";
import type { AdPlatform } from "@shared/paid-traffic";
import {
  isMetaTokenConfigured,
  listMetaAdAccounts,
  MetaApiError,
  META_GRAPH_VERSION,
  testMetaConnection,
} from "../ads/meta-client";
import { listMetaDayDates, loadMetaState, META_BACKFILL_DAYS, META_REFRESH_DAYS, META_RETENTION_DAYS } from "../ads/meta-ads-days";
import { isGa4Configured, loadPaidLandingState } from "../ads/paid-detection";
import { getAdsRefreshStatus, isMetaConnected, requestAdsRefresh } from "../ads/ads-refresh";
import { isRefreshActive } from "@shared/ads-refresh-status";
import { AdsReportRangeError, getAdsReport } from "../ads/ads-report";
import { adsDiagnosticsSummary, buildAdsDiagnostics, loadTrackingParamsCoverage } from "../ads/ads-diagnostics";
import {
  ADS_DETAIL_ADS_LIMIT,
  ADS_LIST_ADS_LIMIT,
  AdsIdFilterError,
  clampAdsLimit,
  clampAdsOffset,
  currentSnapshotMarkers,
  filterIssuesByIds,
  hasAdIdFilters,
  loadAdsSnapshot,
  newerDataAvailable,
  parseAdIdFilters,
  parseIssueIds,
  saveAdsSnapshot,
  trimIssueAds,
  type AdsDiagnosticsSnapshot,
} from "../ads/ads-diagnostics-snapshots";
import { fetchAdsForFix, isMetaWriteConfigured, replaceAdUrlTags } from "../ads/meta-write";
import { applyTrackingFix, previewTrackingFix, type TrackingFixDeps } from "../ads/tracking-fix";
import { TRACKING_FIX_MAX_ADS } from "@shared/ads-tracking-fix";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";

const log = child({ module: "routes/ads" });

const trackingFixSchema = z.object({
  issue_id: z.string().regex(/^missing_tracking_params:\d{1,30}$/),
  snapshot_id: z.string().max(64).optional(),
});

const trackingFixApplySchema = trackingFixSchema.extend({
  ad_ids: z.array(z.string().regex(/^\d{1,30}$/)).min(1).max(TRACKING_FIX_MAX_ADS),
});

/** The issue from the staff's snapshot, or a fresh build when it expired. */
async function findTrackingIssue(site: string, contentRoot: string, issueId: string, snapshotId?: string): Promise<AdsIssue | null> {
  const lookup = snapshotId ? loadAdsSnapshot(site, snapshotId) : null;
  const issues =
    lookup?.status === "ok"
      ? lookup.snapshot.diagnostics.issues
      : saveAdsSnapshot(site, await buildAdsDiagnostics({ site, contentRoot, days: resolveAdsDiagnosticsWindows(undefined).kpiDays, issuesOnly: true }))
          .diagnostics.issues;
  return issues.find((i) => i.id === issueId && i.code === "missing_tracking_params") ?? null;
}

function isBadReportQuery(err: unknown): err is Error {
  return err instanceof AdsReportRangeError || err instanceof AdsIdFilterError;
}

const PLATFORMS: Array<AdPlatform | "all"> = ["all", "meta", "google", "microsoft", "tiktok", "linkedin", "x", "snapchat", "pinterest", "other"];

function getContentRoot(res: Response): string {
  return (res.locals.site as { contentRoot?: string } | undefined)?.contentRoot ?? getDefaultContentRoot();
}

function getSite(res: Response): string {
  return (res.locals.site as { contentRootName?: string } | undefined)?.contentRootName ?? getDefaultContentFolder();
}

function settingsPayload(res: Response) {
  const contentRoot = getContentRoot(res);
  const site = getSite(res);
  const ads = getAdsSettings(contentRoot);
  const state = loadMetaState(site);
  const days = listMetaDayDates(site);
  const ga4 = loadPaidLandingState(site);
  const refresh = getAdsRefreshStatus(site);
  const trackingParams = isMetaConnected(contentRoot) ? loadTrackingParamsCoverage(site, ads.meta.ad_account_ids) : null;
  return {
    ads,
    token_configured: isMetaTokenConfigured(),
    write_token_configured: isMetaWriteConfigured(),
    api_version: META_GRAPH_VERSION,
    utm_template: META_UTM_TEMPLATE,
    tracking_params: trackingParams,
    refreshing: isRefreshActive(refresh),
    refresh,
    sync: {
      last_success_at: state.last_success_at ?? null,
      last_attempt_at: state.last_attempt_at ?? null,
      last_error: state.last_error ?? null,
      last_error_kind: state.last_error_kind ?? null,
      consecutive_failures: state.consecutive_failures ?? 0,
      history_since: days[0] ?? null,
      history_until: days[days.length - 1] ?? null,
      accounts: state.accounts,
    },
    ga4: {
      configured: isGa4Configured(contentRoot),
      last_success_at: ga4.last_success_at ?? null,
      last_export_date: ga4.last_export_date ?? null,
      last_error: ga4.last_error ?? null,
    },
    policy: {
      refresh_days: META_REFRESH_DAYS,
      backfill_days: META_BACKFILL_DAYS,
      retention_days: META_RETENTION_DAYS,
      cache_dir: `.cache/${site}/meta-ads-days`,
    },
  };
}

const thresholdsSchema = z
  .object({
    severity_spend_share_pct: z.number().min(0).max(100),
    severity_spend_floor: z.record(z.string().regex(/^[A-Za-z]{3}$/), z.number().min(0)),
    clicks_visits_drop_pct: z.number().min(0).max(100),
    clicks_visits_floor_pct: z.number().min(0).max(100),
    ratio_min_clicks: z.number().int().min(1),
    unclear_share_pct: z.number().min(0).max(100),
    unclear_min_sessions: z.number().int().min(1),
    ga4_ledger_gap_widen_pts: z.number().min(0).max(100),
    ga4_ledger_gap_bootstrap_pct: z.number().min(0).max(100),
    zero_visits_complete_days: z.number().int().min(1).max(30),
    min_paid_visits_for_rates: z.number().int().min(1),
    unrecognized_campaign_min_visits: z.number().int().min(1),
    unrecognized_campaign_error_visits: z.number().int().min(1),
    unrecognized_campaign_error_share_pct: z.number().min(0).max(100),
    unrecognized_campaign_share_min_visits: z.number().int().min(1),
  })
  .partial();

const knownCampaignSchema = z.object({
  key: z.string().trim().min(1).max(200),
  note: z.string().trim().max(200).optional(),
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  ad_account_ids: z.array(z.union([z.string(), z.number()])).max(50).optional(),
  alert_thresholds: thresholdsSchema.optional(),
  known_external_campaigns: z.array(knownCampaignSchema).max(MAX_KNOWN_EXTERNAL_CAMPAIGNS).optional(),
  test_email_patterns: z.array(z.string().max(200)).max(100).optional(),
});

function parseReportQuery(req: Request) {
  const q = req.query as Record<string, unknown>;
  const platformRaw = typeof q.platform === "string" ? q.platform : "all";
  const platform = (PLATFORMS as string[]).includes(platformRaw) ? (platformRaw as AdPlatform | "all") : "all";
  const day = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    days: q.days != null && q.days !== "" ? Number(q.days) || 28 : undefined,
    since: day(q.since),
    until: day(q.until),
    ...parseAdIdFilters(q),
    platform,
    currency: typeof q.currency === "string" && /^[A-Za-z]{3}$/.test(q.currency) ? q.currency.toUpperCase() : null,
    account: typeof q.account === "string" ? normalizeAdAccountId(q.account) : null,
    content_type: typeof q.content_type === "string" && q.content_type.trim() ? q.content_type.trim() : null,
    model: parseAttributionModel(q.model),
    split_by_version: q.split_by_version === "1" || q.split_by_version === "true",
  };
}

export function registerAdsRoutes(app: Express): void {
  api.get(app, "/api/settings/ads/meta", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    try {
      res.json(settingsPayload(res));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load Ads settings" });
    }
  });

  api.put(app, "/api/settings/ads/meta", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const invalidIds = (parsed.data.ad_account_ids ?? []).filter((id) => !normalizeAdAccountId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: `Invalid ad account id(s): ${invalidIds.join(", ")}. Use the numeric id (with or without act_).` });
    }
    try {
      const contentRoot = getContentRoot(res);
      const site = getSite(res);
      const before = getAdsSettings(contentRoot).meta;
      const next = updateAdsSettings(
        {
          meta: {
            enabled: parsed.data.enabled,
            ad_account_ids: parsed.data.ad_account_ids?.map((id) => normalizeAdAccountId(id)!),
            alert_thresholds: parsed.data.alert_thresholds,
            known_external_campaigns: parsed.data.known_external_campaigns,
          },
          test_email_patterns: parsed.data.test_email_patterns,
        },
        contentRoot,
      );
      markFileAsModified("settings.yml", undefined, undefined, contentRoot);
      const newAccounts = next.meta.ad_account_ids.filter((id) => !before.ad_account_ids.includes(id));
      const justEnabled = next.meta.enabled && !before.enabled;
      let sync_requested = false;
      if (next.meta.enabled && next.meta.ad_account_ids.length > 0 && isMetaTokenConfigured() && (justEnabled || newAccounts.length > 0)) {
        const mode = listMetaDayDates(site).length > 0 && newAccounts.length === 0 ? "refresh" : "backfill";
        sync_requested = isRefreshActive(await requestAdsRefresh(site, contentRoot, mode, { manual: true }));
      }
      res.json({ success: true, sync_requested, ...settingsPayload(res) });
    } catch (err) {
      log.warn({ err }, "[ads] failed to save settings");
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to save Ads settings" });
    }
  });

  api.post(app, "/api/settings/ads/meta/known-campaigns", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    const parsed = knownCampaignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    try {
      const contentRoot = getContentRoot(res);
      const current = getAdsSettings(contentRoot).meta.known_external_campaigns;
      if (isKnownExternalCampaign(current, parsed.data.key)) {
        return res.json({ success: true, already_known: true, known_external_campaigns: current });
      }
      if (current.length >= MAX_KNOWN_EXTERNAL_CAMPAIGNS) {
        return res.status(400).json({ error: `Known external campaigns is full (${MAX_KNOWN_EXTERNAL_CAMPAIGNS}). Remove one in Settings → Ads first.` });
      }
      const entry = parsed.data.note ? { key: parsed.data.key, note: parsed.data.note } : { key: parsed.data.key };
      const next = updateAdsSettings({ meta: { known_external_campaigns: [...current, entry] } }, contentRoot);
      markFileAsModified("settings.yml", undefined, undefined, contentRoot);
      res.json({ success: true, already_known: false, known_external_campaigns: next.meta.known_external_campaigns });
    } catch (err) {
      log.warn({ err }, "[ads] failed to add known external campaign");
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to save known campaign" });
    }
  });

  api.get(app, "/api/settings/ads/meta/accounts", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    if (!isMetaTokenConfigured()) return res.json({ token_configured: false, accounts: [] });
    try {
      res.json({ token_configured: true, accounts: await listMetaAdAccounts() });
    } catch (err) {
      log.warn({ err }, "[ads] failed to list Meta ad accounts");
      res.json({
        token_configured: true,
        accounts: [],
        error: err instanceof Error ? err.message : "Could not list ad accounts",
        error_kind: err instanceof MetaApiError ? err.kind : "other",
      });
    }
  });

  api.post(app, "/api/settings/ads/meta/test", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    const body = (req.body ?? {}) as { ad_account_ids?: unknown };
    const ids = Array.isArray(body.ad_account_ids)
      ? body.ad_account_ids.map(normalizeAdAccountId).filter((x): x is string => !!x)
      : getAdsSettings(getContentRoot(res)).meta.ad_account_ids;
    try {
      res.json(await testMetaConnection(ids));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Connection test failed" });
    }
  });

  api.post(app, "/api/ads/meta/sync", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    const mode = (req.body as { mode?: unknown } | undefined)?.mode === "older" ? "older" : "refresh";
    const site = getSite(res);
    const contentRoot = getContentRoot(res);
    const meta = getAdsSettings(contentRoot).meta;
    if (mode === "older" && (!meta.enabled || meta.ad_account_ids.length === 0 || !isMetaTokenConfigured())) {
      return res.status(400).json({ error: "Connect Meta (token + at least one enabled ad account) before loading history." });
    }
    const refresh = await requestAdsRefresh(site, contentRoot, mode, { manual: true });
    res.json({ success: true, requested: isRefreshActive(refresh), mode, refreshing: isRefreshActive(refresh), refresh });
  });

  api.get(app, "/api/ads/report", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "metrics_view");
    if (!auth.authorized) return;
    try {
      const q = parseReportQuery(req);
      const report = await getAdsReport({ site: getSite(res), contentRoot: getContentRoot(res), ...q });
      res.json(report);
    } catch (err) {
      if (isBadReportQuery(err)) return res.status(400).json({ error: err.message });
      log.warn({ err }, "[ads] report failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build Ads report" });
    }
  });

  api.get(app, "/api/content-types/:type/ads-entries", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "metrics_view");
    if (!auth.authorized) return;
    try {
      const q = parseReportQuery(req);
      const report = await getAdsReport({
        site: getSite(res),
        contentRoot: getContentRoot(res),
        ...q,
        content_type: req.params.type,
      });
      const locale = typeof req.query.locale === "string" && req.query.locale.trim() ? req.query.locale.trim() : null;
      const search = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      const entries = report.pages.filter(
        (p) =>
          (!locale || p.locale === locale) &&
          (!search || (p.slug ?? "").toLowerCase().includes(search) || p.title.toLowerCase().includes(search) || p.path.toLowerCase().includes(search)),
      );
      res.json({
        entries,
        window: report.window,
        platform: report.platform,
        attribution: report.attribution,
        meta: report.meta,
        ga4: report.ga4,
        refreshing: report.refreshing,
        refresh: report.refresh,
        covered_days: report.covered_days,
        consent: report.consent,
        thresholds: { min_paid_visits_for_rates: report.thresholds.min_paid_visits_for_rates },
        warnings: report.warnings,
      });
    } catch (err) {
      if (isBadReportQuery(err)) return res.status(400).json({ error: err.message });
      log.warn({ err }, "[ads] ads-entries failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load Ads entries" });
    }
  });

  api.get(app, "/api/diagnostics/ads", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "metrics_view");
    if (!auth.authorized) return;
    try {
      const site = getSite(res);
      const contentRoot = getContentRoot(res);
      if (req.query.summary === "1") {
        return res.json(await adsDiagnosticsSummary(site, contentRoot));
      }
      const { kpiDays } = resolveAdsDiagnosticsWindows(req.query.days);
      const idFilters = parseAdIdFilters(req.query as Record<string, unknown>);
      const filtersEcho = hasAdIdFilters(idFilters)
        ? { filters: { campaign_ids: idFilters.campaign_ids ?? [], adset_ids: idFilters.adset_ids ?? [], ad_ids: idFilters.ad_ids ?? [] } }
        : {};
      const issueIds = parseIssueIds(req.query.issue_ids);
      const detail = issueIds.length > 0;
      const adsLimit = clampAdsLimit(req.query.ads_limit, detail ? ADS_DETAIL_ADS_LIMIT : ADS_LIST_ADS_LIMIT);
      const adsOffset = clampAdsOffset(req.query.ads_offset);
      const requested = typeof req.query.snapshot_id === "string" ? req.query.snapshot_id : null;

      let snap: AdsDiagnosticsSnapshot;
      let snapshotExpired = false;
      let newer = false;
      const lookup = requested ? loadAdsSnapshot(site, requested) : null;
      if (lookup?.status === "ok") {
        snap = lookup.snapshot;
        newer = newerDataAvailable(snap, currentSnapshotMarkers(site));
      } else {
        snapshotExpired = lookup?.status === "expired";
        snap = saveAdsSnapshot(site, await buildAdsDiagnostics({ site, contentRoot, days: kpiDays, issuesOnly: detail }));
      }
      const snapshotFields = {
        snapshot_id: snap.id,
        snapshot_expires_at: snap.expires_at,
        ...(snapshotExpired ? { snapshot_expired: true } : {}),
        ...(newer ? { newer_data_available: true } : {}),
      };
      const d = snap.diagnostics;
      const issues = filterIssuesByIds(d.issues, idFilters);
      if (!detail) {
        return res.json({ ...d, issues: trimIssueAds(issues, adsLimit, adsOffset), ...filtersEcho, ...snapshotFields });
      }
      const wanted = new Set(issueIds);
      const found = issues.filter((i) => wanted.has(i.id));
      const filteredOut = d.issues.filter((i) => wanted.has(i.id) && !found.some((f) => f.id === i.id)).map((i) => i.id);
      res.json({
        generated_at: d.generated_at,
        issue_window_days: d.issue_window_days,
        status: d.status,
        refreshing: d.refreshing,
        refresh: d.refresh,
        utm_template: d.utm_template,
        issues: trimIssueAds(found, adsLimit, adsOffset),
        missing_issue_ids: issueIds.filter((id) => !found.some((i) => i.id === id) && !filteredOut.includes(id)),
        ...(filteredOut.length > 0 ? { filtered_out_issue_ids: filteredOut } : {}),
        ...filtersEcho,
        ...snapshotFields,
      });
    } catch (err) {
      if (isBadReportQuery(err)) return res.status(400).json({ error: err.message });
      log.warn({ err }, "[ads] diagnostics failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build Ads diagnostics" });
    }
  });

  const trackingFixDeps = (site: string, contentRoot: string): TrackingFixDeps => ({
    writeConfigured: isMetaWriteConfigured,
    fetchAds: fetchAdsForFix,
    replace: replaceAdUrlTags,
    requestRefresh: async () => isRefreshActive(await requestAdsRefresh(site, contentRoot, "refresh", { manual: true })),
  });

  api.post(app, "/api/ads/meta/tracking-fix/preview", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    if (isMcpLoopbackRequest(req)) return res.status(403).json({ error: "Live-ad edits are staff UI only." });
    const auth = await requireCapability(req, res, "ads_edit");
    if (!auth.authorized) return;
    const parsed = trackingFixSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    try {
      const site = getSite(res);
      const contentRoot = getContentRoot(res);
      const issue = await findTrackingIssue(site, contentRoot, parsed.data.issue_id, parsed.data.snapshot_id);
      if (!issue) return res.status(404).json({ error: "This issue is no longer open. Reload the Ads tab." });
      res.json(await previewTrackingFix(issue, trackingFixDeps(site, contentRoot)));
    } catch (err) {
      log.warn({ err }, "[ads] tracking-fix preview failed");
      const status = err instanceof MetaApiError && (err.kind === "auth" || err.kind === "permission") ? 502 : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : "Failed to read ads from Meta",
        ...(err instanceof MetaApiError ? { error_kind: err.kind } : {}),
      });
    }
  });

  api.post(app, "/api/ads/meta/tracking-fix/apply", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    if (isMcpLoopbackRequest(req)) return res.status(403).json({ error: "Live-ad edits are staff UI only." });
    const auth = await requireCapability(req, res, "ads_edit");
    if (!auth.authorized) return;
    const parsed = trackingFixApplySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    if (!isMetaWriteConfigured()) {
      return res.status(409).json({ error: "Live-ad edits are not set up on the server. Ask an admin to add the Meta write token." });
    }
    try {
      const site = getSite(res);
      const contentRoot = getContentRoot(res);
      const issue = await findTrackingIssue(site, contentRoot, parsed.data.issue_id, parsed.data.snapshot_id);
      if (!issue) return res.status(404).json({ error: "This issue is no longer open. Reload the Ads tab." });
      const result = await applyTrackingFix(
        { issue, adIds: parsed.data.ad_ids, actor: auth.username ?? null, site },
        trackingFixDeps(site, contentRoot),
      );
      res.json(result);
    } catch (err) {
      log.warn({ err }, "[ads] tracking-fix apply failed");
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to update ads in Meta",
        ...(err instanceof MetaApiError ? { error_kind: err.kind } : {}),
      });
    }
  });
}
