/**
 * Header tags for one-time data migrations in scripts/migrations/NNN_name.ts.
 */

import path from "path";
import { getProjectRoot } from "@shared/paths";
import { getSiteConfigs } from "../site-config";

export const MIGRATION_FILENAME_RE = /^\d{3}_[\w]+\.ts$/;
export const DEFAULT_TIMEOUT_SECONDS = 120;
export const MAX_TIMEOUT_SECONDS = 1800;

export type MigrationScope = "site" | "all";

export type MigrationHeaders = {
  name: string;
  description: string;
  scope: MigrationScope;
  /** True when the file has no `@scope` tag; treated as `all`. */
  scope_missing: boolean;
  supports_dry_run: boolean;
  timeout_seconds: number;
  production_only: boolean;
};

function tagPresent(content: string, tag: string): boolean {
  return new RegExp(`@${tag}(?![\\w-])`).test(content);
}

export function parseMigrationHeaders(filename: string, content: string): MigrationHeaders {
  const nameMatch = content.match(/@migration\s+([^\n*]+)/);
  const descMatch = content.match(/@description\s+([^\n*]+(?:\n\s*\*\s+[^\n*@]+)*)/);
  const scopeMatch = content.match(/@scope\s+(site|all)\b/);
  const timeoutMatch = content.match(/@timeout\s+(\d+)/);

  let timeout = timeoutMatch ? parseInt(timeoutMatch[1], 10) : DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isFinite(timeout) || timeout <= 0) timeout = DEFAULT_TIMEOUT_SECONDS;

  return {
    name: nameMatch ? nameMatch[1].trim() : filename.replace(/\.ts$/, ""),
    description: descMatch
      ? descMatch[1].replace(/\n\s*\*\s*/g, " ").trim()
      : "No description provided.",
    scope: (scopeMatch?.[1] as MigrationScope | undefined) ?? "all",
    scope_missing: !scopeMatch,
    supports_dry_run: tagPresent(content, "dry-run"),
    timeout_seconds: Math.min(timeout, MAX_TIMEOUT_SECONDS),
    production_only: tagPresent(content, "production-only"),
  };
}

function siteNameFromFolder(folder: string): string {
  const rel = path.isAbsolute(folder) ? path.relative(getProjectRoot(), folder) : folder;
  return rel.replace(/^\.\//, "").replace(/[/\\]+$/, "");
}

/** Content folder of the first site in sites.yml; records every `@scope all` migration. */
export function primarySiteName(): string {
  return siteNameFromFolder(getSiteConfigs()[0].contentFolder);
}

/** Which site's pipeline database records runs of a migration with this scope. */
export function recordingSiteFor(scope: MigrationScope, currentSite: string): string {
  return scope === "site" ? currentSite : primarySiteName();
}
