/**
 * Decide whether a missing live page may be created by an edits proposal.
 * File-based attached posts (blog-style) and section-built file pages (downloadable,
 * landing, …) can, when they implement an accepted idea. Database rows cannot.
 */

import { isEmptyRequiredValue } from "@shared/validateRequiredFields";

type FieldOp = { field_path: string; value?: unknown; reset?: boolean; op?: string };

export type MissingTargetShape =
  | { shape: "database" }
  | { shape: "attached_file"; requiredFields: string[] }
  | { shape: "page_file"; requiredFields: string[] }
  | { shape: "other" };

export type SectionIssue = { property_path: string; message: string };

export function isSectionFieldPath(fieldPath: string): boolean {
  return fieldPath === "sections" || fieldPath.startsWith("sections.") || fieldPath.startsWith("sections[");
}

/** True when an update sets the whole `sections` array to a non-empty list. */
export function hasFullSectionsOp(updates: FieldOp[]): boolean {
  return updates.some(
    (u) =>
      u.field_path === "sections" &&
      !u.reset &&
      u.op !== "remove" &&
      Array.isArray(u.value) &&
      u.value.length > 0,
  );
}

/** Required editor fields that the ops do not fill with a non-empty value. */
export function missingRequiredFromOps(required: string[], updates: FieldOp[]): string[] {
  const filled = new Set<string>();
  for (const u of updates) {
    if (u.reset) continue;
    if (isEmptyRequiredValue(u.value)) continue;
    filled.add(u.field_path);
    const head = u.field_path.split(".")[0];
    if (head) filled.add(head);
  }
  return required.filter((key) => !filled.has(key));
}
