/**
 * Deterministic visible-text limits declared per component in schema.yml
 * (`text_limits`, keyed by section variant; `"*"` applies to every variant).
 *
 * Pure: no fs. Server callers resolve the rules for a section
 * (server/text-limits.ts) and decide whether violations warn or block.
 */

/** Sum of the visible text of `fields` (joined with a space) must stay within `max_length`. */
export interface TextLimitFieldsRule {
  label: string;
  fields: string[];
  max_length: number;
}

/** Array field: cap the item count and/or each item's visible length (`item_field` inside each item). */
export interface TextLimitListRule {
  label: string;
  list: string;
  item_field?: string;
  max_items?: number;
  item_max_length?: number;
}

export type TextLimitRule = TextLimitFieldsRule | TextLimitListRule;
export type TextLimitsByVariant = Record<string, TextLimitRule[]>;

export interface TextLimitViolation {
  label: string;
  /** Paths relative to the section (e.g. `brand_mark.prefix`, `bullets.2.text`). */
  fields: string[];
  /** Section location in the page, e.g. `sections[0]`. */
  section_path: string;
  kind: "length" | "items";
  actual: number;
  max: number;
  /** Measured visible text (length violations only). */
  text?: string;
  message: string;
}

export const TEXT_LIMITS_EXCEEDED_CODE = "text_limits_exceeded";

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Text a visitor sees: HTML comments/tags removed, entities decoded, whitespace collapsed. */
export function visibleText(value: unknown): string {
  if (typeof value !== "string") {
    return typeof value === "number" ? String(value) : "";
  }
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
      const lower = ent.toLowerCase();
      if (lower.startsWith("#x")) return safeFromCodePoint(parseInt(lower.slice(2), 16), m);
      if (lower.startsWith("#")) return safeFromCodePoint(parseInt(lower.slice(1), 10), m);
      return NAMED_ENTITIES[lower] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function safeFromCodePoint(cp: number, fallback: string): string {
  if (!Number.isFinite(cp)) return fallback;
  try {
    return cp === 0xa0 ? " " : String.fromCodePoint(cp);
  } catch {
    return fallback;
  }
}

/** Visible character count (code points, so accents and emoji count as one). */
export function visibleLength(value: unknown): number {
  return Array.from(visibleText(value)).length;
}

function getAtPath(root: unknown, dotted: string): unknown {
  let cur: unknown = root;
  for (const part of dotted.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isFieldsRule(rule: TextLimitRule): rule is TextLimitFieldsRule {
  return Array.isArray((rule as TextLimitFieldsRule).fields);
}

function isValidRule(rule: unknown): rule is TextLimitRule {
  if (!rule || typeof rule !== "object") return false;
  const r = rule as Record<string, unknown>;
  if (typeof r.label !== "string") return false;
  if (Array.isArray(r.fields)) {
    return r.fields.every((f) => typeof f === "string") && typeof r.max_length === "number";
  }
  return (
    typeof r.list === "string" &&
    (typeof r.max_items === "number" || typeof r.item_max_length === "number")
  );
}

/** Rules for one section variant: `"*"` rules first, then the variant's own. Malformed rules are dropped. */
export function rulesForVariant(
  limits: TextLimitsByVariant | null | undefined,
  variant: unknown,
): TextLimitRule[] {
  if (!limits || typeof limits !== "object") return [];
  const all = Array.isArray(limits["*"]) ? limits["*"] : [];
  const own = typeof variant === "string" && Array.isArray(limits[variant]) ? limits[variant] : [];
  return [...all, ...own].filter(isValidRule);
}

function quote(text: string): string {
  return text.length > 160 ? `"${text.slice(0, 157)}..."` : `"${text}"`;
}

function itemText(item: unknown, itemField?: string): string {
  return visibleText(itemField ? getAtPath(item, itemField) : item);
}

/**
 * Violations for one section. With `before` (the saved version of the same
 * section), rules whose inputs did not change are skipped: an unrelated edit
 * never trips on copy that was already there.
 */
export function evaluateSectionTextLimits(opts: {
  section: Record<string, unknown>;
  rules: TextLimitRule[];
  sectionPath: string;
  before?: Record<string, unknown> | null;
}): TextLimitViolation[] {
  const { section, rules, sectionPath, before } = opts;
  const out: TextLimitViolation[] = [];

  for (const rule of rules) {
    if (isFieldsRule(rule)) {
      const text = rule.fields
        .map((f) => visibleText(getAtPath(section, f)))
        .filter(Boolean)
        .join(" ");
      const actual = Array.from(text).length;
      if (actual <= rule.max_length) continue;
      if (
        before &&
        rule.fields.every(
          (f) => visibleText(getAtPath(before, f)) === visibleText(getAtPath(section, f)),
        )
      ) {
        continue;
      }
      out.push({
        label: rule.label,
        fields: rule.fields,
        section_path: sectionPath,
        kind: "length",
        actual,
        max: rule.max_length,
        text,
        message: `${rule.label} has ${actual} visible characters (max ${rule.max_length}) at ${sectionPath} (${rule.fields.join(" + ")}): ${quote(text)}`,
      });
      continue;
    }

    const list = getAtPath(section, rule.list);
    if (!Array.isArray(list)) continue;
    const beforeList = before ? getAtPath(before, rule.list) : undefined;
    const beforeTexts = Array.isArray(beforeList)
      ? beforeList.map((it) => itemText(it, rule.item_field))
      : null;

    if (typeof rule.max_items === "number" && list.length > rule.max_items) {
      const unchanged =
        beforeTexts !== null &&
        beforeTexts.length === list.length &&
        list.every((it, i) => itemText(it, rule.item_field) === beforeTexts[i]);
      if (!unchanged) {
        out.push({
          label: rule.label,
          fields: [rule.list],
          section_path: sectionPath,
          kind: "items",
          actual: list.length,
          max: rule.max_items,
          message: `${rule.label} has ${list.length} items (max ${rule.max_items}) at ${sectionPath}.${rule.list}`,
        });
      }
    }

    if (typeof rule.item_max_length === "number") {
      list.forEach((item, i) => {
        const text = itemText(item, rule.item_field);
        const actual = Array.from(text).length;
        if (actual <= rule.item_max_length!) return;
        if (beforeTexts?.includes(text)) return;
        const field = `${rule.list}.${i}${rule.item_field ? `.${rule.item_field}` : ""}`;
        out.push({
          label: `${rule.label} item ${i + 1}`,
          fields: [field],
          section_path: sectionPath,
          kind: "length",
          actual,
          max: rule.item_max_length!,
          text,
          message: `${rule.label} item ${i + 1} has ${actual} visible characters (max ${rule.item_max_length}) at ${sectionPath}.${field}: ${quote(text)}`,
        });
      });
    }
  }
  return out;
}

function sectionKey(section: Record<string, unknown>): string | null {
  const id = section.section_id ?? section.id;
  return typeof id === "string" && id.trim() ? id : null;
}

/** Saved counterpart of a section: same `section_id`/`id`, else same index with the same type. */
function findBeforeSection(
  section: Record<string, unknown>,
  index: number,
  beforeSections: unknown[],
): Record<string, unknown> | null {
  const key = sectionKey(section);
  if (key) {
    const match = beforeSections.find(
      (s) => s && typeof s === "object" && sectionKey(s as Record<string, unknown>) === key,
    );
    if (match) return match as Record<string, unknown>;
  }
  const atIndex = beforeSections[index];
  if (atIndex && typeof atIndex === "object" && (atIndex as Record<string, unknown>).type === section.type) {
    return atIndex as Record<string, unknown>;
  }
  return null;
}

/**
 * Violations across a page's `sections`. `resolveRules` maps a section to its
 * rules (usually via the component's schema.yml). With `before` (the saved
 * page), only changed limited text is reported; sections new to the page are
 * always checked.
 */
export function evaluatePageTextLimits(
  pageData: Record<string, unknown> | null | undefined,
  opts: {
    resolveRules: (section: Record<string, unknown>) => TextLimitRule[];
    before?: Record<string, unknown> | null;
  },
): TextLimitViolation[] {
  const sections = pageData?.sections;
  if (!Array.isArray(sections)) return [];
  const beforeSections = Array.isArray(opts.before?.sections)
    ? (opts.before!.sections as unknown[])
    : null;

  const out: TextLimitViolation[] = [];
  sections.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const section = raw as Record<string, unknown>;
    const rules = opts.resolveRules(section);
    if (rules.length === 0) return;
    const before = beforeSections ? findBeforeSection(section, index, beforeSections) : null;
    out.push(
      ...evaluateSectionTextLimits({
        section,
        rules,
        sectionPath: `sections[${index}]`,
        before,
      }),
    );
  });
  return out;
}

/** One-line summary for error messages (first few violations). */
export function summarizeTextLimitViolations(violations: TextLimitViolation[], max = 3): string {
  const head = violations.slice(0, max).map((v) => v.message);
  const rest = violations.length - head.length;
  return rest > 0 ? `${head.join("; ")}; and ${rest} more` : head.join("; ");
}
