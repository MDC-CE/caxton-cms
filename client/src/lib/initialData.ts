import { queryClient } from "./queryClient";

export const IS_SERVER = typeof document === 'undefined';

interface SingleQuery {
  queryKey: unknown[];
  data: unknown;
}

export type InitialDataPayload =
  | { queries: SingleQuery[]; queryKey?: never; data?: never }
  | { queryKey: unknown[]; data: unknown; queries?: never };

export let isSSRHydration = false;

/** Sticky for this document load: once we saw SSR hydrate, never flash Loader2. */
let suppressLoaderForSsrSession = false;

/** Suppress full-page Loader2 while SSR HTML must stay on screen. */
export function shouldSuppressFullPageLoader(): boolean {
  if (typeof document === "undefined") return false;
  if (suppressLoaderForSsrSession) return true;
  return document.documentElement.hasAttribute("data-ssr-hydrating");
}

/**
 * True only while `data-ssr-hydrating` is set (cleared after hydrate settles).
 * Use to avoid painting a fake 404 over SSR HTML — unlike shouldSuppressFullPageLoader,
 * this is NOT sticky for the whole document lifetime (SPA 404s must still work).
 */
export function isSsrHydrateWindow(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute("data-ssr-hydrating");
}

export function readInitialDataPayload(): InitialDataPayload | null {
  const script = document.getElementById("__INITIAL_DATA__");
  if (!script) return null;

  try {
    return JSON.parse(script.textContent || "") as InitialDataPayload;
  } catch {
    return null;
  }
}

export function hydrateInitialData() {
  const script = document.getElementById("__INITIAL_DATA__");
  const payload = readInitialDataPayload();
  if (!payload || !script) return;

  try {

    if (payload.queries && Array.isArray(payload.queries)) {
      for (const { queryKey, data } of payload.queries) {
        if (queryKey && data !== undefined) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    } else if (payload.queryKey && payload.data !== undefined) {
      queryClient.setQueryData(payload.queryKey, payload.data);
    }
  } catch {
  }

  isSSRHydration = true;
  suppressLoaderForSsrSession = true;
  document.documentElement.setAttribute("data-ssr-hydrating", "");
  script.remove();
}

export function clearSSRHydration() {
  isSSRHydration = false;
  document.documentElement.removeAttribute("data-ssr-hydrating");
}
