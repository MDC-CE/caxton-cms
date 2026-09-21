/**
 * Decide whether a missing live page may be created by an edits proposal.
 * File-based attached posts (blog-style) can. Database rows cannot.
 */

import { isEmptyRequiredValue } from "@shared/validateRequiredFields";

type FieldOp = { field_path: string; value?: unknown; reset?: boolean };

export type MissingTargetShape =
  | { shape: "database" }
  | { shape: "attached_file"; requiredFields: string[] }
  | { shape: "other" };

export function isSectionFieldPath(fieldPath: string): boolean {
  return fieldPath === "sections" || fieldPath.startsWith("sections.") || fieldPath.startsWith("sections[");
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
