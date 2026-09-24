// Vite 8 compatibility audit (task-579, 2025-05-29)
//
// API surface confirmed still valid in Vite 8.0.14:
//
//  vite.ssrLoadModule()   — NOT deprecated. Still the recommended way to load
//                           and execute an ES-module entry point in the dev-server
//                           SSR environment. The Vite 8 type definition at
//                           node_modules/vite/dist/node/index.d.ts:2633 carries no
//                           @deprecated annotation. The new Module Runner API
//                           (createViteRuntime / server.environments.ssr.runner) is
//                           an *alternative* introduced for framework authors; it is
//                           not a mandatory replacement for per-request ssrLoadModule.
//
//  vite.ssrFixStacktrace() — Unchanged. Still present in Vite 8 types.
//
//  allowedHosts: true      — Valid. Confirmed at types line 626.
//
//  server.middlewareMode   — Valid. Unchanged in Vite 8.
//
//  appType: "custom"       — Valid. Unchanged in Vite 8.
//
// Dev-console deprecation warnings observed during audit: NONE from Vite.
// (PostCSS "from" warning originates from a PostCSS plugin, not Vite.)
import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger, type ViteDevServer } from "vite";
import { isWeblifyDebug } from "../shared/debug";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { resolveInitialData, resolvePreloadHints, injectSsrMetaTags, type PreloadHint, type InitialDataPayload } from "./initial-data-middleware";
import { injectSsrSchemaHtml } from "./ssr-schema";
import { resolvePublicHtmlStatus } from "./public-html-status";
import { applyEntryModulePreload } from "./utils/html-transforms";
import { getEntryAssets, buildEntryPreloadTags, buildEntryLinkHeader } from "./utils/vite-manifest";
import { isMeaningfulSsrAppHtml } from "./utils/ssr-html";
import {
  logSlowHtmlIfNeeded,
  type SlowHtmlOutcome,
} from "./utils/request-health";
import {
  buildHtmlCacheKey,
  setCachedHtml,
  shouldBypassHtmlCache,
} from "./html-page-cache";
import { injectGtmWebContainerId } from "./gtm-web-inject";
import { child as loggerChild } from "./logger";
import { recordPublicNotFound } from "./runtime-issues-store";

function maybeRecordPublicNotFound(req: Request, res: Response, status: number): void {
  if (status !== 404) return;
  const rawUrl = req.originalUrl || req.url || "/";
  const pathOnly = rawUrl.split("?")[0].split("#")[0];
  if (pathOnly.startsWith("/api/") || pathOnly.startsWith("/private/")) return;
  const querySearch = rawUrl.includes("?") ? rawUrl.split("?")[1].split("#")[0] : "";
  const site = (res.locals as { site?: { contentRootName?: string; contentRoot?: string; config?: { domain?: string } } }).site;
  try {
    recordPublicNotFound({
      site: site?.contentRootName || "default",
      contentRoot: site?.contentRoot,
      path: pathOnly,
      querySearch,
      hostname: req.hostname || site?.config?.domain,
      referrer: typeof req.get === "function" ? req.get("referer") : undefined,
      userAgent: typeof req.get === "function" ? req.get("user-agent") : undefined,
    });
  } catch {
    // never break HTML responses
  }
}

const ssrLogger = loggerChild({ module: "ssr" });

/** Verbose SSR diagnostics: on in development, or when SSR_DIAG=1. */
function ssrDiagEnabled(): boolean {
  return process.env.SSR_DIAG === "1" || process.env.NODE_ENV !== "production";
}

function ssrDiag(
  fields: Record<string, unknown>,
  message: string,
  level: "info" | "warn" = "info",
): void {
  if (!ssrDiagEnabled() && level === "info") return;
  if (level === "warn") ssrLogger.warn(fields, `[SSR-diag] ${message}`);
  else ssrLogger.info(fields, `[SSR-diag] ${message}`);
}

async function getInitialDataForRequest(
  url: string,
  res: import("express").Response,
): Promise<InitialDataPayload | null> {
  const locals = res.locals as {
    initialDataPromise?: Promise<InitialDataPayload | null>;
    site?: { contentIndex?: unknown; database?: unknown };
  };
  if (locals.initialDataPromise) {
    return locals.initialDataPromise;
  }
  const site = locals.site as import("./site-manager").SiteContext | undefined;
  const promise = resolveInitialData(
    url,
    site?.contentIndex as any,
    site?.database as any,
    site,
  ).catch(() => null);
  locals.initialDataPromise = promise;
  return promise;
}

