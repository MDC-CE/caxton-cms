import { useEffect, useMemo, useRef, useState } from "react";
import { IS_SERVER } from "@/lib/initialData";
import {
  areEagerSectionsCached,
  preloadEagerSectionsFromPage,
} from "@/components/sectionRegistry";

type PageSettingsLike = { loading?: { eager_count?: number } } | null | undefined;

function isSsrHydratingDom(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute("data-ssr-hydrating")
  );
}

/**
 * True when above-fold section modules are in the registry cache.
 * On the server, sections are preloaded before render — always ready.
 * On the client, waits for preload without painting Header+empty-main+Footer.
 *
 * Critical: after SSR hydrate we must NEVER flip to false (that replaces SSR HTML
 * with the full-page Loader2 — the blue-ring blink). Preload in the background
 * instead. Cold CSR / SPA navigations still gate on the loader.
 */
export function useEagerSectionsReady(
  sections: unknown[] | null | undefined,
  settings?: PageSettingsLike,
): boolean {
  const cacheKey = useMemo(() => {
    if (!Array.isArray(sections)) return "none";
    const eagerCount = settings?.loading?.eager_count ?? 3;
    return sections
      .slice(0, Math.max(eagerCount, sections.length))
      .map((s) => {
        if (!s || typeof s !== "object" || !("type" in s)) return "";
        const sec = s as { type: string; variant?: string; load?: string };
        return `${sec.type}::${sec.variant ?? "default"}::${sec.load ?? ""}`;
      })
      .join("|");
  }, [sections, settings?.loading?.eager_count]);

  /** Sticky for this mount: if we began under SSR hydration, never blank the page. */
  const ssrSessionRef = useRef(IS_SERVER ? false : isSsrHydratingDom());

  const [ready, setReady] = useState(() => {
    if (IS_SERVER) return true;
    if (ssrSessionRef.current || isSsrHydratingDom()) return true;
    return areEagerSectionsCached(sections, settings);
  });

  useEffect(() => {
    if (IS_SERVER) return;

    if (areEagerSectionsCached(sections, settings)) {
      setReady(true);
      return;
    }

    // SSR hydrate session (or still hydrating): keep content visible, warm cache quietly.
    if (ssrSessionRef.current || isSsrHydratingDom()) {
      ssrSessionRef.current = true;
      setReady(true);
      let cancelled = false;
      void preloadEagerSectionsFromPage(sections, settings).then(() => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }

    // Cold CSR / client navigation: avoid an instant Loader2 flash when chunks
    // are already warm (common on SPA). Only blank if preload is still pending
    // after a short delay.
    let cancelled = false;
    let blanked = false;
    const blankTimer = window.setTimeout(() => {
      if (cancelled) return;
      blanked = true;
      setReady(false);
    }, 120);
    void preloadEagerSectionsFromPage(sections, settings).then(() => {
      window.clearTimeout(blankTimer);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(blankTimer);
      if (blanked) {
        // leave state as-is; next effect will correct
      }
    };
    // cacheKey captures sections + settings identity for this gate
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [cacheKey]);

  return ready;
}
