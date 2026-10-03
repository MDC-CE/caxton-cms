import { useCallback, useEffect, useRef, useState } from "react";
import { getDebugToken } from "@/hooks/useDebugAuth";
import {
  createSlugRenameChecker,
  type SlugRenameCheckParams,
  type SlugRenameCheckResult,
} from "@/lib/slugRenameCheck";

function debugHeaders(): Record<string, string> {
  const token = getDebugToken();
  return token ? { "X-Debug-Token": token } : {};
}

/** Live availability for the slug editor; uses the same server rules as Apply. */
export function useSlugRenameCheck(params: SlugRenameCheckParams): SlugRenameCheckResult & { retry: () => void } {
  const [result, setResult] = useState<SlugRenameCheckResult>({ status: "idle", reason: null });
  const checkerRef = useRef<ReturnType<typeof createSlugRenameChecker> | null>(null);
  if (!checkerRef.current) {
    checkerRef.current = createSlugRenameChecker({ onResult: setResult, getHeaders: debugHeaders });
  }

  const { contentType, folderSlug, locale, newSlug, currentSlug } = params;
  useEffect(() => {
    checkerRef.current?.update({ contentType, folderSlug, locale, newSlug, currentSlug });
  }, [contentType, folderSlug, locale, newSlug, currentSlug]);

  useEffect(() => () => checkerRef.current?.dispose(), []);

  const retry = useCallback(() => checkerRef.current?.retry(), []);
  return { ...result, retry };
}
