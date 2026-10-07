/**
 * Layout approvals for component insights.
 *
 * Explicit: staff "Approve layout as design reference" writes
 *   insights_review: { status, fingerprint, by, at }
 * into the page YAML (entry _common.yml, or the shared template file).
 * Implicit: a layout staff published and nobody restructured for 30 days.
 * Both go stale only when the structural fingerprint changes.
 *
 * The ledger (.cache/<site>/layout-ledger.json, persistent across deploys)
 * remembers since when each layout has had its current fingerprint and who
 * published it last.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { CACHE_DIR } from "../db-cache";
import { findTopLevelKeySpan, surgicalRemoveTopLevelKey } from "../seo-fields";

export const INSIGHTS_REVIEW_KEY = "insights_review";

/** Insights layout record key for a shared template (one per content type). */
export function templateLayoutKey(contentType: string): string {
  return `${contentType}::template`;
}
export const IMPLICIT_APPROVAL_DAYS = 30;

export type InsightsReviewStatus = "approved" | "rejected";

export interface InsightsReview {
  status: InsightsReviewStatus;
  fingerprint: string;
  by: string;
  at: string;
}

export type ApprovalState = "approved" | "implicit" | "rejected" | "stale" | "none";

export const APPROVAL_FACTORS: Record<ApprovalState, number> = {
  approved: 2,
  implicit: 1.2,
  rejected: 0,
  stale: 1,
  none: 1,
};

export interface LayoutLedgerEntry {
  fingerprint: string;
  /** ISO time the current fingerprint was first seen. */
  since: string;
  published_by?: string;
  published_by_agent?: boolean;
}

export interface ResolvedApproval {
  state: ApprovalState;
  factor: number;
  by?: string;
  at?: string;
  stable_since?: string;
}

export function parseInsightsReview(v: unknown): InsightsReview | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (r.status !== "approved" && r.status !== "rejected") return null;
  if (typeof r.fingerprint !== "string" || !r.fingerprint) return null;
  return {
    status: r.status,
    fingerprint: r.fingerprint,
    by: typeof r.by === "string" ? r.by : "",
    at: typeof r.at === "string" ? r.at : r.at instanceof Date ? r.at.toISOString() : "",
  };
}

export function resolveApproval(opts: {
  review: InsightsReview | null;
  fingerprint: string;
  ledger?: LayoutLedgerEntry | null;
  now?: number;
}): ResolvedApproval {
  const { review, fingerprint, ledger } = opts;
  if (review) {
    if (review.fingerprint === fingerprint) {
      const state: ApprovalState = review.status === "approved" ? "approved" : "rejected";
      return { state, factor: APPROVAL_FACTORS[state], by: review.by, at: review.at };
    }
    if (review.status === "approved") {
      return { state: "stale", factor: APPROVAL_FACTORS.stale, by: review.by, at: review.at };
    }
  }
  if (ledger && ledger.fingerprint === fingerprint && !ledger.published_by_agent) {
    const ageDays = ((opts.now ?? Date.now()) - Date.parse(ledger.since)) / 86_400_000;
    if (ageDays >= IMPLICIT_APPROVAL_DAYS) {
      return {
        state: "implicit",
        factor: APPROVAL_FACTORS.implicit,
        stable_since: ledger.since,
        ...(ledger.published_by ? { by: ledger.published_by } : {}),
      };
    }
  }
  return {
    state: "none",
    factor: APPROVAL_FACTORS.none,
    ...(ledger && ledger.fingerprint === fingerprint ? { stable_since: ledger.since } : {}),
  };
}

// ─── Ledger ────────────────────────────────────────────────────────────────

function ledgerPath(contentFolder: string): string {
  return path.join(CACHE_DIR, contentFolder, "layout-ledger.json");
}

export function readLayoutLedger(contentFolder: string): Record<string, LayoutLedgerEntry> {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath(contentFolder), "utf8")) as Record<string, LayoutLedgerEntry>;
  } catch {
    return {};
  }
}

function writeLayoutLedger(contentFolder: string, ledger: Record<string, LayoutLedgerEntry>): void {
  const p = ledgerPath(contentFolder);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(ledger, null, 2));
}

/**
 * Reconcile the ledger with the fingerprints seen by a scan. Unknown layouts
 * start their clock now; changed fingerprints restart it (keeping a matching
 * publish record when the publish hook saw this exact structure).
 * The first scan ever backdates `since` to the file's mtime so existing pages
 * do not all wait 30 days.
 */
export function reconcileLayoutLedger(
  contentFolder: string,
  seen: Map<string, { fingerprint: string; mtimeMs?: number }>,
  now = Date.now(),
): Record<string, LayoutLedgerEntry> {
  const ledger = readLayoutLedger(contentFolder);
  const firstRun = Object.keys(ledger).length === 0;
  let changed = false;
  for (const [key, { fingerprint, mtimeMs }] of seen) {
    const prev = ledger[key];
    if (prev?.fingerprint === fingerprint) continue;
    const since = firstRun && mtimeMs ? new Date(Math.min(mtimeMs, now)).toISOString() : new Date(now).toISOString();
    ledger[key] = { fingerprint, since };
    changed = true;
  }
  if (changed) writeLayoutLedger(contentFolder, ledger);
  return ledger;
}

/** Publish hook: remember who put this structure live (agents never earn implicit approval). */
export function recordLayoutPublish(
  contentFolder: string,
  key: string,
  fingerprint: string,
  by: string,
  byAgent: boolean,
  now = Date.now(),
): void {
  const ledger = readLayoutLedger(contentFolder);
  const prev = ledger[key];
  ledger[key] = {
    fingerprint,
    since: prev?.fingerprint === fingerprint ? prev.since : new Date(now).toISOString(),
    published_by: by,
    published_by_agent: byAgent,
  };
  writeLayoutLedger(contentFolder, ledger);
}

// ─── YAML write ────────────────────────────────────────────────────────────

/** Replace / insert / remove top-level `insights_review:` without re-dumping the file. */
export function surgicalReplaceInsightsReview(content: string, review: InsightsReview | null): string {
  const span = findTopLevelKeySpan(content, INSIGHTS_REVIEW_KEY);
  if (!review) return span ? surgicalRemoveTopLevelKey(content, INSIGHTS_REVIEW_KEY) : content;
  const dumped = yaml
    .dump({ [INSIGHTS_REVIEW_KEY]: review }, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false })
    .trimEnd();
  if (!span) {
    if (content.trim() === "" || content.trim() === "{}") return `${dumped}\n`;
    const trimmed = content.endsWith("\n") ? content : `${content}\n`;
    return `${trimmed}${dumped}\n`;
  }
  const before = content.slice(0, span.start);
  let after = content.slice(span.end);
  if (after.startsWith("\n")) after = after.slice(1);
  return `${before}${dumped}\n${after}`;
}
