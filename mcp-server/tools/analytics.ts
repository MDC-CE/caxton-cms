/**
 * MCP get_analytics_report — named GA4 BigQuery reports (read-only).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { denyUnlessMetricsView } from "../lib/auth.js";
import type { CatalogGrant } from "../lib/tool-catalog.js";
import { ok, fail } from "../lib/respond.js";
import { resolveSiteContext } from "../lib/content.js";
import { SITE_PARAM_DESC, MULTI_SITE_TOOL_BLURB } from "../lib/entry-helpers.js";
import { getTokenUsername } from "../lib/oauth.js";

const MAIN_SERVER_PORT = process.env.PORT || "5000";
const INTERNAL_SECRET = process.env.MCP_SERVER_SECRET || process.env.MCP_API_KEY || "";

function internalHeaders(mcpToken?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_SECRET) {
    headers.Authorization = `Bearer ${INTERNAL_SECRET}`;
    const username = mcpToken ? getTokenUsername(mcpToken) : undefined;
    if (username) headers["x-mcp-author"] = username;
  } else if (mcpToken) {
    const username = getTokenUsername(mcpToken);
    if (username) headers["x-mcp-author"] = username;
  }
  return headers;
}

export function registerAnalyticsTools(
  mcp: McpServer,
  mcpToken?: string,
  grants?: CatalogGrant[],
): void {
  mcp.tool(
    "get_analytics_report",
    "Run one named GA4 analytics report from the BigQuery export (metrics_view). " +
      "Exclusive report per call: site_summary | top_pages | page_detail | events_by_name | traffic_sources. " +
      "page_detail: pass path (public pathname/URL) OR content_type+slug (+ optional locale); bare slug fails. " +
      "Server resolves live URLs and returns resolved_paths. days 1–90 ending yesterday (default 28); data lags ~1 day. " +
      "Soft status not_configured when tracking.bigquery is unset (see /private/tracking/ga4); empty window is status ok + warning. " +
      "Read-only — not GSC (use get_organic_traffic), not product journey KPIs (use get_product_funnel_analytics), no content writes. " +
      MULTI_SITE_TOOL_BLURB,
    {
      report: z
        .enum(["site_summary", "top_pages", "page_detail", "events_by_name", "traffic_sources"])
        .describe("Named report for this call"),
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe("Lookback days ending yesterday (default 28)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Row cap for top_pages / events_by_name / traffic_sources (default 20)"),
      path: z
        .string()
        .optional()
        .describe('page_detail: public path or URL, e.g. /en/blog/foo. Do not combine with content_type+slug.'),
      content_type: z
        .string()
        .optional()
        .describe("page_detail: CMS content type with slug (not bare slug alone)"),
      slug: z
        .string()
        .optional()
        .describe("page_detail: entry slug; requires content_type"),
      locale: z
        .string()
        .optional()
        .describe("page_detail with content_type+slug: which live locale URL (default primary en when present)"),
      event_names: z
        .array(z.string())
        .optional()
        .describe("events_by_name only: optional filter list; omit for top events by count"),
      site: z.string().optional().describe(SITE_PARAM_DESC),
    },
    async ({
      report,
      days,
      limit,
      path,
      content_type,
      slug,
      locale,
      event_names,
      site,
    }) => {
      const denied = await denyUnlessMetricsView(mcpToken, grants);
      if (denied) return denied;
      const siteResult = resolveSiteContext(site);
      if (!siteResult.ok) return fail(siteResult.error);
      const domain = siteResult.domain;

      try {
        const params = new URLSearchParams();
        params.set("report", report);
        if (days != null) params.set("days", String(days));
        if (limit != null) params.set("limit", String(limit));
        if (path) params.set("path", path);
        if (content_type) params.set("content_type", content_type);
        if (slug) params.set("slug", slug);
        if (locale) params.set("locale", locale);
        if (event_names?.length) params.set("event_names", event_names.join(","));
        if (domain) params.set("__site", domain);

        const url = `http://127.0.0.1:${MAIN_SERVER_PORT}/api/analytics/report?${params}`;
        const res = await fetch(url, { headers: internalHeaders(mcpToken) });
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return fail((data.error as string) || `Server error: ${res.status}`);
        }

        const warnings: Array<{ code: string; message: string }> = Array.isArray(data.warnings)
          ? (data.warnings as Array<{ code: string; message: string }>)
          : [];
        warnings.push({
          code: "not_gsc_or_journey",
          message:
            "This is GA4 behavioral analytics (BigQuery export). For Search Console use get_organic_traffic; for product funnel page KPIs use get_product_funnel_analytics.",
        });

        return ok(
          {
            message: `Analytics report ${report}`,
            ...data,
          },
          {
            warnings,
            next_actions:
              data.status === "not_configured"
                ? [
                    {
                      tool: "explain_site",
                      priority: "recommended",
                      reason: "BigQuery may be unconfigured — see topic analytics / staff /private/tracking/ga4",
                      args_hint: { topic: "analytics" },
                    },
                  ]
                : [],
          },
        );
      } catch (e) {
        return fail(`get_analytics_report failed: ${(e as Error).message}`);
      }
    },
  );
}
