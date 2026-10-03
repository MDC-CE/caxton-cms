/**
 * @migration 002_consolidate_section_ids
 * @description Consolidates the dual section identifiers (`id` + `section_id`) into a
 * single canonical `section_id` for shared-template content types (blog).
 * @scope all
 * @dry-run
 *
 * What it does, per locale template (single.{locale}.yml):
 *   1. Builds a rename map { legacyInternalId -> section_id } from template sections
 *      that carry both fields, then drops `id` from the template.
 *   2. Rewrites every per-entry overlay ({slug}/{locale}.yml and {slug}/_common.yml):
 *      resolves each overlay section's canonical identity through the rename map,
 *      writes it as `section_id`, deletes `id`, and remaps `_insertAfterSectionId`.
 *   3. Thins locale overlays: overlay sections that match a template section have
 *      every field that is identical to the template deleted (template `{{ single.* }}`
 *      placeholders are compared against the entry's own top-level fields, so resolved
 *      copies are removed rather than pinned). Sections left with no real difference
 *      are dropped entirely; empty `sections:` arrays are removed.
 *      IMPORTANT: the pre-consolidation merge matched layer sections by `id` ONLY —
 *      overlay sections without a legacy `id` were inert (never rendered). Those are
 *      dropped outright: keeping their stale differences would change live pages once
 *      section_id-based matching activates them.
 *   4. Remaps `_section_anchors.json` alias/dependant keys through the rename map.
 *
 * Idempotent — a second run finds no `id` fields and makes no changes.
 * Usage: npx tsx scripts/migrations/002_consolidate_section_ids.ts [--dry-run] [contentDir...]
 *        contentDir defaults to site_4geeks-com/blog
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  escapeTemplateVars,
  unescapeObjectVars,
  escapeObjectVars,
  unescapeYamlDump,
} from "../../shared/templateVars";

type Obj = Record<string, unknown>;

const DRY_RUN = process.argv.includes("--dry-run");
const dirArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const CONTENT_DIRS = (dirArgs.length > 0 ? dirArgs : ["site_4geeks-com/blog"]).map((d) =>
  path.resolve(process.cwd(), d),
);

/** Template-variable-safe YAML load (placeholders survive as literal strings). */
function safeLoad(raw: string): Obj | null {
  const { escaped, map } = escapeTemplateVars(raw);
  const parsed = yaml.load(escaped) as Obj | null;
  if (!parsed) return null;
  return unescapeObjectVars(parsed, map) as Obj;
}

/** Template-variable-safe YAML dump (same options as server content writes). */
function safeDump(obj: Obj): string {
  const { escaped, map } = escapeObjectVars(obj);
  const dumped = yaml.dump(escaped, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false });
  return unescapeYamlDump(dumped, map);
}

function sectionsOf(doc: Obj | null): Obj[] {
  if (!doc || !Array.isArray(doc.sections)) return [];
  return (doc.sections as unknown[]).filter((s): s is Obj => s != null && typeof s === "object");
}

/** Full-string `{{ single.X | default }}` placeholder matcher. */
const SINGLE_PLACEHOLDER_RE = /^\{\{\s*single\.([\w.]+)\s*(?:\|\s*([\s\S]*?))?\s*\}\}$/;

/**
 * Deep equality between an overlay value and a template value, where full-string
 * `{{ single.X | default }}` placeholders in the template match the entry's own
 * top-level field value (or the placeholder default when the field is absent).
 */
function equalsTemplate(overlayVal: unknown, templateVal: unknown, entryFields: Obj): boolean {
  if (typeof templateVal === "string") {
    if (overlayVal === templateVal) return true;
    const m = templateVal.match(SINGLE_PLACEHOLDER_RE);
    if (m) {
      const fieldValue = entryFields[m[1]];
      if (typeof fieldValue === "string" && overlayVal === fieldValue) return true;
      if (fieldValue === undefined && m[2] !== undefined && overlayVal === m[2].trim()) return true;
    }
    return false;
  }
  if (Array.isArray(templateVal)) {
    if (!Array.isArray(overlayVal) || overlayVal.length !== templateVal.length) return false;
    return templateVal.every((tv, i) => equalsTemplate(overlayVal[i], tv, entryFields));
  }
  if (templateVal && typeof templateVal === "object") {
    if (!overlayVal || typeof overlayVal !== "object" || Array.isArray(overlayVal)) return false;
    const tKeys = Object.keys(templateVal as Obj);
    const oKeys = Object.keys(overlayVal as Obj);
    if (tKeys.length !== oKeys.length) return false;
    return tKeys.every(
      (k) => k in (overlayVal as Obj) && equalsTemplate((overlayVal as Obj)[k], (templateVal as Obj)[k], entryFields),
    );
  }
  return overlayVal === templateVal;
}

const IDENTITY_KEYS = new Set(["id", "section_id"]);
const CONTROL_KEYS = new Set(["_remove", "_insertAfterSectionId", "type"]);

/**
 * Remove overlay-section fields identical to the template section.
 * Returns the number of content fields remaining after thinning.
 */
