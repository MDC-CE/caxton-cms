/**
 * Declarative proposal review rule catalog.
 * Stable IDs for audit/tests; staff copy in plain English.
 * Selling allowlist is a v1 stopgap — long-term: content-type strategy flag.
 */

export type DamageClass =
  | "none"
  | "existing_metadata"
  | "existing_content"
  | "selling_page"
  | "new_public_content";

export type UndoCost = "none" | "low" | "medium" | "high";

export type ExistenceState = "exists" | "missing" | "unknown";

export type ChecklistId =
  | "selling_page_figures"
  | "new_content_brand"
  | "dedup_coordinate"
  | "dedup_competing_edits"
  | "dedup_fix_pending"
  | "idea_accept"
  | "notes_close"
  | "review_mode_inert"
  | "verify_copy"
  | "adjacent_findings"
  | "disposition"
  | "existence_unknown"
  | "target_missing";

/** v1 stopgap — extend until strategy.selling (or similar) exists. */
export const SELLING_CONTENT_TYPES = new Set([
  "landing",
  "landings",
  "program",
  "programs",
]);

export const PUBLIC_CONTENT_TYPES = new Set(["blog", "blogs", "article", "articles"]);

export type DamageClassMeta = {
  id: DamageClass;
  badge_label: string;
  situation_description: string;
  risk: string;
};

export const DAMAGE_CLASS_META: Record<DamageClass, DamageClassMeta> = {
  none: {
    id: "none",
    badge_label: "Handoff",
    situation_description:
      "Reminder or wall — closing does not change the live site.",
    risk: "No live content change on close or accept.",
  },
  existing_metadata: {
    id: "existing_metadata",
    badge_label: "Metadata fix",
    situation_description:
      "Small change on an existing page (title, description, etc.). Easy to undo; still check the copy is accurate.",
    risk: "Low — metadata on a page that already exists.",
  },
  existing_content: {
    id: "existing_content",
    badge_label: "Content edit",
    situation_description:
      "Changes copy or fields on a page that already exists. Confirm the edit matches the summary before apply.",
    risk: "Medium — body or field changes on a live page.",
  },
  selling_page: {
    id: "selling_page",
    badge_label: "Selling page",
    situation_description:
      "This proposal changes a page that sells a program or offer. Wrong outcome claims (hire rate, salary, price) can cost real leads — verify figures before apply.",
    risk: "High — selling page; outcome claims affect leads.",
  },
  new_public_content: {
    id: "new_public_content",
    badge_label: "New public content",
    situation_description:
      "New or proposed public page. Judge angle, facts, and funnel — not only whether apply is easy.",
    risk: "High — brand and spam risk for new public content.",
  },
};

export type ThinkTemplate = {
  id: ChecklistId;
  title: string;
  why: string;
  look_for: string[];
  /** Sort priority (lower = earlier). Cap at MAX_THINK in review-context. */
  priority: number;
};

