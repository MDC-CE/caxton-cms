import type { DatabaseManager } from "../database";

type ItemsFor = (name: string) => Record<string, unknown>[] | null | undefined;

/**
 * Minimal DatabaseManager stand-in for entry-layer tests. `itemsFor` is read on
 * every call, and each read reports a new fetched_at so memos never hide test edits.
 */
export function mockDatabase(
  itemsFor: ItemsFor,
  opts: { stale?: boolean; ageMs?: number; onRefresh?: (name: string) => void } = {},
): DatabaseManager {
  let tick = 0;
  const lastGood = (name: string) => {
    const items = itemsFor(name);
    if (!items) return null;
    tick++;
    return {
      items,
      fetchedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, tick)).toISOString(),
      stale: opts.stale ?? false,
      ageMs: opts.ageMs ?? 0,
    };
  };
  return {
    getLastGoodItems: lastGood,
    getMappedItems: (name: string) => lastGood(name)?.items ?? null,
    getListingItems: () => null,
    fetchMappedItems: async () => [],
    mappedMemoVersion: 0,
    clearMappedMemo: () => {},
    exists: (name: string) => itemsFor(name) != null,
    refreshIfExpired: async (name: string) => opts.onRefresh?.(name),
  } as unknown as DatabaseManager;
}