function thinSection(overlaySection: Obj, templateSection: Obj, entryFields: Obj): number {
  let remaining = 0;
  for (const key of Object.keys(overlaySection)) {
    if (IDENTITY_KEYS.has(key) || CONTROL_KEYS.has(key)) continue;
    if (!(key in templateSection)) {
      remaining++;
      continue;
    }
    const tVal = templateSection[key];
    const oVal = overlaySection[key];
    if (equalsTemplate(oVal, tVal, entryFields)) {
      delete overlaySection[key];
      continue;
    }
    // Partial object thinning: deepMerge patches objects per-key, so keys that are
    // identical to the template can be dropped from a nested object patch.
    if (
      oVal && typeof oVal === "object" && !Array.isArray(oVal) &&
      tVal && typeof tVal === "object" && !Array.isArray(tVal)
    ) {
      for (const nk of Object.keys(oVal as Obj)) {
        if (nk in (tVal as Obj) && equalsTemplate((oVal as Obj)[nk], (tVal as Obj)[nk], entryFields)) {
          delete (oVal as Obj)[nk];
        }
      }
      if (Object.keys(oVal as Obj).length === 0) {
        delete overlaySection[key];
        continue;
      }
    }
    remaining++;
  }
  return remaining;
}

function canonicalIdOf(section: Obj, renameMap: Map<string, string>): string | undefined {
  const legacy = typeof section.id === "string" && section.id ? section.id : undefined;
  if (legacy && renameMap.has(legacy)) return renameMap.get(legacy)!;
  if (typeof section.section_id === "string" && section.section_id) return section.section_id;
  return legacy;
}

interface Stats {
  templatesChanged: number;
  overlaysChanged: number;
  idsDropped: number;
  fieldsThinned: number;
  sectionsDropped: number;
  anchorsRemapped: number;
}
const stats: Stats = { templatesChanged: 0, overlaysChanged: 0, idsDropped: 0, fieldsThinned: 0, sectionsDropped: 0, anchorsRemapped: 0 };

function writeFile(filePath: string, doc: Obj, summary: string) {
  console.log(`  ${DRY_RUN ? "[dry-run] " : ""}${path.relative(process.cwd(), filePath)} — ${summary}`);
  if (!DRY_RUN) fs.writeFileSync(filePath, safeDump(doc), "utf-8");
}

