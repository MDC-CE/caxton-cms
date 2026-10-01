/**
 * Build a self-contained HTML document for Cloudflare Browser Rendering /screenshot
 * (html body) — same OG card as OgImagePreviewDefault, with absolute logo/CSS/font URLs.
 *
 * Capture queue and settings OG test shot both use this path (not the live SPA frame).
 */

import * as path from "path";
import { getPackageRoot } from "@shared/paths";
import { formatMissingPreviewPropsMessage } from "@shared/entry-preview-props";
import type { ContentTypePreviewConfig } from "./content-types";
import { buildPreviewSection } from "./entry-preview-build-section";
import { buildPreviewPropResolveContext } from "./entry-preview-resolve";
import { getPublicSiteUrl } from "./cloudflare-browser";
import { getEntryAssets } from "./utils/vite-manifest";
import type { MediaGallery } from "./media-gallery";
import type { DatabaseManager } from "./database";
import type { ContentIndex } from "./content-index";
import { child } from "./logger";

const log = child({ module: "entry-preview-capture-html" });

export type CaptureFailureClass =
  | "preflight"
  | "rate_limit"
  | "screenshot"
  | "config"
  | "unknown";

export class EntryPreviewCaptureError extends Error {
  readonly failureClass: CaptureFailureClass;
  readonly contentType?: string;
  readonly slug?: string;
  readonly locale?: string;

  constructor(
    message: string,
    opts: {
      failureClass: CaptureFailureClass;
      contentType?: string;
      slug?: string;
      locale?: string;
    },
  ) {
    super(message);
    this.name = "EntryPreviewCaptureError";
    this.failureClass = opts.failureClass;
    this.contentType = opts.contentType;
    this.slug = opts.slug;
    this.locale = opts.locale;
  }
}

export function classifyCaptureFailure(err: unknown): CaptureFailureClass {
  if (err instanceof EntryPreviewCaptureError) return err.failureClass;
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|rate.?limit/i.test(msg)) return "rate_limit";
  if (/preview_not_configured|SITE_URL|CLOUDFLARE_|not publicly reachable/i.test(msg)) {
    return "config";
  }
  if (/screenshot|Cloudflare|timeout|waitForSelector|422/i.test(msg)) return "screenshot";
  if (/Entry not found|missing|preflight|logo/i.test(msg)) return "preflight";
  return "unknown";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/** Make a site-relative or absolute image URL absolute for CF (external fetch). */
export function toAbsolutePublicUrl(url: string, siteUrl?: string | null): string | null {
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith("data:")) return t;
  if (/^https?:\/\//i.test(t)) return t;
  const base = (siteUrl ?? getPublicSiteUrl())?.replace(/\/$/, "") || null;
  if (!base) return null;
  if (t.startsWith("//")) {
    try {
      return `${new URL(base).protocol}${t}`;
    } catch {
      return `https:${t}`;
    }
  }
  return t.startsWith("/") ? `${base}${t}` : `${base}/${t}`;
}

function categoryLabels(category: unknown): string[] {
  if (category == null) return [];
  const fromItem = (item: unknown): string | undefined => {
    if (typeof item === "string") {
      const t = item.trim();
      return t || undefined;
    }
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      for (const key of ["title", "name", "label", "slug"]) {
        if (typeof o[key] === "string" && (o[key] as string).trim()) {
          return (o[key] as string).trim();
        }
      }
    }
    return undefined;
  };
  if (Array.isArray(category)) {
    return category.map(fromItem).filter((v): v is string => !!v);
  }
  const single = fromItem(category);
  return single ? [single] : [];
}

