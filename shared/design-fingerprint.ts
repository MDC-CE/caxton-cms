/**
 * Structural fingerprint of a page layout: section order, type, variant and
 * background. Copy edits do not change it; adding/removing/reordering
 * sections, switching a variant or a background does. Used by render reviews
 * (is the review still fresh?) and layout approvals (is the approval stale?).
 */
import { createHash } from "crypto";

export interface StructuralSlot {
  type: string;
  variant: string;
  background: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function structuralSlots(sections: unknown): StructuralSlot[] {
  if (!Array.isArray(sections)) return [];
  const out: StructuralSlot[] = [];
  for (const s of sections) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    const type = str(rec.type);
    if (!type) continue;
    out.push({ type, variant: str(rec.variant) || "default", background: str(rec.background) });
  }
  return out;
}

export function structuralFingerprint(sections: unknown): string {
  const slots = structuralSlots(sections).map((s) => `${s.type}|${s.variant}|${s.background}`);
  return createHash("sha256").update(slots.join("\n")).digest("hex").slice(0, 16);
}
