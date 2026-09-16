/**
 * Deterministic proposal review classifier.
 * Compute on read (and at create for snapshot). Same inputs → same output.
 */

import type { ProposalCategory, ProposalKind, ProposalRecord, ReviewMode } from "./service";
import {
  DAMAGE_CLASS_META,
  THINK_TEMPLATES,
  UNDO_COPY,
  MIXED_SERP_AND_BODY,
  TITLE_DESCRIPTION_STAFF_NOTE,
  worseDamageClass,
  isSellingContentType,
  isPublicContentType,
  hasTitleDescriptionOps,
  isTitleDescriptionOnlyOps,
  type ChecklistId,
  type DamageClass,
  type ExistenceState,
  type UndoCost,
} from "./proposal-review-rules";

export type ReviewWarning = { code: string; message: string };

export type ReviewEntryContext = {
  contentType: string;
  slug: string;
  locale: string;
  existence: ExistenceState;
  damage_class: DamageClass;
  /** True when live is gone and no draft — blocks apply. */
  target_missing?: boolean;
};

export type RelatedOpenProposal = {
  id: string;
  title?: string;
  kind: ProposalKind;
  shared_issue_ids: string[];
};

export type ReviewContext = {
  undo_cost: UndoCost;
  damage_class: DamageClass;
  review_mode_operative: boolean;
  active_checklists: ChecklistId[];
  entries: ReviewEntryContext[];
  related_open_proposals?: RelatedOpenProposal[];
  summary: string;
  staff_summary: {
    badge_label: string;
    situation_description: string;
    risk: string;
    undo: string;
    related?: string;
  };
  agent_preview: {
    think_items: Array<{ id: string; title: string; why: string; look_for: string[] }>;
    warnings: ReviewWarning[];
  };
  /** Apply must fail when any remaining entry has this. */
  block_apply: boolean;
  situation_changed_since_filed?: boolean;
  filed_damage_class?: string;
};

export type EntryExistenceLookup = {
  contentType: string;
  slug: string;
  locale: string;
  variant?: string | null;
  existence: ExistenceState;
  /** Draft file exists when variant was requested. */
  draftExists?: boolean;
};

export type ClassifyProposalReviewOpts = {
  proposal: Pick<
    ProposalRecord,
    | "id"
    | "kind"
    | "status"
    | "category"
    | "review_mode"
    | "related_issue_ids"
    | "related_entries"
    | "entries"
    | "summary"
  >;
  /** Per entry / related target existence. */
  lookups: EntryExistenceLookup[];
  relatedOpen?: RelatedOpenProposal[];
  /** Snapshot from DB for change detection. */
  snapshot?: { damage_class?: string } | null;
};

const MAX_THINK = 6;

export function damageClassForTarget(opts: {
  contentType: string;
  category?: ProposalCategory;
  existence: ExistenceState;
  /** Live missing but draft present → new content path. */
  draftExists?: boolean;
  /** For ideas: missing slug is new content when public type. */
  forIdea?: boolean;
}): DamageClass {
  const ct = opts.contentType;
  if (isSellingContentType(ct)) return "selling_page";

  if (opts.existence === "missing") {
    if (opts.draftExists) return "new_public_content";
    if (opts.forIdea && (isPublicContentType(ct) || !ct)) return "new_public_content";
    if (opts.forIdea) return isSellingContentType(ct) ? "selling_page" : "existing_content";
    // Edits with missing live and no draft — caller marks target_missing; class stays content-type based for badge but never new_public
    if (isPublicContentType(ct)) return "existing_content";
    return opts.category === "content.seo" ? "existing_metadata" : "existing_content";
  }

  if (opts.existence === "unknown") {
    if (isSellingContentType(ct)) return "selling_page";
    return opts.category === "content.seo" ? "existing_metadata" : "existing_content";
  }

  // exists
  if (opts.category === "content.seo" && !isSellingContentType(ct)) {
    return "existing_metadata";
  }
  return "existing_content";
}

