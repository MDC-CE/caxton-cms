import { useEffect, useState } from "react";

export interface PlaygroundCatalogOffering {
  start_date: string;
  course_title: string;
  course_url: string;
  campus: string;
  program_area_name: string;
  is_available: boolean;
  duration?: string;
  format?: string;
  image_id: string;
  image_alt?: string;
}

export function usePlaygroundCatalogOfferings(enabled: boolean): {
  offerings: PlaygroundCatalogOffering[];
  ready: boolean;
} {
  const [offerings, setOfferings] = useState<PlaygroundCatalogOffering[]>([]);
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    fetch("/api/playground-catalog/offerings")
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ offerings?: PlaygroundCatalogOffering[] }>;
      })
      .then((body) => {
        if (cancelled) return;
        setOfferings(Array.isArray(body.offerings) ? body.offerings : []);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOfferings([]);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { offerings, ready };
}
