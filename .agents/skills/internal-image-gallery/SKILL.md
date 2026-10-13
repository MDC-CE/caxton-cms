---
name: internal-image-gallery
description: Complete reference for the Media/Image Gallery system — architecture, singletons, cache strategy, validations, fixers, and admin scripts. Use this skill whenever making any change to image registry logic, image upload/delete/optimization flows, auto-tagging, media storage providers, image validators, or image-related admin/fixer scripts. Also activate when adding new image fields to the registry, new preset definitions, or new storage provider integrations.
---

# Image Gallery System Reference

This skill captures the full architecture of the image/media gallery so changes stay consistent, reuse existing abstractions, and never duplicate code that already exists.

## Overview — Layered Architecture

```
Storage Layer     server/media/                  LocalProvider + GCSProvider behind a unified Media facade
Registry Layer    server/media-gallery.ts         MediaGallery class (singleton) — source of truth
                  server/image-registry.ts         Lightweight read-only module-level cache (no write ops)
Processing Layer  server/image-optimizer.ts        sharp-based responsive image + srcset generation
Intelligence Layer server/image-auto-tagger.ts     AI vision + heuristic tag assignment
Scanner Layer     server/image-registry-scanner.ts Legacy scanner (superseded by MediaGallery.scan())
UI Layer          client/src/pages/MediaGallery.tsx Admin dashboard
Registry file     site_<name>/image-registry.json  Persisted source of truth per site (JSON)
```

## Singletons — Always Import, Never Instantiate

**Rule: never create `new MediaGallery()`, `new Media()`, or `LLMService()` directly.** Use the exported singletons.

| Singleton | Import path | Pattern |
|-----------|-------------|---------|
| `mediaGallery` | `server/media-gallery` | Module singleton (`export const mediaGallery = new MediaGallery()`) |
| `media` | `server/media` | Module singleton (`export const media = new Media()`) |
| `LLMService` | `server/ai/LLMService` | Static `getInstance()` |

```ts
import { mediaGallery } from "../server/media-gallery";
import { media } from "../server/media";
```

Scripts that run outside the server (e.g., `scripts/admin/`) still import these same singletons — they do not create their own instances.

## Registry — Data Model

Defined in `shared/schema.ts` (lines ~396–438). Always import types from there:

```ts
import type { ImageRegistry, ImageEntry, ImagePreset } from "@shared/schema";
```

### `ImageEntry` fields
| Field | Type | Notes |
|-------|------|-------|
| `src` | `string` | GCS URL (most images), `/site_<name>/images/...` (local files served per site from `site_<name>/images/`), or `/attached_assets/...` |
| `alt` | `string` | **Required**. Never leave as empty string or placeholder ("TODO") |
| `focal_point` | enum (optional) | `center` \| `top` \| `bottom` \| `left` \| `right` \| corner variants |
| `tags` | `string[]` (optional) | Drives preset selection (see Tag→Preset mapping) |
| `hash` | `string` (optional) | SHA-256 of file bytes — used for deduplication |
| `width` / `height` | `number` (optional) | Intrinsic dimensions after optimization |
| `preset` | `string[]` (optional) | Preset names applied during optimization |
| `widths_generated` | `number[]` (optional) | Width breakpoints generated for srcset |
| `format` | enum (optional) | `webp` \| `avif` \| `jpeg` \| `png` |
| `srcset` | `{ w: number; url: string }[]` (optional) | Responsive image variants |
| `usage_count` | `number` (optional) | Not actively maintained; prefer `getUsage()` |

### Registry file structure (`image-registry.json`)
```json
{
  "presets": { "hero-wide": { "aspect_ratio": "16:9", "widths": [640,1280,1920], "quality": 85, "description": "..." } },
  "images":  { "my-image": { "src": "/site_4geeks-com/images/my-image.png", "alt": "...", "tags": ["hero"] } }
}
```

### ID derivation rules
- Filename → lowercase, non-alphanumeric → `-`, consecutive dashes collapsed, leading/trailing dashes stripped
- Timestamps (`_1234567890123` suffix) are stripped for conflict detection but kept in the `src` path
- Screenshots (`Screenshot_*`, `Captura_*`, etc.) are **skipped** during auto-scan

## Cache Strategy

The system has three separate cache layers. Understand all three before making changes.

