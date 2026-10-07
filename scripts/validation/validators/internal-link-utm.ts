/**
 * Same-site links must not carry utm_* parameters: they start a new GA4 session and overwrite
 * the visitor's real source (paid traffic gets credited to an internal "campaign").
 * Links to other domains, including the organization's other sites, are not flagged.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { Validator, ValidatorResult, ValidationContext, ValidationIssue } from "../shared/types";
import { getSiteConfigs } from "../../../server/site-config";
import { INTERNAL_LINK_UTM_ISSUE_CODES } from "./internal-link-utm.issueCodes";

const UTM_PARAM_RE = /[?&](utm_[a-z_]+)=/gi;
/** Characters that end a URL token inside text, markdown or HTML. */
const URL_STOP = /[\s"'<>()[\]{}|`]/;

/** Hostnames that count as "this site" (domain, www. variant and configured aliases). */
export function siteHostsFor(contentRoot: string | undefined): Set<string> {
  const hosts = new Set<string>();
  let configs: ReturnType<typeof getSiteConfigs> = [];
  try {
    configs = getSiteConfigs();
  } catch {
    return hosts;
  }
  const folder = contentRoot ? path.basename(contentRoot) : null;
  const cfg = (folder && configs.find((c) => path.basename(c.contentFolder) === folder)) || configs[0];
  if (!cfg) return hosts;
  for (const h of [cfg.domain, ...(cfg.aliases ?? [])]) {
    const host = h.toLowerCase();
    hosts.add(host);
    hosts.add(host.startsWith("www.") ? host.slice(4) : `www.${host}`);
  }
  return hosts;
}

/** URL tokens in `text` that carry utm_* params, with the param names. */
export function utmLinksIn(text: string): Array<{ url: string; params: string[] }> {
  const out = new Map<string, Set<string>>();
  for (const m of Array.from(text.matchAll(UTM_PARAM_RE))) {
    const at = m.index ?? 0;
    let start = at;
    while (start > 0 && !URL_STOP.test(text[start - 1]!)) start--;
    let end = at + 1;
    while (end < text.length && !URL_STOP.test(text[end]!)) end++;
    const url = text.slice(start, end).replace(/[.,;:!]+$/, "");
    if (!out.has(url)) out.set(url, new Set());
    out.get(url)!.add(m[1]!.toLowerCase());
  }
  return Array.from(out, ([url, params]) => ({ url, params: Array.from(params) }));
}

/** True when the link points at this site (relative, protocol-relative or same host). */
export function isSameSiteLink(url: string, siteHosts: Set<string>): boolean {
  if (/^(mailto|tel|javascript|data):/i.test(url)) return false;
  if (url.startsWith("//")) return siteHosts.has(url.slice(2).split(/[/?#]/)[0]!.toLowerCase());
  const abs = url.match(/^https?:\/\/([^/?#]+)/i);
  if (abs) return siteHosts.has(abs[1]!.toLowerCase().replace(/:\d+$/, ""));
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  // Bare "4geeks.com/path" style text is ambiguous; only treat it as same-site when the host matches.
  const bare = url.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#]|$)/i);
  if (bare && !url.startsWith("/") && !url.startsWith("?")) return siteHosts.has(bare[1]!.toLowerCase());
  return url.startsWith("/") || url.startsWith("?") || url.startsWith("#") || url.startsWith(".");
}

type Finding = { yamlPath: string; url: string; params: string[] };

/** Same-site links with utm_* params anywhere in a parsed YAML document. */
export function findInternalUtmLinks(doc: unknown, siteHosts: Set<string>): Finding[] {
  const out: Finding[] = [];
  const walk = (node: unknown, p: string) => {
    if (typeof node === "string") {
      if (!/utm_/i.test(node)) return;
      for (const l of utmLinksIn(node)) if (isSameSiteLink(l.url, siteHosts)) out.push({ yamlPath: p, ...l });
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, p ? `${p}.${i}` : String(i)));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, p ? `${p}.${k}` : k);
    }
  };
  walk(doc, "");
  return out;
}

export const internalLinkUtmValidator: Validator = {
  name: "internal-link-utm",
  issueCodes: INTERNAL_LINK_UTM_ISSUE_CODES,
  description: "Links to pages on this same site must not carry utm_* parameters (they overwrite the visitor's real source in GA4)",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "content",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const warnings: ValidationIssue[] = [];
    const siteHosts = siteHostsFor(context.contentRoot);
    const seen = new Set<string>();
    let checked = 0;

    for (const file of context.contentFiles) {
      if (seen.has(file.filePath) || !fs.existsSync(file.filePath)) continue;
      seen.add(file.filePath);
      let raw: string;
      try {
        raw = fs.readFileSync(file.filePath, "utf-8");
      } catch {
        continue;
      }
      checked++;
      if (!/utm_/i.test(raw)) continue;
      let doc: unknown;
      try {
        doc = yaml.load(raw);
      } catch {
        continue;
      }
      for (const f of findInternalUtmLinks(doc, siteHosts)) {
        warnings.push({
          type: "warning",
          code: "INTERNAL_LINK_HAS_UTM",
          message: `Same-site link at ${f.yamlPath} carries ${f.params.join(", ")}: ${f.url}`,
          file: file.filePath,
          suggestion: `Remove ${f.params.join(", ")} from the link at ${f.yamlPath}. UTMs on internal links start a new GA4 session and replace the visitor's real source (e.g. a paid ad).`,
        });
      }
    }

    return {
      name: this.name,
      description: this.description,
      status: warnings.length > 0 ? "warning" : "passed",
      errors: [],
      warnings,
      duration: Date.now() - startTime,
      artifacts: { checked },
    };
  },
};
