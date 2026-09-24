import fs from "fs";
import path from "path";
import sharp from "sharp";
import { gcs } from "./gcs";
import type { ImageEntry, ImageRegistry } from "@shared/schema";
import { child } from "./logger";
const log = child({ module: "image-optimizer" });



export interface SrcsetEntry {
  w: number;
  url: string;
}

export interface Preset {
  aspect_ratio: string | null;
  widths: number[];
  quality: number;
  description: string;
}

export function inferPresets(
  tags: string[],
  presets: Record<string, Preset>,
  tagDefinitions?: Record<string, { presets?: string[] }>,
): string[] {
  const matched = new Set<string>();
  for (const tag of tags) {
    const defPresets = tagDefinitions?.[tag]?.presets ?? [];
    for (const p of defPresets) {
      if (presets[p]) matched.add(p);
    }
  }
  if (matched.size === 0) {
    matched.add("full");
  }
  return Array.from(matched);
}

export function mergeWidths(presetNames: string[], presets: Record<string, Preset>, qualityOverride?: number): { widths: number[]; quality: number } {
  const allWidths = new Set<number>();
  let maxQuality = 80;
  for (const name of presetNames) {
    const p = presets[name];
    if (p) {
      for (const w of p.widths) allWidths.add(w);
      if (p.quality > maxQuality) maxQuality = p.quality;
    }
  }
  return {
    widths: Array.from(allWidths).sort((a, b) => a - b),
    quality: qualityOverride ?? maxQuality,
  };
}

export function srcExtension(src: string): string {
  try {
    const url = new URL(src);
    return path.extname(url.pathname).toLowerCase();
  } catch {
    return path.extname(src).toLowerCase();
  }
}

export function gcsKeyFromSrc(src: string): string | null {
  if (!gcs.available) return null;
  const prefix = `https://storage.googleapis.com/${gcs.getBucketName()}/`;
  if (src.startsWith(prefix)) {
    return src.slice(prefix.length);
  }
  return null;
}

