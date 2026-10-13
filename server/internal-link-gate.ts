/**
 * Internal-link gate: every internal link on a live page (or a page being published)
 * must resolve to a live page. Blocks only after the cleanup migration completed on the site.
 */

import fs from "fs";
import path from "path";
import { contentIndex as defaultContentIndex, type ContentIndex } from "./content-index";
import { createPublicUrlResolver } from "./redirects";
import { extractInternalLinkHits, type InternalLinkHit } from "./internal-link-hits";
import { getEntryContentDir, hasLiveLocaleFile, listDraftLocales } from "./draft-entry";
import { getDefaultContentRoot } from "./site-config";
import { child } from "./logger";
import { isCompleted, ledgerDb } from "./data-migrations/ledger";
import {
  BROKEN_INTERNAL_LINKS_CODE,
  INTERNAL_LINK_MIGRATION_FILENAME,
  INTERNAL_LINK_WARNING_CODES,
  formatBrokenInternalLinksMessage,
  type BrokenInternalLink,
  type InternalLinkWarning,
  type RedirectedInternalLink,
} from "@shared/internalLinkGate";

const log = child({ module: "internal-link-gate" });

/** `/`, `/en`, `/es-mx`: linking to a locale home is fine even though it redirects to the canonical home. */
const LOCALE_HOME_RE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/;

export type InternalLinkEvaluation = {
  broken: BrokenInternalLink[];
  draftTargets: BrokenInternalLink[];
  redirected: RedirectedInternalLink[];
};

export type InternalLinkGateFailure = {
  code: typeof BROKEN_INTERNAL_LINKS_CODE;
  message: string;
  broken_internal_links: BrokenInternalLink[];
};

export type InternalLinkGateResult = {
  failure: InternalLinkGateFailure | null;
  warnings: InternalLinkWarning[];
};

export type InternalLinkGateOptions = {
  pageData: Record<string, unknown>;
  locale: string;
  contentRoot?: string;
  ci?: ContentIndex;
  /** The page being written is a draft (variant file or draft-only entry). */
  pageIsDraft: boolean;
  intent: "publish" | "save";
};

function siteNameFromContentRoot(contentRoot?: string): string {
  return path.basename(contentRoot ?? getDefaultContentRoot());
}

type EnforcementCheck = (site: string) => boolean;

const enforcedSites = new Set<string>();

const defaultEnforcement: EnforcementCheck = (site) => {
  if (enforcedSites.has(site)) return true;
  try {
    if (isCompleted(ledgerDb(site), INTERNAL_LINK_MIGRATION_FILENAME)) {
      enforcedSites.add(site);
      return true;
    }
  } catch (err) {
    log.warn({ err, site }, "[InternalLinkGate] could not read migration ledger; gate stays warn-only");
  }
  return false;
};

let enforcementCheck: EnforcementCheck =
  process.env.NODE_ENV === "test" || process.env.VITEST ? () => false : defaultEnforcement;

/** True when the cleanup migration completed on this site (gate blocks). */
export function isInternalLinkGateEnforced(contentRoot?: string): boolean {
  return enforcementCheck(siteNameFromContentRoot(contentRoot));
}

export function setInternalLinkGateEnforcementForTests(check: EnforcementCheck | null): void {
  enforcementCheck = check ?? (() => false);
  enforcedSites.clear();
}