### 1. Registry cache (in `MediaGallery`)
```ts
private registryCache: ImageRegistry | null = null;
private lastModified: number = 0;  // file mtimeMs
```
- `getRegistry()` checks `fs.statSync(REGISTRY_PATH).mtimeMs` and only re-parses if changed
- **Always call `mediaGallery.clearCache()`** after externally writing the registry file
- `saveRegistry()` / `persistRegistry()` call `markFileAsModified()` internally — no manual clear needed when using gallery methods

### 2. Existence cache (in `MediaGallery`)
```ts
private existenceCache: Map<string, ExistenceCache> = new Map();
// TTL: EXISTENCE_CACHE_TTL_MS = 24 hours
```
- Wraps `media.exists(src)` to avoid repeated I/O or GCS network calls during scans
- Cleared automatically after `applyChanges()`, `migrate()`, and `unregister()` operations
- **Clear manually** if you move/delete physical files outside of gallery methods: use `mediaGallery.clearCache()` which resets all caches

### 3. Image reference cache (in `MediaGallery`)
```ts
private imageRefCache: ImageReferenceScan | null = null;
```
- Populated lazily by `collectImageReferences()` — walks all YAML files once, caches the result
- **Cleared** by `clearCache()`
- **Do not assume this is fresh** if YAML files change mid-request. Call `clearCache()` before re-collecting when YAML has been modified.

### 4. Module-level registry cache (in `server/image-registry.ts`)
```ts
let registryCache: ImageRegistry | null = null;
let lastModified: number = 0;
```
- Read-only API (`loadImageRegistry`, `getImage`, `getPreset`, `listImages`, `listPresets`)
- Use `clearImageRegistryCache()` if you need to force a reload from external code
- **Prefer `mediaGallery` over `image-registry.ts`** for any code that also writes — the gallery singleton keeps both caches in sync

## GCS Bucket Architecture & Migration

### Bucket Name Resolution Chain
All GCS consumers go through the `gcs` singleton (`server/gcs.ts`). The bucket name is resolved in this order:

1. **`bucket_name`** — top-level field in `sites.yml` (new, post-migration)
2. **`GCS_BUCKET_NAME`** env var — legacy fallback (pre-migration or no `sites.yml`)

```yaml
# sites.yml — new shared bucket field (added AFTER migration)
bucket_name: my-new-multisite-bucket

fl.4geeks.com:
  content_folder: site_4geeks-florida
  ...
```

`site-config.ts` exposes `getBucketName(): string | null` which reads this field. `gcs.initFromEnv()` calls `getBucketName()` first before falling back to the env var.

### Architecture Terminology
- **Old architecture**: objects stored at flat `media/…` (no site prefix).
- **New architecture**: objects stored at `{site}/media/…` (per-site prefix). This is the only layout the codebase supports going forward.

### Architecture Detection & Write-Block
After `gcs.initFromEnv()`, `gcs.checkArchitecture()` is called once during server startup (in `server/routes/index.ts`). It:
1. Lists objects with prefix `media/` (old flat layout).
2. Checks whether any `{knownSite}/media/` objects exist (new layout).
3. If old layout is found and no new layout exists → sets `gcs.migrationRequired = true`.

When `migrationRequired` is true:
- **Reads** (`download`, `exists`, `list`) work normally — content still served.
- **Writes** (`upload`, `debouncedUpload`) are blocked with a warning log — no data lost.

The DebugBubble admin panel polls `GET /api/admin/gcs-status` and shows a persistent banner with the migration CLI command.

### Bucket Full Inventory

| Prefix | What | Source |
|--------|------|--------|
| `{site}/sync/sync-state.json` | Per-site GitHub sync state | `server/sync-state.ts` |
| `{site}/sync/sync-log-state.txt` | Per-site GitHub sync log | `server/sync-log.ts` |
| `{site}/sync/versioning-state.json` | Per-site A/B test counts | `server/versioning/VersioningManager.ts` |
| `{site}/sync/form-state.json` | Per-site form registry | `server/form-state.ts` |
| `multisite-user-store/users-state.json` | Platform user/auth store | `server/user-store.ts` |
| `{site}/media/…` | Images, videos, srcset variants | `server/media/gcs-provider.ts` |
| `{site}/conversations/…` | AI context snapshots | `server/ai/ConversationStore.ts` |
| `{site}/reports/lighthouse/{date}/…` | Lighthouse audit results | `server/routes/admin.ts` |
| `reports/lighthouse/{date}/…` | Lighthouse audit results | `server/routes/admin.ts` |
| `mcp-auth/…` | Encrypted MCP OAuth tokens | `mcp-server/lib/gcs-store.ts` |

