/**
 * Shared GCS (Google Cloud Storage) bucket client.
 *
 * Provides a single Storage instance initialized from environment variables
 * or the sites.yml `bucket_name` field.
 * Any module that needs bucket access imports from here — no basePath is
 * baked in, so each consumer supplies its own key prefix.
 *
 * Bucket name resolution chain:
 *   1. `bucket_name` from top-level of sites.yml (new — post-migration)
 *   2. GCS_BUCKET_NAME env var (legacy fallback — pre-migration or deployments without sites.yml)
 *
 * Environment variables:
 *   GCS_BUCKET_NAME        – fallback when sites.yml has no bucket_name
 *   GCS_PROJECT_ID         – optional
 *   GCS_KEY_FILENAME       – optional (path to service-account JSON)
 *   GCS_CREDENTIALS_JSON   – optional (inline service-account JSON)
 */

import { Storage } from "@google-cloud/storage";
import {
  formStateReadKeys,
  gscUrlInspectionReadKeys,
  platformSitesYmlReadKeys,
  platformUserStoreGcsKey,
  runtimeIssuesStateReadKeys,
  siteConversationsGcsPrefix,
  siteLighthouseGcsPrefixRoot,
  siteMediaGcsPrefix,
  siteSyncGcsKey,
  SYNC_FILENAMES,
  syncLogReadKeys,
  syncStateReadKeys,
  userStoreReadKeys,
  validationCacheReadKeys,
  versioningStateReadKeys,
} from "@shared/gcsKeys";
import { child as loggerChild } from "./logger";
import { getBucketName, getSiteConfigs } from "./site-config";

const gcsLogger = loggerChild({ module: "gcs", worker: "gcs" });

function mediaSegment(): string {
  return process.env.GCS_BASE_PATH || "media";
}

export interface GcsKeyProbe {
  label: string;
  expectedKey: string;
  legacyKeys: string[];
  foundKey: string | null;
  exists: boolean;
  status: "found" | "legacy" | "missing";
  updated: string | null;
}

export interface GcsSiteArchitecture {
  siteFolder: string;
  syncFiles: GcsKeyProbe[];
  mediaSamples: string[];
  conversationSamples: string[];
  lighthouseSamples: string[];
  legacySyncSamples: string[];
}

export interface GcsPlatformArchitecture {
  sitesYml: GcsKeyProbe;
  userStore: GcsKeyProbe;
  mcpAuthSamples: string[];
}

export interface GcsArchitectureDiagnostics {
  migrationRequired: boolean;
  bucketName: string;
  mediaSegment: string;
  knownSitePrefixes: string[];
  hasOldLayout: boolean;
  hasNewLayout: boolean;
  newLayoutSamples: Record<string, string[]>;
  checkError?: string;
  platform?: GcsPlatformArchitecture;
  sites?: GcsSiteArchitecture[];
}

export interface GCSConfig {
  bucketName: string;
  projectId?: string;
  keyFilename?: string;
  credentialsJson?: string;
}

export type GcsSyncStatusValue =
  | "active"
  | "local_dev"
  | "syncing"
  | "migration_required"
  | "unavailable"
  | "error";

export interface GcsObjectMetadata {
  exists: boolean;
  updated: string | null;
  size: number | null;
}

export interface GcsSyncStatus {
  available: boolean;
  bucketName: string | null;
  status: GcsSyncStatusValue;
  pendingUploads: number;
  pendingUploadKeys: string[];
  imageQueuePending: number;
  imageQueueBusy: boolean;
  migrationRequired: boolean;
  isProduction: boolean;
}

interface PendingUpload {
  timer: ReturnType<typeof setTimeout>;
  data: Buffer;
  contentType: string;
  options?: { cacheControl?: string };
}

const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_RETRY_BASE_MS = 2_000;
const DEBOUNCE_DEFAULT_MS = 4_000;

class GCSClient {
  private storage: Storage | null = null;
  private bucketName: string = "";
  private _available = false;
  private _pendingUploads = new Map<string, PendingUpload>();

  /** True when the bucket still uses the old flat layout (media/… without site prefix). */
  migrationRequired = false;

