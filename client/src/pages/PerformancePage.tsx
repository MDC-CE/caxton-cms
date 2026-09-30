import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Braces, Check, ChevronDown, Clock, Cpu, FileText, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricsAccessGate } from "@/components/MetricsAccessGate";
import { ServerSectionHeader } from "@/components/process-stats/ServerSectionHeader";
import { ProcessLineChart, type ChartSeries } from "@/components/process-stats/ProcessLineChart";
import { ErrorLogIssueTable, type UniqueIssue } from "@/pages/ErrorLogPage";
import { apiFetch } from "@/lib/queryClient";
import {
  PROCESS_NAMES,
  RANGE_PRESETS,
  chartBounds,
  parsePerformanceSearch,
  serializePerformanceSearch,
  type PerformanceView,
  type PerfSection,
  type ProcessName,
  type RangePreset,
} from "@/lib/server-performance-url";

const P50_MIN = 5;
const P95_MIN = 20;
const P99_MIN = 100;

const COLOR = {
  c1: "hsl(var(--chart-1))",
  c2: "hsl(var(--chart-2))",
  c3: "hsl(var(--chart-3))",
  c4: "hsl(var(--chart-4))",
};

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

type ChartResponse = {
  startingAt: number;
  endingAt: number;
  stepMs: number;
  boundsMs: number[];
  restarts?: Array<{ timestamp: number }>;
  windows: StatsWindow[];
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

function formatClock(ts: number): string {
  return new Date(ts).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

function emptyWindow(timestamp: number, stepMs: number): StatsWindow {
  return {
    timestamp,
    intervalMs: stepMs,
    cpuProcessPercent: null,
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
  const [section, setSection] = useState<PerfSection>(parsed.section);
  const [legendOn, setLegendOn] = useState<Record<string, boolean>>({
    cpu: true,
    elP50: false,
    elP99: false,
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
    setSection(next.section);
  }, [search]);

  const write = useCallback((patch: Partial<PerformanceView>) => {
    const next: PerformanceView = { ...parsed, tab, section, ...patch };
    if (next.process !== "web") next.tab = "process";
    if (next.tab !== tab) setTab(next.tab);
    if (next.section !== section) setSection(next.section);
    const qs = serializePerformanceSearch(next, search);
    const pathOnly = pathname.split("?")[0];
    const href = qs ? `${pathOnly}?${qs}` : pathOnly;
    seenSearch.current = qs;
    setLocation(href, { replace: true });
  }, [parsed, tab, section, search, pathname, setLocation]);

  const viewTab = parsed.process === "web" ? tab : "process";
  const chartView = viewTab === "traffic" ? (section === "pages" ? "pages" : "api") : "process";
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

  const chartQuery = useQuery({
    queryKey: [
      "process-stats",
      parsed.process,
      chartZoomed ? parsed.zoomFrom : parsed.range,
      chartZoomed ? parsed.zoomTo : "preset",
    ],
    queryFn: async () => {
      const bounds = chartBounds(parsed, Date.now());
      const params = new URLSearchParams({
        process: parsed.process,
        starting_at: String(bounds.from),
        ending_at: String(bounds.to),
      });
      const res = await apiFetch(`/api/admin/process-stats?${params}`);
      if (!res.ok) throw new Error("Could not read statistics");
      return (await res.json()) as ChartResponse;
    },
  });

  const chart = chartQuery.data;
  stepRef.current = chart?.stepMs ?? 30_000;
  const bucketClick = selected
    && stepRef.current > 30_000
    && parsed.endingAt! - parsed.startingAt! === stepRef.current - 1;
  const isRange = selected && parsed.startingAt! < parsed.endingAt! && !bucketClick;
  const chartSelection = selectionIsZoom
    ? null
    : bucketClick
      ? { from: parsed.startingAt!, to: parsed.startingAt! }
      : selection;
  const detailFrom = selected ? parsed.startingAt : chart?.startingAt;
  const detailTo = selected ? parsed.endingAt : chart?.endingAt;
  const wantDetail = viewTab === "traffic" || selected;

  const detailQuery = useQuery({
    queryKey: ["process-stats-detail", parsed.process, detailFrom, detailTo, selected],
    enabled: wantDetail && detailFrom != null && detailTo != null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        process: parsed.process,
        starting_at: String(detailFrom),
        ending_at: String(detailTo),
      });
      if (selected) params.set("logs", "1");
      const res = await apiFetch(`/api/admin/process-stats/detail?${params}`);
      if (!res.ok) throw new Error("Could not read the detail");
      return (await res.json()) as DetailResponse;
    },
  });

  const windows = useMemo(() => insertGaps(chart?.windows ?? [], chart?.stepMs ?? 0), [chart]);
  const openRows = useMemo(() => {
    const source = selection
      ? windows.filter((row) => row.timestamp >= selection.from && row.timestamp <= selection.to)
      : windows;
    const rows: Array<{ timestamp: number; method: string; route: string; count: number; maxMs: number }> = [];
    for (const row of source) {
      for (const call of row.openCalls ?? []) {
        rows.push({ timestamp: row.timestamp, ...call });
      }
    }
    return rows.sort((a, b) => b.maxMs - a.maxMs || b.timestamp - a.timestamp);
  }, [windows, selection]);
  const restarts = useMemo(
    () => (chart?.restarts ?? [])
      .map((item) => snapRestart(item.timestamp, chart?.stepMs ?? 0, windows))
      .filter((ts): ts is number => ts != null),
    [chart, windows],
  );
  const coarse = (chart?.stepMs ?? 0) > 30_000;
  const height = 180;
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
  const trafficSeries: ChartSeries[] = [
    { key: "p50", label: "p50", color: COLOR.c1, on: legendOn.p50 },
    { key: "p95", label: "p95", color: COLOR.c2, on: legendOn.p95 },
    { key: "p99", label: "p99", color: COLOR.c3, on: legendOn.p99 },
    { key: "max", label: "peak", color: COLOR.c4, on: legendOn.max, filled: true },
  ];
  const countSeries: ChartSeries[] = [
    { key: "count", label: "Calls", color: COLOR.c1, on: legendOn.calls },
  ];

  const cpuRows = windows.map((row) => ({ ...row, cpu: row.cpuProcessPercent }));
  const loopRows = windows.map((row) => ({
    timestamp: row.timestamp,
    intervalMs: row.intervalMs,
    elP50: plotMs(row.eventLoop?.p50Ms ?? null, null),
    elP99: plotMs(row.eventLoop?.p99Ms ?? null, null),
    elMax: plotMs(row.eventLoop?.maxMs ?? null, null),
    rawP50: row.eventLoop?.p50Ms ?? null,
    rawP99: row.eventLoop?.p99Ms ?? null,
    rawMax: row.eventLoop?.maxMs ?? null,
  }));
  const ramRows = windows.map((row) => ({
    timestamp: row.timestamp,
    heap: row.heapUsedMb,
    rss: row.rssMb,
  }));

  const trafficKey = section === "pages" ? "pages" : "api";
  const latencyFloor = chart?.boundsMs?.[0] ?? 50;
  const trafficRows = windows.map((row) => {
    const lat = row[trafficKey];
    return {
      timestamp: row.timestamp,
      intervalMs: row.intervalMs,
      count: lat?.count ?? null,
      p50: plotMs(lat?.p50Ms ?? null, latencyFloor),
      p95: plotMs(lat?.p95Ms ?? null, latencyFloor),
      p99: plotMs(lat?.p99Ms ?? null, latencyFloor),
      max: lat ? plotMs(lat.maxMs, latencyFloor) : null,
      raw: lat,
    };
  });

  const pageGaps = section === "pages" && windows.length > 0
    && windows.filter((row) => row.pages == null || row.pages.p50Ms == null).length >= windows.length / 2;

  const detail = detailQuery.data;
  const routeKind = viewTab === "traffic" ? (section === "pages" ? "pages" : "api") : null;
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

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto" data-testid="page-performance">
      <ServerSectionHeader
        section="performance"
        title="Logs and performance"
        description="Performance is for this process, not for a site."
      />

      <div className="flex items-center gap-2">
        <ToggleButtonBar
          className="min-w-0 flex-1"
          listClassName="flex w-full bg-transparent"
          value={parsed.process}
          onValueChange={(value) => write({ process: value as ProcessName, startingAt: null, endingAt: null, zoomed: false })}
        >
          {PROCESS_NAMES.map((name) => (
            <ToggleButtonBarTrigger key={name} value={name} className="flex-1" data-testid={`process-${name}`}>{name}</ToggleButtonBarTrigger>
          ))}
        </ToggleButtonBar>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={chartZoomed ? false : !isRange}
            onClick={() => {
              setCue(null);
              if (chartZoomed) write({ zoomed: false, zoomFrom: null, zoomTo: null });
              else write({ zoomed: true, zoomFrom: parsed.startingAt, zoomTo: parsed.endingAt });
            }}
            data-testid="button-zoom-selection"
          >
            {chartZoomed ? <ZoomOut /> : <ZoomIn />}
            {chartZoomed ? "Zoom out" : "Zoom in"}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" data-testid="button-range">
                <Clock />
                {rangeLabel}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {RANGE_PRESETS.map((preset) => {
                const active = !chartZoomed && parsed.range === preset;
                return (
                  <DropdownMenuItem
                    key={preset}
                    data-testid={`range-${preset}`}
                    onSelect={() => write({ range: preset, startingAt: null, endingAt: null, zoomed: false })}
                  >
                    <Check className={cn("h-4 w-4", active ? "opacity-100" : "opacity-0")} />
                    {RANGE_LABEL[preset]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
                  onClick={() => {
                    if (mode.value === "api") write({ tab: "traffic", section: "api" });
                    else if (mode.value === "pages") write({ tab: "traffic", section: "pages" });
                    else write({ tab: "process" });
                  }}
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
          {chartQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {chart && windows.length === 0 && <p className="text-sm text-muted-foreground">No data in this range.</p>}

          {viewTab === "process" && windows.length > 0 && (
            <div className="space-y-3">
              <ProcessLineChart
                  title="CPU"
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
                    return (
                      <div className="space-y-0.5">
                        <div>CPU {row.cpuProcessPercent == null ? "—" : `${String(row.cpuProcessPercent)}%`}</div>
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

          {viewTab === "traffic" && windows.length > 0 && (
            <div className="space-y-2">
                <ProcessLineChart
                    title="Latency"
                    rows={trafficRows}
                    series={trafficSeries}
                    onToggle={toggle}
                    axis="latency"
                    latencyBounds={chart?.boundsMs}
                    height={220}
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
                      if (!lat || lat.count <= 0) return <div>no calls</div>;
                      return (
                        <div className="space-y-0.5">
                          <div>{lat.count} calls</div>
                          <div>{missingPercentile("p50", lat.p50Ms, lat.count, P50_MIN)}</div>
                          <div>{missingPercentile("p95", lat.p95Ms, lat.count, P95_MIN)}</div>
                          <div>{missingPercentile("p99", lat.p99Ms, lat.count, P99_MIN)}</div>
                          <div>avg {formatMs(lat.avgMs, true)}</div>
                          <div>peak {formatMs(lat.maxMs, true)}</div>
                          {row.intervalMs !== 30000 && <div>window {Math.round(Number(row.intervalMs) / 1000)} s</div>}
                        </div>
                      );
                    }}
                  />
                  <ProcessLineChart
                    title="Calls"
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
                    tooltip={(row) => (
                      <div>{row.count == null ? "no calls" : `${row.count} calls`}</div>
                    )}
                  />
                  {pageGaps && (
                    <p className="text-xs text-muted-foreground">
                      Few calls per window; try a wider range to see p50 and p95.
                    </p>
                  )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">Click a point for its detail · drag to choose a span</p>
        </div>
      </div>

      {wantDetail && (
        <div ref={detailRef}>
          {selected && (
            <h2 className="mb-3 text-sm font-medium">
              Detail
            </h2>
          )}
          <DetailBlock
          loading={detailQuery.isLoading}
          error={detailQuery.isError}
          detail={detail}
          routes={routes}
          showKind={viewTab === "process"}
          showSsr={viewTab === "traffic" ? section === "pages" : routes.some((row) => row.kind === "pages")}
          duration={duration}
          bounds={detail?.boundsMs ?? []}
          callTotal={callTotal}
          slowPct={slowPct}
          statusLine={countLine(statusTotals.acc)}
          ssrLine={countLine(statusTotals.ssr, SSR_LABELS)}
          showLogs={selected}
          showTraffic={viewTab === "traffic"}
          openRows={openRows}
          showOpenTimes={new Set(openRows.map((row) => row.timestamp)).size > 1}
          coarseOpenNote={coarse && (selected || openRows.length > 0)}
        />
        </div>
      )}
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
  statusLine,
  ssrLine,
  showLogs,
  showTraffic,
  openRows,
  showOpenTimes,
  coarseOpenNote,
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
  statusLine: string;
  ssrLine: string;
  showLogs: boolean;
  showTraffic: boolean;
  openRows: Array<{ timestamp: number; method: string; route: string; count: number; maxMs: number }>;
  showOpenTimes: boolean;
  coarseOpenNote: boolean;
}) {
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
      {showTraffic && detail.mixedBounds && (
        <p className="text-sm text-muted-foreground">
          This span mixes two different bucket sets, so percentiles are not calculated.
        </p>
      )}
      {showTraffic && !detail.mixedBounds && duration.some((n) => n > 0) && (
        <div className="space-y-2">
          <div className="flex h-24 items-end gap-1">
            {duration.map((n, i) => (
              <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                {n > 0 && <span className="text-[10px] tabular-nums">{n}</span>}
                <div
                  className="w-full rounded-sm bg-primary/70"
                  style={{ height: n > 0 ? `${Math.max(8, (n / maxBar) * 100)}%` : 0 }}
                />
                <span className="text-[10px] text-muted-foreground">{bucketLabel(i, bounds)}</span>
              </div>
            ))}
          </div>
          <p className="text-sm">{callTotal} calls, {slowPct}% at 500 ms or more</p>
        </div>
      )}

      {showTraffic && (statusLine || ssrLine) && (
        <p className="text-xs text-muted-foreground">
          {[statusLine, ssrLine].filter(Boolean).join(" · ")}
        </p>
      )}

      {showTraffic && routes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">The first row is the slowest, not necessarily the cause.</p>
          <Table>
            <TableHeader>
              <TableRow>
                {showKind && <TableHead>Kind</TableHead>}
                <TableHead>Method</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Peak</TableHead>
                <TableHead>Status</TableHead>
                {showSsr && <TableHead>Render</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((row) => (
                <TableRow key={`${row.kind}-${row.method}-${row.route}`}>
                  {showKind && <TableCell>{row.kind === "pages" ? "page" : "API"}</TableCell>}
                  <TableCell>{row.method}</TableCell>
                  <TableCell>
                    <div>{row.route}</div>
                    {row.path && <div className="text-xs text-muted-foreground">{row.path}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.avgMs} ms</TableCell>
                  <TableCell className="text-right tabular-nums">{row.maxMs} ms</TableCell>
                  <TableCell className="text-xs">{countLine(row.statusCounts) || "—"}</TableCell>
                  {showSsr && <TableCell className="text-xs">{countLine(row.ssrCounts, SSR_LABELS) || "—"}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(openRows.length > 0 || coarseOpenNote) && (
        <div className="space-y-1">
          <p className="text-sm">Open at close</p>
          <p className="text-xs text-muted-foreground">
            Still open when the window closed, and already at 500 ms or more. The peak is that elapsed time, not how long they took to finish.
          </p>
          {coarseOpenNote && (
            <p className="text-xs text-muted-foreground">
              This list is the 30 s cut with the worst event loop. The other cuts in that point are not mixed in.
            </p>
          )}
          {openRows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  {showOpenTimes && <TableHead>Cut</TableHead>}
                  <TableHead>Method</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Peak</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openRows.map((row) => (
                  <TableRow key={`${row.timestamp}-${row.method}-${row.route}`}>
                    {showOpenTimes && <TableCell className="tabular-nums">{formatClock(row.timestamp)}</TableCell>}
                    <TableCell>{row.method}</TableCell>
                    <TableCell>{row.route}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.maxMs} ms</TableCell>
                    <TableCell className="text-xs">—</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {openRows.length === 0 && (
            <p className="text-xs text-muted-foreground">No call had been open for 500 ms at that cut.</p>
          )}
        </div>
      )}

      {showLogs && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">The log covers every process. It only keeps 48 h.</p>
          {detail.logsCoverage === "none" && (
            <p className="text-sm text-muted-foreground">No data before {formatClock(detail.endingAt)}.</p>
          )}
          {detail.logsCoverage === "partial" && detail.logsSince != null && (
            <p className="text-sm text-muted-foreground">No data before {formatClock(detail.logsSince)}.</p>
          )}
          <ErrorLogIssueTable issues={detail.logs ?? []} />
          {(detail.logs ?? []).length === 0 && detail.logsCoverage !== "none" && (
            <p className="text-sm text-muted-foreground">No logs in this span.</p>
          )}
        </div>
      )}
    </div>
  );
}