### Migration Script (`scripts/admin/migrate-gcs-multisite.ts`)
Unified migration: copies flat `media/` objects to per-site `{content_folder}/media/` prefixes, rewrites `image-registry.json`, unifies `sync/{site}/` → `{site}/sync/`, and moves user store to `multisite-user-store/`. Resumable via `.cache/gcs-multisite-migration-state.json`. Bypasses the `gcs` singleton (raw SDK clients) so the write-block doesn't interfere.

```bash
# Dry-run (default)
npx tsx scripts/admin/migrate-gcs-multisite.ts --to-bucket=<bucket>

# Apply media + layout migration
npx tsx scripts/admin/migrate-gcs-multisite.ts --to-bucket=<bucket> --execute

# Delete legacy keys after copy
npx tsx scripts/admin/migrate-gcs-multisite.ts --to-bucket=<bucket> --execute --delete-source
```

Legacy media-only script `scripts/admin/migrate-gcs-bucket.ts` remains for backward compatibility.

After migration completes:
1. Add `bucket_name: <bucket>` to `sites.yml` if changing buckets.
2. Redeploy — server picks up the new bucket automatically.
3. Verify media serving is correct.

## Storage Layer — `server/media/`

### `StorageProvider` interface (`server/media/types.ts`)
```ts
interface StorageProvider {
  readonly name: string;
  exists(key: string): Promise<boolean>;
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  extractKey(src: string): string | null;   // null = this provider does not own this src
  owns(src: string): boolean;
}
```

Two implementations: `LocalProvider` (disk) and `GCSProvider` (Google Cloud Storage).

### `Media` facade methods
```ts
media.exists(src)           // auto-routes to correct provider via owns()
media.upload(data, key, contentType?, providerName?)  // defaults to defaultProvider
media.delete(src)           // auto-routes
media.resolveProvider(src)  // returns the provider that owns this src
media.getStatus()           // { defaultProvider, providers, gcs? }
media.initFromEnv()         // reads MEDIA_DEFAULT_PROVIDER, GCS_* env vars
```

Provider is selected by env var `MEDIA_DEFAULT_PROVIDER` (`"local"` or `"gcs"`). The GCS provider only activates when `GCS_BUCKET_NAME` is set.

## Image Processing — `server/image-optimizer.ts`

### Tag → Preset mapping
```ts
const TAG_TO_PRESET = {
  logo: "logo", avatar: "avatar", icon: "icon",
  badge: "icon", certification: "icon", award: "icon",
  hero: "hero-wide",
};
// If no tag matches, falls back to "full" preset
```

### Key exports
```ts
inferPresets(tags, presets): string[]          // derives preset names from tags
mergeWidths(presetNames, presets): { widths, quality }  // union of all widths, max quality
processImageBuffer(id, buffer, entry, presets): Promise<OptimizationResult | null>
processImageFromSrc(id, entry, presets): Promise<OptimizationResult | null>
variantKey(originalKey, width, ext): string    // "dir/name-640w.webp"
outputFormat(ext): { sharpFormat, ext, registryFormat }  // prefers webp, avif if source is avif
gcsKeyFromSrc(src): string | null              // strips GCS bucket URL prefix
```

Output format: non-avif → webp; avif → avif. SVGs are never processed (not raster).

## Auto-Tagging — `server/image-auto-tagger.ts`

### Strategy (in order)
1. **YAML context heuristics** — inspects field names where the image is referenced (e.g., `hero_image` field → `hero` tag)
2. **Filename patterns** — regex against the image filename
3. **AI vision** — `LLMService.getInstance()` with the vision model from `site_*/llm.yml` (`model.vision` key; falls back to `model.default`, then `openai/gpt-4o`)

### Key export
```ts
classifyAndApply(imageId: string): Promise<{ added: string[]; removed: string[] }>
```
Reads the image from the registry via `mediaGallery.getRegistry()`, runs all three strategies, merges results, and calls `mediaGallery.updateImageTags()`.