function lastSegment(p: string): string {
  const parts = p.replace(/\/$/, "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Most likely intended live URL: same locale prefix, same last segment (wrong category),
 * otherwise the closest last segment within a small edit distance.
 */
export function findClosestLiveMatch(targetPath: string, liveUrls: Iterable<string>): string | null {
  const target = targetPath.replace(/\/$/, "");
  const localePrefix = target.split("/")[1] ?? "";
  const seg = lastSegment(target);
  if (!seg) return null;
  const threshold = Math.max(2, Math.floor(seg.length * 0.25));
  let best: { url: string; dist: number } | null = null;
  for (const url of Array.from(liveUrls)) {
    if (localePrefix && url.split("/")[1] !== localePrefix) continue;
    const candidate = lastSegment(url);
    if (!candidate) continue;
    if (candidate === seg) return url;
    if (Math.abs(candidate.length - seg.length) > threshold) continue;
    const dist = levenshtein(seg, candidate);
    if (dist <= threshold && (!best || dist < best.dist)) best = { url, dist };
  }
  return best?.url ?? null;
}

function isDraftTarget(
  ci: ContentIndex,
  linkPath: string,
  contentRoot?: string,
): boolean {
  try {
    const parsed = ci.parseContentUrl(linkPath);
    if (!parsed?.slug) return false;
    const dir = getEntryContentDir(parsed.contentType, parsed.slug, contentRoot);
    if (!fs.existsSync(dir)) return false;
    if (hasLiveLocaleFile(dir, parsed.locale)) return false;
    return listDraftLocales(dir).includes(parsed.locale);
  } catch {
    return false;
  }
}

/** Resolve every internal link on the page: live, redirecting to live, draft-only, or broken. */
export function evaluateInternalLinks(opts: {
  pageData: Record<string, unknown>;
  locale: string;
  contentRoot?: string;
  ci?: ContentIndex;
}): InternalLinkEvaluation {
  const ci = opts.ci ?? defaultContentIndex;
  const hits = extractInternalLinkHits(opts.pageData);
  const result: InternalLinkEvaluation = { broken: [], draftTargets: [], redirected: [] };
  if (hits.length === 0) return result;

  const resolver = createPublicUrlResolver(ci);
  let liveUrls: Set<string> | null = null;
  const unresolved: InternalLinkHit[] = [];

  for (const hit of hits) {
    const test = resolver.test(hit.path, opts.locale);
    if (test.pageExists) continue;
    if (test.match && test.destinationExists && test.resolvedTo) {
      if (LOCALE_HOME_RE.test(hit.path)) continue;
      result.redirected.push({
        link: hit.link,
        field_path: hit.fieldPath,
        ...(hit.component ? { component: hit.component } : {}),
        final_url: test.resolvedTo,
      });
      continue;
    }
    unresolved.push(hit);
  }

  for (const hit of unresolved) {
    const base: BrokenInternalLink = {
      link: hit.link,
      field_path: hit.fieldPath,
      ...(hit.component ? { component: hit.component } : {}),
    };
    if (isDraftTarget(ci, hit.path, opts.contentRoot)) {
      result.draftTargets.push({ ...base, draft_target: true });
      continue;
    }
    if (!liveUrls) {
      try {
        liveUrls = ci.getAllValidUrls();
      } catch {
        liveUrls = new Set();
      }
    }
    result.broken.push({ ...base, closest_live_match: findClosestLiveMatch(hit.path, liveUrls) });
  }
  return result;
}

/**
 * Gate decision. Live saves and publish: broken links and draft-only targets block
 * (warn-only until the cleanup migration completed on the site). Draft saves only warn.
 * Links that redirect to a live page always pass with a warning.
 */
export function runInternalLinkGate(opts: InternalLinkGateOptions): InternalLinkGateResult {
  const evaluation = evaluateInternalLinks(opts);
  const warnings: InternalLinkWarning[] = [];

  if (evaluation.redirected.length > 0) {
    warnings.push({
      code: INTERNAL_LINK_WARNING_CODES.redirects,
      message:
        `${evaluation.redirected.length} internal link(s) go through a redirect. They work, but link to the final URL instead: ` +
        evaluation.redirected.map((r) => `${r.link} → ${r.final_url}`).slice(0, 10).join("; "),
      links: evaluation.redirected,
    });
  }

  const draftSave = opts.pageIsDraft && opts.intent === "save";
  if (draftSave) {
    if (evaluation.draftTargets.length > 0) {
      warnings.push({
        code: INTERNAL_LINK_WARNING_CODES.draftTarget,
        message:
          `${evaluation.draftTargets.length} link(s) point to pages that are still drafts. ` +
          "Allowed while this page is a draft; publishing this page is blocked until those pages are live.",
        links: evaluation.draftTargets,
      });
    }
    if (evaluation.broken.length > 0) {
      warnings.push({
        code: INTERNAL_LINK_WARNING_CODES.draftPageBroken,
        message: `${formatBrokenInternalLinksMessage(evaluation.broken)} Draft saves are not blocked; publishing is.`,
        links: evaluation.broken,
      });
    }
    return { failure: null, warnings };
  }

  const blocking = [...evaluation.broken, ...evaluation.draftTargets];
  if (blocking.length === 0) return { failure: null, warnings };

  const message = formatBrokenInternalLinksMessage(blocking);
  if (!isInternalLinkGateEnforced(opts.contentRoot)) {
    warnings.push({
      code: INTERNAL_LINK_WARNING_CODES.notEnforced,
      message: `${message} Not blocking yet: the broken-link cleanup migration has not run on this site.`,
      links: blocking,
    });
    return { failure: null, warnings };
  }
  return {
    failure: { code: BROKEN_INTERNAL_LINKS_CODE, message, broken_internal_links: blocking },
    warnings,
  };
}
