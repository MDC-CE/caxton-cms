/**
 * Standalone runner for navigation-eager-manifest generation.
 * Invoked as a tsx subprocess by the Vite build plugin when
 * navigation-eager-manifest.ts detects it is running inside a
 * Vite pre-bundled config (.vite-temp/*.mjs) where relative
 * TypeScript imports cannot be resolved.
 *
 * Usage: tsx server/navigation-eager-manifest-run.ts [contentRoot]
 */

import { contentIndex } from "./content-index";
import { resolvePageQuery } from "./initial-data-middleware";
import { runManifestGeneration } from "./navigation-eager-manifest";

const contentRoot = process.argv[2] || undefined;

runManifestGeneration(contentIndex, (pagePath, ci) =>
  resolvePageQuery(pagePath, ci as import("./content-index").ContentIndex),
  contentRoot,
).catch((err) => {
  console.error("[NavigationManifest runner] Failed:", err);
  process.exit(1);
});
