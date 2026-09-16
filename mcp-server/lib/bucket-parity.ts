import fs from "fs";
import path from "path";
import { getProjectRoot } from "../../shared/paths.js";

/** Read top-level `bucket_name` from sites.yml (project root under weblify). */
export function readSitesYmlBucketName(): string | null {
  const sitesPath = path.join(getProjectRoot(), "sites.yml");
  if (!fs.existsSync(sitesPath)) return null;
  try {
    const text = fs.readFileSync(sitesPath, "utf-8");
    const match = text.match(/^bucket_name:\s*['"]?([^'"\s#]+)['"]?\s*$/m);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

export function warnMcpBucketParity(): void {
  const envBucket = process.env.GCS_BUCKET_NAME?.trim();
  const sitesBucket = readSitesYmlBucketName();
  if (envBucket && sitesBucket && envBucket !== sitesBucket) {
    console.warn(
      `[MCP] WARN: GCS_BUCKET_NAME (${envBucket}) != sites.yml bucket_name (${sitesBucket})`,
    );
  }
}
