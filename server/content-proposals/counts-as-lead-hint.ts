/**
 * Best-effort Count-as-lead form detection for proposal soft hints.
 * Never throws; never alone attaches outcome-figures checklist.
 */

import { getAllFormEntries } from "../form-state";
import { getLeadConversionEventNames } from "../settings";

export function pageHasCountsAsLeadForm(opts: {
  contentType: string;
  slug: string;
  locale?: string;
  contentRoot?: string;
}): boolean {
  try {
    const leads = new Set(getLeadConversionEventNames(opts.contentRoot));
    if (leads.size === 0) return false;
    const ct = opts.contentType.trim().toLowerCase();
    const slug = opts.slug.trim();
    const locale = opts.locale?.trim();
    return getAllFormEntries().some((f) => {
      if (f.content_type.trim().toLowerCase() !== ct) return false;
      if (f.slug !== slug) return false;
      if (locale && f.locale && f.locale !== locale) return false;
      const name = (f.conversion_name || "").trim();
      return Boolean(name && leads.has(name));
    });
  } catch {
    return false;
  }
}

export function anyEntryHasCountsAsLeadForm(
  entries: Array<{ contentType: string; slug: string; locale: string }>,
  contentRoot?: string,
): boolean {
  for (const e of entries) {
    if (
      pageHasCountsAsLeadForm({
        contentType: e.contentType,
        slug: e.slug,
        locale: e.locale,
        contentRoot,
      })
    ) {
      return true;
    }
  }
  return false;
}
