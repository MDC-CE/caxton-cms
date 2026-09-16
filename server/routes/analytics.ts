/**
 * Staff / MCP analytics reports from GA4 BigQuery export.
 */

import type { Express } from "express";
import { z } from "zod";
import { api } from "../rate-limit/api";
import { child } from "../logger";
import {
  ANALYTICS_REPORTS,
  AnalyticsReportValidationError,
  getAnalyticsReport,
  type AnalyticsReportName,
} from "../analytics/reports";

const log = child({ module: "routes/analytics" });

const reportSchema = z.object({
  report: z.enum(ANALYTICS_REPORTS as unknown as [AnalyticsReportName, ...AnalyticsReportName[]]),
  days: z.coerce.number().int().min(1).max(90).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  path: z.string().optional(),
  content_type: z.string().optional(),
  slug: z.string().optional(),
  locale: z.string().optional(),
  event_names: z.string().optional(),
});

export function registerAnalyticsRoutes(app: Express): void {
  api.get(app, "/api/analytics/report", { rate: "publicRead" }, async (req, res) => {
    const { requireCapability } = await import("./_helpers");
    const auth = await requireCapability(req, res, "metrics_view");
    if (!auth.authorized) return;

    const parsed = reportSchema.safeParse({
      report: req.query.report,
      days: req.query.days,
      limit: req.query.limit,
      path: req.query.path,
      content_type: req.query.content_type,
      slug: req.query.slug,
      locale: req.query.locale,
      event_names: req.query.event_names,
    });
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid query",
        details: parsed.error.flatten(),
      });
    }

    const { report, days, limit, path, content_type, slug, locale, event_names } = parsed.data;
    const eventList = event_names
      ? event_names
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    try {
      const result = await getAnalyticsReport({
        report,
        days,
        limit,
        path,
        content_type,
        slug,
        locale,
        event_names: eventList,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof AnalyticsReportValidationError) {
        return res.status(400).json({ error: err.message });
      }
      log.error({ err }, "[AnalyticsRoutes] GET /api/analytics/report");
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
