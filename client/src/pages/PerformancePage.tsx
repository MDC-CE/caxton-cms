import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Braces, Check, ChevronDown, ChevronRight, Clock, CornerDownRight, Cpu, Download, File, FileText, Info, Loader2, Pin, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricsAccessGate } from "@/components/MetricsAccessGate";
import { ServerSectionHeader } from "@/components/process-stats/ServerSectionHeader";
import { ProcessLineChart, type ChartSeries } from "@/components/process-stats/ProcessLineChart";
import { ErrorLogIssueTable, type UniqueIssue } from "@/pages/ErrorLogPage";
import { apiFetch } from "@/lib/queryClient";
import {
  PROCESS_NAMES,
  RANGE_MS,
  RANGE_PRESETS,
  chartBounds,
  parsePerformanceSearch,
  selectionOverlaps,
  serializePerformanceSearch,
  type PerformanceView,
  type ProcessName,
  type RangePreset,
} from "@/lib/server-performance-url";
import { cpuThreadCoverage, formatCpuStackRaw, labelCpuSymbol } from "@/lib/cpu-stack-label";
import { buildPerformanceDetailMarkdown, performanceDetailReportFilename } from "@/lib/performance-detail-report";

const P50_MIN = 5;
const P95_MIN = 20;
const P99_MIN = 100;

function LatencyPercentiles({ unit }: { unit: "pages" | "requests" }) {
  const one = unit === "pages" ? "page" : "request";
  return (
    <>
      <p>
        p50 is the time half the {unit} finished within. p95 is that time for 95% of them, and p99 for 99%. The peak is the slowest {one}. The average is total time divided by how many finished.
      </p>
      <p>
        A 30-second point uses the {unit} from that sample. When a point groups several samples, p50, p95, and p99 are read from every {one} in the group together. A sample with many {unit} pulls the lines more than a sample with a few.
      </p>
    </>
  );
}

function ChartInfo({ label, children }: { label: string; children: ReactNode }) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`About ${label}`}
          data-testid={`button-chart-info-${slug}`}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}

const COLOR = {
  c1: "hsl(var(--chart-1))",
  c2: "hsl(var(--chart-2))",
  c3: "hsl(var(--chart-3))",
  c4: "hsl(var(--chart-4))",
  c5: "hsl(262 55% 55%)",
};

const MAX_PINS = 6;
/** Left to right: purple, yellow, pink, cyan, dark green, black. */
const PIN_COLORS = [
  "hsl(262 72% 52%)",
  "hsl(50 98% 64%)",
  "hsl(336 78% 62%)",
  "hsl(188 72% 42%)",
  "hsl(142 45% 28%)",
  "hsl(0 0% 18%)",
];

type ChartPin = {
  kind: "api" | "pages";
  method: string | null;
  route: string;
  shown: boolean;
  excluded: boolean;
  /** Set when the pin is created. Stays with that box. */
  colorIndex: number;
};

function nextPinColor(list: ChartPin[]): number {
  const used = new Set(list.map((pin) => pin.colorIndex));
  for (let i = 0; i < PIN_COLORS.length; i++) if (!used.has(i)) return i;
  return 0;
}

function ChartSpinner({ minHeight }: { minHeight: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border bg-card"
      style={{ minHeight }}
      aria-busy="true"
      aria-label="Loading"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function pinTint(color: string): string {
  const end = color.lastIndexOf(")");
  return `${color.slice(0, end)} / 0.12)`;
}

function pinName(pin: { method: string | null; route: string }): string {
  return pin.method ? `${pin.method} ${pin.route}` : pin.route;
}

function samePin(
  a: { kind: string; method: string | null; route: string },
  b: { kind: string; method: string | null; route: string },
): boolean {
  return a.kind === b.kind && a.route === b.route && (a.kind === "pages" || a.method === b.method);
}

type Traffic = {
  count: number;
  avgMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number;
};

type StatsWindow = {
  timestamp: number;
  intervalMs: number;
  cpuProcessPercent: number | null;
  cpuUserPercent: number | null;
  cpuSystemPercent: number | null;
  cpuMainThreadPercent: number | null;
  cpuOtherThreadsPercent: number | null;
  cpuMachinePercent: number | null;
  heapUsedMb: number | null;
  rssMb: number | null;
  garbageCollectionPauseMs: number | null;
  garbageCollectionMaxPauseMs: number | null;
  inFlightMaxRequests: number | null;
  openFds: number | null;
  openFdsLimit: number | null;
  eventLoop: { p50Ms: number; p99Ms: number; maxMs: number } | null;
  api: Traffic | null;
  pages: Traffic | null;
  openCalls: Array<{ method: string; route: string; count: number; maxMs: number }> | null;
};

type RouteSeries = {
  startingAt: number;
  endingAt: number;
  stepMs: number;
  kind: "api" | "pages";
  method: string | null;
  route: string;
  windows: Array<{ timestamp: number; count: number; avgMs: number; maxMs: number }>;
};

type ChartResponse = {
  startingAt: number;
  endingAt: number;
  stepMs: number;
  boundsMs: number[];
  restarts?: Array<{ timestamp: number }>;
  windows: StatsWindow[];
  routes?: RouteSeries[];
};

type DetailRoute = {
  kind: "api" | "pages";
  method: string;
  route: string;
  count: number;
  avgMs: number;
  maxMs: number;
  statusCounts: Record<string, number>;
  durationCounts: number[];
  ssrCounts?: Record<string, number>;
  path?: string | null;
};

type DetailResponse = {
  startingAt: number;
  endingAt: number;
  boundsMs: number[];
  counts: number[];
  count: number;
  statusCounts: Record<string, number>;
  ssrCounts?: Record<string, number>;
  mixedBounds: boolean;
  routes: DetailRoute[];
  cpuStacks?: CpuProfileCapture[];
  cpuCapture?: {
    mode: "service" | "local";
    active: boolean | null;
    lastError: string | null;
    notice: string | null;
  };
  logs?: UniqueIssue[];
  logsCoverage?: "full" | "partial" | "none";
  logsSince?: number;
};

const SSR_LABELS: Record<string, string> = {
  ssr_ok: "rendered",
  ssr_empty_fallback: "empty #root",
  ssr_error_fallback: "render error",
  client_fallback: "client only",
};

const RANGE_LABEL: Record<RangePreset, string> = {
  "1h": "1 h",
  "6h": "6 h",
  "24h": "24 h",
  "7d": "7 d",
};

function formatClock(ts: number, withSeconds = false): string {
  const shown = withSeconds ? Math.floor(ts / 1000) * 1000 : ts;
  return new Date(shown).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
  });
}

const SAMPLE_MS = 30_000;

function windowsOf(ms: number): number {
  return Math.max(1, Math.round(ms / SAMPLE_MS));
}

/** How the badge duration is built from 30-second samples. */
function windowBadgeCopy(stepMs: number, spanMs: number): { lead: string; detail: string } {
  const perPoint = windowsOf(stepMs);
  const point = formatStepName(stepMs);
  const lead = "Every 30 seconds the server saves a sample: a snapshot of that slice of this process, including the calls that finished then. The chart is drawn from those samples. A point is one sample, or several samples grouped into the time the range allows.";
  if (spanMs <= stepMs) {
    if (stepMs <= SAMPLE_MS) {
      return { lead, detail: "This badge is one chart point. It is a single sample, the 30 seconds it covers." };
    }
    return {
      lead,
      detail: `This badge is one chart point, ${point}. That point groups the ${perPoint} samples saved during those ${point}, and the lines are read from all ${perPoint} together.`,
    };
  }
  const total = windowsOf(spanMs);
  const span = formatWindowSize(spanMs);
  if (stepMs <= SAMPLE_MS) {
    return {
      lead,
      detail: `This badge is the selection, ${span}. That is ${total} samples. Each chart point inside it is one of those samples.`,
    };
  }
  return {
    lead,
    detail: `This badge is the selection, ${span}. That is ${total} samples. Each chart point inside it is ${point} and groups ${perPoint} samples.`,
  };
}

/** One sample window, named by its step. A dragged span uses the full length instead. */
function formatStepName(stepMs: number): string {
  if (stepMs === 30_000) return "30s";
  if (stepMs === 90_000) return "90s";
  if (stepMs === 5 * 60_000) return "5 min";
  if (stepMs === 30 * 60_000) return "30 min";
  return formatWindowSize(stepMs);
}

function formatWindowSize(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}s`;
  const hours = Math.floor(minutes / 60);
  const minRest = minutes % 60;
  if (minRest === 0) return `${hours} h`;
  return `${hours} h ${minRest} min`;
}

/** Clock span of the detail. Sub-minute steps keep seconds: 19:16:23 – 19:16:53. */
function formatWindow(from: number, toExclusive: number, stepMs: number): string {
  const start = new Date(from);
  const end = new Date(toExclusive);
  const withSeconds = stepMs < 60_000 || start.getSeconds() !== 0 || end.getSeconds() !== 0;
  const endShown = withSeconds ? new Date(Math.floor(toExclusive / 1000) * 1000) : end;
  const sameDay = start.getFullYear() === endShown.getFullYear()
    && start.getMonth() === endShown.getMonth()
    && start.getDate() === endShown.getDate();
  if (!sameDay) return `${formatClock(from, withSeconds)} – ${formatClock(toExclusive, withSeconds)}`;
  const time = endShown.toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
  });
  return `${formatClock(from, withSeconds)} – ${time}`;
}

function formatSpan(from: number, to: number): string {
  const start = new Date(from);
  const end = new Date(to);
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  if (!sameDay) return `${formatClock(from)} – ${formatClock(to)}`;
  const time = end.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${formatClock(from)} – ${time}`;
}

function formatDetailRange(from: number, to: number): string {
  const start = new Date(from);
  const end = new Date(to);
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  if (!sameDay) return `${formatClock(from)} to ${formatClock(to)}`;
  const time = end.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${formatClock(from)} to ${time}`;
}

function formatMs(value: number, floorNote: boolean): string {
  if (floorNote && value < 10) return "<10 ms";
  return `${Math.round(value)} ms`;
}

function plotMs(value: number | null | undefined, floor: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (floor != null) return Math.max(floor, value);
  return value > 0 ? value : 0.1;
}

function missingPercentile(label: string, value: number | null, count: number, min: number): string {
  if (value != null) return `${label}: ${formatMs(value, true)}`;
  return `${label} needs at least ${min} calls (had ${count})`;
}

function countLine(counts: Record<string, number> | undefined, labels?: Record<string, string>): string {
  if (!counts) return "";
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} × ${labels?.[key] ?? key}`)
    .join(", ");
}