function buildPreloadTags(hints: PreloadHint[]): string {
  if (hints.length === 0) return "";
  // Only the first (true LCP) candidate gets fetchpriority=high; siblings stay
  // as plain preloads so they don't contend for bandwidth with the hero.
  return hints
    .map((hint, index) => {
      const href = `href="${hint.src.replace(/"/g, "&quot;")}"`;
      const priority =
        index === 0 || hint.highPriority
          ? ` fetchpriority="high"`
          : "";
      if (hint.srcset) {
        const imagesrcset = `imagesrcset="${hint.srcset.replace(/"/g, "&quot;")}"`;
        const imagesizes = `imagesizes="${(hint.sizes ?? "100vw").replace(/"/g, "&quot;")}"`;
        return `<link rel="preload" as="image"${priority} ${href} ${imagesrcset} ${imagesizes}>`;
      }
      return `<link rel="preload" as="image"${priority} ${href}>`;
    })
    .join("\n");
}

function injectPreloadTags(html: string, preloadTags: string): string {
  if (!preloadTags) return html;
  return html.replace("</head>", preloadTags + "\n</head>");
}

const viteLogger = createLogger();

function quietViteLogger(): typeof viteLogger {
  const noop = () => {};
  return {
    ...viteLogger,
    info: noop,
    warn: noop,
    // keep error / hasErrorLogged / clear* from viteLogger
  };
}

function siteContentIndex(res: Response): { isKnownUrl(url: string): boolean } | undefined {
  return (res.locals as { site?: { contentIndex?: { isKnownUrl(url: string): boolean } } }).site
    ?.contentIndex;
}

export function log(message: string, source = "express") {
  // Route through Pino so every server log line is structured JSON in production.
  // pino-pretty renders it with a human-readable timestamp in development.
  ssrLogger.info({ source }, message);
}