for (const contentDir of CONTENT_DIRS) {
  if (!fs.existsSync(contentDir)) {
    console.error(`Content dir not found: ${contentDir}`);
    continue;
  }
  console.log(`\nMigrating ${path.relative(process.cwd(), contentDir)}`);

  const templateFiles = fs
    .readdirSync(contentDir)
    .filter((f) => /^single\.[a-z0-9-]+\.ya?ml$/i.test(f));

  // ---- Step 1: templates → rename maps, drop legacy `id`
  // renameMap: legacy internal id -> canonical section_id (union across locales)
  const renameMap = new Map<string, string>();
  // Per-locale template docs, kept for thinning comparisons
  const templatesByLocale = new Map<string, Obj>();

  for (const file of templateFiles) {
    const localeMatch = file.match(/^single\.([a-z0-9-]+)\.ya?ml$/i);
    const locale = localeMatch ? localeMatch[1] : "en";
    const filePath = path.join(contentDir, file);
    const doc = safeLoad(fs.readFileSync(filePath, "utf-8"));
    if (!doc) continue;

    let changed = false;
    for (const s of sectionsOf(doc)) {
      const legacy = typeof s.id === "string" && s.id ? s.id : undefined;
      if (!legacy) continue;
      const sectionId = typeof s.section_id === "string" && s.section_id ? s.section_id : undefined;
      if (sectionId) {
        renameMap.set(legacy, sectionId);
      } else {
        // Legacy-only section: promote the id value to section_id (value unchanged)
        s.section_id = legacy;
      }
      delete s.id;
      stats.idsDropped++;
      changed = true;
    }
    templatesByLocale.set(locale, doc);
    if (changed) {
      stats.templatesChanged++;
      writeFile(filePath, doc, "dropped legacy id fields from template");
    }
  }

  // ---- Steps 2 & 3: per-entry overlays
  const entryDirs = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const slug of entryDirs) {
    const entryDir = path.join(contentDir, slug);
    const overlayFiles = fs
      .readdirSync(entryDir)
      .filter((f) => /^(_common|[a-z]{2}(-[a-z0-9]+)?)\.ya?ml$/i.test(f));

    for (const file of overlayFiles) {
      const filePath = path.join(entryDir, file);
      const doc = safeLoad(fs.readFileSync(filePath, "utf-8"));
      if (!doc) continue;

      const overlaySections = sectionsOf(doc);
      if (overlaySections.length === 0) continue;

      // Pre-migration files carry legacy `id` fields; files without any are either
      // already migrated or hand-authored post-consolidation. Only those in
      // pre-migration state go through inert-drop + thinning (keeps re-runs safe).
      const isPreMigration = overlaySections.some((s) => typeof s.id === "string" && s.id);

      const isCommon = /^_common\./i.test(file);
      const locale = isCommon ? null : file.replace(/\.ya?ml$/i, "");
      const template = locale
        ? templatesByLocale.get(locale) ?? templatesByLocale.get("en") ?? null
        : null;

      // Template sections indexed by canonical id (for thinning)
      const templateById = new Map<string, Obj>();
      for (const ts of sectionsOf(template)) {
        const cid = typeof ts.section_id === "string" ? ts.section_id : undefined;
        if (cid) templateById.set(cid, ts);
      }

      // `{{ single.* }}` resolution context: the entry's own top-level fields
      // (locale file wins over _common.yml, mirroring merge order).
      let entryFields: Obj = {};
      const commonPath = path.join(entryDir, "_common.yml");
      if (fs.existsSync(commonPath)) {
        const commonDoc = safeLoad(fs.readFileSync(commonPath, "utf-8"));
        if (commonDoc) entryFields = { ...commonDoc };
      }
      entryFields = { ...entryFields, ...doc };

      let changed = false;
      let fileThinned = 0;
      let fileDropped = 0;
      const keptSections: Obj[] = [];

      for (const s of overlaySections) {
        // Step 2: identity normalization.
        // "Active" = the old merge actually applied this overlay section (it matched
        // layer sections by legacy `id` only). Id-less sections were inert stale copies.
        const wasActive = typeof s.id === "string" && !!s.id;
        const canonical = canonicalIdOf(s, renameMap);
        if (typeof s.id === "string") {
          delete s.id;
          stats.idsDropped++;
          changed = true;
        }
        if (canonical && s.section_id !== canonical) {
          s.section_id = canonical;
          changed = true;
        }
        const anchor = s._insertAfterSectionId;
        if (typeof anchor === "string" && renameMap.has(anchor)) {
          s._insertAfterSectionId = renameMap.get(anchor);
          stats.anchorsRemapped++;
          changed = true;
        }

        // Step 3: drop inert sections, thin active ones (locale overlays only;
        // _remove markers are kept as-is)
        if (!isCommon && isPreMigration && !s._remove) {
          if (!wasActive) {
            // Never rendered before — keeping it would activate stale content
            fileDropped++;
            stats.sectionsDropped++;
            changed = true;
            continue;
          }
          const templateSection = canonical ? templateById.get(canonical) : undefined;
          if (templateSection) {
            const before = Object.keys(s).length;
            const remaining = thinSection(s, templateSection, entryFields);
            const after = Object.keys(s).length;
            if (after < before) {
              fileThinned += before - after;
              stats.fieldsThinned += before - after;
              changed = true;
            }
            if (remaining === 0) {
              // Nothing but identity/type left — the template fully covers this section
              fileDropped++;
              stats.sectionsDropped++;
              changed = true;
              continue;
            }
          }
          // Active per-entry-only sections (no template match) are kept as-is
        }
        keptSections.push(s);
      }

      if (!changed) continue;

      if (keptSections.length === 0) {
        delete doc.sections;
      } else {
        doc.sections = keptSections;
      }
      stats.overlaysChanged++;
      writeFile(filePath, doc, `thinned ${fileThinned} fields, dropped ${fileDropped} sections, kept ${keptSections.length}`);
    }
  }

  // ---- Step 4: sidecar `_section_anchors.json`
  const sidecarPath = path.join(contentDir, "_section_anchors.json");
  if (fs.existsSync(sidecarPath) && renameMap.size > 0) {
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf-8")) as {
      aliases?: Record<string, string | null>;
      dependants?: Record<string, string[]>;
    };
    let changed = false;
    const remapKey = (k: string) => (renameMap.has(k) ? renameMap.get(k)! : k);

    if (sidecar.aliases) {
      const next: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(sidecar.aliases)) {
        const nk = remapKey(k);
        const nv = typeof v === "string" ? remapKey(v) : v;
        if (nk !== k || nv !== v) changed = true;
        next[nk] = nv;
      }
      sidecar.aliases = next;
    }
    if (sidecar.dependants) {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(sidecar.dependants)) {
        const nk = remapKey(k);
        if (nk !== k) changed = true;
        next[nk] = v;
      }
      sidecar.dependants = next;
    }
    if (changed) {
      stats.anchorsRemapped++;
      console.log(`  ${DRY_RUN ? "[dry-run] " : ""}${path.relative(process.cwd(), sidecarPath)} — remapped sidecar keys`);
      if (!DRY_RUN) fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf-8");
    }
  }
}

console.log(`\nMigration ${DRY_RUN ? "(dry run) " : ""}complete:`);
console.log(`  Templates changed:  ${stats.templatesChanged}`);
console.log(`  Overlays changed:   ${stats.overlaysChanged}`);
console.log(`  Legacy ids dropped: ${stats.idsDropped}`);
console.log(`  Fields thinned:     ${stats.fieldsThinned}`);
console.log(`  Sections dropped:   ${stats.sectionsDropped}`);
console.log(`  Anchor keys fixed:  ${stats.anchorsRemapped}`);
