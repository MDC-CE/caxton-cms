/**
 * True when SSR produced real body markup (not Suspense-null / whitespace-only).
 * Empty appHtml must not be injected into #root or HTML-cached as a successful page.
 */
export function isMeaningfulSsrAppHtml(appHtml: string | null | undefined): boolean {
  if (typeof appHtml !== "string") return false;
  const trimmed = appHtml.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!trimmed) return false;
  // Require at least one HTML tag (section wrappers, headings, etc.)
  return /<[a-zA-Z]/.test(trimmed);
}