export function undoCostFor(kind: ProposalKind, reviewMode: ReviewMode): UndoCost {
  if (kind === "notes" || kind === "idea") return "none";
  if (reviewMode === "soft_variant") return "low";
  if (reviewMode === "draft_backed") return "high";
  return "medium"; // soft
}

function lookupKey(contentType: string, slug: string, locale: string, variant?: string | null) {
  return `${contentType}\0${slug}\0${locale}\0${variant?.trim() || ""}`;
}

function findLookup(
  lookups: EntryExistenceLookup[],
  contentType: string,
  slug: string,
  locale: string,
  variant?: string | null,
): EntryExistenceLookup | undefined {
  const exact = lookups.find(
    (l) =>
      l.contentType === contentType &&
      l.slug === slug &&
      l.locale === locale &&
      (l.variant?.trim() || "") === (variant?.trim() || ""),
  );
  if (exact) return exact;
  return lookups.find(
    (l) => l.contentType === contentType && l.slug === slug && l.locale === locale,
  );
}

export function classifyProposalReview(opts: ClassifyProposalReviewOpts): ReviewContext {
  const { proposal, lookups, relatedOpen = [], snapshot } = opts;
  const warnings: ReviewWarning[] = [];
  const checklists = new Set<ChecklistId>();
  const entryContexts: ReviewEntryContext[] = [];
  let block_apply = false;

  const review_mode_operative = proposal.kind === "edits";
  const undo_cost = undoCostFor(proposal.kind, proposal.review_mode);

  if (proposal.kind === "notes") {
    checklists.add("notes_close");
    checklists.add("review_mode_inert");
  }
  if (proposal.kind === "idea") {
    checklists.add("idea_accept");
    checklists.add("review_mode_inert");
  }

  let damage_class: DamageClass = "none";

  if (proposal.kind === "edits") {
    const workEntries = proposal.entries.filter(
      (e) => !e.status || e.status === "pending" || e.status === "failed",
    );
    const toClassify = workEntries.length ? workEntries : proposal.entries;

    for (const e of toClassify) {
      const lu = findLookup(lookups, e.contentType, e.slug, e.locale, e.variant);
      const existence: ExistenceState = lu?.existence ?? "unknown";
      const draftExists = Boolean(e.variant?.trim() && lu?.draftExists);
      const liveMissing = existence === "missing";
      const target_missing = liveMissing && !draftExists;

      let dc = damageClassForTarget({
        contentType: e.contentType,
        category: proposal.category,
        existence,
        draftExists,
      });
      if (target_missing) {
        // Never label deleted target as new public content
        if (dc === "new_public_content") {
          dc = isSellingContentType(e.contentType) ? "selling_page" : "existing_content";
        }
        block_apply = true;
        checklists.add("target_missing");
        warnings.push({
          code: "target_missing",
          message: `Entry ${e.contentType}/${e.slug} (${e.locale}) no longer exists — apply is blocked. Reject or withdraw, or restore the page and file fresh.`,
        });
      }
      if (liveMissing && draftExists) {
        dc = "new_public_content";
      }
      if (existence === "unknown") {
        checklists.add("existence_unknown");
        warnings.push({
          code: "existence_unknown",
          message: `Could not confirm whether ${e.contentType}/${e.slug} (${e.locale}) exists — verify before trusting this situation label.`,
        });
      }

      entryContexts.push({
        contentType: e.contentType,
        slug: e.slug,
        locale: e.locale,
        existence,
        damage_class: dc,
        ...(target_missing ? { target_missing: true } : {}),
      });
      damage_class = worseDamageClass(damage_class, dc);
    }

    if (damage_class === "selling_page") checklists.add("selling_page_figures");
    if (damage_class === "new_public_content") checklists.add("new_content_brand");

    const workForOps = toClassify;
    const hasSerp = hasTitleDescriptionOps(workForOps);
    const serpOnly = isTitleDescriptionOnlyOps(workForOps);
    if (hasSerp) {
      checklists.add("title_description_ctr");
      if (!serpOnly) {
        checklists.add("verify_copy");
        warnings.push({
          code: MIXED_SERP_AND_BODY,
          message:
            "This proposal mixes search title/description with other field updates. Prefer separate proposals next time; for now run both the title/description harm scorecard and verify_copy. Create still succeeds.",
        });
      }
    } else {
      checklists.add("verify_copy");
    }

    if (
      !block_apply &&
      (damage_class === "existing_metadata" ||
        damage_class === "existing_content" ||
        damage_class === "selling_page")
    ) {
      checklists.add("adjacent_findings");
    }
    checklists.add("disposition");
  } else if (proposal.kind === "idea") {
    const related = proposal.related_entries ?? [];
    if (related.length === 0) {
      damage_class = "none";
    } else {
      for (const r of related) {
        const locale = r.locale?.trim() || "en";
        const lu = findLookup(lookups, r.contentType, r.slug, locale);
        const existence: ExistenceState = lu?.existence ?? "unknown";
        const dc = damageClassForTarget({
          contentType: r.contentType,
          existence,
          forIdea: true,
          draftExists: false,
        });
        // Missing public → new_public_content
        const resolved =
          existence === "missing"
            ? isSellingContentType(r.contentType)
              ? "selling_page"
              : "new_public_content"
            : dc;
        entryContexts.push({
          contentType: r.contentType,
          slug: r.slug,
          locale,
          existence,
          damage_class: resolved,
        });
        damage_class = worseDamageClass(damage_class === "none" ? resolved : damage_class, resolved);
        if (existence === "unknown") {
          checklists.add("existence_unknown");
        }
      }
      if (damage_class === "selling_page") checklists.add("selling_page_figures");
      if (damage_class === "new_public_content") checklists.add("new_content_brand");
    }
  }

  // Sibling dedup
  const siblings = relatedOpen.filter((s) => s.id !== proposal.id);
  if (siblings.length) {
    warnings.push({
      code: "shared_issue_id",
      message: `Open proposal(s) share related issue id(s): ${siblings.map((s) => s.id).join(", ")}.`,
    });
    const hasNotesSibling = siblings.some((s) => s.kind === "notes" || s.kind === "idea");
    const hasEditsSibling = siblings.some((s) => s.kind === "edits");
    if (proposal.kind === "edits" && hasNotesSibling) checklists.add("dedup_coordinate");
    if (proposal.kind === "edits" && hasEditsSibling) checklists.add("dedup_competing_edits");
    if (proposal.kind === "notes" && hasEditsSibling) checklists.add("dedup_fix_pending");
    if (proposal.kind === "notes" && hasNotesSibling) checklists.add("dedup_coordinate");
  }

  if (!review_mode_operative) {
    // already added review_mode_inert
  }

  const orderedIds = [...checklists]
    .map((id) => THINK_TEMPLATES[id])
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_THINK);

  const meta = DAMAGE_CLASS_META[damage_class];
  let relatedStaff: string | undefined;
  if (siblings.length) {
    if (proposal.kind === "edits" && siblings.some((s) => s.kind === "notes")) {
      relatedStaff =
        "Related notes share an issue — if this is the fix, apply then close the notes. Do not reject only because notes exist.";
    } else if (proposal.kind === "edits" && siblings.some((s) => s.kind === "edits")) {
      relatedStaff =
        "Another open edits proposal overlaps — compare updates; do not apply both without comparing.";
    } else if (proposal.kind === "notes" && siblings.some((s) => s.kind === "edits")) {
      relatedStaff =
        "An open edits proposal may already be the fix — check it before closing this notes handoff.";
    } else {
      relatedStaff = `Related open proposals: ${siblings.map((s) => s.id).join(", ")}.`;
    }
  }

  const situation_changed_since_filed = Boolean(
    snapshot?.damage_class && snapshot.damage_class !== damage_class,
  );
  if (situation_changed_since_filed) {
    warnings.push({
      code: "situation_changed",
      message: `Situation changed since filed (was ${snapshot!.damage_class}, now ${damage_class}).`,
    });
  }
  if (block_apply && !situation_changed_since_filed && snapshot?.damage_class) {
    // still flag change when target went missing
  }

  const summaryParts = [meta.situation_description];
  if (block_apply) summaryParts.push("Apply is blocked — target no longer exists.");
  if (situation_changed_since_filed) {
    summaryParts.push(`Changed since filed (was ${snapshot!.damage_class}).`);
  }
  const hasTitleDescChecklist = orderedIds.some((t) => t.id === "title_description_ctr");
  if (hasTitleDescChecklist && !block_apply) {
    summaryParts.push(TITLE_DESCRIPTION_STAFF_NOTE);
  }

  let staffSituation = block_apply
    ? "The page this proposal edits no longer exists — apply is blocked; reject or withdraw, or restore the page and file fresh."
    : meta.situation_description;
  if (hasTitleDescChecklist && !block_apply) {
    staffSituation = `${staffSituation} ${TITLE_DESCRIPTION_STAFF_NOTE}`;
  }

  return {
    undo_cost,
    damage_class,
    review_mode_operative,
    active_checklists: orderedIds.map((t) => t.id),
    entries: entryContexts,
    ...(siblings.length ? { related_open_proposals: siblings } : {}),
    summary: summaryParts.join(" "),
    staff_summary: {
      badge_label: block_apply ? "Target missing" : meta.badge_label,
      situation_description: staffSituation,
      risk: block_apply ? "Apply blocked — target gone." : meta.risk,
      undo: UNDO_COPY[undo_cost],
      ...(relatedStaff ? { related: relatedStaff } : {}),
    },
    agent_preview: {
      think_items: orderedIds.map((t) => ({
        id: t.id,
        title: t.title,
        why: t.why,
        look_for: t.look_for,
      })),
      warnings,
    },
    block_apply,
    ...(situation_changed_since_filed
      ? { situation_changed_since_filed: true, filed_damage_class: snapshot!.damage_class }
      : {}),
  };
}

