import { structuralFingerprint } from "@shared/design-fingerprint";
import { applyComponentSectionDefaults } from "../component-registry";

/** Fingerprint after component section_defaults (same shape the preview renders). */
export function deliveredFingerprint(sections: unknown): string {
  if (!Array.isArray(sections)) return structuralFingerprint([]);
  const copy = sections.map((s) => (s && typeof s === "object" ? { ...(s as Record<string, unknown>) } : s));
  applyComponentSectionDefaults(copy);
  return structuralFingerprint(copy);
}
