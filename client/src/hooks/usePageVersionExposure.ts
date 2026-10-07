import { useEffect } from "react";
import { trackPageVersion, type ServedPageVersion } from "@/lib/tracking";

/**
 * Report the page version the server served (`_page_version` on page JSON).
 * Skipped for forced previews so staff never count as experiment traffic.
 */
export function usePageVersionExposure(data: unknown, opts: { skip?: boolean } = {}): void {
  const pv =
    data && typeof data === "object"
      ? ((data as { _page_version?: ServedPageVersion })._page_version ?? null)
      : null;
  const key = pv ? `${pv.experiment_id}|${pv.variant}` : "";
  useEffect(() => {
    if (opts.skip || !data) return;
    trackPageVersion(pv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.skip, !!data]);
}