**Do not call `LLMService` directly for tagging.** Always go through `classifyAndApply`.

## `MediaGallery` — Full Public API

All operations go through this singleton. Prefer it over direct file system access.

```ts
// Read
mediaGallery.getRegistry(): ImageRegistry | null
mediaGallery.getImage(id): { src, alt } | null
mediaGallery.getPreset(name): ImagePreset | null
mediaGallery.listImages(): Array<{ id } & ImageEntry>
mediaGallery.listPresets(): Array<{ name } & ImagePreset>
mediaGallery.findByHash(hash): { id, entry } | null
mediaGallery.getUsage(imageId, imageSrc?, srcsetUrls?): string[]  // YAML files referencing this image
mediaGallery.collectImageReferences(): ImageReferenceScan         // full YAML walk, cached

// Write
mediaGallery.register(id, entry)                  // add or overwrite a single entry
mediaGallery.saveRegistry(registry)               // persist full registry to disk
mediaGallery.persistRegistry()                    // persist in-memory registry (after mutation)
mediaGallery.clearCache()                         // invalidate all caches

// Scan & sync
mediaGallery.scan(): Promise<ScanResult>           // detects new, updated, broken, duplicates
mediaGallery.applyChanges(scanResult)             // writes new/updated entries + updates YAML paths

// Upload workflow
mediaGallery.uploadAndRegister(filename, data, contentType, opts?)
  // → deduplicates by hash, derives ID, uploads via media.upload(), registers entry
mediaGallery.replaceAndRegister(id, filename, data, contentType)
  // → in-place overwrite: same ID; images → WebP; same doctype only; 409-style
  //   duplicate conflict if hash matches another ID; preserves metadata; clears
  //   srcsets then optimizeInBackground; does not cascade crop children

// Delete
mediaGallery.unregister(id): Promise<{ success, error?, usedIn?, cleanupErrors? }>
  // → refuses if image is referenced anywhere; deletes physical files + srcset variants
mediaGallery.bulkUnregister(ids[]): Promise<{ results, deletedCount }>

// Migration
mediaGallery.migrate(fromProvider, toProvider, { dryRun?, prefix? })
  // → iterates registry, re-uploads via target provider, updates src in registry + YAML
```

### `ScanResult` shape
```ts
{
  newImages: { id, src, filename }[]
  updatedImages: { id, oldSrc, newSrc }[]
  brokenReferences: { yamlFile, field, missingSrc }[]
  duplicates: { hash, ids, canonical }[]  // canonical = shortest id alphabetically
  hashesComputed: number
  registeredCount: number
  scannedImagesCount: number
  summary: { new, updated, broken, duplicates }
}
```

## Validators — `scripts/validation/validators/`

Image-related validators:

| File | Name | What it checks |
|------|------|---------------|
| `images.ts` | `images` | Registry load, broken `src` paths on disk, missing/placeholder alt text, orphaned registry entries, image IDs referenced in YAML but missing from registry |
| `image-tags.ts` | `image-tags` | Images with no tags assigned |
| `image-optimization.ts` | `image-optimization` | Raster images without srcset variants |
| `hero-image-tags.ts` | `hero-image-tags` | Hero-type images lacking the `hero` tag |

### Adding a new image validator
1. Create `scripts/validation/validators/your-validator.ts` exporting a `Validator` object
2. Register it in `scripts/validation/validators/index.ts`
3. Follow the `ValidatorResult` shape: `{ name, description, status, errors, warnings, duration, artifacts? }`
4. Use `mediaGallery.collectImageReferences()` for YAML traversal — do not walk YAML files independently

## Fixers — `scripts/validation/fixers/`

| File | Fixer name | What it does |
|------|------------|-------------|
| `image-registry-sync.ts` | `image-registry-sync` | Calls `mediaGallery.scan()` then `applyChanges()` |
| `image-auto-tags.ts` | `image-auto-tags` | Finds untagged images, calls `classifyAndApply()` per image |
| `image-optimization.ts` | `image-optimization` | Finds images without srcset, calls `processImageFromSrc()` in background loop, calls `persistRegistry()` every 10 images |
| `hero-image-tags.ts` | `hero-image-tags` | Ensures hero-type images carry the `hero` tag |

