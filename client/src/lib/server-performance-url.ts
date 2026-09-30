export const PERFORMANCE_SEARCH_KEYS = {
  process: "process",
  range: "range",
  startingAt: "starting_at",
  endingAt: "ending_at",
  zoomed: "zoom",
  zoomFrom: "zoom_from",
  zoomTo: "zoom_to",
  tab: "tab",
  section: "section",
} as const;

export const PROCESS_NAMES = ["web", "sidequest", "mcp", "diagnostics-worker"] as const;
export type ProcessName = (typeof PROCESS_NAMES)[number];
export const RANGE_PRESETS = ["1h", "6h", "24h", "7d"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type PerfTab = "process" | "traffic";
export type PerfSection = "api" | "pages";

export const RANGE_MS: Record<RangePreset, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export interface PerformanceView {
  process: ProcessName;
  range: RangePreset;
  startingAt: number | null;
  endingAt: number | null;
  /** Chart shows zoomFrom–zoomTo. A selection on top of that does not change the chart. */
  zoomed: boolean;
  zoomFrom: number | null;
  zoomTo: number | null;
  tab: PerfTab;
  section: PerfSection;
}

export const PERFORMANCE_VIEW_DEFAULTS: PerformanceView = {
  process: "web",
  range: "6h",
  startingAt: null,
  endingAt: null,
  zoomed: false,
  zoomFrom: null,
  zoomTo: null,
  tab: "process",
  section: "api",
};

function parseEpochMs(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function oneOf<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw != null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function parsePerformanceSearch(search: string): PerformanceView {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const startingAt = parseEpochMs(params.get(PERFORMANCE_SEARCH_KEYS.startingAt));
  const endingAt = parseEpochMs(params.get(PERFORMANCE_SEARCH_KEYS.endingAt));
  const pair = startingAt != null && endingAt != null && startingAt <= endingAt
    ? { startingAt, endingAt }
    : { startingAt: null, endingAt: null };
  const zoomFlag = params.get(PERFORMANCE_SEARCH_KEYS.zoomed) === "1";
  const zoomFromRaw = parseEpochMs(params.get(PERFORMANCE_SEARCH_KEYS.zoomFrom));
  const zoomToRaw = parseEpochMs(params.get(PERFORMANCE_SEARCH_KEYS.zoomTo));
  const explicitZoom = zoomFromRaw != null && zoomToRaw != null && zoomFromRaw < zoomToRaw
    ? { zoomFrom: zoomFromRaw, zoomTo: zoomToRaw }
    : null;
  const legacyZoom = pair.startingAt != null && pair.endingAt != null && pair.startingAt < pair.endingAt
    ? { zoomFrom: pair.startingAt, zoomTo: pair.endingAt }
    : null;
  const zoomWindow = zoomFlag ? (explicitZoom ?? legacyZoom) : null;
  const process = oneOf(params.get(PERFORMANCE_SEARCH_KEYS.process), PROCESS_NAMES, "web");
  let tab = oneOf(params.get(PERFORMANCE_SEARCH_KEYS.tab), ["process", "traffic"] as const, "process");
  if (process !== "web") tab = "process";
  const section = process === "web"
    ? oneOf(params.get(PERFORMANCE_SEARCH_KEYS.section), ["api", "pages"] as const, "api")
    : "api";
  return {
    process,
    range: oneOf(params.get(PERFORMANCE_SEARCH_KEYS.range), RANGE_PRESETS, "6h"),
    ...pair,
    zoomed: zoomWindow != null,
    zoomFrom: zoomWindow?.zoomFrom ?? null,
    zoomTo: zoomWindow?.zoomTo ?? null,
    tab,
    section,
  };
}

function setOmitDefault(params: URLSearchParams, key: string, value: string, fallback: string) {
  if (!value || value === fallback) params.delete(key);
  else params.set(key, value);
}

/** Writes known keys. Defaults are omitted. Unknown params are kept. */
export function serializePerformanceSearch(view: PerformanceView, existingSearch = ""): string {
  const params = new URLSearchParams(existingSearch.startsWith("?") ? existingSearch.slice(1) : existingSearch);
  const drag = view.startingAt != null && view.endingAt != null && view.startingAt < view.endingAt;
  const click = view.startingAt != null && view.endingAt != null && view.startingAt === view.endingAt;
  if (drag || click) {
    params.set(PERFORMANCE_SEARCH_KEYS.startingAt, String(view.startingAt));
    params.set(PERFORMANCE_SEARCH_KEYS.endingAt, String(view.endingAt));
  } else {
    params.delete(PERFORMANCE_SEARCH_KEYS.startingAt);
    params.delete(PERFORMANCE_SEARCH_KEYS.endingAt);
  }
  const zoomed = view.zoomed
    && view.zoomFrom != null
    && view.zoomTo != null
    && view.zoomFrom < view.zoomTo;
  if (zoomed) {
    params.set(PERFORMANCE_SEARCH_KEYS.zoomed, "1");
    params.set(PERFORMANCE_SEARCH_KEYS.zoomFrom, String(view.zoomFrom));
    params.set(PERFORMANCE_SEARCH_KEYS.zoomTo, String(view.zoomTo));
  } else {
    params.delete(PERFORMANCE_SEARCH_KEYS.zoomed);
    params.delete(PERFORMANCE_SEARCH_KEYS.zoomFrom);
    params.delete(PERFORMANCE_SEARCH_KEYS.zoomTo);
  }
  setOmitDefault(params, PERFORMANCE_SEARCH_KEYS.range, view.range, "6h");
  setOmitDefault(params, PERFORMANCE_SEARCH_KEYS.process, view.process, "web");
  const tab = view.process === "web" ? view.tab : "process";
  setOmitDefault(params, PERFORMANCE_SEARCH_KEYS.tab, tab, "process");
  if (view.process === "web" && view.section === "pages") params.set(PERFORMANCE_SEARCH_KEYS.section, "pages");
  else params.delete(PERFORMANCE_SEARCH_KEYS.section);
  return params.toString();
}

export function chartBounds(view: PerformanceView, now: number): { from: number; to: number } {
  if (view.zoomed && view.zoomFrom != null && view.zoomTo != null && view.zoomFrom < view.zoomTo) {
    return { from: view.zoomFrom, to: view.zoomTo };
  }
  return { from: now - RANGE_MS[view.range], to: now };
}

export function detailBounds(view: PerformanceView, now: number): { from: number; to: number; logs: boolean } {
  if (view.startingAt != null && view.endingAt != null) {
    return { from: view.startingAt, to: view.endingAt, logs: true };
  }
  const chart = chartBounds(view, now);
  return { ...chart, logs: false };
}
