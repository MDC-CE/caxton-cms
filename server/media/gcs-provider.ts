import type { StorageProvider } from "./types";
import { gcs } from "../gcs";

export class GCSProvider implements StorageProvider {
  readonly name = "gcs";
  private basePath: string;
  private urlPrefix: string;

  constructor(config: { basePath?: string }) {
    this.basePath = config.basePath ? config.basePath.replace(/\/+$/, "") : "";
    this.urlPrefix = `https://storage.googleapis.com/${gcs.getBucketName()}/`;
  }

  private fullKey(key: string): string {
    return this.basePath ? `${this.basePath}/${key}` : key;
  }

  owns(src: string): boolean {
    if (src.startsWith(this.urlPrefix)) {
      if (this.basePath) {
        const afterPrefix = src.slice(this.urlPrefix.length);
        return afterPrefix.startsWith(this.basePath + "/");
      }
      return true;
    }
    return src.startsWith(`gs://${gcs.getBucketName()}/`);
  }

  extractKey(src: string): string | null {
    if (src.startsWith(this.urlPrefix)) {
      const full = src.slice(this.urlPrefix.length);
      if (this.basePath && full.startsWith(this.basePath + "/")) {
        return full.slice(this.basePath.length + 1);
      }
      return full;
    }
    const gsPrefix = `gs://${gcs.getBucketName()}/`;
    if (src.startsWith(gsPrefix)) {
      const full = src.slice(gsPrefix.length);
      if (this.basePath && full.startsWith(this.basePath + "/")) {
        return full.slice(this.basePath.length + 1);
      }
      return full;
    }
    return null;
  }

  async exists(key: string): Promise<boolean> {
    return gcs.exists(this.fullKey(key));
  }

  async upload(key: string, data: Buffer, contentType?: string): Promise<string> {
    // Gallery files are embedded on public pages. JSON sidecars (AI prompts, preview meta) stay private.
    const publicRead = contentType !== "application/json";
    return gcs.upload(this.fullKey(key), data, contentType, { publicRead });
  }

  async delete(key: string): Promise<void> {
    return gcs.delete(this.fullKey(key));
  }

  getPublicUrl(key: string): string {
    return gcs.getPublicUrl(this.fullKey(key));
  }

  async download(key: string): Promise<Buffer | null> {
    return gcs.download(this.fullKey(key));
  }

  /**
   * List all object keys under an optional sub-prefix (relative to this provider's basePath).
   * Returns bare keys (without the basePath prefix), matching what upload/delete/exists expect.
   */
  async list(subPrefix?: string): Promise<string[]> {
    const listPrefix = subPrefix
      ? `${this.fullKey(subPrefix)}/`
      : this.basePath
        ? `${this.basePath}/`
        : "";
    const fullKeys = await gcs.list(listPrefix);
    return fullKeys.map((k) => {
      if (this.basePath && k.startsWith(this.basePath + "/")) {
        return k.slice(this.basePath.length + 1);
      }
      return k;
    });
  }
}