### Fixer contract (`scripts/validation/fixers/types.ts`)
```ts
interface Fixer {
  name: string;
  description: string;
  run(ctx: FixerContext): Promise<FixerResult>;
}
interface FixerResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}
```

### Adding a new fixer
1. Create `scripts/validation/fixers/your-fixer.ts` exporting a `Fixer` object
2. Register it in `scripts/validation/fixers/index.ts`
3. For long-running work, fire-and-forget with `(async () => { ... })().catch(...)` and return immediately with `{ ok: true, message: "Queued N items" }`
4. Call `mediaGallery.persistRegistry()` periodically (every ~10 items) and once at the end

## Admin Scripts — `scripts/admin/`

### `migrate-to-cloud.ts`
Migrates images between providers. Always calls `media.initFromEnv()` at entry point.
```
npx tsx scripts/admin/migrate-to-cloud.ts <from> <to> [--dry-run] [--prefix=<path>]
```
Delegates to `mediaGallery.migrate()` — do not duplicate migration logic.

### `remove-unused-images.ts`
Exports `removeUnusedImages({ dryRun? })`. Uses `mediaGallery.collectImageReferences()` to identify unreferenced images, then calls `mediaGallery.unregister()` per image.

### `scripts/stats/image-usage.ts`
Standalone stats reporter. Reads registry and walks YAML independently (does not use `mediaGallery` — keep this as-is to avoid circular deps in a CLI context).

## Key Invariants — Never Violate These

1. **Always check for referenced images before deletion.** Call `mediaGallery.getUsage()` and refuse if `usedIn.length > 0`. The `unregister()` method does this; do not bypass it.

2. **Hash before uploading.** Call `mediaGallery.computeBufferHash(data)` and `findByHash()` to return the existing entry if it's a duplicate.

3. **Derive IDs consistently.** Use `filenameToId()` logic (lowercase, alphanumeric + dash only, no leading/trailing dash). Do not invent custom ID schemes.

4. **SVGs are never processed by sharp.** `OPTIMIZABLE_EXTENSIONS` = `{.png, .jpg, .jpeg, .webp, .avif}`. Skip SVG/GIF in any optimization loop.

5. **Screenshots are excluded from auto-scan.** Pattern: `/^Screenshot_/i`, `/^Captura_/i`, `/^Capture_/i`, `/^Screen[\s_]?Shot/i`.

6. **New registry entries require alt text.** Never write an entry with `alt: ""`. Use `"TODO: Add alt text for <filename>"` as the placeholder and flag it as a warning — not silently empty.

7. **Always use `mediaGallery.saveRegistry()` or `persistRegistry()`** to write the registry. Never write `image-registry.json` directly with `fs.writeFile`.

8. **Video files are tracked as media but not optimized.** `VIDEO_EXTENSIONS = {.mp4, .webm, .mov, .ogg, .m4v}`. Include in `uploadAndRegister` but exclude from srcset generation.

## Relevant Files

- `server/media-gallery.ts`
- `server/image-registry.ts`
- `server/image-optimizer.ts`
- `server/image-auto-tagger.ts`
- `server/image-registry-scanner.ts`
- `server/media/index.ts`
- `server/media/types.ts`
- `server/media/local-provider.ts`
- `server/media/gcs-provider.ts`
- `shared/schema.ts:396-438`
- `scripts/validation/validators/images.ts`
- `scripts/validation/validators/image-tags.ts`
- `scripts/validation/validators/image-optimization.ts`
- `scripts/validation/validators/hero-image-tags.ts`
- `scripts/validation/fixers/image-registry-sync.ts`
- `scripts/validation/fixers/image-auto-tags.ts`
- `scripts/validation/fixers/image-optimization.ts`
- `scripts/validation/fixers/hero-image-tags.ts`
- `scripts/validation/fixers/types.ts`
- `scripts/validation/fixers/index.ts`
- `scripts/admin/migrate-to-cloud.ts`
- `scripts/admin/remove-unused-images.ts`
- `scripts/stats/image-usage.ts`
- `site_<name>/image-registry.json` (e.g. `site_4geeks-com/image-registry.json`)
- `client/src/pages/MediaGallery.tsx`
