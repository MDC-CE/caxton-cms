/**
 * Per-section view of a `sections` change. `author_diff` reports `sections` as one atomic field,
 * so reviewers (and the classifier) use this to see which sections were added, removed, moved,
 * or edited.
 */

export type SectionSummaryStatus = "added" | "removed" | "changed" | "moved";

export type SectionSummaryRow = {
  /** Index in the draft (after); index in live (before) for removed rows. */
  index: number;
  type: string;
  status: SectionSummaryStatus;
  changed_keys?: string[];
  /** Moved rows: where the section sat before. */
  from_index?: number;
};

export type SectionsSummary = {
  before_count: number;
  after_count: number;
  rows: SectionSummaryRow[];
  truncated?: true;
};

export const MAX_SECTION_SUMMARY_ROWS = 30;
export const MAX_SECTION_CHANGED_KEYS = 8;

type Section = Record<string, unknown>;

function asSections(v: unknown): Section[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => (s && typeof s === "object" && !Array.isArray(s) ? (s as Section) : {}));
}

function sectionType(s: Section | undefined): string {
  return typeof s?.type === "string" && s.type ? s.type : "unknown";
}

function sectionId(s: Section): string | null {
  const id = s.section_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function changedKeys(before: Section, after: Section): string[] {
  const out: string[] = [];
  for (const k of Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out.push(k);
  }
  return out.sort();
}

/** Before-indices that kept their relative order (longest increasing subsequence); the rest moved. */
function keptOrder(seq: number[]): Set<number> {
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);
  seq.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1]! : -1;
  });
  const out = new Set<number>();
  let k = tails.length ? tailIdx[tails.length - 1]! : -1;
  while (k >= 0) {
    out.add(seq[k]!);
    k = prev[k]!;
  }
  return out;
}

/**
 * Match sections by `section_id`, falling back to index + type (for sections without an id).
 * Unchanged sections are omitted.
 */
export function summarizeSectionsChange(beforeRaw: unknown, afterRaw: unknown): SectionsSummary {
  const before = asSections(beforeRaw);
  const after = asSections(afterRaw);
  const rows: SectionSummaryRow[] = [];

  const beforeById = new Map<string, number>();
  before.forEach((s, i) => {
    const id = sectionId(s);
    if (id && !beforeById.has(id)) beforeById.set(id, i);
  });
  const matchedBefore = new Set<number>();
  const pairs: Array<{ after: number; before: number | null }> = [];

  after.forEach((s, i) => {
    const id = sectionId(s);
    if (id) {
      const b = beforeById.get(id);
      if (b !== undefined && !matchedBefore.has(b)) {
        matchedBefore.add(b);
        pairs.push({ after: i, before: b });
        return;
      }
      pairs.push({ after: i, before: null });
      return;
    }
    pairs.push({ after: i, before: null });
  });
  // Fallback for sections without a section_id on either side: same index and type first, then
  // the first unmatched section of the same type (a reorder). A different type is added + removed.
  const unmatchedWithoutId = (p: { after: number; before: number | null }) =>
    p.before === null && !sectionId(after[p.after]!);
  const free = (b: number) => !matchedBefore.has(b) && !sectionId(before[b]!);
  for (const p of pairs) {
    if (!unmatchedWithoutId(p)) continue;
    const b = p.after;
    if (b < before.length && free(b) && sectionType(before[b]) === sectionType(after[p.after])) {
      matchedBefore.add(b);
      p.before = b;
    }
  }
  for (const p of pairs) {
    if (!unmatchedWithoutId(p)) continue;
    const type = sectionType(after[p.after]);
    const b = before.findIndex((s, i) => free(i) && sectionType(s) === type);
    if (b >= 0) {
      matchedBefore.add(b);
      p.before = b;
    }
  }

  const inOrder = keptOrder(pairs.filter((p) => p.before !== null).map((p) => p.before!));

  for (const p of pairs) {
    const a = after[p.after]!;
    if (p.before === null) {
      rows.push({ index: p.after, type: sectionType(a), status: "added" });
      continue;
    }
    const b = before[p.before]!;
    const keys = changedKeys(b, a);
    if (!inOrder.has(p.before)) {
      rows.push({
        index: p.after,
        type: sectionType(a),
        status: "moved",
        from_index: p.before,
        ...(keys.length ? { changed_keys: keys.slice(0, MAX_SECTION_CHANGED_KEYS) } : {}),
      });
    } else if (keys.length) {
      rows.push({
        index: p.after,
        type: sectionType(a),
        status: "changed",
        changed_keys: keys.slice(0, MAX_SECTION_CHANGED_KEYS),
      });
    }
  }
  before.forEach((s, i) => {
    if (!matchedBefore.has(i)) rows.push({ index: i, type: sectionType(s), status: "removed" });
  });

  const truncated = rows.length > MAX_SECTION_SUMMARY_ROWS;
  return {
    before_count: before.length,
    after_count: after.length,
    rows: truncated ? rows.slice(0, MAX_SECTION_SUMMARY_ROWS) : rows,
    ...(truncated ? { truncated: true as const } : {}),
  };
}

/**
 * Layout (structure) changed: a section added, removed, or moved, or the list was empty /
 * missing before (a created page, language, or template language). Text edits inside one
 * section are not structural.
 */
export function isStructuralSectionsChange(summary: SectionsSummary | null | undefined): boolean {
  if (!summary) return false;
  if (summary.before_count === 0 && summary.after_count > 0) return true;
  return summary.rows.some((r) => r.status === "added" || r.status === "removed" || r.status === "moved");
}