function formatMetaLine(author?: string, readingTime?: string | null): string | null {
  const parts = [author?.trim(), readingTime?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function resolveLogoCandidate(
  raw: unknown,
  mediaGallery?: MediaGallery,
): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (!t) return "";
  if (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("/") ||
    t.startsWith("data:") ||
    t.startsWith("//")
  ) {
    return t;
  }
  // Registry id → public src
  if (mediaGallery) {
    return mediaGallery.getImage(t)?.src ?? "";
  }
  return "";
}

function themeFallbackLogoUrl(
  ctxBrand: Record<string, unknown> | undefined,
  theme: "dark" | "light",
): string {
  if (!ctxBrand) return "";
  const primary =
    theme === "dark"
      ? String(ctxBrand["brand.logo"] ?? ctxBrand["brand.logo_dark"] ?? "")
      : String(ctxBrand["brand.logo"] ?? "");
  return primary.trim();
}

/** Inline theme tokens so the card still paints if CSS fetch is slow/missing. */
function inlineThemeCss(theme: "dark" | "light"): string {
  if (theme === "light") {
    return `
:root, html.light {
  --background: 0 0% 100%;
  --foreground: 223 100% 5%;
  --primary: 210 100% 50%;
  --muted-foreground: 215 16% 40%;
  --font-heading: 'Lato', 'Lato Fallback', sans-serif;
}
body { margin: 0; background: hsl(var(--background)); color: hsl(var(--foreground)); }
.font-heading { font-family: var(--font-heading); }
.text-foreground { color: hsl(var(--foreground)); }
.text-muted-foreground { color: hsl(var(--muted-foreground)); }
.bg-background\\/35 { background-color: hsl(var(--background) / 0.35); }
`;
  }
  return `
:root, html.dark {
  --background: 0 0% 8%;
  --foreground: 0 0% 95%;
  --primary: 210 100% 50%;
  --muted-foreground: 215 12% 70%;
  --font-heading: 'Lato', 'Lato Fallback', sans-serif;
}
body { margin: 0; background: hsl(var(--background)); color: hsl(var(--foreground)); }
.font-heading { font-family: var(--font-heading); }
.text-foreground { color: hsl(var(--foreground)); }
.text-muted-foreground { color: hsl(var(--muted-foreground)); }
.bg-background\\/35 { background-color: hsl(var(--background) / 0.35); }
`;
}

function resolveStylesheetLinks(siteUrl: string): string {
  const distPublic = path.join(getPackageRoot(), "dist", "public");
  const assets = getEntryAssets(distPublic);
  const hrefs = assets.css.length > 0 ? assets.css : [];
  return hrefs
    .map((href) => {
      const abs = href.startsWith("http") ? href : `${siteUrl}${href.startsWith("/") ? href : `/${href}`}`;
      return `<link rel="stylesheet" href="${escapeAttr(abs)}">`;
    })
    .join("\n");
}

function resolveFontLinks(siteUrl: string): string {
  // Common Lato paths used by the site; harmless 404 if absent.
  const faces = [
    `${siteUrl}/fonts/Lato-Regular.woff2`,
    `${siteUrl}/fonts/Lato-Bold.woff2`,
  ];
  return faces
    .map(
      (href) =>
        `<link rel="preload" as="font" type="font/woff2" crossorigin href="${escapeAttr(href)}">`,
    )
    .join("\n");
}

export type OgCardHtmlInput = {
  title: string;
  logoAbsoluteUrl: string | null;
  category?: unknown;
  author?: string;
  readingTime?: string | null;
  theme: "dark" | "light";
  width?: number;
  height?: number;
};

/**
 * Render the OG card as a full HTML document (mirrors OgImagePreviewDefault markup).
 */
export function buildOgCardCaptureHtml(input: OgCardHtmlInput): string {
  const siteUrl = getPublicSiteUrl();
  if (!siteUrl) {
    throw new EntryPreviewCaptureError("SITE_URL is required for HTML OG capture", {
      failureClass: "config",
    });
  }

  const width = input.width ?? 1200;
  const height = input.height ?? 630;
  const themeClass = input.theme === "light" ? "light" : "dark";
  const title = escapeHtml(input.title || "");
  const labels = categoryLabels(input.category);
  const metaLine = formatMetaLine(input.author, input.readingTime);
  const logoUrl = input.logoAbsoluteUrl;

  const badges =
    labels.length > 0
      ? `<div class="flex flex-wrap items-center gap-2" data-testid="og-image-preview-category">${labels
          .map(
            (label) =>
              `<span class="border-transparent bg-background/35 px-3 py-1 text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground backdrop-blur-sm rounded-md">${escapeHtml(label)}</span>`,
          )
          .join("")}</div>`
      : "";

  const logoBlock = logoUrl
    ? `<img data-og-logo="1" src="${escapeAttr(logoUrl)}" alt="Brand" loading="eager" class="h-10 w-auto max-w-[280px]" style="object-fit:contain;height:2.5rem;width:auto;max-width:280px" />`
    : "";

  const metaBlock = metaLine
    ? `<p class="text-lg text-muted-foreground" data-testid="og-image-preview-meta">${escapeHtml(metaLine)}</p>`
    : "";

  const cssLinks = resolveStylesheetLinks(siteUrl);
  const fontLinks = resolveFontLinks(siteUrl);

  return `<!DOCTYPE html>
<html class="${themeClass}" lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=${width}, height=${height}"/>
${fontLinks}
${cssLinks}
<style>${inlineThemeCss(input.theme)}
[data-screenshot-root]{width:${width}px;height:${height}px;overflow:hidden}
</style>
</head>
<body>
<section
  data-screenshot-root
  data-testid="section-og-image-preview"
  class="relative flex flex-col justify-between overflow-hidden p-16 text-foreground"
  style="width:${width}px;height:${height}px;box-sizing:border-box;background:radial-gradient(ellipse 120% 100% at 0% 0%, hsl(var(--primary) / 0.55) 0%, hsl(var(--background)) 65%)"
>
  <div class="flex items-center" data-testid="og-image-preview-logo">${logoBlock}</div>
  <div class="flex flex-col gap-4" style="max-width:920px">
    ${badges}
    <h1 class="font-heading text-5xl font-bold leading-tight tracking-tight text-foreground" data-testid="og-image-preview-title" style="font-size:3rem;font-weight:700;line-height:1.15;margin:0">${title}</h1>
    ${metaBlock}
  </div>
</section>
</body>
</html>`;
}

export type BuildEntryCaptureHtmlOpts = {
  contentType: string;
  slug: string;
  locale: string;
  entry: Record<string, unknown>;
  preview: ContentTypePreviewConfig;
  theme: "dark" | "light";
  contentRoot: string;
  mediaGallery: MediaGallery;
  db?: DatabaseManager;
  contentIndex?: ContentIndex;
  width?: number;
  height?: number;
};

export type BuildEntryCaptureHtmlResult = {
  html: string;
  logoAbsoluteUrl: string | null;
  /** CF waitForSelector — logo img when present, else root. */
  waitForSelector: string;
  /** Extra settle after selector. */
  waitForTimeoutMs: number;
  section: Record<string, unknown>;
  ctx: Awaited<ReturnType<typeof buildPreviewPropResolveContext>>;
};

/**
 * Resolve entry → section → absolute logo → full HTML document.
 * Fails with failureClass preflight before CF when required props or logo are missing.
 */
export async function buildEntryCaptureHtml(
  opts: BuildEntryCaptureHtmlOpts,
): Promise<BuildEntryCaptureHtmlResult> {
  const {
    contentType,
    slug,
    locale,
    entry,
    preview,
    theme,
    contentRoot,
    mediaGallery,
    db,
    contentIndex,
    width,
    height,
  } = opts;

  const ctx = await buildPreviewPropResolveContext({
    contentType,
    slug,
    locale,
    entry,
    contentRoot,
    db,
    contentIndex,
    mediaGallery,
    theme,
  });

  const { section, missing } = buildPreviewSection(preview, ctx);
  if (missing.length > 0) {
    throw new EntryPreviewCaptureError(
      formatMissingPreviewPropsMessage(missing, preview.props, ctx),
      { failureClass: "preflight", contentType, slug, locale },
    );
  }

  const title =
    typeof section.title === "string" && section.title.trim()
      ? section.title.trim()
      : slug;

  let logoRaw = resolveLogoCandidate(section.logo, mediaGallery);
  if (!logoRaw) {
    logoRaw = resolveLogoCandidate(themeFallbackLogoUrl(ctx.brand as Record<string, unknown>, theme), mediaGallery);
  }

  let logoAbsoluteUrl = logoRaw ? toAbsolutePublicUrl(logoRaw) : null;
  if (!logoAbsoluteUrl) {
    // Last resort: brand map already resolved URLs (may be relative)
    const brandFallback = themeFallbackLogoUrl(ctx.brand as Record<string, unknown>, theme);
    logoAbsoluteUrl = brandFallback ? toAbsolutePublicUrl(brandFallback) : null;
  }

  if (!logoAbsoluteUrl) {
    throw new EntryPreviewCaptureError(
      "No absolute logo URL for OG capture (entry logo and default brand wordmark missing)",
      { failureClass: "preflight", contentType, slug, locale },
    );
  }

  const author = typeof section.author === "string" ? section.author : undefined;
  const readingTime =
    typeof section.reading_time === "string" ? section.reading_time : null;

  const html = buildOgCardCaptureHtml({
    title,
    logoAbsoluteUrl,
    category: section.category,
    author,
    readingTime,
    theme,
    width: width ?? preview.widths?.[0] ?? 1200,
    height: height ?? preview.maxHeight ?? 630,
  });

  log.info(
    { contentType, slug, locale, hasLogo: true, titleLen: title.length },
    "[entry-preview-capture-html] built document",
  );

  return {
    html,
    logoAbsoluteUrl,
    waitForSelector: 'img[data-og-logo="1"]',
    waitForTimeoutMs: 400,
    section,
    ctx,
  };
}

/** Throwaway settings test card (same HTML pipeline, no entry). */
export function buildOgTestCaptureHtml(opts: {
  logoAbsoluteUrl: string;
  theme?: "dark" | "light";
}): { html: string; waitForSelector: string; waitForTimeoutMs: number } {
  const theme = opts.theme === "light" ? "light" : "dark";
  const html = buildOgCardCaptureHtml({
    title: "OG capture test",
    logoAbsoluteUrl: opts.logoAbsoluteUrl,
    category: ["Test"],
    author: "4Geeks",
    readingTime: "1 min read",
    theme,
  });
  return {
    html,
    waitForSelector: 'img[data-og-logo="1"]',
    waitForTimeoutMs: 400,
  };
}
