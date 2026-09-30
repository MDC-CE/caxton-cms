import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  on: boolean;
  /** Flat fill under the line. Charts with one series fill that line. */
  filled?: boolean;
};

type Row = { timestamp: number; count?: number | null; [key: string]: unknown };

const CLICK_PX = 5;
const EVENT_LOOP_DECADES = [0.1, 1, 10, 100, 1000, 10_000];
const LATENCY_BOUNDS = [50, 100, 250, 500, 1000, 2500, 5000];
/** Same gutter on every chart so the plot starts at the same x. Centered ticks, with room around "10000ms". */
const AXIS_WIDTH = 68;
/** Restart marker. The tooltip sits just outside this radius and only opens inside DOT_HIT. */
const DOT_R = 3;
/** One reading has no segment. This stroke is only a mark, not a duration. */
const ISOLATED_TICK_PX = 8;
const DOT_GAP = 6;
const DOT_HIT = 12;

export type ChartAxis = "cpu" | "eventLoop" | "memory" | "latency" | "count";

/** True when this reading cannot join a line: the windows beside it have no number. */
export function isIsolatedReading(values: readonly unknown[], index: number): boolean {
  const has = (i: number) => {
    const value = values[i];
    return typeof value === "number" && Number.isFinite(value);
  };
  return has(index) && !has(index - 1) && !has(index + 1);
}

export function axisScale(kind: ChartAxis, max: number, bounds: number[] = LATENCY_BOUNDS): {
  scale: "linear" | "log";
  domain: [number, number];
  ticks: number[];
  /** Empty for the call count. Drawn tight against the number. */
  unit: string;
  format: (value: number) => string;
  width: number;
} {
  const peak = Number.isFinite(max) && max > 0 ? max : 0;
  const labeled = (unit: string) => (value: number) => `${value}${unit}`;
  if (kind === "cpu") {
    const top = Math.max(20, Math.ceil(peak / 20) * 20);
    return { scale: "linear", domain: [0, top], ticks: steps(0, top, 20), unit: "%", format: labeled("%"), width: AXIS_WIDTH };
  }
  if (kind === "memory") {
    const top = Math.max(500, Math.ceil(peak / 500) * 500);
    return { scale: "linear", domain: [0, top], ticks: steps(0, top, 500), unit: "MB", format: labeled("MB"), width: AXIS_WIDTH };
  }
  if (kind === "count") {
    const top = Math.max(1, Math.ceil(peak));
    const step = countStep(top);
    const ceiling = Math.max(step, Math.ceil(top / step) * step);
    return { scale: "linear", domain: [0, ceiling], ticks: steps(0, ceiling, step), unit: "", format: labeled(""), width: AXIS_WIDTH };
  }
  if (kind === "eventLoop") {
    let top = EVENT_LOOP_DECADES.find((decade) => decade >= peak) ?? EVENT_LOOP_DECADES[EVENT_LOOP_DECADES.length - 1];
    if (top <= 0.1) top = 1;
    const ticks = EVENT_LOOP_DECADES.filter((decade) => decade <= top);
    let ceiling = top;
    while (ceiling < peak) {
      ceiling *= 10;
      ticks.push(ceiling);
    }
    return { scale: "log", domain: [0.1, ceiling], ticks, unit: "ms", format: labeled("ms"), width: AXIS_WIDTH };
  }
  const grid = bounds.length > 0 ? bounds : LATENCY_BOUNDS;
  const floor = grid[0] ?? 50;
  const last = grid[grid.length - 1] ?? 5000;
  let top = peak > last ? peak : (grid.find((bound) => bound >= Math.max(peak, floor)) ?? last);
  if (top <= floor) top = grid.find((bound) => bound > floor) ?? floor * 2;
  return {
    scale: "log",
    domain: [floor, top],
    ticks: grid.filter((bound) => bound >= floor && bound <= top),
    unit: "ms",
    format: labeled("ms"),
    width: AXIS_WIDTH,
  };
}

function countStep(top: number): number {
  if (top <= 5) return 1;
  const rough = top / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const n = rough / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function steps(from: number, to: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = from; value <= to; value += step) ticks.push(value);
  return ticks;
}

function seriesPeak(rows: Row[], series: ChartSeries[]): number {
  let peak = 0;
  for (const row of rows) {
    for (const item of series) {
      const value = row[item.key];
      if (typeof value === "number" && value > peak) peak = value;
    }
  }
  return peak;
}

function axisTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

