/**
 * Shared base palette checks: which theme background IDs the shared component
 * library (every site) relies on, and which sites' own themes lack one.
 */
import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";
import { getSharedRegistryPath } from "@shared/registry-resolve";
import { missingBasePaletteIds } from "@shared/theme-palette";
import { escapeTemplateVars, unescapeObjectVars } from "@shared/templateVars";
import { getProjectRoot } from "@shared/paths";
import { getSiteConfigs } from "../site-config";
import { loadSiteTheme, hasOwnSiteTheme } from "../theme-config";

export interface SharedExampleBackground {
  type: string;
  file: string;
  path: string;
  value: string;
}

function safeLoad(text: string): unknown {
  const { escaped, map } = escapeTemplateVars(text);
  return unescapeObjectVars(yaml.load(escaped), map);
}

function walk(node: unknown, at: string, out: Array<{ path: string; value: string }>): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${at}[${i}]`, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = at ? `${at}.${key}` : key;
    if ((key === "background" || key.endsWith("_background")) && typeof value === "string") {
      out.push({ path: here, value });
    } else {
      walk(value, here, out);
    }
  }
}

/** Every `background` / `*_background` value in shared registry examples (both example file formats). */
export function collectSharedExampleBackgrounds(registryRoot = getSharedRegistryPath()): SharedExampleBackground[] {
  const out: SharedExampleBackground[] = [];
  if (!fs.existsSync(registryRoot)) return out;
  for (const type of fs.readdirSync(registryRoot)) {
    if (type.startsWith("_")) continue;
    const typeDir = path.join(registryRoot, type);
    if (!fs.statSync(typeDir).isDirectory()) continue;
    for (const version of fs.readdirSync(typeDir)) {
      const examplesDir = path.join(typeDir, version, "examples");
      if (!fs.existsSync(examplesDir)) continue;
      for (const file of fs.readdirSync(examplesDir).filter((f) => /\.ya?ml$/.test(f))) {
        const abs = path.join(examplesDir, file);
        let doc: unknown;
        try {
          doc = safeLoad(fs.readFileSync(abs, "utf-8"));
        } catch {
          continue;
        }
        const inner = (doc as { yaml?: unknown })?.yaml;
        const sections = typeof inner === "string" ? safeLoad(inner) : doc;
        const found: Array<{ path: string; value: string }> = [];
        walk(sections, "", found);
        const rel = path.relative(path.dirname(registryRoot), abs).replace(/\\/g, "/");
        for (const f of found) out.push({ type, file: `shared/${rel}`, path: f.path, value: f.value });
      }
    }
  }
  return out;
}

/** Shared component types whose examples use this background ID. */
export function sharedTypesUsingBackground(id: string): string[] {
  return Array.from(new Set(collectSharedExampleBackgrounds().filter((b) => b.value === id).map((b) => b.type))).sort();
}

/** Sites with their own theme.json that lack one or more base palette IDs. */
export function sitesMissingBasePalette(): Array<{ contentFolder: string; missing: string[] }> {
  const out: Array<{ contentFolder: string; missing: string[] }> = [];
  for (const c of getSiteConfigs()) {
    const root = path.isAbsolute(c.contentFolder) ? c.contentFolder : path.join(getProjectRoot(), c.contentFolder);
    if (!hasOwnSiteTheme(root)) continue;
    const missing = missingBasePaletteIds(loadSiteTheme(root)?.backgrounds);
    if (missing.length > 0) out.push({ contentFolder: c.contentFolder, missing });
  }
  return out;
}
