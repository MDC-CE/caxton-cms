/**
 * Shared shapes for the internal-link gate (server gate, MCP guidance, editor UI).
 */

export const BROKEN_INTERNAL_LINKS_CODE = "broken_internal_links" as const;

export const INTERNAL_LINK_WARNING_CODES = {
  redirects: "internal_link_redirects",
  draftTarget: "internal_link_draft_target",
  notEnforced: "broken_internal_links_not_enforced",
  draftPageBroken: "broken_internal_links_on_draft",
} as const;

/** Data migration that cleans existing broken links; the gate blocks only after it completed. */
export const INTERNAL_LINK_MIGRATION_FILENAME = "005_fix_broken_internal_links.ts";

export type BrokenInternalLink = {
  link: string;
  field_path: string;
  component?: string;
  /** Live URL that most likely was meant, when one is close enough. */
  closest_live_match?: string | null;
  /** True when the target exists only as a draft. */
  draft_target?: boolean;
};

export type RedirectedInternalLink = {
  link: string;
  field_path: string;
  component?: string;
  final_url: string;
};

export type InternalLinkWarning = {
  code: (typeof INTERNAL_LINK_WARNING_CODES)[keyof typeof INTERNAL_LINK_WARNING_CODES];
  message: string;
  links: Array<BrokenInternalLink | RedirectedInternalLink>;
};

function describeLink(l: BrokenInternalLink): string {
  const hint = l.closest_live_match ? ` → did you mean ${l.closest_live_match}?` : "";
  const draft = l.draft_target ? " (target is still a draft)" : "";
  return `${l.link} at ${l.field_path}${draft}${hint}`;
}

export function formatBrokenInternalLinksMessage(links: BrokenInternalLink[]): string {
  const shown = links.slice(0, 10).map(describeLink).join("; ");
  const more = links.length > 10 ? `; and ${links.length - 10} more` : "";
  return (
    `BROKEN_INTERNAL_LINKS: This page links to ${links.length} page(s) that do not exist: ${shown}${more}. ` +
    "Fix or remove these links, then save again."
  );
}