export async function setupVite(app: Express, server: Server): Promise<ViteDevServer> {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
    ws: { perMessageDeflate: false },
  };

  // The engine root is always one level above this server/ file when running from source,
  // or WEBLIFY_PACKAGE_ROOT when running as an installed package.
  const { getPackageRoot } = await import("@shared/paths");
  const projectRoot = getPackageRoot();

  // vite.config.ts exports an async factory via defineConfig.
  // We must call it to get the resolved config object before spreading.
  // Note: isSsrBuild was removed from the callback params in Vite 6+; omit it here.
  const resolvedViteConfig = typeof viteConfig === "function"
    ? await (viteConfig as Function)({ mode: "development", command: "serve" })
    : viteConfig;

  const baseLogger = isWeblifyDebug() ? viteLogger : quietViteLogger();

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    // Always override root and resolve.alias with project-root-relative paths so
    // they are correct regardless of where vite.config was loaded from.
    root: path.resolve(projectRoot, "client"),
    resolve: {
      ...(resolvedViteConfig?.resolve ?? {}),
      alias: {
        "@": path.resolve(projectRoot, "client", "src"),
        "@shared": path.resolve(projectRoot, "shared"),
        "@assets": path.resolve(projectRoot, "attached_assets"),
      },
    },
    customLogger: {
      ...baseLogger,
      error: (msg, options) => {
        baseLogger.error(msg, options);
        // Only crash on genuine build/plugin errors, not on SSR pre-transform misses
        if (options?.error && !msg.includes("Pre-transform error")) {
          process.exit(1);
        }
      },
    },
    // Merge vite.config server options (fs, warmup, etc.) with the runtime
    // middleware-mode overrides so neither set silently drops the other.
    server: {
      ...(resolvedViteConfig?.server ?? {}),
      ...serverOptions,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    // Never serve the SPA shell for API paths — callers expect JSON.
    // Prefer originalUrl: Express `*` can leave req.path as "/" even for /api/...
    if (req.path.startsWith("/api/") || req.originalUrl.startsWith("/api/")) {
      if (!res.headersSent) {
        const apiPath = (req.originalUrl || req.url || req.path).split("?")[0];
        res.status(404).json({ error: `API route not found: ${req.method} ${apiPath}` });
      }
      return;
    }

    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);

      const initialDataPayload = await getInitialDataForRequest(url, res);

      let appHtml = "";
      const cleanUrlForSsr = url.split("?")[0].split("#")[0];
      const skipSsr = cleanUrlForSsr.startsWith("/private/");
      let ssrOutcome: "ok" | "skipped" | "empty" | "error" = skipSsr ? "skipped" : "ok";
      if (!skipSsr) {
        const t0 = Date.now();
        try {
          const entryServerAbs = path.resolve(
            import.meta.dirname,
            "..",
            "client",
            "src",
            "entry-server.tsx",
          );
          const { render } = await vite.ssrLoadModule(entryServerAbs);
          if (typeof render !== "function") {
            ssrOutcome = "error";
            ssrDiag(
              { url, renderType: typeof render },
              "dev ssrLoadModule did not export render()",
              "warn",
            );
          } else {
            appHtml = await render(url, initialDataPayload);
            if (!isMeaningfulSsrAppHtml(appHtml)) {
              ssrDiag(
                { url, appHtmlLength: appHtml?.length ?? 0, ms: Date.now() - t0 },
                "SSR returned empty body, retrying once",
                "warn",
              );
              appHtml = await render(url, initialDataPayload);
            }
            if (!isMeaningfulSsrAppHtml(appHtml)) {
              ssrOutcome = "empty";
              ssrDiag(
                {
                  url,
                  appHtmlLength: appHtml?.length ?? 0,
                  ms: Date.now() - t0,
                  preview: String(appHtml ?? "").slice(0, 120),
                },
                "SSR returned empty body after retry, falling back to client-only",
                "warn",
              );
              appHtml = "";
            } else {
              ssrDiag(
                { url, appHtmlLength: appHtml.length, ms: Date.now() - t0 },
                "dev SSR ok — injecting into #root",
              );
            }
          }
        } catch (ssrErr) {
          ssrOutcome = "error";
          ssrDiag(
            {
              err: ssrErr,
              url,
              ms: Date.now() - t0,
              errMessage: ssrErr instanceof Error ? ssrErr.message : String(ssrErr),
            },
            "render failed, falling back to client-only",
            "warn",
          );
        }
      }

      const injected = isMeaningfulSsrAppHtml(appHtml);
      if (!injected && ssrOutcome !== "skipped") {
        ssrDiag(
          { url, ssrOutcome, rootInjected: false },
          "serving empty #root (client will first-paint)",
          "warn",
        );
      }

      let html = injected
        ? page.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
        : page;

      const preloadUrls = resolvePreloadHints(initialDataPayload);
      const preloadTags = buildPreloadTags(preloadUrls);
      html = injectPreloadTags(html, preloadTags);
      html = injectSsrMetaTags(
        html,
        initialDataPayload,
        (res.locals as any).site?.contentRoot,
        url,
      );

      const ssrSchemaHtml = (req as any).ssrSchemaHtml as string | undefined;
      if (ssrSchemaHtml) {
        html = injectSsrSchemaHtml(html, ssrSchemaHtml);
      }

      if (initialDataPayload) {
        const scriptTag = `<script id="__INITIAL_DATA__" type="application/json">${JSON.stringify(initialDataPayload).replace(/</g, "\\u003c")}</script>`;
        html = html.replace("</body>", scriptTag + "</body>");
      }

      html = injectGtmWebContainerId(html, (res.locals as any).site?.contentRoot);

      const payloadStatus =
        initialDataPayload &&
        typeof (initialDataPayload as { httpStatus?: number }).httpStatus === "number"
          ? (initialDataPayload as { httpStatus: number }).httpStatus
          : undefined;
      const status = resolvePublicHtmlStatus({
        url,
        httpStatus: payloadStatus,
        contentIndex: siteContentIndex(res),
      });
      maybeRecordPublicNotFound(req, res, status);
      res.status(status).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  return vite;
}

let ssrRenderFn: ((url: string, payload: unknown) => Promise<string>) | null = null;
let ssrModuleLoaded = false;

