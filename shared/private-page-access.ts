/**
 * Who may see /private staff UI vs deny.
 *
 * Capture/embed frames must stay reachable without a staff session (screenshot
 * workers and in-app iframes pass ?debug=false). Everything else requires a
 * validated staff session so anonymous visitors cannot open admin URLs.
 */

export function isPrivateEmbedPath(pathname: string): boolean {
  const path = pathname.split("?")[0].split("#")[0];
  if (path === "/private/entry-preview-frame" || path.startsWith("/private/entry-preview-frame/")) {
    return true;
  }
  if (/^\/private\/demo\/[a-f0-9]{32}\/?$/.test(path)) {
    return true;
  }
  return /^\/private\/component-showcase\/[^/]+\/preview\/?$/.test(path);
}

/** True when the document request may load the SPA without a staff cookie yet. */
export function isPrivateHtmlAuthBypass(pathname: string, search: string): boolean {
  if (isPrivateEmbedPath(pathname)) return true;
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(qs);
  const code = params.get("staff_session_code");
  return typeof code === "string" && code.trim().length > 0;
}

export type PrivatePageAccess = "allow" | "deny" | "pending";

export type PrivatePageAccessInput = {
  pathname: string;
  isLoading: boolean;
  isValidated: boolean | null;
  hasToken: boolean;
  hasCachedStaffSession: boolean;
};

export function resolvePrivatePageAccess(input: PrivatePageAccessInput): PrivatePageAccess {
  if (isPrivateEmbedPath(input.pathname)) return "allow";
  if (input.hasToken && input.isValidated) return "allow";
  if (input.isLoading || input.isValidated === null) {
    if (input.hasCachedStaffSession || input.hasToken) return "pending";
    return "deny";
  }
  return "deny";
}