  init(config: GCSConfig): void {
    this.bucketName = config.bucketName;

    const opts: Record<string, any> = {};
    if (config.projectId) opts.projectId = config.projectId;

    if (config.credentialsJson) {
      try {
        opts.credentials = JSON.parse(config.credentialsJson);
      } catch {
        gcsLogger.error("failed to parse GCS_CREDENTIALS_JSON, falling back to default auth");
      }
    } else if (config.keyFilename) {
      opts.keyFilename = config.keyFilename;
    }

    this.storage = new Storage(opts);
    this._available = true;
    gcsLogger.info({ bucket: this.bucketName }, "initialized");
  }

  /**
   * Bootstrap init using GCS_BUCKET_NAME only — used before sites.yml is on disk
   * (e.g. loading the site registry from GCS on cold start).
   */
  initBootstrapFromEnv(): void {
    const bucket = process.env.GCS_BUCKET_NAME;
    if (!bucket) {
      gcsLogger.info("initBootstrapFromEnv: GCS_BUCKET_NAME not set — GCS unavailable");
      return;
    }
    gcsLogger.info({ bucket }, "initBootstrapFromEnv: bucket from GCS_BUCKET_NAME");
    this.init({
      bucketName: bucket,
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILENAME,
      credentialsJson: process.env.GCS_CREDENTIALS_JSON,
    });
  }

  initFromEnv(): void {
    let bucket: string | undefined;

    const fromYml = getBucketName();
    if (fromYml) {
      bucket = fromYml;
      gcsLogger.info({ bucket }, "bucket name resolved from sites.yml");
    }

    if (!bucket) {
      bucket = process.env.GCS_BUCKET_NAME;
    }

    if (!bucket) {
      gcsLogger.info("No bucket name configured (sites.yml bucket_name or GCS_BUCKET_NAME) — GCS unavailable");
      return;
    }

    this.init({
      bucketName: bucket,
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILENAME,
      credentialsJson: process.env.GCS_CREDENTIALS_JSON,
    });
  }

  async getArchitectureDiagnostics(): Promise<GcsArchitectureDiagnostics> {
    const segment = mediaSegment();
    const flatPrefix = `${segment}/`;
    const knownSitePrefixes = getSiteConfigs().map((s) => s.contentFolder);
    const result: GcsArchitectureDiagnostics = {
      migrationRequired: this.migrationRequired,
      bucketName: this.bucketName,
      mediaSegment: segment,
      knownSitePrefixes,
      hasOldLayout: false,
      hasNewLayout: false,
      newLayoutSamples: {},
    };

    if (!this.storage) {
      result.checkError = "GCS not initialized";
      return result;
    }

    try {
      const [oldFiles] = await this.storage
        .bucket(this.bucketName)
        .getFiles({ prefix: flatPrefix, maxResults: 3 });

      result.hasOldLayout = oldFiles.length > 0;

      for (const sitePrefix of knownSitePrefixes) {
        const [newFiles] = await this.storage
          .bucket(this.bucketName)
          .getFiles({ prefix: `${sitePrefix}/${segment}/`, maxResults: 3 });
        result.newLayoutSamples[sitePrefix] = newFiles.map((f) => f.name);
        if (newFiles.length > 0) result.hasNewLayout = true;
      }

      result.migrationRequired =
        result.hasOldLayout && !result.hasNewLayout ? true : false;

      result.platform = await this.probePlatformArchitecture();
      result.sites = await Promise.all(
        knownSitePrefixes.map((siteFolder) => this.probeSiteArchitecture(siteFolder, siteFolder === knownSitePrefixes[0])),
      );
    } catch (err) {
      result.checkError = err instanceof Error ? err.message : String(err);
    }

    return result;
  }

