/**
 * Seed standard image presets (if missing) and generate srcset variants for
 * every raster in a site image registry.
 *
 *   npx tsx scripts/admin/optimize-site-images.ts --site=site_learning-mdc-edu
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ quiet: true });

import path from "path";
import { MediaGallery } from "../../server/media-gallery";
import { media } from "../../server/media";
import { processImageFromSrc } from "../../server/image-optimizer";
import type { Preset } from "../../server/image-optimizer";

const STANDARD_PRESETS: Record<string, Preset> = {
  "hero-wide": {
    aspect_ratio: "16:9",
    widths: [640, 960, 1280, 1920, 2560, 3840],
    quality: 85,
    description: "Full-width hero images",
  },
  "hero-tall": {
    aspect_ratio: "3:4",
    widths: [360, 480, 640, 960, 1280, 1920],
    quality: 85,
    description: "Vertical / mobile hero images",
  },
  card: {
    aspect_ratio: "4:3",
    widths: [320, 480, 640, 960],
    quality: 80,
    description: "Standard card thumbnails",
  },
  "card-wide": {
    aspect_ratio: "16:9",
    widths: [320, 480, 640, 960],
    quality: 80,
    description: "Wide card thumbnails",
  },
  avatar: {
    aspect_ratio: "1:1",
    widths: [64, 128, 256],
    quality: 85,
    description: "Profile pictures",
  },
  logo: {
    aspect_ratio: null,
    widths: [120, 240, 480],
    quality: 90,
    description: "Company logos",
  },
  icon: {
    aspect_ratio: "1:1",
    widths: [32, 64, 128],
    quality: 90,
    description: "Icons and badges",
  },
  full: {
    aspect_ratio: null,
    widths: [320, 480, 640, 960, 1280, 1920, 2560, 3840],
    quality: 85,
    description: "Full-size, preserves ratio (default for untagged / ce-landing)",
  },
};

const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);

function extOf(src: string): string {
  try {
    return path.extname(new URL(src).pathname).toLowerCase();
  } catch {
    return path.extname(src).toLowerCase();
  }
}

function parseSiteArg(): string {
  const raw = process.argv.find((a) => a.startsWith("--site="));
  return raw?.slice("--site=".length) || process.env.CONTENT_FOLDER || "site_learning-mdc-edu";
}

async function main() {
  const content = parseSiteArg();
  media.initFromEnv();
  const gallery = new MediaGallery(content);
  const registry = gallery.getRegistry();
  if (!registry) throw new Error(`No image registry for ${content}`);

  registry.presets = { ...STANDARD_PRESETS, ...(registry.presets ?? {}) };
  // Always refresh width lists on standard keys so large frames get 2560/3840.
  for (const [name, preset] of Object.entries(STANDARD_PRESETS)) {
    registry.presets[name] = preset;
  }
  registry.tagDefinitions = {
    ...(registry.tagDefinitions ?? {}),
    hero: { presets: ["hero-wide"] },
    logo: { presets: ["logo"] },
    avatar: { presets: ["avatar"] },
    icon: { presets: ["icon"] },
    badge: { presets: ["icon"] },
    certification: { presets: ["icon"] },
    award: { presets: ["icon"] },
    "ce-landing": { presets: ["full"] },
    mockup: { presets: ["full"] },
    steps: { presets: ["full"] },
  };
  gallery.saveRegistry(registry);

  const presets = registry.presets as Record<string, Preset>;
  const tagDefinitions = (registry.tagDefinitions ?? {}) as Record<string, { presets?: string[] }>;
  const ids = Object.keys(registry.images).filter((id) => RASTER.has(extOf(registry.images[id].src)));

  let optimized = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of ids) {
    const current = gallery.getRegistry();
    const entry = current?.images[id];
    if (!current || !entry) {
      skipped++;
      continue;
    }
    try {
      const result = await processImageFromSrc(id, entry, presets, false, undefined, tagDefinitions);
      if (!result || result.srcset.length === 0) {
        skipped++;
        console.log(`skip ${id}`);
        continue;
      }
      entry.width = result.width;
      entry.height = result.height;
      entry.preset = result.preset;
      entry.widths_generated = result.widths_generated;
      entry.format = result.format;
      entry.srcset = result.srcset;
      gallery.saveRegistry(current);
      optimized++;
      console.log(`ok ${id}: ${result.widths_generated.join(",")}`);
    } catch (err) {
      failed++;
      console.error(`fail ${id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`done optimized=${optimized} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