async function getSsrRender() {
  if (ssrModuleLoaded) {
    if (process.env.SSR_DIAG === "1") {
      ssrDiag(
        { cached: true, hasRender: typeof ssrRenderFn === "function" },
        "reusing cached SSR render fn",
      );
    }
    return ssrRenderFn;
  }
  ssrModuleLoaded = true;
  const ssrBundlePath = path.resolve(import.meta.dirname, "server", "entry-server.js");
  const exists = fs.existsSync(ssrBundlePath);
  ssrDiag({ ssrBundlePath, exists }, "loading SSR bundle");
  try {
    if (!exists) {
      ssrDiag({ ssrBundlePath }, "SSR bundle file missing — public pages will be client-only", "warn");
      return ssrRenderFn;
    }
    const mod = await import(ssrBundlePath);
    ssrRenderFn = typeof mod.render === "function" ? mod.render : null;
    if (!ssrRenderFn) {
      ssrDiag(
        { ssrBundlePath, exportKeys: Object.keys(mod ?? {}) },
        "SSR bundle loaded but mod.render is not a function",
        "warn",
      );
    } else {
      ssrDiag({ ssrBundlePath }, "SSR bundle loaded OK");
    }
  } catch (e) {
    ssrDiag({ err: e, ssrBundlePath }, "could not load SSR bundle", "warn");
  }
  return ssrRenderFn;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { index: false }));

  const indexHtmlPath = path.resolve(distPath, "index.html");

  // Resolve entry-chunk assets from the Vite manifest once at startup.
  // getEntryAssets is cached — returns empty arrays if the manifest is absent.
  const entryAssets = getEntryAssets(distPath);
  const entryPreloadTags = buildEntryPreloadTags(entryAssets);
  const entryLinkHeader = buildEntryLinkHeader(entryAssets);

  /** Inject entry-chunk preload tags after the first stylesheet so CSS is
   * discovered before the modulepreload storm (SSR text paints from CSS). */
  function applyEntryPreloads(html: string, res: import("express").Response): string {
    if (entryLinkHeader) {
      // Merge with any existing Link header set by upstream middleware.
      const existing = res.getHeader("Link");
      const merged = existing
        ? `${existing}, ${entryLinkHeader}`
        : entryLinkHeader;
      res.setHeader("Link", merged);
    }
    if (entryPreloadTags) {
      if (/<link[^>]+rel=["']stylesheet["']/i.test(html)) {
        html = html.replace(
          /(<link[^>]+rel=["']stylesheet["'][^>]*>)/i,
          `$1\n${entryPreloadTags}`,
        );
      } else {
        html = html.replace(/(<head[^>]*>)/i, `$1\n${entryPreloadTags}`);
      }
    }
    return html;
  }

  app.use("*", async (_req, res) => {
    if (_req.path.startsWith("/api/") || _req.originalUrl.startsWith("/api/")) {
      if (!res.headersSent) {
        const apiPath = (_req.originalUrl || _req.url || _req.path).split("?")[0];
        res.status(404).json({ error: `API route not found: ${_req.method} ${apiPath}` });
      }
      return;
    }

    const url = _req.originalUrl;
    const tHtml = Date.now();
    const htmlMeta: {
      cache: "HIT" | "MISS" | "BYPASS" | "NONE";
      outcome: SlowHtmlOutcome;
      appHtmlLength?: number;
    } = {
      cache: "NONE",
      outcome: "other",
    };
    res.on("finish", () => {
      logSlowHtmlIfNeeded({
        url,
        ms: Date.now() - tHtml,
        status: res.statusCode,
        cache: htmlMeta.cache,
        outcome: htmlMeta.outcome,
        appHtmlLength: htmlMeta.appHtmlLength,
      });
    });

    let status = resolvePublicHtmlStatus({
      url,
      contentIndex: siteContentIndex(res),
    });
    const ssrSchemaHtml = _req.ssrSchemaHtml;

    const cleanUrlForSsr = url.split("?")[0].split("#")[0];
    const skipSsr = cleanUrlForSsr.startsWith("/private/");

    const site = (res.locals as any).site;
    const siteId =
      site?.contentRootName ||
      site?.contentRoot ||
      site?.domain ||
      "default";
    const bypassCache = skipSsr || shouldBypassHtmlCache(_req);
    if (bypassCache) htmlMeta.cache = "BYPASS";

    try {
      // Ensure variant key is resolved before MISS populate
      if (!(res.locals as any).htmlVariantKey && !bypassCache) {
        const { resolveHtmlVariantKey } = await import("./html-variant-key");
        (res.locals as any).htmlVariantKey = resolveHtmlVariantKey(_req, res);
      }
      const cacheKey = buildHtmlCacheKey(
        siteId,
        cleanUrlForSsr,
        (res.locals as any).htmlVariantKey || "live",
      );
      const render = !skipSsr ? await getSsrRender() : null;
      if (!skipSsr && !render) {
        ssrDiag(
          { url },
          "no SSR render fn available — falling back to empty #root",
          "warn",
        );
      }
      if (render) {
        const indexHtml = await fs.promises.readFile(indexHtmlPath, "utf-8");
        const initialDataPayload = await getInitialDataForRequest(url, res);
        status = resolvePublicHtmlStatus({
          url,
          httpStatus:
            initialDataPayload &&
            typeof (initialDataPayload as { httpStatus?: number }).httpStatus === "number"
              ? (initialDataPayload as { httpStatus: number }).httpStatus
              : undefined,
          contentIndex: siteContentIndex(res),
        });
        const t0 = Date.now();
        let appHtml = await render(url, initialDataPayload);
        if (!isMeaningfulSsrAppHtml(appHtml)) {
          ssrDiag(
            { url, appHtmlLength: appHtml?.length ?? 0, ms: Date.now() - t0 },
            "SSR returned empty body, retrying once",
            "warn",
          );
          appHtml = await render(url, initialDataPayload);
        }
        if (!isMeaningfulSsrAppHtml(appHtml)) {
          ssrDiag(
            {
              url,
              appHtmlLength: appHtml?.length ?? 0,
              ms: Date.now() - t0,
              preview: String(appHtml ?? "").slice(0, 120),
            },
            "SSR returned empty body after retry — not caching empty #root",
            "warn",
          );
          htmlMeta.outcome = "ssr_empty_fallback";
          htmlMeta.appHtmlLength = appHtml?.length ?? 0;
          throw new Error("empty_ssr_app_html");
        }

        ssrDiag(
          { url, appHtmlLength: appHtml.length, ms: Date.now() - t0 },
          "prod SSR ok — injecting into #root",
        );

        let html = indexHtml.replace(
          '<div id="root"></div>',
          `<div id="root">${appHtml}</div>`,
        );

        const preloadUrls = resolvePreloadHints(initialDataPayload);
        const preloadTags = buildPreloadTags(preloadUrls);
        html = injectPreloadTags(html, preloadTags);
        html = injectSsrMetaTags(
          html,
          initialDataPayload,
          (res.locals as any).site?.contentRoot,
          url,
        );

        if (ssrSchemaHtml) {
          html = injectSsrSchemaHtml(html, ssrSchemaHtml);
        }

        if (initialDataPayload) {
          const scriptTag = `<script id="__INITIAL_DATA__" type="application/json">${JSON.stringify(initialDataPayload).replace(/</g, "\\u003c")}</script>`;
          html = html.replace("</body>", scriptTag + "</body>");
        }

        html = applyEntryModulePreload(html);
        html = applyEntryPreloads(html, res);

        // Cache HTML with the GTM placeholder intact; inject the live ID only on send
        // so settings changes apply on cache HITs without busting the page cache.
        const htmlForCache = html;
        html = injectGtmWebContainerId(html, (res.locals as any).site?.contentRoot);

        if (!bypassCache && status === 200) {
          setCachedHtml(cacheKey, htmlForCache, status);
          res.setHeader("X-HTML-Cache", "MISS");
          htmlMeta.cache = "MISS";
        }
        htmlMeta.outcome = "ssr_ok";
        htmlMeta.appHtmlLength = appHtml.length;

        maybeRecordPublicNotFound(_req, res, status);
        res.status(status).set({ "Content-Type": "text/html" }).send(html);
        return;
      }
    } catch (e) {
      if (htmlMeta.outcome === "other") {
        htmlMeta.outcome =
          e instanceof Error && e.message === "empty_ssr_app_html"
            ? "ssr_empty_fallback"
            : "ssr_error_fallback";
      }
      ssrDiag(
        {
          err: e,
          url,
          errMessage: e instanceof Error ? e.message : String(e),
        },
        "production render failed, falling back (empty #root)",
        "warn",
      );
    }

    ssrDiag({ url, hasSchema: Boolean(ssrSchemaHtml) }, "serving client-only HTML fallback", "warn");
    if (htmlMeta.outcome === "other") htmlMeta.outcome = "client_fallback";

    if (ssrSchemaHtml) {
      try {
        let html = await fs.promises.readFile(indexHtmlPath, "utf-8");
        html = injectSsrSchemaHtml(html, ssrSchemaHtml);
        html = applyEntryModulePreload(html);
        html = applyEntryPreloads(html, res);
        html = injectGtmWebContainerId(html, (res.locals as any).site?.contentRoot);
        maybeRecordPublicNotFound(_req, res, status);
        res.status(status).set({ "Content-Type": "text/html" }).send(html);
        return;
      } catch {
        // fall through to sendFile
      }
    }

    try {
      let html = await fs.promises.readFile(indexHtmlPath, "utf-8");
      html = applyEntryModulePreload(html);
      html = applyEntryPreloads(html, res);
      html = injectGtmWebContainerId(html, (res.locals as any).site?.contentRoot);
      maybeRecordPublicNotFound(_req, res, status);
      res.status(status).set({ "Content-Type": "text/html" }).send(html);
    } catch {
      maybeRecordPublicNotFound(_req, res, status);
      res.status(status).sendFile(indexHtmlPath);
    }
  });
}
