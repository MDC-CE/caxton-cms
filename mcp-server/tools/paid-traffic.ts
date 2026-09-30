/**
 * MCP get_paid_traffic — paid landing pages, spend, and ad tracking health (read-only).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { denyUnlessMetricsView } from "../lib/auth.js";
import type { CatalogGrant } from "../lib/tool-catalog.js";
import { ok, fail, type McpSideEffect, type NextAction } from "../lib/respond.js";
import { resolveSiteContext } from "../lib/content.js";
import { SITE_PARAM_DESC, MULTI_SITE_TOOL_BLURB } from "../lib/entry-helpers.js";
import { getTokenUsername } from "../lib/oauth.js";

const MAIN_SERVER_PORT = process.env.PORT || "5000";
const INTERNAL_SECRET = process.env.MCP_SERVER_SECRET || process.env.MCP_API_KEY || "";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SUMMARY_TOP = 5;

type Warning = { code: string; message: string };
type Money = Record<string, number>;
type PageRow = {
  key: string;
  title: string;
  url: string;
  path: string;
  kind: string;
  content_type: string | null;
  slug: string | null;
  locale: string | null;
  spend: Money;
  paid_visits: number;
  unique_leads: number;
  submissions: number;
  conversion_rate: number | null;
  cost_per_lead: Money;
  low_sample: boolean;
  campaigns?: unknown[];
  versions?: unknown[];
  [k: string]: unknown;
};
type Report = {
  window: unknown;
  platform: string;
  attribution: unknown;
  meta: { connected: boolean; last_synced_at: string | null; accounts: unknown[] };
  ga4: { configured: boolean; last_export_date: string | null };
  refreshing: boolean;
  collecting_since: string | null;
  covered_days: unknown;
  consent: unknown;
  totals: Record<string, unknown>;
  pages: PageRow[];
  destinations: PageRow[];
  campaigns: unknown[];
  thresholds: unknown;
  warnings: Warning[];
};

function internalHeaders(mcpToken?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_SECRET) headers.Authorization = `Bearer ${INTERNAL_SECRET}`;
  const username = mcpToken ? getTokenUsername(mcpToken) : undefined;
  if (username) headers["x-mcp-author"] = username;
  return headers;
}

function moneyTotal(m: Money | undefined): number {
  return Object.values(m ?? {}).reduce((a, b) => a + b, 0);
}

type SortKey = "spend" | "paid_visits" | "unique_leads" | "conversion_rate" | "cost_per_lead";

function sortPages(rows: PageRow[], sort: SortKey): PageRow[] {
  const val = (r: PageRow): number | null => {
    switch (sort) {
      case "spend":
        return moneyTotal(r.spend);
      case "cost_per_lead":
        return r.unique_leads > 0 ? moneyTotal(r.cost_per_lead) : null;
      case "conversion_rate":
        return r.low_sample ? null : r.conversion_rate;
      default:
        return r[sort];
    }
  };
  const asc = sort === "cost_per_lead";
  return [...rows].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return asc ? av - bv : bv - av;
  });
}

const NON_EFFECTS = [
  "Read-only: does not change Meta campaigns, settings, or lead delivery.",
  "Test leads (staff session / test email pattern) are excluded from lead counts.",
  "Meta-reported leads and site leads are separate sources — never summed.",
];

export function registerPaidTrafficTools(mcp: McpServer, mcpToken?: string, grants?: CatalogGrant[]): void {
  mcp.tool(
    "get_paid_traffic",
    "Paid traffic by landing page: ad spend (Meta Marketing API), paid visits (GA4 BigQuery export), and site leads (lead ledger), " +
      "plus ad tracking health. Requires metrics_view. Exclusive mode per call: " +
      "summary (totals + top pages) | campaigns | entries (managed pages, paginated) | destinations (spend that did not land on a managed page) | diagnostics (tracking issues, KPIs, consent rates). " +
      "days 1–90 ending yesterday (default 28; diagnostics uses 7 or 28). Credit: one lead → one landing page (model last_paid default | first_paid), 30-day lookback, no split; the form page never gets credit. " +
      "Money is per currency (never converted). Soft status not_configured when neither Meta nor GA4 export is set up. " +
      "When warnings include meta_refresh_in_progress, re-call in ~1 minute for fresh numbers. " +
      "Read-only — not GSC (get_organic_traffic), not general GA4 reports (get_analytics_report). " +
      MULTI_SITE_TOOL_BLURB,
    {
      mode: z.enum(["summary", "campaigns", "entries", "destinations", "diagnostics"]).describe("Exclusive mode for this call"),
      days: z.number().int().min(1).max(90).optional().describe("Lookback days ending yesterday (default 28). diagnostics: ≤7 → 7, else 28."),
      platform: z
        .enum(["all", "meta", "google", "microsoft", "tiktok", "linkedin", "x", "snapchat", "pinterest", "other"])
        .optional()
        .describe("Filter paid visits by ad platform (default all). Spend is Meta only in Phase 1."),
      currency: z.string().optional().describe("ISO currency filter, e.g. USD. Omit for all currencies (returned per currency)."),
      account: z.string().optional().describe("Meta ad account id filter (digits; act_ prefix optional)"),
      content_type: z.string().optional().describe("entries/summary: limit pages to one CMS content type"),
      model: z.enum(["last_paid", "first_paid"]).optional().describe("Lead credit model (default last_paid)"),
      group: z
        .enum(["page", "campaign"])
        .optional()
        .describe("entries only: page (default, campaigns trimmed to top 3 per row) or campaign (full campaign list per row)"),
      split_by_version: z.boolean().optional().describe("entries only: include per-variant rows from experiment_exposure"),
      sort: z
        .enum(["spend", "paid_visits", "unique_leads", "conversion_rate", "cost_per_lead"])
        .optional()
        .describe("entries/destinations sort (default spend). Low-sample rows sort last for rates."),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Page size (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
      site: z.string().optional().describe(SITE_PARAM_DESC),
    },
    async ({ mode, days, platform, currency, account, content_type, model, group, split_by_version, sort, limit, offset, site }) => {
      const denied = await denyUnlessMetricsView(mcpToken, grants);
      if (denied) return denied;
      const siteResult = resolveSiteContext(site);
      if (!siteResult.ok) return fail(siteResult.error);
      const domain = siteResult.domain;
      const lim = limit ?? DEFAULT_LIMIT;
      const off = offset ?? 0;

      try {
        if (mode === "diagnostics") {
          const params = new URLSearchParams({ days: (days ?? 28) <= 7 ? "7" : "28" });
          if (domain) params.set("__site", domain);
          const res = await fetch(`http://127.0.0.1:${MAIN_SERVER_PORT}/api/diagnostics/ads?${params}`, { headers: internalHeaders(mcpToken) });
          const data = (await res.json()) as Record<string, unknown>;
          if (!res.ok) return fail((data.error as string) || `Server error: ${res.status}`);
          const warnings: Warning[] = [];
          if (data.refreshing) warnings.push({ code: "meta_refresh_in_progress", message: "Ad data is refreshing; re-call in ~1 minute." });
          const issues = Array.isArray(data.issues) ? data.issues : [];
          return ok(
            {
              message: `Ads diagnostics (${data.window_days} days): ${String(data.status)}`,
              ...(data.status === "not_connected" ? { status_detail: "Meta not connected — only GA4/consent checks ran" } : {}),
              ...data,
              issues: issues.slice(off, off + lim),
              issues_total: issues.length,
              non_effects: NON_EFFECTS,
            },
            {
              warnings,
              side_effects: [
                {
                  kind: "landing_probe",
                  summary: "Probes up to 10 top ad landing URLs (redirects followed manually; results cached 6h) and records Issues/Resolved state.",
                  paths: [".cache/{site}/ads-issues.json"],
                },
              ],
              next_actions: data.refreshing
                ? [{ tool: "get_paid_traffic", priority: "recommended", reason: "Re-call after refresh", args_hint: { mode: "diagnostics" } }]
                : [],
            },
          );
        }

        const params = new URLSearchParams();
        if (days != null) params.set("days", String(days));
        if (platform) params.set("platform", platform);
        if (currency) params.set("currency", currency);
        if (account) params.set("account", account);
        if (content_type) params.set("content_type", content_type);
        if (model) params.set("model", model);
        if (split_by_version && mode === "entries") params.set("split_by_version", "1");
        if (domain) params.set("__site", domain);
        const res = await fetch(`http://127.0.0.1:${MAIN_SERVER_PORT}/api/ads/report?${params}`, { headers: internalHeaders(mcpToken) });
        const data = (await res.json()) as Report & { error?: string };
        if (!res.ok) return fail(data.error || `Server error: ${res.status}`);

        const warnings: Warning[] = [...(data.warnings ?? [])];
        const notConfigured = !data.meta.connected && !data.ga4.configured;
        const next_actions: NextAction[] = [];
        if (data.refreshing) {
          next_actions.push({ tool: "get_paid_traffic", priority: "recommended", reason: "Ad data is refreshing; re-call in ~1 minute", args_hint: { mode } });
        }
        if (notConfigured) {
          next_actions.push({ tool: "explain_site", priority: "recommended", reason: "Setup: Meta token + accounts, GA4 export", args_hint: { topic: "ads" } });
        }

        const base = {
          ...(notConfigured ? { status: "not_configured" } : { status: "ok" }),
          window: data.window,
          platform: data.platform,
          attribution: data.attribution,
          consent: data.consent,
          covered_days: data.covered_days,
          collecting_since: data.collecting_since,
          meta: data.meta,
          ga4: data.ga4,
          refreshing: data.refreshing,
          thresholds: data.thresholds,
          non_effects: NON_EFFECTS,
        };
        const meta = { warnings, side_effects: [] as McpSideEffect[], next_actions };

        if (mode === "summary") {
          const top = sortPages(data.pages, "spend")
            .slice(0, SUMMARY_TOP)
            .map(({ campaigns: _c, versions: _v, ...r }) => r);
          return ok(
            {
              message: "Paid traffic summary",
              ...base,
              totals: data.totals,
              pages_total: data.pages.length,
              destinations_total: data.destinations.length,
              campaigns_total: data.campaigns.length,
              top_pages: top,
            },
            meta,
          );
        }

        if (mode === "campaigns") {
          return ok(
            {
              message: "Paid traffic by campaign",
              ...base,
              total: data.campaigns.length,
              offset: off,
              limit: lim,
              campaigns: data.campaigns.slice(off, off + lim),
            },
            meta,
          );
        }

        const source = mode === "destinations" ? data.destinations : data.pages;
        const sorted = sortPages(source, sort ?? "spend");
        const pageRows = sorted.slice(off, off + lim).map((r) =>
          group === "campaign" || mode === "destinations" ? r : { ...r, campaigns: (r.campaigns ?? []).slice(0, 3) },
        );
        return ok(
          {
            message: mode === "destinations" ? "Paid traffic to other destinations" : "Paid traffic by landing page",
            ...base,
            total: source.length,
            offset: off,
            limit: lim,
            has_more: off + lim < source.length,
            [mode === "destinations" ? "destinations" : "entries"]: pageRows,
          },
          meta,
        );
      } catch (e) {
        return fail(`get_paid_traffic failed: ${(e as Error).message}`);
      }
    },
  );
}