export function localKeyFromSrc(src: string): string | null {
  if (src.startsWith("/attached_assets/")) return null;
  if (src.startsWith("http://") || src.startsWith("https://")) return null;
  const { getSiteContextMap } = require("./site-manager") as typeof import("./site-manager");
  try {
    for (const [, site] of getSiteContextMap()) {
      const prefix = `/${site.contentRootName}/images/`;
      if (src.startsWith(prefix)) {
        return src.slice(1);
      }
    }
  } catch {
    // fallback: treat any /<folder>/images/ path as local
    const match = src.match(/^\/([^/]+)\/images\//);
    if (match) return src.slice(1);
  }
  return null;
}

export function variantKey(originalKey: string, width: number, ext: string): string {
  const parsed = path.parse(originalKey);
  const dir = parsed.dir ? `${parsed.dir}/` : "";
  return `${dir}${parsed.name}-${width}w${ext}`;
}

export function outputFormat(originalExt: string): { sharpFormat: keyof sharp.FormatEnum; ext: string; registryFormat: "webp" | "avif" } {
  if (originalExt === ".avif") {
    return { sharpFormat: "avif", ext: ".avif", registryFormat: "avif" };
  }
  return { sharpFormat: "webp", ext: ".webp", registryFormat: "webp" };
}

export function contentTypeForExt(ext: string): string {
  const map: Record<string, string> = {
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  return map[ext] || "application/octet-stream";
}

export async function downloadImage(src: string): Promise<Buffer | null> {
  const key = gcsKeyFromSrc(src);
  if (key) {
    return gcs.download(key);
  }
  if (localKeyFromSrc(src)) {
    const localPath = path.resolve(process.cwd(), src.slice(1));
    try {
      return fs.readFileSync(localPath);
    } catch {
      return null;
    }
  }
  try {
    const resp = await fetch(src);
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

export interface ProcessImageResult {
  width: number;
  height: number;
  preset: string[];
  widths_generated: number[];
  format: "webp" | "avif";
  srcset: SrcsetEntry[];
}

export class ImageEncodingError extends Error {
  constructor(id: string, message: string) {
    super(`[ImageOptimizer] ${id}: ${message}`);
    this.name = "ImageEncodingError";
  }
}

export async function processImageBuffer(
  id: string,
  buffer: Buffer,
  src: string,
  tags: string[],
  presets: Record<string, Preset>,
  dryRun: boolean = false,
  qualityOverride?: number,
  tagDefinitions?: Record<string, { presets?: string[] }>,
): Promise<ProcessImageResult | null> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    log.warn(`[ImageOptimizer] ${id}: sharp metadata failed: ${(err as Error).message}`);
    return null;
  }

  const intrinsicWidth = metadata.width || 0;
  const intrinsicHeight = metadata.height || 0;

  if (!intrinsicWidth || !intrinsicHeight) {
    log.error(`[ImageOptimizer] ${id}: could not determine dimensions`);
    return null;
  }

  const presetNames = inferPresets(tags, presets, tagDefinitions);
  const { widths, quality } = mergeWidths(presetNames, presets, qualityOverride);

  const filteredWidths = widths.filter(w => w <= intrinsicWidth);
  if (filteredWidths.length === 0) {
    filteredWidths.push(intrinsicWidth);
  }

  const origExt = srcExtension(src);
  const { sharpFormat, ext: outExt, registryFormat } = outputFormat(origExt);
  const gcsKey = gcsKeyFromSrc(src);
  const localKey = localKeyFromSrc(src);
  const originalKey = gcsKey ?? localKey;

  if (!originalKey && !dryRun) {
    log.info(`[ImageOptimizer] ${id}: skipping optimization — cannot determine storage key for src: ${src}`);
    return {
      width: intrinsicWidth,
      height: intrinsicHeight,
      preset: presetNames,
      widths_generated: [],
      format: registryFormat,
      srcset: [],
    };
  }

  const srcset: SrcsetEntry[] = [];
  const widthsGenerated: number[] = [];

  for (const w of filteredWidths) {
    const vKey = originalKey ? variantKey(originalKey, w, outExt) : `media/${id}-${w}w${outExt}`;

    if (dryRun) {
      const vUrl = gcsKey ? gcs.getPublicUrl(vKey) : `/${vKey}`;
      srcset.push({ w, url: vUrl });
      widthsGenerated.push(w);
      continue;
    }

    try {
      const { data: resized, info } = await sharp(buffer)
        .resize({ width: w, withoutEnlargement: true })
        .toFormat(sharpFormat, { quality })
        .toBuffer({ resolveWithObject: true });

      const actualWidth = info.width;
      let vUrl: string;

      if (gcsKey) {
        vUrl = await gcs.upload(vKey, resized, contentTypeForExt(outExt), { publicRead: true });
      } else {
        const diskPath = path.resolve(process.cwd(), vKey);
        const dir = path.dirname(diskPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(diskPath, resized);
        vUrl = `/${vKey}`;
        log.info(`[ImageOptimizer] ${id}: wrote local variant ${vUrl} (${actualWidth}w)`);
      }

      srcset.push({ w: actualWidth, url: vUrl });
      widthsGenerated.push(actualWidth);
    } catch (err) {
      log.warn(`[ImageOptimizer] ${id}: failed to process ${w}w: ${(err as Error).message}`);
    }
  }

  if (srcset.length === 0) {
    throw new ImageEncodingError(
      id,
      `all ${filteredWidths.length} width variant(s) failed to encode — buffer passed metadata check but is unprocessable`,
    );
  }

  return {
    width: intrinsicWidth,
    height: intrinsicHeight,
    preset: presetNames,
    widths_generated: widthsGenerated,
    format: registryFormat,
    srcset,
  };
}

export async function processImageFromSrc(
  id: string,
  entry: { src: string; tags?: string[]; quality_override?: number },
  presets: Record<string, Preset>,
  dryRun: boolean = false,
  qualityOverride?: number,
  tagDefinitions?: Record<string, { presets?: string[] }>,
): Promise<ProcessImageResult | null> {
  const buffer = await downloadImage(entry.src);
  if (!buffer) {
    log.error(`[ImageOptimizer] ${id}: failed to download ${entry.src}`);
    return null;
  }

  const resolvedQuality = qualityOverride ?? entry.quality_override;
  return processImageBuffer(id, buffer, entry.src, entry.tags || [], presets, dryRun, resolvedQuality, tagDefinitions);
}
