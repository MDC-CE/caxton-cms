/** Staff-facing reject kinds (matches server ProposalRejectKind). */
export const PROPOSAL_REJECT_KIND_OPTIONS = [
  { value: "bad_idea", label: "Bad idea — strategy or intent is wrong" },
  { value: "not_implementable", label: "Not implementable" },
  { value: "illegal_or_policy", label: "Illegal or policy violation" },
  { value: "harmful", label: "Harmful if shipped" },
  { value: "duplicate_weaker", label: "Weaker duplicate of another proposal" },
  { value: "target_missing", label: "Page no longer exists" },
] as const;

export type ProposalRejectKindValue = (typeof PROPOSAL_REJECT_KIND_OPTIONS)[number]["value"];

export const REJECT_NOTE_MIN = 80;

export function rejectKindLabel(kind: string | null | undefined): string {
  const opt = PROPOSAL_REJECT_KIND_OPTIONS.find((o) => o.value === kind);
  return opt?.label ?? kind ?? "Rejected";
}