/** 2xx and 3xx finished fine. 304 is a hit, not a failure. */
function isOkStatus(code: string): boolean {
  const n = Number(code);
  return Number.isInteger(n) && n >= 200 && n < 400;
}

function statusEntries(counts: Record<string, number> | undefined): Array<[string, number]> {
  if (!counts) return [];
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => {
      const na = Number(a[0]);
      const nb = Number(b[0]);
      const aNum = Number.isInteger(na);
      const bNum = Number.isInteger(nb);
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a[0].localeCompare(b[0]);
    });
}

function statusClass(code: string): string {
  const n = Number(code);
  if (!Number.isInteger(n)) return "text-muted-foreground";
  if (n >= 200 && n < 300) return "text-emerald-700";
  if (n >= 300 && n < 400) return "text-amber-600";
  if (n >= 400 && n < 500) return "text-orange-600";
  if (n >= 500 && n < 600) return "text-red-600";
  return "text-muted-foreground";
}

function statusBadgeClass(code: string): string {
  const n = Number(code);
  if (!Number.isInteger(n)) return "border-transparent bg-muted";
  if (n >= 200 && n < 300) return "border-transparent bg-emerald-100";
  if (n >= 300 && n < 400) return "border-transparent bg-amber-100";
  if (n >= 400 && n < 500) return "border-transparent bg-orange-100";
  if (n >= 500 && n < 600) return "border-transparent bg-red-100";
  return "border-transparent bg-muted";
}

function StatusCountBadges({ counts }: { counts: Record<string, number> | undefined }) {
  const entries = statusEntries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([code, n]) => (
        <Badge key={code} variant="secondary" className={cn("rounded-full tabular-nums", statusBadgeClass(code))}>
          <span className="text-foreground">{n}</span>
          <span className={statusClass(code)}> · {code}</span>
        </Badge>
      ))}
    </div>
  );
}

function StatusCounts({ counts }: { counts: Record<string, number> | undefined }) {
  const entries = statusEntries(counts);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-start gap-0 text-xs leading-none tabular-nums">
      {entries.map(([code, n]) => (
        <span key={code} className="whitespace-nowrap">
          <span className="text-foreground">{n}</span>
          <span className={statusClass(code)}> · {code}</span>
        </span>
      ))}
    </span>
  );
}

function StatusShare({ counts }: { counts: Record<string, number> | undefined }) {
  const entries = statusEntries(counts);
  if (entries.length === 0) return null;
  let ok = 0;
  let bad = 0;
  for (const [code, n] of entries) {
    if (isOkStatus(code)) ok += n;
    else bad += n;
  }
  const total = ok + bad;
  const okPct = total > 0 ? (ok / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-red-500" aria-hidden>
        <div className="h-full" style={{ width: `${okPct}%`, backgroundColor: "#059669" }} />
      </div>
      <div className="shrink-0 text-xs font-medium tabular-nums">
        <span className="text-emerald-600">{ok}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-red-600">{bad}</span>
      </div>
    </div>
  );
}

function emptyWindow(timestamp: number, stepMs: number): StatsWindow {
  return {
    timestamp,
    intervalMs: stepMs,
    cpuProcessPercent: null,
    cpuUserPercent: null,
    cpuSystemPercent: null,
    cpuMainThreadPercent: null,
    cpuOtherThreadsPercent: null,
    cpuMachinePercent: null,
    heapUsedMb: null,
    rssMb: null,
    garbageCollectionPauseMs: null,
    garbageCollectionMaxPauseMs: null,
    inFlightMaxRequests: null,
    openFds: null,
    openFdsLimit: null,
    eventLoop: null,
    api: null,
    pages: null,
    openCalls: null,
  };
}

/** A missing window is a break in the line. Recharts only breaks on a null point, not on a hole in the array. */
function insertGaps(windows: StatsWindow[], stepMs: number): StatsWindow[] {
  if (windows.length < 2 || stepMs <= 0) return windows;
  const out: StatsWindow[] = [];
  for (let i = 0; i < windows.length; i++) {
    const prev = windows[i - 1];
    const current = windows[i];
    if (prev && current.timestamp - prev.timestamp > stepMs * 1.5) {
      out.push(emptyWindow(prev.timestamp + stepMs, stepMs));
    }
    out.push(current);
  }
  return out;
}

/** Closest sample to this time, at most one step away. Another process ticks on its own clock. */
function nearestWindow(windows: StatsWindow[], stepMs: number, time: number): StatsWindow | null {
  let best: StatsWindow | null = null;
  let dist = stepMs;
  for (const row of windows) {
    const gap = Math.abs(row.timestamp - time);
    if (gap <= dist) {
      dist = gap;
      best = row;
    }
  }
  return best;
}

/** Inclusive sample range of the windows this selection covers. A coarse point covers its whole bucket. */
function selectionCoverage(
  windows: StatsWindow[],
  stepMs: number,
  from: number,
  to: number,
): { from: number; to: number } | null {
  if (stepMs <= 0 || windows.length === 0) return null;
  const placed = selectionOnChart(windows, stepMs, from, to);
  const hit = windows.filter((row) => row.timestamp >= placed.from && row.timestamp <= placed.to);
  if (hit.length === 0) return null;
  const start = hit[0].timestamp;
  const last = hit[hit.length - 1].timestamp;
  return { from: start, to: last + stepMs - 1 };
}

/** Draw the selection on the windows this chart actually has. A point from a finer zoom marks the window that contains it. */
function selectionOnChart(
  windows: StatsWindow[],
  stepMs: number,
  from: number,
  to: number,
): { from: number; to: number } {
  if (stepMs <= 0 || windows.length === 0) return { from, to };
  if (from === to) {
    const exact = windows.find((row) => row.timestamp === from);
    if (exact) return { from: exact.timestamp, to: exact.timestamp };
    const owners = windows.filter((row) => row.timestamp <= from && row.timestamp + stepMs > from);
    const owner = owners.length > 0 ? owners[owners.length - 1] : nearestWindow(windows, stepMs, from);
    if (owner) return { from: owner.timestamp, to: owner.timestamp };
    return { from, to };
  }
  const hit = windows.filter((row) => row.timestamp <= to && row.timestamp + stepMs > from);
  if (hit.length > 0) return { from: hit[0].timestamp, to: hit[hit.length - 1].timestamp };
  const start = nearestWindow(windows, stepMs, from);
  const end = nearestWindow(windows, stepMs, to);
  if (!start || !end) return { from, to };
  return {
    from: Math.min(start.timestamp, end.timestamp),
    to: Math.max(start.timestamp, end.timestamp),
  };
}

function snapRestart(timestamp: number, stepMs: number, windows: StatsWindow[]): number | null {
  const target = stepMs > 30_000 ? Math.floor(timestamp / stepMs) * stepMs : timestamp;
  let best: number | null = null;
  let dist = stepMs > 0 ? stepMs : 30_000;
  for (const row of windows) {
    if (row.cpuProcessPercent == null && row.eventLoop == null) continue;
    const d = Math.abs(row.timestamp - target);
    if (d <= dist) {
      dist = d;
      best = row.timestamp;
    }
  }
  return best;
}

function bucketLabel(index: number, bounds: number[]): string {
  if (index <= 0) return `<${bounds[0] ?? 10}`;
  if (index >= bounds.length) return `≥${bounds[bounds.length - 1] ?? 5000}`;
  return `${bounds[index - 1]}–${bounds[index]}`;
}

/** Blue under 500 ms, orange through 2500 ms, red after that. */
function durationBarClass(index: number, bounds: number[]): string {
  const orangeFrom = bounds.indexOf(500) + 1;
  const redFrom = bounds.indexOf(2500) + 1;
  if (redFrom > 0 && index >= redFrom) return "bg-destructive";
  if (orangeFrom > 0 && index >= orangeFrom) return "bg-orange-500";
  return "bg-primary/70";
}

/** 0% slow is green. A larger share of calls at 500 ms or more shifts toward red. */
function slowShareClass(pct: number): string {
  if (pct <= 0) return "border-transparent bg-emerald-100 text-emerald-900";
  if (pct < 15) return "border-transparent bg-lime-100 text-lime-900";
  if (pct < 40) return "border-transparent bg-amber-100 text-amber-900";
  if (pct < 70) return "border-transparent bg-orange-100 text-orange-900";
  return "border-transparent bg-red-100 text-red-900";
}

function sumDuration(routes: DetailRoute[], width: number): number[] {
  const totals = new Array(width).fill(0);
  for (const route of routes) {
    route.durationCounts.forEach((n, i) => {
      if (i < totals.length) totals[i] += n;
    });
  }
  return totals;
}

export default function PerformancePage() {
  return (
    <MetricsAccessGate>
      <PerformanceInner />
    </MetricsAccessGate>
  );
}

