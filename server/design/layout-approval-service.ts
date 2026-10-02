/**
 * Staff "Approve layout as design reference" — read/write insights_review
 * for the layout an entry renders (its own sections, or the shared template
 * when attached). Insights scan the default site only.
 */
import fs from "fs";
import path from "path";
import { getFolder } from "../content-types";
import { getDefaultContentRoot } from "../site-config";
import { layoutInfoForEntry } from "../layout-owner";
import { markFileAsModified } from "../sync-state";
import {
  loadTemplateSections,
  markInsightsDirty,
  resolvePageSections,
  templateLayoutKey,
  type ResolvedLayoutSource,
} from "../component-insights";
import {
  readLayoutLedger,
  resolveApproval,
  surgicalReplaceInsightsReview,
  type InsightsReview,
  type InsightsReviewStatus,
  type ResolvedApproval,
} from "./layout-approval";
import { getDefaultContentFolder } from "../site-config";

export interface EntryLayoutApproval {
  key: string;
  layout_owner: "entry" | "shared_template";
  fingerprint: string;
  section_count: number;
  review: InsightsReview | null;
  approval: ResolvedApproval;
  /** Relative file that stores insights_review. */
  file: string;
  /** Attached entries sharing this layout (templates only). */
  shared_with_entries?: boolean;
}

function absRoot(): string {
  const r = getDefaultContentRoot();
  return path.isAbsolute(r) ? r : path.join(process.cwd(), r);
}

function layoutSourceFor(
  contentType: string,
  slug: string,
): { key: string; owner: "entry" | "shared_template"; source: ResolvedLayoutSource; reviewFile: string } | null {
  const root = absRoot();
  const owner = layoutInfoForEntry(contentType, slug, getDefaultContentRoot()).layout_owner;
  if (owner === "shared_template") {
    const source = loadTemplateSections(contentType, root);
    if (!source.file || source.sections.length === 0) return null;
    return { key: templateLayoutKey(contentType), owner, source, reviewFile: source.file };
  }
  const contentDir = path.join(root, getFolder(contentType, getDefaultContentRoot()));
  const source = resolvePageSections(contentType, slug, contentDir);
  if (source.sections.length === 0) return null;
  return { key: `${contentType}/${slug}`, owner, source, reviewFile: path.join(contentDir, slug, "_common.yml") };
}

export function getEntryLayoutApproval(contentType: string, slug: string): EntryLayoutApproval | null {
  const found = layoutSourceFor(contentType, slug);
  if (!found) return null;
  const ledger = readLayoutLedger(getDefaultContentFolder())[found.key];
  return {
    key: found.key,
    layout_owner: found.owner,
    fingerprint: found.source.fingerprint,
    section_count: found.source.sections.length,
    review: found.source.review,
    approval: resolveApproval({ review: found.source.review, fingerprint: found.source.fingerprint, ledger }),
    file: path.relative(process.cwd(), found.reviewFile),
    ...(found.owner === "shared_template" ? { shared_with_entries: true } : {}),
  };
}

export function setEntryLayoutApproval(opts: {
  contentType: string;
  slug: string;
  status: InsightsReviewStatus | null;
  by: string;
}): { ok: true; result: EntryLayoutApproval } | { ok: false; status: number; error: string } {
  const found = layoutSourceFor(opts.contentType, opts.slug);
  if (!found) {
    return { ok: false, status: 404, error: "No live layout found for this entry (drafts cannot be approved)." };
  }
  const review: InsightsReview | null = opts.status
    ? { status: opts.status, fingerprint: found.source.fingerprint, by: opts.by, at: new Date().toISOString() }
    : null;
  const file = found.reviewFile;
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  const after = surgicalReplaceInsightsReview(before, review);
  if (after !== before) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, after, "utf-8");
    markFileAsModified(file, opts.by, undefined, getDefaultContentRoot());
    markInsightsDirty();
  }
  const result = getEntryLayoutApproval(opts.contentType, opts.slug);
  if (!result) return { ok: false, status: 500, error: "Approval written but layout could not be re-read." };
  return { ok: true, result };
}