  /**
   * Architecture check — call once after initFromEnv() during server startup.
   *
   * Detects the old flat layout (objects at `media/…` without a site prefix).
   * When found and no new-style `{site}/media/…` objects exist, sets
   * `migrationRequired = true` and blocks all writes until migration is done.
   */
  async checkArchitecture(): Promise<GcsArchitectureDiagnostics> {
    if (!this.storage) {
      return {
        migrationRequired: false,
        bucketName: this.bucketName,
        mediaSegment: mediaSegment(),
        knownSitePrefixes: [],
        hasOldLayout: false,
        hasNewLayout: false,
        newLayoutSamples: {},
        checkError: "GCS not initialized",
      };
    }

    this.migrationRequired = false;

    const diagnostics = await this.getArchitectureDiagnostics();
    this.migrationRequired = diagnostics.migrationRequired;

    if (diagnostics.checkError) {
      gcsLogger.warn(
        { err: diagnostics.checkError },
        "GCS architecture check failed — skipping (bucket may not yet exist or credentials missing)",
      );
      return diagnostics;
    }

    if (!diagnostics.hasOldLayout) {
      gcsLogger.info("GCS architecture check passed — no old flat-layout objects found");
      return diagnostics;
    }

    if (diagnostics.migrationRequired) {
      gcsLogger.warn(
        {
          bucket: this.bucketName,
          knownSitePrefixes: diagnostics.knownSitePrefixes,
          mediaSegment: diagnostics.mediaSegment,
        },
        "GCS migration required: old flat layout detected. " +
          "All GCS writes are blocked. Run: npx tsx scripts/admin/migrate-gcs-multisite.ts --to-bucket=<bucket> --execute",
      );
    } else {
      gcsLogger.info(
        "GCS architecture check: old and new layouts coexist — migration in progress or already done",
      );
    }

    return diagnostics;
  }

  get available(): boolean {
    return this._available;
  }

  getBucketName(): string {
    return this.bucketName;
  }

  getStorage(): Storage | null {
    return this.storage;
  }

  async exists(key: string): Promise<boolean> {
    if (!this.storage) return false;
    try {
      const [exists] = await this.storage.bucket(this.bucketName).file(key).exists();
      return exists;
    } catch {
      return false;
    }
  }