const TOOLTIP_CLASS = "rounded-sm bg-zinc-900/85 px-1.5 py-1 text-[11px] leading-tight text-white";

export function SeriesLegend({
  series,
  onToggle,
}: {
  series: ChartSeries[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1" role="group" aria-label="Series">
      {series.map((item) => (
        <button
          key={item.key}
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            item.on ? "text-foreground" : "text-muted-foreground opacity-40",
          )}
          aria-pressed={item.on}
          onClick={() => onToggle(item.key)}
          data-testid={`legend-${item.key}`}
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: item.on ? item.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${item.color}` }}
          />
          {item.label}
        </button>
      ))}
    </div>
  );
}

type DetailAnchor = { x: number; y: number; side: "left" | "right" };

/** Recharts puts the tooltip on the right and flips left when it would overflow. The popover takes the other side. */
function oppositeOfTooltip(plot: HTMLElement, clientX: number): "left" | "right" {
  const tip = plot.querySelector(".recharts-tooltip-wrapper");
  if (tip instanceof HTMLElement) {
    const rect = tip.getBoundingClientRect();
    const hidden = getComputedStyle(tip).visibility === "hidden";
    if (!hidden && rect.width > 0 && rect.height > 0) {
      const tooltipOnRight = rect.left + rect.width / 2 >= clientX;
      return tooltipOnRight ? "left" : "right";
    }
  }
  const box = plot.getBoundingClientRect();
  const x = clientX - box.left;
  const tooltipOnRight = x + 10 + 180 <= box.width;
  return tooltipOnRight ? "left" : "right";
}

function DetailJumpPopover({
  anchor,
  onShowDetail,
  onDismiss,
  onHot,
}: {
  anchor: DetailAnchor;
  onShowDetail: () => void;
  onDismiss: () => void;
  onHot: (hot: boolean) => void;
}) {
  return (
    <Popover open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute size-0" style={{ left: anchor.x, top: anchor.y }} />
      </PopoverAnchor>
      <PopoverContent
        side={anchor.side}
        align="center"
        sideOffset={10}
        avoidCollisions={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={() => onHot(true)}
        onMouseLeave={() => onHot(false)}
        className="w-auto overflow-hidden rounded-md border border-black/10 bg-white p-0 text-foreground shadow-sm transition-colors hover:bg-zinc-100"
      >
        <button
          type="button"
          className="block bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onHot(false);
            onShowDetail();
          }}
        >
          View detail
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function ProcessLineChart({
  title,
  rows,
  series,
  onToggle,
  axis,
  latencyBounds,
  height,
  syncId,
  restarts = [],
  selection,
  draft,
  onDraft,
  tooltip,
  onPick,
  detailButton = null,
  onShowDetail,
  onDismissDetail,
  selectionHot = false,
  onDetailHot,
}: {
  title: string;
  rows: Row[];
  series: ChartSeries[];
  onToggle: (key: string) => void;
  axis: ChartAxis;
  latencyBounds?: number[];
  height: number;
  syncId?: string;
  restarts?: number[];
  selection: { from: number; to: number } | null;
  draft: { from: number; to: number } | null;
  onDraft: (band: { from: number; to: number } | null) => void;
  tooltip: (row: Row) => ReactNode;
  onPick: (from: number, to: number, at: DetailAnchor) => void;
  /** Set on the chart that was just clicked or dragged. */
  detailButton?: DetailAnchor | null;
  onShowDetail?: () => void;
  onDismissDetail?: () => void;
  /** Stronger selection marks, shared across charts with the same sync id. */
  selectionHot?: boolean;
  onDetailHot?: (hot: boolean) => void;
}) {
  const drag = useRef<{ x: number; y: number; from: number; to: number } | null>(null);
  const onPickRef = useRef(onPick);
  const onDraftRef = useRef(onDraft);
  onPickRef.current = onPick;
  onDraftRef.current = onDraft;
  const underPointer = useRef(false);
  const plotRef = useRef<HTMLDivElement>(null);
  /** Pixel of the axis floor. The area fill closes there. */
  const floorY = useRef<number | null>(null);
  const dotAt = useRef(new Map<number, { cx: number; cy: number }>());
  const [onDot, setOnDot] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const restartAt = useMemo(() => new Set(restarts), [restarts]);
  const visible = series.filter((item) => item.on);
  const y = axisScale(axis, seriesPeak(rows, visible), latencyBounds);
  const hasLogValue = y.scale !== "log" || rows.some((row) =>
    series.some((item) => {
      const value = row[item.key];
      return typeof value === "number" && value > 0;
    }),
  );
  const rawArea = draft ?? selection;
  const area = rawArea
    ? { from: Math.min(rawArea.from, rawArea.to), to: Math.max(rawArea.from, rawArea.to) }
    : null;
  const markHot = selectionHot;

  useEffect(() => {
    const onUp = (event: MouseEvent) => {
      const start = drag.current;
      if (!start) return;
      drag.current = null;
      onDraftRef.current(null);
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      const plot = plotRef.current;
      const box = plot?.getBoundingClientRect();
      const at = {
        x: event.clientX - (box?.left ?? 0),
        y: event.clientY - (box?.top ?? 0),
        side: plot ? oppositeOfTooltip(plot, event.clientX) : "left" as const,
      };
      if (moved < CLICK_PX) onPickRef.current(start.from, start.from, at);
      else onPickRef.current(Math.min(start.from, start.to), Math.max(start.from, start.to), at);
    };
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      if (drag.current) {
        drag.current = null;
        onDraftRef.current(null);
      }
    };
  }, []);
  const config = Object.fromEntries(series.map((item) => [item.key, { label: item.label, color: item.color }]));

  const labelOf = (state: { activeLabel?: unknown } | null): number | null => {
    const n = Number(state?.activeLabel);
    return Number.isFinite(n) ? n : null;
  };

  const trackDot = (state: { activeLabel?: unknown; chartX?: number; chartY?: number } | null) => {
    const label = labelOf(state);
    const dot = label != null ? dotAt.current.get(label) : undefined;
    const x = state?.chartX;
    const y = state?.chartY;
    const hit = dot != null && x != null && y != null && Math.hypot(x - dot.cx, y - dot.cy) <= DOT_HIT;
    const next = hit && label != null ? label : null;
    setOnDot((prev) => (prev === next ? prev : next));
  };

  const restartTip = onDot != null ? dotAt.current.get(onDot) : undefined;
  const restartTipPos = (() => {
    if (!restartTip) return undefined;
    const width = plotRef.current?.clientWidth ?? 0;
    const tipW = 156;
    let x = restartTip.cx + DOT_R + DOT_GAP;
    if (width > 0 && x + tipW > width - 8) x = Math.max(0, restartTip.cx - DOT_R - DOT_GAP - tipW);
    return { x, y: Math.max(0, restartTip.cy - DOT_R) };
  })();

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex items-center gap-1">
        <SeriesLegend series={series} onToggle={onToggle} />
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
          onClick={() => setCollapsed((open) => !open)}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>
    </div>
  );

  if (collapsed || !hasLogValue) {
    return (
      <section className="space-y-2 rounded-lg border bg-card p-3">
        {header}
        {!collapsed && <p className="text-sm text-muted-foreground">No data in this range.</p>}
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-lg border bg-card p-3">
      {header}
      <div className="relative z-0">
      <ChartContainer ref={plotRef} config={config} className="w-full aspect-auto select-none [&_.recharts-surface]:cursor-crosshair" style={{ height }}>
        <AreaChart
          data={rows}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          syncId={syncId}
          onMouseEnter={(state) => {
            underPointer.current = true;
            trackDot(state);
          }}
          onMouseLeave={() => {
            underPointer.current = false;
            setOnDot(null);
          }}
          onMouseDown={(state, event) => {
            const label = labelOf(state);
            const mouse = event as unknown as MouseEvent | undefined;
            if (label == null || !mouse) return;
            mouse.preventDefault();
            window.getSelection()?.removeAllRanges();
            drag.current = { x: mouse.clientX, y: mouse.clientY, from: label, to: label };
            onDraft({ from: label, to: label });
          }}
          onMouseMove={(state) => {
            underPointer.current = true;
            trackDot(state);
            if (!drag.current) return;
            const label = labelOf(state);
            if (label == null) return;
            drag.current.to = label;
            onDraft({ from: drag.current.from, to: label });
          }}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="timestamp" tickFormatter={axisTime} minTickGap={32} />
          <YAxis
            scale={y.scale}
            domain={y.domain}
            ticks={y.ticks}
            width={y.width}
            interval={0}
            tick={(props) => {
              const tick = props as { y?: number; payload?: { value?: number } };
              if (tick.y == null || tick.payload?.value == null) return <g />;
              if (tick.payload.value === y.domain[0]) floorY.current = tick.y;
              return (
                <text x={y.width / 2} y={tick.y} textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" fontSize={12}>
                  {tick.payload.value}
                  {y.unit ? <tspan fontWeight={600}>{y.unit}</tspan> : null}
                </text>
              );
            }}
          />
          <ChartTooltip
            isAnimationActive={false}
            position={restartTipPos}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as Row | undefined;
              if (!row) return null;
              if (onDot != null && row.timestamp === onDot) {
                return (
                  <div className={TOOLTIP_CLASS}>
                    <div className="font-medium">Process restart</div>
                    <div className="text-white/70">{axisTime(row.timestamp)}</div>
                  </div>
                );
              }
              return (
                <div className={TOOLTIP_CLASS}>
                  <div className="mb-0.5 font-medium">{axisTime(row.timestamp)}</div>
                  {tooltip(row)}
                </div>
              );
            }}
          />
          {visible
            .slice()
            .sort((a, b) => Number(Boolean(b.filled ?? series.length === 1)) - Number(Boolean(a.filled ?? series.length === 1)))
            .map((item) => {
              const paint = item.filled ?? series.length === 1;
              const readings = rows.map((row) => row[item.key]);
              return (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  stroke={item.color}
                  strokeOpacity={paint ? 1 : 0.55}
                  fill={paint ? item.color : "none"}
                  fillOpacity={paint ? 0.18 : 0}
                  strokeWidth={1.75}
                  dot={(props) => {
                    const dot = props as {
                      key?: string;
                      cx?: number;
                      cy?: number;
                      index?: number;
                      stroke?: string;
                      strokeOpacity?: number;
                      strokeWidth?: number;
                      fill?: string;
                      fillOpacity?: number;
                    };
                    const index = dot.index ?? -1;
                    if (dot.cx == null || dot.cy == null || !isIsolatedReading(readings, index)) return <g key={dot.key} />;
                    const half = ISOLATED_TICK_PX / 2;
                    const bottom = floorY.current;
                    const under = paint && bottom != null && bottom > dot.cy;
                    return (
                      <g key={dot.key} pointerEvents="none">
                        {under && (
                          <rect
                            x={dot.cx - half}
                            y={dot.cy}
                            width={ISOLATED_TICK_PX}
                            height={bottom - dot.cy}
                            fill={dot.fill}
                            fillOpacity={dot.fillOpacity}
                            stroke="none"
                          />
                        )}
                        <line
                          x1={dot.cx - half}
                          x2={dot.cx + half}
                          y1={dot.cy}
                          y2={dot.cy}
                          stroke={dot.stroke}
                          strokeOpacity={dot.strokeOpacity}
                          strokeWidth={dot.strokeWidth}
                        />
                      </g>
                    );
                  }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          {area && area.from !== area.to && (
            <ReferenceArea
              x1={area.from}
              x2={area.to}
              fill="hsl(var(--primary))"
              fillOpacity={markHot ? 0.28 : 0.18}
              stroke="hsl(var(--primary))"
              strokeOpacity={markHot ? 0.95 : 0.45}
              strokeWidth={markHot ? 2 : 1}
            />
          )}
          {area && area.from === area.to && (
            <ReferenceLine
              x={area.from}
              stroke="hsl(var(--foreground))"
              strokeOpacity={markHot ? 1 : 0.85}
              strokeWidth={markHot ? 2.5 : 1.5}
            />
          )}
          {[...restartAt].map((timestamp) => (
            <ReferenceDot
              key={timestamp}
              x={timestamp}
              y={y.domain[1]}
              r={DOT_R}
              ifOverflow="visible"
              shape={(props) => {
                const dot = props as { cx?: number; cy?: number };
                if (dot.cx == null || dot.cy == null) return <g />;
                const cy = dot.cy + DOT_R + 1;
                dotAt.current.set(timestamp, { cx: dot.cx, cy });
                return (
                  <circle
                    cx={dot.cx}
                    cy={cy}
                    r={DOT_R}
                    fill="white"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    style={{ pointerEvents: "none" }}
                  />
                );
              }}
            />
          ))}
        </AreaChart>
      </ChartContainer>
      {detailButton && onShowDetail && onDismissDetail && (
        <DetailJumpPopover
          anchor={detailButton}
          onShowDetail={onShowDetail}
          onDismiss={onDismissDetail}
          onHot={onDetailHot ?? (() => {})}
        />
      )}
      </div>
    </section>
  );
}