/** Distinct damage classes across targets — for mixed_risk_bundle refuse. */
export function collectDamageClassesForMixedCheck(
  targets: Array<{
    contentType: string;
    category?: ProposalCategory;
    existence: ExistenceState;
    draftExists?: boolean;
    forIdea?: boolean;
  }>,
): DamageClass[] {
  const set = new Set<DamageClass>();
  for (const t of targets) {
    let dc = damageClassForTarget(t);
    if (t.forIdea && t.existence === "missing" && !isSellingContentType(t.contentType)) {
      dc = "new_public_content";
    }
    if (t.existence === "missing" && t.draftExists) {
      dc = "new_public_content";
    }
    set.add(dc);
  }
  return [...set];
}

/**
 * Mixed-risk refuse: selling or new-public must not share a proposal with a different class.
 * existing_metadata + existing_content on the same non-selling types is allowed.
 */
export function isMixedRiskBundle(classes: DamageClass[]): boolean {
  const buckets = new Set(
    classes.map((c) =>
      c === "existing_metadata" || c === "existing_content" ? "existing" : c,
    ),
  );
  buckets.delete("none");
  return buckets.size > 1;
}

export function snapshotFromReviewContext(ctx: ReviewContext): Record<string, unknown> {
  return {
    damage_class: ctx.damage_class,
    undo_cost: ctx.undo_cost,
    badge_label: ctx.staff_summary.badge_label,
    situation_description: ctx.staff_summary.situation_description,
    active_checklists: ctx.active_checklists,
    block_apply: ctx.block_apply,
  };
}

export function parseReviewSnapshot(raw: string | null | undefined): {
  damage_class?: string;
  badge_label?: string;
} | null {
  if (!raw || raw === "null") return null;
  try {
    const o = JSON.parse(raw) as { damage_class?: string; badge_label?: string };
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

/** @internal test helper */
export function _lookupKeyForTests(...args: Parameters<typeof lookupKey>) {
  return lookupKey(...args);
}