  async upload(
    key: string,
    data: Buffer,
    contentType?: string,
    options?: { cacheControl?: string; publicRead?: boolean }
  ): Promise<string> {
    if (!this.storage) throw new Error("[GCS] Not initialized");

    if (this.migrationRequired) {
      const msg = `[GCS] Upload blocked for key "${key}" — bucket migration required. Run: npx tsx scripts/admin/migrate-gcs-multisite.ts --to-bucket=<bucket> --execute`;
      gcsLogger.warn({ key }, msg);
      throw new Error(msg);
    }

    const file = this.storage.bucket(this.bucketName).file(key);
    const saveOpts = {
      contentType: contentType || "application/octet-stream",
      resumable: false,
      metadata: {
        cacheControl: options?.cacheControl ?? "public, max-age=31536000",
      },
    };

    let attempt = 0;
    while (true) {
      try {
        await file.save(data, saveOpts);
        if (options?.publicRead) {
          try {
            await file.makePublic();
          } catch (err: any) {
            const detail = err?.message || String(err);
            throw new Error(
              `Saved "${key}" but could not make it public for the website. Public access prevention on the bucket must be off. ${detail}`,
            );
          }
        }
        return this.getPublicUrl(key);
      } catch (err: any) {
        const is429 = err?.code === 429 || err?.response?.statusCode === 429;
        attempt++;
        if (!is429 || attempt >= UPLOAD_MAX_RETRIES) throw err;
        const delayMs = UPLOAD_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        gcsLogger.warn({ key, attempt, maxRetries: UPLOAD_MAX_RETRIES - 1, delayMs }, "429 on upload, retrying");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  debouncedUpload(
    key: string,
    data: Buffer,
    contentType?: string,
    delayMs: number = DEBOUNCE_DEFAULT_MS,
    options?: { cacheControl?: string }
  ): void {
    if (this.migrationRequired) {
      gcsLogger.warn({ key }, "[GCS] Debounced write blocked — bucket migration required.");
      return;
    }

    const existing = this._pendingUploads.get(key);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(async () => {
      this._pendingUploads.delete(key);
      try {
        await this.upload(key, data, contentType, options);
      } catch (err) {
        gcsLogger.error({ err, key }, "debouncedUpload failed");
      }
    }, delayMs);

    this._pendingUploads.set(key, { timer, data, contentType: contentType || "application/octet-stream", options });
  }

  async flushPending(): Promise<void> {
    if (this._pendingUploads.size === 0) return;

    gcsLogger.info({ count: this._pendingUploads.size }, "flushing pending uploads before shutdown");
    const entries = Array.from(this._pendingUploads.entries());
    this._pendingUploads.clear();

    await Promise.allSettled(
      entries.map(async ([key, pending]) => {
        clearTimeout(pending.timer);
        try {
          await this.upload(key, pending.data, pending.contentType, pending.options);
          gcsLogger.info({ key }, "flushed pending upload");
        } catch (err) {
          gcsLogger.error({ err, key }, "failed to flush pending upload");
        }
      })
    );
  }

  async list(prefix: string): Promise<string[]> {
    if (!this.storage) return [];
    try {
      const [files] = await this.storage
        .bucket(this.bucketName)
        .getFiles({ prefix, versions: false });
      return files.map((f) => f.name);
    } catch {
      return [];
    }
  }

  async download(key: string): Promise<Buffer | null> {
    if (!this.storage) return null;
    try {
      const [data] = await this.storage.bucket(this.bucketName).file(key).download();
      return data;
    } catch (err: any) {
      if (err?.code === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.bucket(this.bucketName).file(key).delete();
    } catch (err: any) {
      if (err?.code !== 404) throw err;
    }
  }

  getPublicUrl(key: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${key}`;
  }

  getPendingUploadCount(): number {
    return this._pendingUploads.size;
  }

  getPendingUploadKeys(): string[] {
    return Array.from(this._pendingUploads.keys());
  }

  isPendingUpload(key: string): boolean {
    return this._pendingUploads.has(key);
  }

  async getObjectMetadata(key: string): Promise<GcsObjectMetadata> {
    if (!this.storage) {
      return { exists: false, updated: null, size: null };
    }
    try {
      const file = this.storage.bucket(this.bucketName).file(key);
      const [exists] = await file.exists();
      if (!exists) {
        return { exists: false, updated: null, size: null };
      }
      const [metadata] = await file.getMetadata();
      const updated =
        metadata.updated != null
          ? new Date(metadata.updated).toISOString()
          : metadata.timeCreated != null
            ? new Date(metadata.timeCreated).toISOString()
            : null;
      const size =
        metadata.size != null
          ? typeof metadata.size === "string"
            ? parseInt(metadata.size, 10)
            : metadata.size
          : null;
      return { exists: true, updated, size: Number.isFinite(size) ? size : null };
    } catch {
      return { exists: false, updated: null, size: null };
    }
  }

  async getNewestObjectInPrefix(prefix: string): Promise<GcsObjectMetadata & { key: string | null }> {
    if (!this.storage) {
      return { key: null, exists: false, updated: null, size: null };
    }
    try {
      const [files] = await this.storage
        .bucket(this.bucketName)
        .getFiles({ prefix, maxResults: 50 });
      if (files.length === 0) {
        return { key: null, exists: false, updated: null, size: null };
      }
      let newest: { key: string; updated: Date } | null = null;
      for (const file of files) {
        const updated = file.metadata?.updated
          ? new Date(file.metadata.updated)
          : file.metadata?.timeCreated
            ? new Date(file.metadata.timeCreated)
            : null;
        if (!updated) continue;
        if (!newest || updated > newest.updated) {
          newest = { key: file.name, updated };
        }
      }
      if (!newest) {
        return { key: files[0].name, exists: true, updated: null, size: null };
      }
      const meta = await this.getObjectMetadata(newest.key);
      return { key: newest.key, ...meta };
    } catch {
      return { key: null, exists: false, updated: null, size: null };
    }
  }

  async resolveExistingKey(keys: string[]): Promise<string | null> {
    for (const key of keys) {
      if (await this.exists(key)) return key;
    }
    return null;
  }

  async downloadFirstExisting(keys: string[]): Promise<{ key: string; data: Buffer } | null> {
    const key = await this.resolveExistingKey(keys);
    if (!key) return null;
    const data = await this.download(key);
    if (!data) return null;
    return { key, data };
  }

  async listSampleKeys(prefix: string, max = 3): Promise<string[]> {
    if (!this.storage) return [];
    try {
      const [files] = await this.storage
        .bucket(this.bucketName)
        .getFiles({ prefix, maxResults: max });
      return files.map((f) => f.name);
    } catch {
      return [];
    }
  }

  private async probeKey(
    label: string,
    expectedKey: string,
    legacyKeys: string[],
  ): Promise<GcsKeyProbe> {
    const allKeys = [expectedKey, ...legacyKeys];
    const foundKey = await this.resolveExistingKey(allKeys);
    let updated: string | null = null;
    if (foundKey) {
      const meta = await this.getObjectMetadata(foundKey);
      updated = meta.updated;
    }
    const status: GcsKeyProbe["status"] = !foundKey
      ? "missing"
      : foundKey === expectedKey
        ? "found"
        : "legacy";
    return {
      label,
      expectedKey,
      legacyKeys,
      foundKey,
      exists: !!foundKey,
      status,
      updated,
    };
  }

  private async probePlatformArchitecture(): Promise<GcsPlatformArchitecture> {
    const sitesYmlKeys = platformSitesYmlReadKeys();
    const userStoreKeys = userStoreReadKeys();
    return {
      sitesYml: await this.probeKey(
        "Site registry",
        sitesYmlKeys[0],
        sitesYmlKeys.slice(1),
      ),
      userStore: await this.probeKey(
        "User store",
        userStoreKeys[0],
        userStoreKeys.slice(1),
      ),
      mcpAuthSamples: await this.listSampleKeys("mcp-auth/", 3),
    };
  }

  private async probeSiteArchitecture(
    siteFolder: string,
    isDefaultSite: boolean,
  ): Promise<GcsSiteArchitecture> {
    const segment = mediaSegment();
    const syncFiles = await Promise.all([
      this.probeKey("Sync state", siteSyncGcsKey(siteFolder, SYNC_FILENAMES.syncState), syncStateReadKeys(siteFolder).slice(1)),
      this.probeKey("Sync log", siteSyncGcsKey(siteFolder, SYNC_FILENAMES.syncLog), syncLogReadKeys(siteFolder).slice(1)),
      this.probeKey("Versioning", siteSyncGcsKey(siteFolder, SYNC_FILENAMES.versioningState), versioningStateReadKeys(siteFolder).slice(1)),
      this.probeKey("Form registry", siteSyncGcsKey(siteFolder, SYNC_FILENAMES.formState), formStateReadKeys(siteFolder, isDefaultSite).slice(1)),
      this.probeKey("Validation cache", siteSyncGcsKey(siteFolder, SYNC_FILENAMES.validationCache), validationCacheReadKeys(siteFolder).slice(1)),
      this.probeKey("Search Console inspection", siteSyncGcsKey(siteFolder, SYNC_FILENAMES.gscUrlInspection), gscUrlInspectionReadKeys(siteFolder).slice(1)),
      this.probeKey("Runtime issues", siteSyncGcsKey(siteFolder, SYNC_FILENAMES.runtimeIssuesState), runtimeIssuesStateReadKeys(siteFolder).slice(1)),
    ]);

    const legacySyncPrefix = `sync/${siteFolder}/`;
    const legacySyncSamples = (await this.listSampleKeys(legacySyncPrefix, 10)).filter(
      (k) => k.startsWith(legacySyncPrefix) && k !== legacySyncPrefix,
    );

    return {
      siteFolder,
      syncFiles,
      mediaSamples: await this.listSampleKeys(siteMediaGcsPrefix(siteFolder, segment), 3),
      conversationSamples: await this.listSampleKeys(siteConversationsGcsPrefix(siteFolder), 3),
      lighthouseSamples: await this.listSampleKeys(siteLighthouseGcsPrefixRoot(siteFolder), 3),
      legacySyncSamples: legacySyncSamples.slice(0, 3),
    };
  }

  buildSyncStatus(options: {
    imageQueuePending?: number;
    imageQueueBusy?: boolean;
    checkError?: string;
  }): GcsSyncStatus {
    const pendingUploads = this.getPendingUploadCount();
    const pendingUploadKeys = this.getPendingUploadKeys();
    const imageQueuePending = options.imageQueuePending ?? 0;
    const imageQueueBusy = options.imageQueueBusy ?? false;
    const isProduction = process.env.NODE_ENV === "production";

    let status: GcsSyncStatusValue;
    if (!this._available) {
      status = "unavailable";
    } else if (options.checkError) {
      status = "error";
    } else if (this.migrationRequired) {
      status = "migration_required";
    } else if (!isProduction) {
      status = "local_dev";
    } else if (pendingUploads > 0 || imageQueuePending > 0 || imageQueueBusy) {
      status = "syncing";
    } else {
      status = "active";
    }

    return {
      available: this._available,
      bucketName: this.bucketName || null,
      status,
      pendingUploads,
      pendingUploadKeys,
      imageQueuePending,
      imageQueueBusy,
      migrationRequired: this.migrationRequired,
      isProduction,
    };
  }
}

export const gcs = new GCSClient();