export const THINK_TEMPLATES: Record<ChecklistId, ThinkTemplate> = {
  selling_page_figures: {
    id: "selling_page_figures",
    title: "Verify every outcome figure",
    why: "This page sells. A wrong hire rate, salary, or price is not cosmetic.",
    look_for: [
      "proposed number vs approved source",
      "locale of the figure",
      "reject or block if the source is missing",
    ],
    priority: 10,
  },
  new_content_brand: {
    id: "new_content_brand",
    title: "Clear the new-public-content gate",
    why: "Cheap to file; expensive if spammy or generic.",
    look_for: [
      "defensible technical or educational angle",
      "facts checked against the product",
      "CTA or link to a real program",
      "reject or add_blocker if any of the three fails",
    ],
    priority: 10,
  },
  dedup_coordinate: {
    id: "dedup_coordinate",
    title: "Coordinate with related proposals",
    why: "Another open proposal shares an issue — same problem, not independent work.",
    look_for: [
      "if this edits proposal is the fix, apply then close the related notes",
      "do not reject solely because related notes exist",
    ],
    priority: 20,
  },
  dedup_competing_edits: {
    id: "dedup_competing_edits",
    title: "Competing edits on the same problem",
    why: "Another open edits proposal overlaps — do not apply both blind.",
    look_for: [
      "compare field updates with the sibling edits proposal",
      "join, fold, or reject the weaker duplicate",
      "do not apply both without comparing",
    ],
    priority: 15,
  },
  dedup_fix_pending: {
    id: "dedup_fix_pending",
    title: "An edits proposal may already be the fix",
    why: "Open edits share this issue — check them before parking this notes handoff.",
    look_for: [
      "open the related edits proposal before closing as wont_fix",
      "close notes as fixed_elsewhere only after the fix is applied or tracked",
    ],
    priority: 20,
  },
  idea_accept: {
    id: "idea_accept",
    title: "Accept greenlights a brief only",
    why: "Accept does not create pages or write YAML. The build is a later step.",
    look_for: [
      "next_step is concrete (min 20 characters)",
      "do not report the page as live after accept",
      "close/park means no — not yes",
    ],
    priority: 5,
  },
  notes_close: {
    id: "notes_close",
    title: "Close disposition",
    why: "Notes do not change YAML on close. Closing parks the wall.",
    look_for: [
      "wont_fix vs fixed_elsewhere vs tracked_elsewhere",
      "closing does not re-queue when no_auto_retry is set",
    ],
    priority: 5,
  },
  review_mode_inert: {
    id: "review_mode_inert",
    title: "Ignore review mode here",
    why: "On notes and ideas, review_mode does nothing.",
    look_for: ["do not reason about soft vs draft for this proposal kind"],
    priority: 40,
  },
  verify_copy: {
    id: "verify_copy",
    title: "Check the proposed change against live",
    why: "Confirm the proposed values match the summary and do not invent claims.",
    look_for: [
      "proposed value vs live for fields this proposal writes",
      "summary claims match the ops (meta-only is not a content refresh)",
      "no invented stats in the proposed text",
    ],
    priority: 30,
  },
  adjacent_findings: {
    id: "adjacent_findings",
    title: "Park out-of-scope live-page defects",
    why: "Real live defects this proposal does not write must not become default apply-blockers or chat-only.",
    look_for: [
      "invented or stale figures on the live page even if ops do not change them",
      "dead links, duplicate blocks, locale-mismatched related links",
      "title/H1/body disagreement that this proposal does not fix",
      "would I still ship this meta if the article stays as-is?",
      "makes proposed copy false or summary overclaims → add_blocker",
      "same entry, ops do not touch → notes naming this page; link issue only if one exists; do not block apply",
      "other entry → notes naming that page; never blocker on this proposal",
      "existing open notes covering it → join/append; nothing to park → no empty notes",
      "do not leave findings only in chat",
      "lack proposals_create → do not turn park items into blockers; hand off to a create-capable role",
    ],
    priority: 50,
  },
  disposition: {
    id: "disposition",
    title: "Choose a disposition",
    why: "After optional research, decide apply, reject, add_blocker, or park adjacent notes.",
    look_for: [
      "apply only when you would ship this yourself",
      "add_blocker when the proposed change is wrong or invents claims (then author revise_entries)",
      "out-of-scope live defects → adjacent_findings notes park (same or other page); do not default every finding to add_blocker",
      "reject only for bad/impossible/illegal/harmful/duplicate/target missing — confirm_reject + reject_kind + note",
    ],
    priority: 90,
  },
  existence_unknown: {
    id: "existence_unknown",
    title: "Confirm the page exists",
    why: "The server could not confirm whether the page is on disk.",
    look_for: [
      "verify with get_entry_seo or get_entry_content before trusting this label",
      "do not invent selling-page vs new-content from a failed lookup",
    ],
    priority: 5,
  },
  target_missing: {
    id: "target_missing",
    title: "Target no longer exists",
    why: "The page this proposal edits is gone. Apply is blocked.",
    look_for: [
      "reject or withdraw this proposal",
      "restore the page and file a fresh proposal if the work is still wanted",
      "do not treat this as new public content",
    ],
    priority: 1,
  },
};

export const UNDO_COPY: Record<UndoCost, string> = {
  none: "No live write on close or accept.",
  low: "Apply writes a draft only — nothing public changes until a later promote.",
  medium: "Apply writes live immediately.",
  high: "Apply publishes a whole draft to live — point of no return for that piece.",
};

export function isSellingContentType(contentType: string): boolean {
  return SELLING_CONTENT_TYPES.has(contentType.trim().toLowerCase());
}

export function isPublicContentType(contentType: string): boolean {
  return PUBLIC_CONTENT_TYPES.has(contentType.trim().toLowerCase());
}

/** Higher = worse for mixed-risk / worst-case. */
export const DAMAGE_CLASS_RANK: Record<DamageClass, number> = {
  none: 0,
  existing_metadata: 1,
  existing_content: 2,
  selling_page: 3,
  new_public_content: 3,
};

export function worseDamageClass(a: DamageClass, b: DamageClass): DamageClass {
  return DAMAGE_CLASS_RANK[a] >= DAMAGE_CLASS_RANK[b] ? a : b;
}