function scrollableParent(el: HTMLElement): HTMLElement | Window {
  let node = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const scrolls = /(auto|scroll)/.test(style.overflowY);
    if (scrolls && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return window;
}

function PerformanceInner() {
  const search = useSearch();
  const [pathname, setLocation] = useLocation();
  const parsed = useMemo(() => parsePerformanceSearch(search), [search]);
  const [tab, setTab] = useState(parsed.tab);
  const [pins, setPins] = useState<{ api: ChartPin[]; pages: ChartPin[] }>(() => {
    const empty = { api: [] as ChartPin[], pages: [] as ChartPin[] };
    if (!parsed.route || (parsed.tab !== "api" && parsed.tab !== "pages")) return empty;
    const pin: ChartPin = {
      kind: parsed.tab,
      method: parsed.tab === "api" ? parsed.method : null,
      route: parsed.route,
      shown: false,
      excluded: false,
      colorIndex: 0,
    };
    empty[parsed.tab] = [pin];
    return empty;
  });
  const [pinScroll, setPinScroll] = useState(0);
  const [detailFolded, setDetailFolded] = useState<Record<string, boolean>>({});
  const chartsRef = useRef<HTMLDivElement>(null);
  const scrollToCharts = useRef(false);
  const [legendOn, setLegendOn] = useState<Record<string, boolean>>({
    cpu: true,
    elP50: true,
    elP99: true,
    elMax: true,
    heap: true,
    rss: true,
    p50: true,
    p95: true,
    p99: false,
    max: true,
    calls: true,
  });
  const [draft, setDraft] = useState<{ from: number; to: number } | null>(null);
  const [cue, setCue] = useState<{ chartId: string; x: number; y: number; side: "left" | "right" } | null>(null);
  const [hotSync, setHotSync] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const hideCueOnNextScroll = useRef(false);
  const seenSearch = useRef(search);

  useEffect(() => {
    if (!cue) setHotSync(null);
  }, [cue]);

  useEffect(() => {
    if (seenSearch.current === search) return;
    seenSearch.current = search;
    const next = parsePerformanceSearch(search);
    setTab(next.tab);
  }, [search]);

  const write = useCallback((patch: Partial<PerformanceView>) => {
    const next: PerformanceView = { ...parsed, tab, ...patch, route: null, method: null };
    if (next.process !== "web") next.tab = "process";
    const dropSaved = (patch.process != null && patch.process !== parsed.process) || next.process !== "web";
    if (dropSaved) setPins({ api: [], pages: [] });
    if (next.tab !== tab) setTab(next.tab);
    const qs = serializePerformanceSearch(next, search);
    const pathOnly = pathname.split("?")[0];
    const href = qs ? `${pathOnly}?${qs}` : pathOnly;
    seenSearch.current = qs;
    setLocation(href, { replace: true });
  }, [parsed, tab, search, pathname, setLocation]);

  const viewTab = parsed.process === "web" ? tab : "process";
  const chartView = viewTab;
  const tabPins = viewTab === "api" || viewTab === "pages" ? pins[viewTab] : [];

  useEffect(() => {
    if (!scrollToCharts.current) return;
    const el = chartsRef.current;
    if (!el) return;
    scrollToCharts.current = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduce ? "auto" : "smooth";
    const gap = 140;
    const parent = scrollableParent(el);
    if (parent === window) {
      const top = window.scrollY + el.getBoundingClientRect().top - gap;
      window.scrollTo({ top: Math.max(0, top), behavior });
      return;
    }
    const top = parent.scrollTop + el.getBoundingClientRect().top - parent.getBoundingClientRect().top - gap;
    parent.scrollTo({ top: Math.max(0, top), behavior });
  }, [pinScroll, viewTab]);
  const selected = parsed.startingAt != null && parsed.endingAt != null;

  const detailPeeking = () => {
    const el = detailRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return window.innerHeight > 0 && visible / window.innerHeight >= 1 / 3;
  };

  const stepRef = useRef(30_000);

  const onPick = useCallback((chartId: string, from: number, to: number, at: { x: number; y: number; side: "left" | "right" }) => {
    const step = stepRef.current;
    const end = from === to && step > 30_000 ? from + step - 1 : to;
    if (parsed.startingAt === from && parsed.endingAt === end) return;
    hideCueOnNextScroll.current = detailPeeking();
    setCue({ chartId, x: at.x, y: at.y, side: at.side });
    write({
      startingAt: from,
      endingAt: end,
      zoomed: parsed.zoomed,
      zoomFrom: parsed.zoomed ? parsed.zoomFrom : null,
      zoomTo: parsed.zoomed ? parsed.zoomTo : null,
    });
  }, [parsed.startingAt, parsed.endingAt, parsed.zoomed, parsed.zoomFrom, parsed.zoomTo, write]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      write({ startingAt: null, endingAt: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, write]);

  const showDetail = () => {
    const el = detailRef.current;
    hideCueOnNextScroll.current = false;
    setCue(null);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduce ? "auto" : "smooth";
    if (!el) return;
    if (detailPeeking()) {
      scrollableParent(el).scrollBy({ top: 160, behavior });
      return;
    }
    el.scrollIntoView({ behavior, block: "start" });
  };

  const dismissCue = () => setCue(null);

  const detailButtonFor = (chartId: string) => (
    cue?.chartId === chartId ? { x: cue.x, y: cue.y, side: cue.side } : null
  );

  const chartZoomed = parsed.zoomed
    && parsed.zoomFrom != null
    && parsed.zoomTo != null
    && parsed.zoomFrom < parsed.zoomTo;
  const selection = selected ? { from: parsed.startingAt!, to: parsed.endingAt! } : null;
  const selectionIsZoom = chartZoomed && selection != null
    && selection.from === parsed.zoomFrom
    && selection.to === parsed.zoomTo;
  const rangeLabel = chartZoomed && parsed.zoomFrom != null && parsed.zoomTo != null
    ? formatSpan(parsed.zoomFrom, parsed.zoomTo)
    : RANGE_LABEL[parsed.range];

  const routeOn = viewTab === "api" || viewTab === "pages";
  const shownPins = tabPins.flatMap((pin, index) => (pin.shown ? [{ pin, index }] : []));
  const excludedPins = tabPins.filter((pin) => pin.excluded);
  const chartQuery = useQuery({
    queryKey: [
      "process-stats",
      parsed.process,
      chartZoomed ? parsed.zoomFrom : parsed.range,
      chartZoomed ? parsed.zoomTo : "preset",
      shownPins.map((item) => `${item.pin.kind}:${item.pin.method ?? ""}:${item.pin.route}`).join("|"),
      excludedPins.map((pin) => `${pin.kind}:${pin.method ?? ""}:${pin.route}`).join("|"),
    ],
    queryFn: async () => {
      const bounds = chartBounds(parsed, Date.now());
      const params = new URLSearchParams({
        process: parsed.process,
        starting_at: String(bounds.from),
        ending_at: String(bounds.to),
      });
      const body = shownPins.length > 0 || excludedPins.length > 0
        ? {
            routes: shownPins.map((item) => ({
              kind: item.pin.kind,
              ...(item.pin.method ? { method: item.pin.method } : {}),
              route: item.pin.route,
            })),
            exclude: excludedPins.map((pin) => ({
              kind: pin.kind,
              ...(pin.method ? { method: pin.method } : {}),
              route: pin.route,
            })),
          }
        : null;
      const res = await apiFetch(`/api/admin/process-stats?${params}`, body ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      } : undefined);
      if (!res.ok) throw new Error("Could not read statistics");
      return (await res.json()) as ChartResponse;
    },
    placeholderData: keepPreviousData,
  });
  const chartBusy = chartQuery.isLoading || chartQuery.isPlaceholderData;

  const chart = chartQuery.data;
  const windows = useMemo(() => insertGaps(chart?.windows ?? [], chart?.stepMs ?? 0), [chart]);
  stepRef.current = chart?.stepMs ?? 30_000;
  const bucketClick = selected
    && stepRef.current > 30_000
    && parsed.endingAt! - parsed.startingAt! === stepRef.current - 1;
  const drag = selected
    && parsed.startingAt! < parsed.endingAt!
    && !bucketClick
    && !selectionIsZoom;
  const zoomIn = drag || (bucketClick && !selectionIsZoom);
  const covered = selection && !selectionIsZoom
    ? selectionCoverage(windows, chart?.stepMs ?? 0, selection.from, selection.to)
    : null;
  const detailFrom = selected
    ? (covered?.from ?? (chartQuery.isPending ? null : parsed.startingAt))
    : chart?.startingAt;
  const detailTo = selected
    ? (covered?.to ?? (chartQuery.isPending ? null : parsed.endingAt))
    : chart?.endingAt;
  const wantDetail = viewTab !== "process" || selected;
  const step = chart?.stepMs ?? 30_000;
  const detailSpan = (() => {
    if (covered) return { from: covered.from, toExclusive: covered.to + 1 };
    if (!selected || selectionIsZoom || parsed.startingAt == null || parsed.endingAt == null) return null;
    const point = parsed.startingAt === parsed.endingAt
      || (step > 30_000 && parsed.endingAt - parsed.startingAt === step - 1);
    const from = parsed.startingAt;
    return { from, toExclusive: point ? from + step : parsed.endingAt + step };
  })();
  const detailRange = (() => {
    const zoomSpan = chartZoomed && parsed.zoomFrom != null && parsed.zoomTo != null;
    if (!selected || selectionIsZoom) {
      if (zoomSpan) return formatDetailRange(parsed.zoomFrom!, parsed.zoomTo!);
      return `the last ${RANGE_LABEL[parsed.range]}`;
    }
    if (detailSpan) return formatWindow(detailSpan.from, detailSpan.toExclusive, step);
    return formatClock(parsed.startingAt!);
  })();
  const windowBadge = (() => {
    if (detailSpan) {
      const spanMs = detailSpan.toExclusive - detailSpan.from;
      return {
        label: spanMs <= step ? formatStepName(step) : formatWindowSize(spanMs),
        spanMs,
      };
    }
    if (chartZoomed && parsed.zoomFrom != null && parsed.zoomTo != null && (!selected || selectionIsZoom)) {
      const spanMs = parsed.zoomTo - parsed.zoomFrom;
      return { label: formatWindowSize(spanMs), spanMs };
    }
    return null;
  })();
  const badgeCopy = windowBadge ? windowBadgeCopy(step, windowBadge.spanMs) : null;

  const detailQuery = useQuery({
    queryKey: ["process-stats-detail", parsed.process, detailFrom, detailTo],
    enabled: detailFrom != null && detailTo != null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        process: parsed.process,
        starting_at: String(detailFrom),
        ending_at: String(detailTo),
        logs: "1",
      });
      const res = await apiFetch(`/api/admin/process-stats/detail?${params}`);
      if (!res.ok) throw new Error("Could not read the detail");
      return (await res.json()) as DetailResponse;
    },
  });

  const chartSelection = selection && !selectionIsZoom
    ? selectionOnChart(windows, chart?.stepMs ?? 0, selection.from, selection.to)
    : null;
  const openRows = useMemo(() => {
    const source = selected && detailFrom != null && detailTo != null
      ? windows.filter((row) => row.timestamp >= detailFrom && row.timestamp <= detailTo)
      : windows;
    const last = [...source].reverse().find((row) =>
      row.cpuProcessPercent != null || row.eventLoop != null || row.heapUsedMb != null || row.api != null || row.pages != null,
    );
    return (last?.openCalls ?? [])
      .map((call) => ({ timestamp: last!.timestamp, ...call }))
      .sort((a, b) => b.maxMs - a.maxMs || b.count - a.count);
  }, [windows, selected, detailFrom, detailTo]);
  const restarts = useMemo(
    () => (chart?.restarts ?? [])
      .map((item) => snapRestart(item.timestamp, chart?.stepMs ?? 0, windows))
      .filter((ts): ts is number => ts != null),
    [chart, windows],
  );
  const coarse = (chart?.stepMs ?? 0) > 30_000;
  const height = 180;
  /** Latency has more axis labels than the process charts. */
  const logHeight = 200;
  const toggle = (key: string) => setLegendOn((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (!selected) {
      hideCueOnNextScroll.current = false;
      setCue(null);
      return;
    }
    const onScroll = () => {
      if (hideCueOnNextScroll.current) {
        hideCueOnNextScroll.current = false;
        setCue(null);
        return;
      }
      if (detailPeeking()) setCue(null);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [selected, detailQuery.data, chartQuery.data]);

  const cpuSeries: ChartSeries[] = [
    { key: "cpu", label: "CPU", color: COLOR.c1, on: legendOn.cpu },
  ];
  const loopSeries: ChartSeries[] = [
    { key: "elP50", label: "p50", color: COLOR.c1, on: legendOn.elP50 },
    { key: "elP99", label: "p99", color: COLOR.c2, on: legendOn.elP99 },
    { key: "elMax", label: "max", color: COLOR.c3, on: legendOn.elMax, filled: true },
  ];
  const ramSeries: ChartSeries[] = [
    { key: "heap", label: "heap", color: COLOR.c1, on: legendOn.heap },
    { key: "rss", label: "RSS", color: COLOR.c2, on: legendOn.rss, filled: true },
  ];
  const clampPinLabel = tabPins.length >= 3;
  const routeSeriesList: ChartSeries[] = shownPins.map((item) => ({
    key: `p${item.index}`,
    label: pinName(item.pin),
    color: PIN_COLORS[item.pin.colorIndex ?? tabPins.length - 1 - item.index] ?? COLOR.c5,
    on: true,
    pinned: true as const,
    clamp: clampPinLabel,
  }));
  const trafficSeries: ChartSeries[] = [
    { key: "p50", label: "p50", color: COLOR.c1, on: legendOn.p50 },
    { key: "p95", label: "p95", color: COLOR.c2, on: legendOn.p95 },
    { key: "p99", label: "p99", color: COLOR.c3, on: legendOn.p99 },
    { key: "max", label: "peak", color: COLOR.c4, on: legendOn.max, filled: true },
    ...routeSeriesList,
  ];
  const countSeries: ChartSeries[] = [
    { key: "count", label: "Calls", color: COLOR.c1, on: legendOn.calls, filled: true },
    ...routeSeriesList.map((item) => ({ ...item, key: `${item.key}Count` })),
  ];
  const updatePin = (pin: ChartPin, patch: Partial<ChartPin>) => {
    setPins((prev) => ({
      ...prev,
      [pin.kind]: prev[pin.kind].map((item) => (samePin(item, pin) ? { ...item, ...patch } : item)),
    }));
  };
  const dropPin = (pin: ChartPin) => {
    setPins((prev) => ({
      ...prev,
      [pin.kind]: prev[pin.kind].filter((item) => !samePin(item, pin)),
    }));
  };
  const pinDot = (on: boolean, color: string) => (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full border"
      style={on ? { background: color, borderColor: color } : { borderColor: color }}
    />
  );
  const pinCard = (pin: ChartPin, index: number, stacked: boolean) => {
    const color = PIN_COLORS[pin.colorIndex ?? tabPins.length - 1 - index] ?? COLOR.c5;
    const name = pinName(pin);
    const controls = (
      <>
        <button
          type="button"
          aria-pressed={pin.shown}
          title="Show occurrences"
          className={cn(
            "inline-flex items-center gap-1 text-foreground",
            clampPinLabel ? "min-w-0" : "shrink-0 whitespace-nowrap",
          )}
          onClick={() => updatePin(pin, { shown: !pin.shown })}
        >
          {pinDot(pin.shown, color)}
          <span className={cn(clampPinLabel && "truncate")}>Show occurrences</span>
        </button>
        <button
          type="button"
          aria-pressed={pin.excluded}
          title="Exclude occurrences"
          className={cn(
            "inline-flex items-center gap-1 text-foreground",
            clampPinLabel ? "min-w-0" : "shrink-0 whitespace-nowrap",
          )}
          onClick={() => updatePin(pin, { excluded: !pin.excluded })}
        >
          {pinDot(pin.excluded, color)}
          <span className={cn(clampPinLabel && "truncate")}>Exclude occurrences</span>
        </button>
      </>
    );
    return (
      <div
        key={`${pin.kind}-${pin.method ?? ""}-${pin.route}`}
        className={cn(
          "max-w-full rounded-md px-2 py-1 text-xs",
          stacked ? "flex w-max min-w-0 max-w-full shrink flex-col gap-1" : "flex flex-wrap items-center gap-x-1.5 gap-y-1",
        )}
        style={{ backgroundColor: pinTint(color) }}
      >
        <span
          className={cn("min-w-0 items-center gap-1.5", stacked ? "grid w-full" : "flex")}
          style={stacked ? { gridTemplateColumns: "1.25rem minmax(0, 1fr) 1.25rem" } : undefined}
        >
          <Pin className="size-4 shrink-0" style={{ color }} />
          <span className={cn("min-w-0 text-center font-medium", clampPinLabel && "truncate")} title={clampPinLabel ? name : undefined}>{name}</span>
          {stacked && (
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-self-end rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Unpin ${name}`}
              title="Unpin"
              onClick={() => dropPin(pin)}
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          )}
        </span>
        {stacked ? (
          <span className="flex min-w-0 items-center gap-2">{controls}</span>
        ) : (
          <>
            <span className="mx-1.5 inline-block h-4 w-px shrink-0" style={{ backgroundColor: "hsl(262 35% 35% / 0.45)" }} aria-hidden />
            {controls}
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Unpin ${name}`}
              title="Unpin"
              onClick={() => dropPin(pin)}
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    );
  };
  const pinBox = tabPins.length === 0 ? null : tabPins.length === 1 ? (
    pinCard(tabPins[0], 0, false)
  ) : (
    <div className={cn("flex justify-end gap-2", clampPinLabel ? "w-full min-w-0 flex-nowrap" : "flex-wrap items-start")}>
      {tabPins.map((pin, index) => pinCard(pin, index, true))}
    </div>
  );

  const cpuRows = windows.map((row) => ({ ...row, cpu: row.cpuProcessPercent }));
  const loopRows = windows.map((row) => ({
    timestamp: row.timestamp,
    intervalMs: row.intervalMs,
    elP50: plotMs(row.eventLoop?.p50Ms ?? null, 10),
    elP99: plotMs(row.eventLoop?.p99Ms ?? null, 10),
    elMax: plotMs(row.eventLoop?.maxMs ?? null, 10),
    rawP50: row.eventLoop?.p50Ms ?? null,
    rawP99: row.eventLoop?.p99Ms ?? null,
    rawMax: row.eventLoop?.maxMs ?? null,
  }));
  const ramRows = windows.map((row) => ({
    timestamp: row.timestamp,
    heap: row.heapUsedMb,
    rss: row.rssMb,
  }));

  const latencyFloor = chart?.boundsMs?.[0] ?? 50;
  const trafficKey = viewTab === "pages" ? "pages" : "api";
  const routeByTime = useMemo(() => {
    const map = new Map<number, Map<number, RouteSeries["windows"][number]>>();
    const series = chart?.routes ?? [];
    shownPins.forEach((item, order) => {
      const byTime = new Map<number, RouteSeries["windows"][number]>();
      for (const row of series[order]?.windows ?? []) byTime.set(row.timestamp, row);
      map.set(item.index, byTime);
    });
    return map;
  }, [chart?.routes, shownPins]);
  const trafficRows = windows.map((row) => {
    const lat = row[trafficKey];
    const hits: Array<{ name: string; count: number; maxMs: number }> = [];
    const plotted: Record<string, number | null> = {};
    for (const item of shownPins) {
      const hit = routeByTime.get(item.index)?.get(row.timestamp) ?? null;
      plotted[`p${item.index}`] = hit ? plotMs(hit.maxMs, latencyFloor) : null;
      plotted[`p${item.index}Count`] = hit ? hit.count : null;
      if (hit) hits.push({ name: pinName(item.pin), count: hit.count, maxMs: hit.maxMs });
    }
    return {
      timestamp: row.timestamp,
      intervalMs: row.intervalMs,
      count: lat?.count ?? null,
      p50: plotMs(lat?.p50Ms ?? null, latencyFloor),
      p95: plotMs(lat?.p95Ms ?? null, latencyFloor),
      p99: plotMs(lat?.p99Ms ?? null, latencyFloor),
      max: lat ? plotMs(lat.maxMs, latencyFloor) : null,
      ...plotted,
      routeHits: hits,
      raw: lat,
    };
  });

  const pageGaps = viewTab === "pages" && windows.length > 0
    && windows.filter((row) => row.pages == null || row.pages.p50Ms == null).length >= windows.length / 2;

  const detail = detailQuery.data;
  const routeKind = viewTab === "api" || viewTab === "pages" ? viewTab : null;
  const routes = useMemo(() => {
    const rows = detail?.routes ?? [];
    return rows
      .filter((row) => routeKind == null || row.kind === routeKind)
      .slice()
      .sort((a, b) => b.maxMs - a.maxMs || b.count - a.count);
  }, [detail, routeKind]);

  const durationWidth = Math.max(detail?.boundsMs.length ?? 0, routes[0]?.durationCounts.length ?? 0);
  const duration = sumDuration(routes, durationWidth);
  const durationTotal = duration.reduce((sum, n) => sum + n, 0);
  const slowFrom = (detail?.boundsMs.indexOf(500) ?? -1) + 1;
  const slow = slowFrom > 0 ? duration.slice(slowFrom).reduce((sum, n) => sum + n, 0) : 0;
  const slowPct = durationTotal > 0 ? Math.round((slow / durationTotal) * 100) : 0;
  const callTotal = routes.reduce((sum, row) => sum + row.count, 0);

  const statusTotals = useMemo(() => {
    const acc: Record<string, number> = {};
    const ssr: Record<string, number> = {};
    for (const row of routes) {
      for (const [key, n] of Object.entries(row.statusCounts)) acc[key] = (acc[key] ?? 0) + n;
      for (const [key, n] of Object.entries(row.ssrCounts ?? {})) ssr[key] = (ssr[key] ?? 0) + n;
    }
    return { acc, ssr };
  }, [routes]);

  const reportReady = !!detail && !detailQuery.isPlaceholderData && !detailQuery.isError;
  const downloadDetailReport = () => {
    if (!detail || !reportReady) return;
    const reportRoutes = detail.routes
      .slice()
      .sort((a, b) => b.maxMs - a.maxMs || b.count - a.count);
    const reportDuration = sumDuration(
      reportRoutes,
      Math.max(detail.boundsMs.length, reportRoutes[0]?.durationCounts.length ?? 0),
    );
    const reportCallTotal = reportRoutes.reduce((sum, row) => sum + row.count, 0);
    const reportDurationTotal = reportDuration.reduce((sum, count) => sum + count, 0);
    const reportSlowFrom = detail.boundsMs.indexOf(500) + 1;
    const reportSlow = reportSlowFrom > 0
      ? reportDuration.slice(reportSlowFrom).reduce((sum, count) => sum + count, 0)
      : 0;
    const reportSlowPct = reportDurationTotal > 0 ? Math.round((reportSlow / reportDurationTotal) * 100) : 0;
    const reportStatus: Record<string, number> = {};
    const reportSsr: Record<string, number> = {};
    for (const row of reportRoutes) {
      for (const [key, count] of Object.entries(row.statusCounts)) reportStatus[key] = (reportStatus[key] ?? 0) + count;
      for (const [key, count] of Object.entries(row.ssrCounts ?? {})) reportSsr[key] = (reportSsr[key] ?? 0) + count;
    }
    const showSsr = reportRoutes.some((row) => row.kind === "pages");
    const logRows = detail.logs ?? [];
    const logNote = detail.logsCoverage === "none"
      ? `No data before ${formatClock(detail.endingAt)}.`
      : detail.logsCoverage === "partial" && detail.logsSince != null
        ? `No data before ${formatClock(detail.logsSince)}.`
        : null;
    const showCpu = (detail.cpuStacks?.length ?? 0) > 0 || (parsed.process === "web" && detail.cpuCapture?.mode === "service");
    const markdown = buildPerformanceDetailMarkdown({
      process: parsed.process,
      range: detailRange,
      window: windowBadge?.label ?? null,
      duration: detail.mixedBounds
        ? null
        : {
          buckets: reportDuration.map((count, index) => ({
            label: `${bucketLabel(index, detail.boundsMs)} ms`,
            count,
          })),
          total: reportCallTotal,
          slowPct: reportSlowPct,
        },
      routes: reportRoutes.length > 0
        ? {
          showKind: true,
          showSsr,
          statusLine: statusEntries(reportStatus).map(([code, count]) => `${count} × ${code}`).join(", "),
          ssrLine: showSsr ? countLine(reportSsr, SSR_LABELS) : "",
          rows: reportRoutes,
        }
        : null,
      running: openRows.length > 0
        ? openRows.map((row) => ({ method: row.method, route: row.route, count: row.count, maxMs: row.maxMs }))
        : null,
      logs: {
        note: logNote,
        empty: logRows.length === 0 && detail.logsCoverage !== "none" ? "No logs in this span." : null,
        rows: logRows.map((row) => ({
          level: row.level,
          module: row.module,
          message: row.message,
          errName: row.err_name,
          count: row.count,
          lastSeen: formatClock(row.lastTs, true),
        })),
      },
      cpu: showCpu
        ? {
          inactive: detail.cpuCapture?.mode === "service" && detail.cpuCapture.active === false
            ? "Capture inactive. The recorder has not checked in for 2 minutes, so an empty list does not mean the CPU stayed under 120%."
            : null,
          notice: detail.cpuCapture?.notice ?? null,
          lastError: detail.cpuCapture?.lastError ? `Last recording failed: ${detail.cpuCapture.lastError}` : null,
          empty: (detail.cpuStacks?.length ?? 0) === 0 ? "No recording in this range." : null,
          stacks: (detail.cpuStacks ?? []).map((stack) => (
            stack.ok
              ? { when: formatClock(stack.timestamp, true), ok: true as const, threads: stack.threads }
              : { when: formatClock(stack.timestamp, true), ok: false as const, error: stack.error }
          )),
        }
        : null,
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = performanceDetailReportFilename(parsed.process, detail.startingAt);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto" data-testid="page-performance">
      <ServerSectionHeader
        section="performance"
        title="Performance of each process"
        description={
          <>
            <p>How busy the process you select is, and how long its work took. This is that process alone, not a site and not the whole machine.</p>
            <p>
              A sample is saved every 30 seconds (a snapshot of that slice of the process) and kept for 7 days. The chart is drawn from those samples. The time range sets what one point covers: one sample (30 seconds) up to 2 hours, then samples grouped into 90 seconds up to 6 hours, 5 minutes up to a day, and 30 minutes after that. Zoom in for a finer point.
            </p>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <ToggleButtonBar
          className="min-w-0 flex-1"
          listClassName="flex w-full bg-transparent"
          value={parsed.process}
          onValueChange={(value) => write({ process: value as ProcessName, zoomed: false })}
        >
          {PROCESS_NAMES.map((name) => (
            <ToggleButtonBarTrigger key={name} value={name} className="flex-1" data-testid={`process-${name}`}>{name}</ToggleButtonBarTrigger>
          ))}
        </ToggleButtonBar>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className={cn("gap-1 tabular-nums", chartZoomed && "bg-secondary hover:bg-secondary")} data-testid="button-range">
                <Clock />
                {rangeLabel}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {RANGE_PRESETS.map((preset) => {
                const active = !chartZoomed && parsed.range === preset;
                return (
                  <DropdownMenuItem
                    key={preset}
                    data-testid={`range-${preset}`}
                    onSelect={() => {
                      const now = Date.now();
                      const from = now - RANGE_MS[preset];
                      const keep = selectionOverlaps(parsed.startingAt, parsed.endingAt, from, now);
                      write({
                        range: preset,
                        startingAt: keep ? parsed.startingAt : null,
                        endingAt: keep ? parsed.endingAt : null,
                        zoomed: false,
                      });
                    }}
                  >
                    <Check className={cn("h-4 w-4", active ? "opacity-100" : "opacity-0")} />
                    {RANGE_LABEL[preset]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-[102px] shrink-0"
            disabled={!zoomIn && !chartZoomed}
            onClick={() => {
              setCue(null);
              if (zoomIn) write({ zoomed: true, zoomFrom: parsed.startingAt, zoomTo: parsed.endingAt });
              else write({ zoomed: false, zoomFrom: null, zoomTo: null });
            }}
            data-testid="button-zoom-selection"
          >
            {chartZoomed && !zoomIn ? <ZoomOut /> : <ZoomIn />}
            {chartZoomed && !zoomIn ? "Zoom out" : "Zoom in"}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!selected}
            onClick={() => write({ startingAt: null, endingAt: null })}
            data-testid="button-clear-range"
          >
            <Trash2 />
            Clear selection
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2">
        {parsed.process === "web" && (
          <div className="flex w-16 shrink-0 flex-col gap-1">
            {([
              { value: "process", label: "Process", icon: Cpu, testId: "tab-process" },
              { value: "api", label: "API traffic", icon: Braces, testId: "section-api" },
              { value: "pages", label: "Page traffic", icon: FileText, testId: "section-pages" },
            ] as const).map((mode) => {
              const active = chartView === mode.value;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.value}
                  type="button"
                  title={mode.label}
                  data-testid={mode.testId}
                  onClick={() => write({ tab: mode.value })}
                  className={cn(
                    "flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md px-1 text-muted-foreground",
                    active ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <Icon className={cn("size-6", active ? "text-foreground" : "text-muted-foreground")} strokeWidth={1.75} />
                  <span className="text-center text-[10px] font-normal leading-tight text-muted-foreground">{mode.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          {chartQuery.isError && <p className="text-sm text-destructive">Could not read statistics.</p>}
          {chart && windows.length === 0 && !chartBusy && <p className="text-sm text-muted-foreground">No data in this range.</p>}

          {viewTab === "process" && chartBusy && <ChartSpinner minHeight={height * 3 + 24} />}
          {viewTab === "process" && !chartBusy && windows.length > 0 && (
            <div className="space-y-3">
              <ProcessLineChart
                  title="CPU"
                  info={
                    <ChartInfo label="CPU">
                      <p>CPU time this process used, as a share of one core. 100% means it kept one core busy for the whole sample. It can go above 100% because Node also runs work on other threads, such as file reads and compression: 200% is about two cores. Other processes on the machine are not included.</p>
                      <p>The tooltip splits that time into your code and the kernel, and into the main thread and the other threads of this process. Machine is the whole computer: 100% means every core was busy.</p>
                      <p>Samples are taken every 30 seconds. When a point covers more than one sample, it shows the highest of those readings, not their average.</p>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-foreground">Read more (advanced)</summary>
                        <p className="mt-1">Your code and the kernel come from Node's cpuUsage. The thread split is read from /proc on Linux. When a point covers more than one sample, those splits are taken from the sample with the highest process CPU.</p>
                      </details>
                    </ChartInfo>
                  }
                  rows={cpuRows}
                  series={cpuSeries}
                  onToggle={toggle}
                  axis="cpu"
                  height={height}
                  syncId="process"
                  selectionHot={hotSync === "process"}
                  onDetailHot={(hot) => setHotSync(hot ? "process" : null)}
                  restarts={restarts}
                  selection={chartSelection}
                  draft={draft}
                  onDraft={setDraft}
                  onPick={(from, to, at) => onPick("cpu", from, to, at)}
                  detailButton={detailButtonFor("cpu")}
                  onShowDetail={showDetail}
                  onDismissDetail={dismissCue}
                  tooltip={(row) => {
                    const text = (value: unknown) => (value == null ? "—" : String(value));
                    const pct = (value: unknown) => (typeof value === "number" ? `${String(value)}%` : "—");
                    const showSplit = row.cpuUserPercent != null || row.cpuSystemPercent != null;
                    const showThreads = row.cpuMainThreadPercent != null || row.cpuOtherThreadsPercent != null;
                    return (
                      <div className="space-y-0.5">
                        <div>CPU {row.cpuProcessPercent == null ? "—" : `${String(row.cpuProcessPercent)}%`}</div>
                        {showSplit && <div>Your code {pct(row.cpuUserPercent)} · kernel {pct(row.cpuSystemPercent)}</div>}
                        {showThreads && <div>Main thread {pct(row.cpuMainThreadPercent)} · other threads {pct(row.cpuOtherThreadsPercent)}</div>}
                        {row.cpuMachinePercent != null && <div>Machine {pct(row.cpuMachinePercent)} (100% means all cores)</div>}
                        <div>GC pause {text(row.garbageCollectionPauseMs)} ms (max {text(row.garbageCollectionMaxPauseMs)} ms)</div>
                        <div>In-flight requests {text(row.inFlightMaxRequests)}</div>
                        {row.openFds != null && (
                          <div>File descriptors {String(row.openFds)}{row.openFdsLimit != null ? ` / ${String(row.openFdsLimit)}` : ""}</div>
                        )}
                      </div>
                    );
                  }}
                />
              <ProcessLineChart
                  title="Event loop"
                  info={
                    <ChartInfo label="Event loop">
                      <p>How long this process waited before it could run JavaScript. p50 is a typical wait in that sample, p99 the slow tail, and max the longest stall.</p>
                      <p>Samples are taken every 30 seconds. When a point covers more than one sample, p50 and p99 are the worst of those readings. They are not a percentile of the whole point.</p>
                    </ChartInfo>
                  }
                  rows={loopRows}
                  series={loopSeries}
                  onToggle={toggle}
                  axis="eventLoop"
                  height={height}
                  syncId="process"
                  selectionHot={hotSync === "process"}
                  onDetailHot={(hot) => setHotSync(hot ? "process" : null)}
                  restarts={restarts}
                  selection={chartSelection}
                  draft={draft}
                  onDraft={setDraft}
                  onPick={(from, to, at) => onPick("loop", from, to, at)}
                  detailButton={detailButtonFor("loop")}
                  onShowDetail={showDetail}
                  onDismissDetail={dismissCue}
                  tooltip={(row) => (
                    <div className="space-y-0.5">
                      <div>p50 {row.rawP50 == null ? "—" : `${row.rawP50} ms`}</div>
                      <div>p99 {row.rawP99 == null ? "—" : `${row.rawP99} ms`}</div>
                      <div>max {row.rawMax == null ? "—" : `${row.rawMax} ms`}</div>
                      {coarse && <div>This point keeps the worst 30 s reading in the group. It is not a real percentile.</div>}
                      {Number(row.intervalMs) !== 30000 && <div>window {Math.round(Number(row.intervalMs) / 1000)} s</div>}
                    </div>
                  )}
                />
              <ProcessLineChart
                  title="Memory of this process"
                  info={
                    <ChartInfo label="Memory">
                      <p>Heap is the memory V8 uses for JavaScript in this process. RSS is all the RAM this process holds. Neither is the memory of the machine.</p>
                      <p>Samples are taken every 30 seconds. When a point covers more than one sample, it shows the highest of those readings, not their average.</p>
                    </ChartInfo>
                  }
                  rows={ramRows}
                  series={ramSeries}
                  onToggle={toggle}
                  axis="memory"
                  height={height}
                  syncId="process"
                  selectionHot={hotSync === "process"}
                  onDetailHot={(hot) => setHotSync(hot ? "process" : null)}
                  restarts={restarts}
                  selection={chartSelection}
                  draft={draft}
                  onDraft={setDraft}
                  onPick={(from, to, at) => onPick("memory", from, to, at)}
                  detailButton={detailButtonFor("memory")}
                  onShowDetail={showDetail}
                  onDismissDetail={dismissCue}
                  tooltip={(row) => (
                    <div className="space-y-0.5">
                      <div>heap {row.heap == null ? "—" : `${row.heap} MB`}</div>
                      <div>RSS {row.rss == null ? "—" : `${row.rss} MB`}</div>
                      <div>Memory of this process.</div>
                    </div>
                  )}
                />
            </div>
          )}

          {routeOn && (tabPins.length > 0 || windows.length > 0 || chartBusy) && (
            <div ref={chartsRef} className="space-y-2">
                {pinBox && <div className="flex w-full min-w-0 justify-end">{pinBox}</div>}
                {chartBusy ? (
                  <ChartSpinner minHeight={logHeight + 140 + 8} />
                ) : windows.length > 0 ? (
                <>
                <ProcessLineChart
                    title="Latency"
                    info={
                      <ChartInfo label="Latency">
                        {viewTab === "pages" ? (
                          <p>This chart is only the server. It measures from when the request reaches the page handler until the HTML response is sent, including the server render. Nothing the browser does after that — download, scripts, or paint — is included. A cached page is skipped, because the server does not build it.</p>
                        ) : (
                          <p>How long an API request took to finish on this process.</p>
                        )}
                        <LatencyPercentiles unit={viewTab === "pages" ? "pages" : "requests"} />
                      </ChartInfo>
                    }
                    rows={trafficRows}
                    series={trafficSeries}
                    onToggle={toggle}
                    axis="latency"
                    latencyBounds={chart?.boundsMs}
                    height={logHeight}
                    syncId="traffic"
                    selectionHot={hotSync === "traffic"}
                    onDetailHot={(hot) => setHotSync(hot ? "traffic" : null)}
                    restarts={restarts}
                    selection={chartSelection}
                    draft={draft}
                    onDraft={setDraft}
                    onPick={(from, to, at) => onPick("latency", from, to, at)}
                    detailButton={detailButtonFor("latency")}
                    onShowDetail={showDetail}
                    onDismissDetail={dismissCue}
                    tooltip={(row) => {
                      const lat = row.raw as Traffic | null;
                      const hits = row.routeHits as Array<{ name: string; count: number; maxMs: number }>;
                      if (!lat || lat.count <= 0) {
                        return hits.length > 0
                          ? <div className="space-y-0.5">{hits.map((hit) => <div key={hit.name}>{hit.name}: {hit.count} calls · peak {formatMs(hit.maxMs, true)}</div>)}</div>
                          : <div>no calls</div>;
                      }
                      return (
                        <div className="space-y-0.5">
                          <div>{lat.count} calls</div>
                          <div>{missingPercentile("p50", lat.p50Ms, lat.count, P50_MIN)}</div>
                          <div>{missingPercentile("p95", lat.p95Ms, lat.count, P95_MIN)}</div>
                          <div>{missingPercentile("p99", lat.p99Ms, lat.count, P99_MIN)}</div>
                          <div>avg {formatMs(lat.avgMs, true)}</div>
                          <div>peak {formatMs(lat.maxMs, true)}</div>
                          {hits.map((hit) => <div key={hit.name}>{hit.name}: {hit.count} calls, peak {formatMs(hit.maxMs, true)}</div>)}
                          {row.intervalMs !== 30000 && <div>window {Math.round(Number(row.intervalMs) / 1000)} s</div>}
                        </div>
                      );
                    }}
                  />
                  <ProcessLineChart
                    title="Calls"
                    info={
                      <ChartInfo label="Calls">
                        {viewTab === "pages" ? (
                          <p>How many page responses this server finished building in each point. A cached page is not counted. When a point groups several 30-second samples, the count is the sum of those samples.</p>
                        ) : (
                          <p>How many API requests finished in each point. When a point groups several 30-second samples, the count is the sum of those samples, not the busiest one.</p>
                        )}
                      </ChartInfo>
                    }
                    rows={trafficRows}
                    series={countSeries}
                    onToggle={toggle}
                    axis="count"
                    height={140}
                    syncId="traffic"
                    selectionHot={hotSync === "traffic"}
                    onDetailHot={(hot) => setHotSync(hot ? "traffic" : null)}
                    restarts={restarts}
                    selection={chartSelection}
                    draft={draft}
                    onDraft={setDraft}
                    onPick={(from, to, at) => onPick("calls", from, to, at)}
                    detailButton={detailButtonFor("calls")}
                    onShowDetail={showDetail}
                    onDismissDetail={dismissCue}
                    tooltip={(row) => {
                      const hits = row.routeHits as Array<{ name: string; count: number }>;
                      const total = row.count == null ? "no calls" : `${row.count} calls`;
                      if (hits.length === 0) return <div>{total}</div>;
                      return (
                        <div className="space-y-0.5">
                          <div>{total}</div>
                          {hits.map((hit) => <div key={hit.name}>{hit.name}: {hit.count} calls</div>)}
                        </div>
                      );
                    }}
                  />
                  {pageGaps && (
                    <p className="text-xs text-muted-foreground">
                      Few calls per window; try a wider range to see p50 and p95.
                    </p>
                  )}
                </>
                ) : null}
            </div>
          )}

          <p className="text-xs text-muted-foreground">Click a point for its detail · drag to choose a span</p>
        </div>
      </div>

      {(wantDetail || (detailFrom != null && detailTo != null)) && (
        <div ref={detailRef} className="rounded-lg border bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Details <span className="font-semibold text-muted-foreground">({detailRange})</span>
            </h2>
            <div className="flex shrink-0 items-center gap-1.5">
              {windowBadge && (
                <div className="flex items-center gap-0.5">
                  <Badge variant="secondary" className="shrink-0 gap-1 rounded-full font-normal">
                    <Clock className="size-3.5" />
                    {windowBadge.label}
                  </Badge>
                  <ChartInfo label="Window size">
                    <p>{badgeCopy?.lead}</p>
                    <p>{badgeCopy?.detail}</p>
                  </ChartInfo>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={!reportReady}
                title="Download the full detail for this range as Markdown"
                aria-label="Download detail report"
                data-testid="button-download-performance-detail"
                onClick={downloadDetailReport}
              >
                <Download className="size-3.5" />
                Download
              </Button>
            </div>
          </div>
          <DetailBlock
          loading={detailQuery.isLoading}
          error={detailQuery.isError}
          detail={detail}
          routes={routes}
          showKind={viewTab === "process"}
          showSsr={viewTab === "pages" || (viewTab === "process" && routes.some((row) => row.kind === "pages"))}
          duration={duration}
          bounds={detail?.boundsMs ?? []}
          callTotal={callTotal}
          slowPct={slowPct}
          statusCounts={statusTotals.acc}
          ssrLine={countLine(statusTotals.ssr, SSR_LABELS)}
          showSpan={wantDetail}
          showTraffic={viewTab !== "process"}
          folded={detailFolded}
          onToggleFold={(id) => setDetailFolded((prev) => ({ ...prev, [id]: !prev[id] }))}
          pins={pins}
          onPinRoute={(row) => {
            const method = row.kind === "api" ? row.method : null;
            const next = { kind: row.kind, method, route: row.route };
            const list = pins[row.kind];
            const exists = list.some((pin) => samePin(pin, next));
            if (!exists && list.length >= MAX_PINS) return;
            if (!exists && list.length === 0) {
              scrollToCharts.current = true;
              setPinScroll((n) => n + 1);
            }
            setPins((prev) => {
              const stamped = prev[row.kind].map((pin, index, list) =>
                pin.colorIndex != null ? pin : { ...pin, colorIndex: list.length - 1 - index },
              );
              return {
                ...prev,
                [row.kind]: exists
                  ? stamped.filter((pin) => !samePin(pin, next))
                  : [{ ...next, shown: false, excluded: false, colorIndex: nextPinColor(stamped) }, ...stamped],
              };
            });
            if (viewTab !== row.kind) write({ tab: row.kind });
          }}
          openRows={openRows}
        />
        {detail && ((detail.cpuStacks?.length ?? 0) > 0 || (parsed.process === "web" && detail.cpuCapture?.mode === "service")) && (
          <CpuStackList
            stacks={detail.cpuStacks ?? []}
            capture={parsed.process === "web" ? detail.cpuCapture : undefined}
          />
        )}
        </div>
      )}
    </div>
  );
}

function DetailCardTitle({
  title,
  folded,
  onToggle,
}: {
  title: string;
  folded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <CardTitle className="text-base">{title}</CardTitle>
      <button
        type="button"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-expanded={!folded}
        aria-label={folded ? `Show ${title}` : `Hide ${title}`}
        onClick={onToggle}
      >
        {folded ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
    </div>
  );
}

function DetailBlock({
  loading,
  error,
  detail,
  routes,
  showKind,
  showSsr,
  duration,
  bounds,
  callTotal,
  slowPct,
  statusCounts,
  ssrLine,
  showSpan,
  showTraffic,
  folded,
  onToggleFold,
  pins,
  onPinRoute,
  openRows,
}: {
  loading: boolean;
  error: boolean;
  detail: DetailResponse | undefined;
  routes: DetailRoute[];
  showKind: boolean;
  showSsr: boolean;
  duration: number[];
  bounds: number[];
  callTotal: number;
  slowPct: number;
  statusCounts: Record<string, number>;
  ssrLine: string;
  showSpan: boolean;
  showTraffic: boolean;
  folded: Record<string, boolean>;
  onToggleFold: (id: string) => void;
  pins: { api: ChartPin[]; pages: ChartPin[] };
  onPinRoute: (row: { kind: "api" | "pages"; method: string; route: string }) => void;
  openRows: Array<{ timestamp: number; method: string; route: string; count: number; maxMs: number }>;
}) {
  const [routesOpen, setRoutesOpen] = useState(false);
  const pinOf = (row: { kind: "api" | "pages"; method: string; route: string }) => {
    const method = row.kind === "api" ? row.method : null;
    return pins[row.kind].some((pin) => samePin(pin, { kind: row.kind, method, route: row.route }));
  };
  const pinLocked = (row: { kind: "api" | "pages" }) => pins[row.kind].length >= MAX_PINS;
  const pinnedPastFold = routes.some((row, index) => index >= 10 && pinOf(row));
  useEffect(() => {
    if (pinnedPastFold) setRoutesOpen(true);
  }, [pinnedPastFold]);
  const visibleRoutes = routesOpen ? routes : routes.slice(0, 10);
  const hiddenRoutes = routes.length - visibleRoutes.length;
  if (loading) {
    return (
      <div className="min-h-80 space-y-3" aria-busy="true">
        <p className="text-sm text-muted-foreground">Loading detail…</p>
        <div className="h-24 rounded-md bg-muted" />
        <div className="h-40 rounded-md bg-muted" />
      </div>
    );
  }
  if (error || !detail) return <p className="text-sm text-destructive">Could not read the detail.</p>;
  const maxBar = Math.max(1, ...duration);
  return (
    <div className="space-y-4">
      {showSpan && showTraffic && !detail.mixedBounds && duration.some((n) => n > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <DetailCardTitle title="Calls by duration" folded={!!folded.duration} onToggle={() => onToggleFold("duration")} />
            {!folded.duration && (
            <p className="mt-1 text-xs text-muted-foreground">
              Count of every call in this span, grouped by response duration.
            </p>
            )}
          </CardHeader>
          {!folded.duration && (
          <CardContent className="space-y-3">
            <div className="flex h-24 items-end gap-1">
              {duration.map((n, i) => (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  {n > 0 && <span className="text-[10px] tabular-nums">{n}</span>}
                  <div
                    className={cn("w-full rounded-sm", durationBarClass(i, bounds))}
                    style={{ height: n > 0 ? `${Math.max(8, (n / maxBar) * 100)}%` : 0 }}
                  />
                  <span className="text-center text-[10px] leading-tight text-muted-foreground">
                    {bucketLabel(i, bounds)}
                    <span className="block">ms</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full">{callTotal} total calls</Badge>
              <Badge className={cn("rounded-full", slowShareClass(slowPct))}>{slowPct}% at 500 ms or more</Badge>
            </div>
          </CardContent>
          )}
        </Card>
      )}

      {showSpan && routes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <DetailCardTitle title="Routes Count" folded={!!folded.routes} onToggle={() => onToggleFold("routes")} />
            {!folded.routes && (
            <>
            <p className="mt-1 text-xs text-muted-foreground">
              Each row is one route. Calls is how many times it finished in this span, not how many started then. {routes.some((row) => row.kind === "api") && "The MCP and OAuth proxy is left out because this process only holds those connections open and forwards them; they stay open for minutes and would pin the peak, while the work itself already shows up as the /api calls made back here. "}Avg time is the average of those finishes, and Peak time is the slowest one. Rows are ordered by that peak, highest first. The top row is the slowest peak, not necessarily the cause. Pin a route to show or exclude it on the charts.
            </p>
            {showSsr && (
            <p className="mt-1 text-xs text-muted-foreground">
              Render is how this server produced the HTML. Rendered: the page was built on the server. Client only: the browser got an empty page and built it itself. Empty #root: the server tried to render and the body came back empty, so the browser built it. Render error: rendering failed and the browser built it. ssr_skipped_non_200: the response was not a success, usually a 404, so the server skipped rendering.
            </p>
            )}
            </>
            )}
          </CardHeader>
          {!folded.routes && (
          <CardContent className="space-y-3">
          {showTraffic && statusEntries(statusCounts).length > 0 && (
            <StatusCountBadges counts={statusCounts} />
          )}
          {showTraffic && ssrLine && (
            <p className="text-xs text-muted-foreground">{ssrLine}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {showKind && <TableHead className="h-8 px-3">Kind</TableHead>}
                <TableHead className="h-8 px-3">Method</TableHead>
                <TableHead className="h-8 px-3">Route</TableHead>
                <TableHead className="h-8 px-3 text-right">Calls</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-3 text-right">Avg time</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-3 text-right">Peak time</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-3">Successful / Failed</TableHead>
                <TableHead className="h-8 whitespace-nowrap px-3">Status count</TableHead>
                {showSsr && <TableHead className="h-8 px-3">Render</TableHead>}
                <TableHead className="h-8 px-3"><span className="sr-only">Pin</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRoutes.map((row) => {
                const picked = pinOf(row);
                const locked = !picked && pinLocked(row);
                return (
                  <TableRow
                    key={`${row.kind}-${row.method}-${row.route}`}
                    className={cn(picked && "bg-muted")}
                  >
                    {showKind && <TableCell className="px-3 py-2.5">{row.kind === "pages" ? "page" : "API"}</TableCell>}
                    <TableCell className="px-3 py-2.5">{row.method}</TableCell>
                    <TableCell className="px-3 py-2.5">
                      <div>{row.route}</div>
                      {row.path && <div className="text-xs text-muted-foreground">{row.path}</div>}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.avgMs} ms</TableCell>
                    <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.maxMs} ms</TableCell>
                    <TableCell className="px-3 py-2.5">
                      <StatusShare counts={row.statusCounts} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <StatusCounts counts={row.statusCounts} />
                    </TableCell>
                    {showSsr && <TableCell className="px-3 py-2.5 text-xs">{countLine(row.ssrCounts, SSR_LABELS) || "—"}</TableCell>}
                    <TableCell className="px-3 py-2.5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-pressed={picked}
                        disabled={locked}
                        aria-label={picked ? `Unpin ${row.route}` : `Pin ${row.route} to the charts`}
                        title={locked ? "6 routes are already pinned" : picked ? "Unpin" : "Pin to the charts"}
                        onClick={() => onPinRoute(row)}
                      >
                        <Pin
                          className="!size-[22px]"
                          style={picked ? { color: COLOR.c5 } : undefined}
                          fill={picked ? "currentColor" : "none"}
                        />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(hiddenRoutes > 0 || (routesOpen && routes.length > 10)) && (
            <div className="flex justify-center">
              {hiddenRoutes > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setRoutesOpen(true)}>
                  See more ({hiddenRoutes})
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setRoutesOpen(false)}>
                  See less
                </Button>
              )}
            </div>
          )}
          </CardContent>
          )}
        </Card>
      )}

      {showSpan && openRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <DetailCardTitle title="Requests still running" folded={!!folded.running} onToggle={() => onToggleFold("running")} />
            {!folded.running && (
            <p className="mt-1 text-xs text-muted-foreground">
              Requests still open when this span ended, and already running for 500 ms or more. Earlier points in the span are not listed, and a request open for less than 500 ms is not listed either. They are missing from Routes Count for this span until they finish: that table only lists calls that finished in the span. Open calls is how many were still open. Running for (peak) is how long the slowest of them had already been going.
            </p>
            )}
          </CardHeader>
          {!folded.running && (
          <CardContent className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 px-3">Method</TableHead>
                  <TableHead className="h-8 px-3">Route</TableHead>
                  <TableHead className="h-8 whitespace-nowrap px-3 text-right">Open calls</TableHead>
                  <TableHead className="h-8 whitespace-nowrap px-3 text-right">Running for (peak)</TableHead>
                  <TableHead className="h-8 px-3"><span className="sr-only">Pin</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openRows.map((row) => {
                  const kind = row.route === "/health" || row.route.startsWith("/api") ? "api" : "pages";
                  const picked = pinOf({ kind, method: row.method, route: row.route });
                  const locked = !picked && pinLocked({ kind });
                  return (
                    <TableRow key={`${row.method}-${row.route}`} className={cn(picked && "bg-muted")}>
                      <TableCell className="px-3 py-2.5">{row.method}</TableCell>
                      <TableCell className="px-3 py-2.5">{row.route}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.count}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.maxMs} ms</TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-pressed={picked}
                          disabled={locked}
                          aria-label={picked ? `Unpin ${row.route}` : `Pin ${row.route} to the charts`}
                          title={locked ? "6 routes are already pinned" : picked ? "Unpin" : "Pin to the charts"}
                          onClick={() => onPinRoute({ kind, method: row.method, route: row.route })}
                        >
                          <Pin
                            className="!size-[22px]"
                            style={picked ? { color: COLOR.c5 } : undefined}
                            fill={picked ? "currentColor" : "none"}
                          />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          )}
        </Card>
      )}

      <Card>
          <CardHeader className="pb-3">
            <DetailCardTitle title="Error and warning logs" folded={!!folded.logs} onToggle={() => onToggleFold("logs")} />
            {!folded.logs && (
            <p className="mt-1 text-xs text-muted-foreground">
              Errors and warnings that happened in this span, across every process. The log only keeps 48 h. Same message shape is collapsed. Errors come first, then by count, unless you sort by Count or Last seen (click again to flip, a third time to reset). Last seen is the most recent occurrence.
            </p>
            )}
          </CardHeader>
          {!folded.logs && (
          <CardContent className="space-y-3">
          {detail.logsCoverage === "none" && (
            <p className="text-sm text-muted-foreground">No data before {formatClock(detail.endingAt)}.</p>
          )}
          {detail.logsCoverage === "partial" && detail.logsSince != null && (
            <p className="text-sm text-muted-foreground">No data before {formatClock(detail.logsSince)}.</p>
          )}
          <ErrorLogIssueTable bare issues={detail.logs ?? []} />
          {(detail.logs ?? []).length === 0 && detail.logsCoverage !== "none" && (
            <p className="text-sm text-muted-foreground">No logs in this span.</p>
          )}
          </CardContent>
          )}
        </Card>
    </div>
  );
}

type CpuProfileFrame = {
  percent: number;
  function: string;
  file: string;
  kind: "js" | "native" | "kernel";
  callers?: Array<{ function: string; file: string }>;
  /** Older recordings stored a single parent. */
  caller?: { function: string; file: string };
};

type CpuProfileCapture =
  | { timestamp: number; processName: string; ok: true; threads: Array<{ name: string; percent: number; frames: CpuProfileFrame[] }> }
  | { timestamp: number; processName: string; ok: false; error: string };

function callChain(frame: CpuProfileFrame): Array<{ function: string; file: string }> {
  if (frame.callers && frame.callers.length > 0) return frame.callers;
  if (frame.caller) return [frame.caller];
  return [];
}

function kindLabel(kind: CpuProfileFrame["kind"]): string {
  if (kind === "js") return "JavaScript";
  if (kind === "kernel") return "Kernel";
  return "Native";
}

function ArrowFnMark({ kind }: { kind: CpuProfileFrame["kind"] }) {
  const label = kind === "js" ? "JavaScript" : kind === "kernel" ? "Kernel" : "Native";
  return (
    <span className="shrink-0 font-mono text-sm font-medium leading-none" title={label} aria-label={label}>
      <span className="text-red-600 dark:text-red-400">(</span>
      <span className="text-red-600 dark:text-red-400">)</span>
      <span className="text-sky-600 dark:text-sky-400">{" => "}</span>
      <span className="text-amber-600 dark:text-amber-400">{"{"}</span>
      <span className="text-amber-600 dark:text-amber-400">{"}"}</span>
    </span>
  );
}

const VISIBLE_STACK_FRAMES = 6;

function CpuStackList({
  stacks,
  capture,
}: {
  stacks: CpuProfileCapture[];
  capture?: DetailResponse["cpuCapture"];
}) {
  const [folded, setFolded] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [listOpen, setListOpen] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [openFrame, setOpenFrame] = useState<string | null>(null);
  const [framesOpen, setFramesOpen] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const visible = listOpen ? stacks : stacks.slice(0, 3);
  const hidden = stacks.length - visible.length;
  const inactive = capture?.mode === "service" && capture.active === false;
  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <DetailCardTitle title="CPU stacks" folded={folded} onToggle={() => setFolded((value) => !value)} />
        {inactive && (
          <p className="mt-1 text-sm text-destructive">
            Capture inactive. The recorder has not checked in for 2 minutes, so an empty list does not mean the CPU stayed under 120%.
          </p>
        )}
        {!folded && capture?.notice && (
          <p className="mt-1 text-sm text-muted-foreground">{capture.notice}</p>
        )}
        {!folded && capture?.lastError && (
          <p className="mt-1 text-sm text-destructive">Last recording failed: {capture.lastError}</p>
        )}
        {!folded && (
          <p className="mt-1 text-xs text-muted-foreground">
            {`This list is a 20-second look at the threads of this process that were using the CPU, taken the first time this process went above 120% of one core.${capture?.mode === "service" ? " On the server, a separate recorder takes that sample. This page only stores the result." : ""} The threads are only this process: the main thread, worker threads, and Node's helper threads. Other processes on the machine are not included. Each function is classified as JavaScript, Native, or Kernel. JavaScript means a function from this project. Native means compiled code that is not JavaScript, such as Node, V8, or a library. Kernel means the operating system. A name map turns addresses into JavaScript function names. Names on screen leave out compiler marks and C++ argument types. Copy full stack keeps that text. One recording is saved per streak above 120%, and the list is kept for 7 days.`}
          </p>
        )}
      </CardHeader>
      {!folded && (
      <CardContent className="space-y-4">
      {stacks.length === 0 && (
        <p className="text-sm text-muted-foreground">No recording in this range.</p>
      )}
      <div>
        {visible.map((stack) => {
          const open = !collapsed.has(stack.timestamp);
          return (
            <div key={stack.timestamp} className="border-b last:border-b-0">
              <div className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-lg font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(stack.timestamp)) next.delete(stack.timestamp);
                    else next.add(stack.timestamp);
                    return next;
                  })}
                >
                  {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                  <span>{formatClock(stack.timestamp, true)}</span>
                  {!stack.ok && <span className="text-destructive">Recording failed</span>}
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(formatCpuStackRaw(stack)).then(() => {
                      setCopiedId(stack.timestamp);
                      window.setTimeout(() => setCopiedId((current) => current === stack.timestamp ? null : current), 2000);
                    });
                  }}
                >
                  {copiedId === stack.timestamp ? <Check className="size-3.5" /> : null}
                  {copiedId === stack.timestamp ? "Copied" : "Copy full stack"}
                </Button>
              </div>
              {open && (
                <div className="pb-3 pl-4 pr-1 text-sm">
                  {!stack.ok ? (
                    <p className="text-destructive">{stack.error}</p>
                  ) : stack.threads.length === 0 ? (
                    <p className="text-muted-foreground">No samples in this recording.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 w-8 px-3" aria-label="Expand" />
                          <TableHead className="h-8 px-3">Thread</TableHead>
                          <TableHead className="h-8 whitespace-nowrap px-3 text-right" title="Percent of samples in this 20-second recording">Execution %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                      {stack.threads.map((thread) => {
                    const threadKey = `${stack.timestamp}:${thread.name}`;
                    const threadOpen = openThread === threadKey;
                    const shownFrames = framesOpen.has(threadKey) ? thread.frames : thread.frames.slice(0, VISIBLE_STACK_FRAMES);
                    const hiddenFrames = thread.frames.length - VISIBLE_STACK_FRAMES;
                    const coverage = cpuThreadCoverage(thread.percent, thread.frames.map((frame) => frame.percent));
                    return (
                      <Fragment key={thread.name}>
                        <TableRow
                          className="cursor-pointer"
                          aria-expanded={threadOpen}
                          onClick={() => setOpenThread(threadOpen ? null : threadKey)}
                        >
                          <TableCell className="px-3 py-2.5">
                            <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", threadOpen && "rotate-90")} />
                          </TableCell>
                          <TableCell className="px-3 py-2.5 font-medium">{thread.name}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right tabular-nums">{thread.percent}%</TableCell>
                        </TableRow>
                        {threadOpen && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={3} className="bg-neutral-50 p-0 dark:bg-neutral-800/30">
                          <div className="bg-neutral-50 p-4 dark:bg-neutral-800/30">
                          <ul className="overflow-hidden rounded-md border bg-card">
                            <li className="flex items-center gap-2 bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
                              <span className="size-4 shrink-0" aria-hidden />
                              <span className="min-w-0 flex-1">Function</span>
                              <span className="w-24 shrink-0" title="JavaScript, native code, or the kernel">Kind</span>
                              <span className="w-36 shrink-0 text-right" title="Percent of samples in this 20-second recording where this function was running">Execution %</span>
                            </li>
                            {shownFrames.map((frame, index) => {
                              const frameKey = `${threadKey}:${index}`;
                              const frameOpen = openFrame === frameKey;
                              const label = labelCpuSymbol(frame.function, frame.file, frame.kind);
                              return (
                                <li key={frameKey}>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-100/70 dark:hover:bg-neutral-800/70"
                                    aria-expanded={frameOpen}
                                    onClick={() => setOpenFrame(frameOpen ? null : frameKey)}
                                  >
                                    <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", frameOpen && "rotate-90")} />
                                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                      <span className="truncate">{label.name}</span>
                                      <ArrowFnMark kind={frame.kind} />
                                    </span>
                                    <span className="w-24 shrink-0 text-xs">{kindLabel(frame.kind)}</span>
                                    <span className="w-36 shrink-0 text-right tabular-nums">{frame.percent}%</span>
                                  </button>
                                  {frameOpen && (
                                    <div className="space-y-2.5 py-2 pl-10 pr-3 text-xs text-muted-foreground">
                                      {label.path && (
                                        <div className="flex items-center gap-1.5 text-foreground">
                                          <File className="size-3.5 shrink-0" aria-hidden />
                                          <span className="min-w-0 break-all">{label.path}</span>
                                        </div>
                                      )}
                                      {callChain(frame).map((step, stepIndex) => {
                                        const caller = labelCpuSymbol(step.function, step.file, step.function.startsWith("JS:") ? "js" : "native");
                                        return (
                                          <div key={`${step.function}-${step.file}-${stepIndex}`} className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: stepIndex * 12 }}>
                                            <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
                                            <span className="shrink-0">{caller.name}</span>
                                            {caller.path && <File className="size-3.5 shrink-0" aria-hidden />}
                                            {caller.path && <span className="min-w-0 truncate">{caller.path}</span>}
                                          </div>
                                        );
                                      })}
                                      <div>Up to 3 closest calls above. Only the first Node entry to the function is listed.</div>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                            {hiddenFrames > 0 && (
                              <li className="flex justify-center px-3 py-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setFramesOpen((current) => {
                                    const next = new Set(current);
                                    if (next.has(threadKey)) next.delete(threadKey);
                                    else next.add(threadKey);
                                    return next;
                                  })}
                                >
                                  {framesOpen.has(threadKey) ? "See less" : `See more (${hiddenFrames})`}
                                </Button>
                              </li>
                            )}
                            {coverage != null && (
                              <li className="px-3 py-1.5 text-xs text-muted-foreground">
                                Listed functions cover {coverage}% of this thread.
                              </li>
                            )}
                          </ul>
                          </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(hidden > 0 || (listOpen && stacks.length > 3)) && (
        <div className="flex justify-center">
          {hidden > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setListOpen(true)}>
              See more ({hidden})
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setListOpen(false)}>
              See less
            </Button>
          )}
        </div>
      )}
      </CardContent>
      )}
    </Card>
  );
}
