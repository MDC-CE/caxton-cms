/**
 * Ads (paid traffic) routes.
 *
 * Settings (ads_settings):
 *   GET/PUT /api/settings/ads/meta        — accounts, thresholds, test email patterns, sync status
 *   POST    /api/settings/ads/meta/test   — probe token + accounts (read-only)
 *   POST    /api/ads/meta/sync            — Sync now / Load older history
 * Reads (metrics_view):
 *   GET /api/ads/report                   — paid pages / destinations / campaigns
 *   GET /api/content-types/:type/ads-entries — Ads perspective for one content type
 *   GET /api/diagnostics/ads              — Diagnostics Ads tab (or ?summary=1 roll-up)
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { api } from "../rate-limit/api";
import { getDefaultContentFolder, getDefaultContentRoot } from "../site-config";
import { getAdsSettings, updateAdsSettings } from "../settings";
import { markFileAsModified } from "../sync-state";
import { requireCapability } from "./_helpers";
import { child } from "../logger";
import { META_UTM_TEMPLATE, normalizeAdAccountId } from "@shared/ads-settings";
import { parseAttributionModel } from "@shared/paid-attribution";
import type { AdPlatform } from "@shared/paid-traffic";
import { isMetaTokenConfigured, META_GRAPH_VERSION, testMetaConnection } from "../ads/meta-client";
import { listMetaDayDates, loadMetaState, META_BACKFILL_DAYS, META_REFRESH_DAYS, META_RETENTION_DAYS } from "../ads/meta-ads-days";
import { isGa4Configured, loadPaidLandingState } from "../ads/paid-detection";
import { isAdsRefreshing, requestAdsRefresh } from "../ads/ads-refresh";
import { getAdsReport } from "../ads/ads-report";
import { adsDiagnosticsSummary, buildAdsDiagnostics } from "../ads/ads-diagnostics";

const log = child({ module: "routes/ads" });

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
  return {
    ads,
    token_configured: isMetaTokenConfigured(),
    api_version: META_GRAPH_VERSION,
    utm_template: META_UTM_TEMPLATE,
    refreshing: isAdsRefreshing(site),
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
  })
  .partial();

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  ad_account_ids: z.array(z.union([z.string(), z.number()])).max(50).optional(),
  alert_thresholds: thresholdsSchema.optional(),
  test_email_patterns: z.array(z.string().max(200)).max(100).optional(),
});

function parseReportQuery(req: Request) {
  const q = req.query as Record<string, unknown>;
  const platformRaw = typeof q.platform === "string" ? q.platform : "all";
  const platform = (PLATFORMS as string[]).includes(platformRaw) ? (platformRaw as AdPlatform | "all") : "all";
  return {
    days: Number(q.days) || 28,
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
        sync_requested = await requestAdsRefresh(site, contentRoot, listMetaDayDates(site).length > 0 && newAccounts.length === 0 ? "refresh" : "backfill");
      }
      res.json({ success: true, sync_requested, ...settingsPayload(res) });
    } catch (err) {
      log.warn({ err }, "[ads] failed to save settings");
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to save Ads settings" });
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
    const requested = await requestAdsRefresh(site, contentRoot, mode);
    res.json({ success: true, requested, mode, refreshing: true });
  });

  api.get(app, "/api/ads/report", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "metrics_view");
    if (!auth.authorized) return;
    try {
      const q = parseReportQuery(req);
      const report = await getAdsReport({ site: getSite(res), contentRoot: getContentRoot(res), ...q });
      res.json(report);
    } catch (err) {
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
        covered_days: report.covered_days,
        consent: report.consent,
        thresholds: { min_paid_visits_for_rates: report.thresholds.min_paid_visits_for_rates },
        warnings: report.warnings,
      });
    } catch (err) {
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
      const days = Number(req.query.days) === 7 ? 7 : 28;
      res.json(await buildAdsDiagnostics({ site, contentRoot, days }));
    } catch (err) {
      log.warn({ err }, "[ads] diagnostics failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build Ads diagnostics" });
    }
  });
}
