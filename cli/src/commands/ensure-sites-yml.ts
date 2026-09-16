import fs from "fs";
import path from "path";
import { askMultiselect, askText, canPrompt } from "../prompts.js";
import { sitesYmlForEntries } from "../lib/project-files.js";
import type { ResolvedConfig } from "../types.js";

export type SiteYmlEntry = { domain: string; contentFolder: string };

function slugFromFolder(folder: string): string {
  return folder.replace(/^site_/, "");
}

function defaultDomainForIndex(folder: string, index: number): string {
  return index === 0 ? "localhost" : `${slugFromFolder(folder)}.localhost`;
}

function folderFromSlug(slug: string | undefined, folders: string[]): string | undefined {
  if (!slug) return undefined;
  const normalized = slug.startsWith("site_") ? slug : `site_${slug}`;
  return folders.find((f) => f === normalized);
}

/**
 * Resolve which site_* folders + hostnames to put in a new sites.yml.
 * Interactive when TTY; --yes / --slug for non-interactive.
 */
export async function resolveSitesYmlEntries(config: ResolvedConfig): Promise<SiteYmlEntry[]> {
  const folders = config.detect.siteFolders ?? [];
  if (folders.length === 0) {
    throw new Error("No site_* folders found to register in sites.yml.");
  }

  const slugMatch = folderFromSlug(config.contentSlug, folders);

  if (!canPrompt()) {
    if (!config.yes && !slugMatch) {
      throw new Error(
        folders.length === 1
          ? "Creating sites.yml requires --yes (or an interactive terminal)."
          : "Multiple site_* folders found. Pass --slug <name> (and --yes) or run interactively.",
      );
    }
    if (folders.length === 1) {
      return [{ domain: "localhost", contentFolder: folders[0] }];
    }
    if (slugMatch) {
      return [{ domain: "localhost", contentFolder: slugMatch }];
    }
    throw new Error(
      `Multiple site_* folders (${folders.join(", ")}). Pass --slug <name> to pick one for localhost, or run interactively.`,
    );
  }

  let chosen = folders;
  if (folders.length > 1) {
    chosen = await askMultiselect(
      "Which content folders should sites.yml register?",
      folders.map((f) => ({ value: f, label: f })),
      slugMatch ? [slugMatch] : folders,
    );
  }

  const entries: SiteYmlEntry[] = [];
  const usedDomains = new Set<string>();

  for (let i = 0; i < chosen.length; i++) {
    const folder = chosen[i];
    const fallback = defaultDomainForIndex(folder, i);
    const domain = (await askText(`Hostname for ${folder} (req.hostname match)`, fallback))
      .trim()
      .toLowerCase();

    if (!domain) {
      throw new Error(`Hostname required for ${folder}.`);
    }
    if (usedDomains.has(domain)) {
      throw new Error(`Duplicate hostname "${domain}". Each site needs a unique domain key.`);
    }
    usedDomains.add(domain);
    entries.push({ domain, contentFolder: folder });
  }

  return entries;
}

export async function ensureSitesYml(config: ResolvedConfig): Promise<SiteYmlEntry[]> {
  const entries = config.sitesYmlEntries ?? (await resolveSitesYmlEntries(config));
  const dest = path.join(config.projectRoot, "sites.yml");
  if (fs.existsSync(dest)) {
    throw new Error(`sites.yml already exists at ${dest}`);
  }
  fs.writeFileSync(dest, sitesYmlForEntries(entries));
  return entries;
}
