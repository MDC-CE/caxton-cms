/**
 * Cookie consent (tracking banner) routes.
 *
 * Public:
 *   GET  /api/consent-window  — banner mode for this visitor + copy + durations
 *   POST /api/consent         — record "shown" or a decision; decisions set the `4g_consent` cookie
 *   POST /api/ad-context      — after consent, merge campaign context into the HttpOnly `4g_ads` cookie
 * Staff (ads_settings):
 *   GET/PUT /api/settings/consent/window — countries, unknown-country mode, durations, banner copy
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { api } from "../rate-limit/api";
import { getDefaultContentRoot } from "../site-config";
import { getVM } from "../site-manager";
import { getDefaultLocale, normalizeLocale, getConsentWindowSettings, updateConsentWindowSettings } from "../settings";
import { markFileAsModified } from "../sync-state";
import { requireCapability } from "./_helpers";
import { getParentCookieDomain } from "../versioning/cookie-utils";
import { resolveVisitorCountry } from "../ads/visitor-country";
import { recordConsentEvent } from "../ads/consent-store";
import {
  clearAdContext,
  hasTrackingConsentCookie,
  mergeAdContext,
  readAdContext,
  writeAdContext,
} from "../ads/ad-context";
import { child } from "../logger";
import {
  CONSENT_COOKIE_NAME,
  COOKIE_BANNER_KEYS,
  CONSENT_DECISIONS,
  consentMaxAgeDays,
  effectiveAskCountries,
  isRejectDurationRisky,
  resolveConsentMode,
  resolveCookieBannerCopy,
  serializeConsentCookie,
  type ConsentDecision,
  type ConsentMode,
  type CookieBannerKey,
} from "@shared/consent";

const log = child({ module: "routes/consent" });

function getContentRoot(res: Response): string {
  return (res.locals.site as { contentRoot?: string } | undefined)?.contentRoot ?? getDefaultContentRoot();
}

function getSiteKey(res: Response): string | null {
  return (res.locals.site as { contentRootName?: string } | undefined)?.contentRootName ?? null;
}

function staffWindowPayload(res: Response) {
  const contentRoot = getContentRoot(res);
  const defaultLocale = getDefaultLocale(contentRoot);
  const window = getConsentWindowSettings(contentRoot);
  return {
    window,
    effective_ask_countries: effectiveAskCountries(window),
    reject_duration_risky: isRejectDurationRisky(window.reject_days),
    copy: getVM(res).getCookieBannerSettings(defaultLocale),
    default_locale: defaultLocale,
  };
}

const consentEventSchema = z.object({
  kind: z.enum(["shown", ...CONSENT_DECISIONS] as [string, ...string[]]),
  mode: z.enum(["ask", "notice"]),
  country: z.string().regex(/^[A-Za-z]{2}$/).optional().nullable(),
});

const windowUpdateSchema = z.object({
  ask_countries: z.union([z.literal("default"), z.array(z.string().regex(/^[A-Za-z]{2}$/))]).optional(),
  unknown_country_mode: z.enum(["ask", "notice"]).optional(),
  accept_days: z.number().int().min(1).max(3650).optional(),
  reject_days: z.number().int().min(1).max(3650).optional(),
  copy: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional()
    .refine(
      (v) => !v || Object.keys(v).every((k) => (COOKIE_BANNER_KEYS as readonly string[]).includes(k)),
      { message: "Unknown cookie banner key" },
    ),
});

export function registerConsentRoutes(app: Express): void {
  api.get(app, "/api/consent-window", { rate: "publicRead" }, async (req: Request, res: Response) => {
    try {
      const contentRoot = getContentRoot(res);
      const defaultLocale = getDefaultLocale(contentRoot);
      const locale = normalizeLocale(typeof req.query.locale === "string" ? req.query.locale : null, contentRoot);
      const window = getConsentWindowSettings(contentRoot);
      const country = await resolveVisitorCountry(req);
      const mode: ConsentMode = resolveConsentMode(country, window);
      const vm = getVM(res);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        mode,
        country,
        accept_days: window.accept_days,
        reject_days: window.reject_days,
        copy: resolveCookieBannerCopy(vm.getCookieBannerSettings(defaultLocale), locale),
        privacy_url: vm.getLegalSettings().legal_privacy_url || null,
      });
    } catch (err) {
      log.error({ err }, "[consent] failed to resolve consent window");
      res.status(500).json({ error: "Failed to load consent window" });
    }
  });

  api.post(app, "/api/consent", { rate: "publicRead" }, (req: Request, res: Response) => {
    const parsed = consentEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid consent event" });
    }
    const { kind, mode } = parsed.data;
    const country = parsed.data.country ? parsed.data.country.toUpperCase() : null;
    const contentRoot = getContentRoot(res);
    const window = getConsentWindowSettings(contentRoot);

    if (kind !== "shown") {
      const decision = kind as ConsentDecision;
      if (mode === "ask" && decision === "granted_implied") {
        return res.status(400).json({ error: "Implied consent is not allowed in ask mode" });
      }
      const days = consentMaxAgeDays(decision, window);
      const domain = getParentCookieDomain(req.hostname);
      res.cookie(CONSENT_COOKIE_NAME, serializeConsentCookie({ decision, mode, at: Date.now() / 1000 }), {
        maxAge: days * 86_400_000,
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        ...(domain ? { domain } : {}),
      });
      if (decision === "denied") clearAdContext(req, res);
    }

    const site = getSiteKey(res);
    if (site) {
      try {
        recordConsentEvent(site, { kind: kind as "shown" | ConsentDecision, mode, country });
      } catch (err) {
        log.warn({ err }, "[consent] failed to record consent counter");
      }
    }
    res.json({ ok: true });
  });

  api.post(app, "/api/ad-context", { rate: "publicRead" }, (req: Request, res: Response) => {
    if (!hasTrackingConsentCookie(req)) {
      return res.status(403).json({ ok: false, error: "Tracking consent not granted" });
    }
    const body = (req.body ?? {}) as { utm?: unknown; first_touch?: unknown; paid_landing?: unknown };
    const merged = mergeAdContext(readAdContext(req), body);
    const stored = writeAdContext(req, res, merged);
    res.json({ ok: stored, has_paid_landing: !!merged.last_paid });
  });

  api.get(app, "/api/settings/consent/window", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    try {
      res.json(staffWindowPayload(res));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load consent window" });
    }
  });

  api.put(app, "/api/settings/consent/window", { rate: "staffWrite" }, async (req: Request, res: Response) => {
    const auth = await requireCapability(req, res, "ads_settings");
    if (!auth.authorized) return;
    const parsed = windowUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    try {
      const contentRoot = getContentRoot(res);
      const { copy, ...windowPatch } = parsed.data;
      if (Object.keys(windowPatch).length > 0) {
        updateConsentWindowSettings(windowPatch, contentRoot);
        markFileAsModified("settings.yml", undefined, undefined, contentRoot);
      }
      if (copy) {
        const defaultLocale = getDefaultLocale(contentRoot);
        for (const [key, locales] of Object.entries(copy)) {
          getVM(res).updateCookieBannerSetting(key as CookieBannerKey, locales, defaultLocale);
        }
      }
      res.json({ success: true, ...staffWindowPayload(res) });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to save consent window" });
    }
  });
}
