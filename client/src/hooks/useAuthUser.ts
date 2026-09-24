import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getTokenFromCookie,
  setTokenCookie,
  clearTokenCookie,
  migrateLegacyTokenFromLocalStorage,
} from "@/lib/sessionCookie";

/**
 * Consumer (visitor) authentication — completely separate from the debug/editor
 * auth in useDebugAuth. Token lives in cookie `4g_tok` (parent Domain) so sibling
 * subdomains can detect login. Never touches `debug_mode`.
 */

export interface AuthUserProfile {
  valid: boolean;
  id?: number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

function stripTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    // ignore
  }
}

export function getConsumerToken(): string | null {
  if (typeof window === "undefined") return null;

  const fromCookie = getTokenFromCookie() ?? migrateLegacyTokenFromLocalStorage();
  if (fromCookie) return fromCookie;

  // Login redirects append ?token=; persist under `4g_tok`.
  const urlToken = new URLSearchParams(window.location.search).get("token");
  if (urlToken) {
    setTokenCookie(urlToken);
    stripTokenFromUrl();
    return urlToken;
  }

  return null;
}

export function setConsumerToken(token: string): void {
  if (typeof window === "undefined") return;
  setTokenCookie(token);
}

export function clearConsumerToken(): void {
  if (typeof window === "undefined") return;
  clearTokenCookie();
}

interface UseAuthUserOptions {
  /** Fetch the profile only when needed (e.g. a form with is_signup on the page). */
  enabled?: boolean;
}

export function useAuthUser({ enabled = true }: UseAuthUserOptions = {}) {
  // SSR-safe: never read document.cookie during the initial render (window may be shimmed).
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(getConsumerToken());
  }, []);

  const setToken = useCallback((next: string) => {
    setConsumerToken(next);
    setTokenState(next);
  }, []);

  const clearToken = useCallback(() => {
    clearConsumerToken();
    setTokenState(null);
  }, []);

  const { data: profile, isLoading, isFetching } = useQuery<AuthUserProfile>({
    queryKey: ["/api/auth/profile", token],
    queryFn: async () => {
      const res = await fetch("/api/auth/profile", {
        headers: { Authorization: `Token ${token}` },
      });
      if (!res.ok) return { valid: false };
      return (await res.json()) as AuthUserProfile;
    },
    enabled: enabled && !!token,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isLoggedIn = !!token && profile?.valid === true;

  return {
    token,
    profile: isLoggedIn ? profile! : null,
    isLoggedIn,
    isLoading: enabled && !!token && (isLoading || isFetching),
    setToken,
    clearToken,
  };
}
