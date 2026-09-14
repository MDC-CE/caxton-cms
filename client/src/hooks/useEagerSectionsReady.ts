import { useEffect, useMemo, useState } from "react";
import { IS_SERVER } from "@/lib/initialData";
import {
  areEagerSectionsCached,
  preloadEagerSectionsFromPage,
} from "@/components/sectionRegistry";

type PageSettingsLike = { loading?: { eager_count?: number } } | null | undefined;

/**
 * True when above-fold section modules are in the registry cache.
 * On the server, sections are preloaded before render — always ready.
 * On the client, waits for preload without painting Header+empty-main+Footer.
 * During SSR hydration (`data-ssr-hydrating`), treats as ready so we do not
 * replace SSR HTML with a loader (hydrate already awaited preload in main.tsx).
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

  const [ready, setReady] = useState(() => {
    if (IS_SERVER) return true;
    if (
      typeof document !== "undefined" &&
      document.documentElement.hasAttribute("data-ssr-hydrating")
    ) {
      return true;
    }
    return areEagerSectionsCached(sections, settings);
  });

  useEffect(() => {
    if (IS_SERVER) return;
    if (areEagerSectionsCached(sections, settings)) {
      setReady(true);
      return;
    }
    if (
      typeof document !== "undefined" &&
      document.documentElement.hasAttribute("data-ssr-hydrating")
    ) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void preloadEagerSectionsFromPage(sections, settings).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // cacheKey captures sections + settings identity for this gate
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [cacheKey]);

  return ready;
}
