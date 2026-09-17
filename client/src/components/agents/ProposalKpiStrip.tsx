import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconInfoCircle } from "@tabler/icons-react";
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ToggleButtonBar,
  ToggleButtonBarTrigger,
} from "@/components/ui/toggle-button-bar";
import {
  proposalKpiCardsForKindFilter,
  proposalKpiLiveCount,
  PROPOSAL_KPI_CARD_STATUSES,
  type ProposalKpiCardKind,
  type ProposalKpiCardStatus,
  type ProposalListKind,
  type ProposalListStats,
  type ProposalListStatus,
} from "@/pages/proposals-list-filters";

type KpiPoint = { day: string; count: number };
type KpiSeries = {
  kind: ProposalKpiCardKind;
  status: ProposalKpiCardStatus;
  points: KpiPoint[];
};
type KpiHistoryResponse = {
  granularity: "day" | "week";
  from: string;
  to: string;
  series: KpiSeries[];
};

/** open = yellow/away, finished = green/online, rejected = red/destructive */
const STATUS_STROKE: Record<ProposalKpiCardStatus, string> = {
  open: "stroke-status-away",
  finished: "stroke-status-online",
  rejected: "stroke-destructive",
};

const STATUS_TEXT: Record<ProposalKpiCardStatus, string> = {
  open: "text-status-away",
  finished: "text-status-online",
  rejected: "text-destructive",
};

function pathForSeries(
  points: KpiPoint[],
  n: number,
  max: number,
  pad: { t: number; r: number; b: number; l: number },
  innerW: number,
  innerH: number,
): string {
  if (points.length === 0) return "";
  const midY = pad.t + innerH / 2;
  const empty = max <= 0;
  return points
    .map((p, i) => {
      const x = n <= 1 ? pad.l + innerW / 2 : pad.l + (i / (n - 1)) * innerW;
      const y = empty ? midY : pad.t + (1 - p.count / max) * innerH;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function MiniTripleSpark({
  byStatus,
  focusStatus,
  testId,
}: {
  byStatus: Record<ProposalKpiCardStatus, KpiPoint[]>;
  focusStatus?: ProposalKpiCardStatus | null;
  testId?: string;
}) {
  const W = 96;
  const H = 28;
  const pad = { t: 3, r: 2, b: 3, l: 2 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const visible = focusStatus
    ? ([focusStatus] as ProposalKpiCardStatus[])
    : [...PROPOSAL_KPI_CARD_STATUSES];
  const all = visible.flatMap((s) => byStatus[s] ?? []);
  const n = Math.max(...visible.map((s) => (byStatus[s] ?? []).length), 0);
  const max = Math.max(0, ...all.map((p) => p.count));
  const midY = pad.t + innerH / 2;
  const empty = n === 0 || max === 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="shrink-0"
      role="img"
      aria-hidden
      data-testid={testId}
    >
      {empty ? (
        <line
          x1={pad.l}
          y1={midY}
          x2={pad.l + innerW}
          y2={midY}
          className="stroke-muted-foreground"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
      ) : (
        visible.map((status) => (
          <path
            key={status}
            d={pathForSeries(byStatus[status] ?? [], n, max, pad, innerW, innerH)}
            fill="none"
            className={STATUS_STROKE[status]}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))
      )}
    </svg>
  );
}

function MultiStatusLineChart({
  seriesByStatus,
  focusStatus,
  testId,
}: {
  seriesByStatus: Record<ProposalKpiCardStatus, KpiPoint[]>;
  focusStatus?: ProposalKpiCardStatus | null;
  testId?: string;
}) {
  const W = 560;
  const H = 140;
  const pad = { t: 12, r: 12, b: 20, l: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const visible = focusStatus
    ? ([focusStatus] as ProposalKpiCardStatus[])
    : [...PROPOSAL_KPI_CARD_STATUSES];
  const all = visible.flatMap((s) => seriesByStatus[s] ?? []);
  const n = Math.max(...visible.map((s) => (seriesByStatus[s] ?? []).length), 0);
  const max = Math.max(1, ...all.map((p) => p.count));

  return (
    <div className="space-y-2" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-40" role="img">
        <title>Open, finished, and rejected stock over time</title>
        <line
          x1={pad.l}
          y1={pad.t + innerH}
          x2={pad.l + innerW}
          y2={pad.t + innerH}
          className="stroke-border"
          strokeWidth="1"
        />
        {visible.map((status) => (
          <path
            key={status}
            d={pathForSeries(seriesByStatus[status] ?? [], n, max, pad, innerW, innerH)}
            fill="none"
            className={STATUS_STROKE[status]}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {PROPOSAL_KPI_CARD_STATUSES.map((s) => (
          <span
            key={s}
            className={cn(
              "inline-flex items-center gap-1.5",
              STATUS_TEXT[s],
              focusStatus && focusStatus !== s && "opacity-35",
            )}
          >
            <span className="inline-block h-0.5 w-3 rounded-full bg-current" />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusCountPill({
  status,
  count,
  testId,
}: {
  status: ProposalKpiCardStatus;
  count: number;
  testId: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-sm px-1.5 py-0 text-[10px] font-semibold tabular-nums",
        status === "open"
          ? "bg-status-away/15 text-status-away"
          : status === "finished"
            ? "bg-status-online/15 text-status-online"
            : "bg-destructive/15 text-destructive",
      )}
      data-testid={testId}
    >
      {count}
    </span>
  );
}

const STATUS_SHORT_LABEL: Record<ProposalKpiCardStatus, string> = {
  open: "Open",
  finished: "Done",
  rejected: "Rej",
};

function StatusBadgeButton({
  status,
  count,
  active,
  testId,
  onHoverChange,
  onClick,
}: {
  status: ProposalKpiCardStatus;
  count: number;
  active: boolean;
  testId: string;
  onHoverChange: (hovering: boolean) => void;
  onClick: () => void;
}) {
  const labelHot =
    status === "open"
      ? "text-status-away"
      : status === "finished"
        ? "text-status-online"
        : "text-destructive";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md p-0.5 shrink-0 hover-elevate",
        active && "ring-1 ring-border bg-muted/40",
      )}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${count} ${status}`}
      data-testid={testId}
    >
      <span
        className={cn(
          "text-[10px] font-semibold leading-none",
          count > 0 ? labelHot : "text-muted-foreground",
        )}
      >
        {STATUS_SHORT_LABEL[status]}
      </span>
      <StatusCountPill status={status} count={count} testId={`${testId}-count`} />
    </button>
  );
}

export function ProposalKpiStrip({
  kindFilter,
  statusFilter,
  stalledOnly = false,
  stats,
  headers,
  onKindClick,
  onStatusClick,
  onStalledClick,
  trailing,
}: {
  kindFilter: ProposalListKind;
  /** List status from the query string — drives spark focus when open|finished|rejected. */
  statusFilter: ProposalListStatus;
  stalledOnly?: boolean;
  stats?: ProposalListStats | null;
  headers: () => Record<string, string>;
  onKindClick: (kind: ProposalKpiCardKind) => void;
  onStatusClick: (status: ProposalListStatus) => void;
  /** Toggle stalled accepted ideas filter (Ideas card badge). */
  onStalledClick?: () => void;
  /** Extra KPI cell (e.g. webhooks) — shares the same row on large screens. */
  trailing?: ReactNode;
}) {
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  /** Hover preview applies only to that card’s spark. */
  const [hoverFocus, setHoverFocus] = useState<{
    kind: ProposalKpiCardKind;
    status: ProposalKpiCardStatus;
  } | null>(null);

  const focusedKind: ProposalKpiCardKind | null =
    kindFilter === "idea" || kindFilter === "edits" || kindFilter === "notes"
      ? kindFilter
      : null;

  const urlStatusFocus: ProposalKpiCardStatus | null =
    statusFilter === "open" || statusFilter === "finished" || statusFilter === "rejected"
      ? statusFilter
      : null;

  const cards = useMemo(() => proposalKpiCardsForKindFilter(kindFilter), [kindFilter]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("granularity", granularity);
    if (focusedKind) p.set("kind", focusedKind);
    return p.toString();
  }, [granularity, focusedKind]);

  const { data: history } = useQuery({
    queryKey: ["/api/admin/proposals/kpis", qs],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/proposals/kpis?${qs}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load proposal KPIs");
      return res.json() as Promise<KpiHistoryResponse>;
    },
  });

  const seriesForKind = (kind: ProposalKpiCardKind): Record<ProposalKpiCardStatus, KpiPoint[]> => {
    const pick = (status: ProposalKpiCardStatus) =>
      history?.series.find((s) => s.kind === kind && s.status === status)?.points ?? [];
    return {
      open: pick("open"),
      finished: pick("finished"),
      rejected: pick("rejected"),
    };
  };

  const chartByStatus = useMemo(() => {
    if (!focusedKind || !history?.series) return null;
    const pick = (status: ProposalKpiCardStatus) =>
      history.series.find((s) => s.kind === focusedKind && s.status === status)?.points ?? [];
    return {
      open: pick("open"),
      finished: pick("finished"),
      rejected: pick("rejected"),
    } satisfies Record<ProposalKpiCardStatus, KpiPoint[]>;
  }, [focusedKind, history]);

  /** Hover wins for that card only; otherwise follow the list status query. */
  const sparkFocusFor = (kind: ProposalKpiCardKind): ProposalKpiCardStatus | null => {
    if (hoverFocus?.kind === kind) return hoverFocus.status;
    return urlStatusFocus;
  };

  const chartFocus =
    (focusedKind && hoverFocus?.kind === focusedKind ? hoverFocus.status : null) ?? urlStatusFocus;

  return (
    <div className="space-y-3" data-testid="proposal-kpi-strip">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ToggleButtonBar
          className="shrink-0"
          value={granularity}
          onValueChange={(v) => {
            if (v === "day" || v === "week") setGranularity(v);
          }}
          listClassName="flex"
        >
          <ToggleButtonBarTrigger value="day" data-testid="toggle-proposal-kpi-day">
            Daily
          </ToggleButtonBarTrigger>
          <ToggleButtonBarTrigger value="week" data-testid="toggle-proposal-kpi-week">
            Weekly
          </ToggleButtonBarTrigger>
        </ToggleButtonBar>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Read more (advanced)"
              data-testid="button-proposal-kpi-advanced"
            >
              <IconInfoCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 space-y-2 text-xs text-muted-foreground leading-relaxed"
          >
            <p className="font-medium text-foreground text-sm">Read more (advanced)</p>
            <p>
              Card numbers are live. Sparks are end-of-day stock through yesterday (open includes
              in-progress). Days use UTC; history is rebuilt from create/close times. Withdrawn is
              left out. Retention is 90 days.
            </p>
            <p>
              Hover a status chip to preview that line on that card. The list status filter isolates
              the same line on every card. Click a chip to set or clear the list filter.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      <div
        className={cn(
          "grid w-full gap-3 grid-cols-1 sm:grid-cols-2",
          trailing ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        {cards.map((card) => {
          const counts = {
            open: proposalKpiLiveCount(stats, card.kind, "open"),
            finished: proposalKpiLiveCount(stats, card.kind, "finished"),
            rejected: proposalKpiLiveCount(stats, card.kind, "rejected"),
          };
          const total = counts.open + counts.finished + counts.rejected;
          return (
            <Card
              key={card.kind}
              className="min-w-0"
              data-testid={`card-proposal-kpi-${card.kind}`}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="text-left min-w-0 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:opacity-90"
                      onClick={() => onKindClick(card.kind)}
                      data-testid={`button-proposal-kpi-kind-${card.kind}`}
                    >
                      <p className="text-2xl font-bold text-foreground tabular-nums">{total}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
                    </button>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <MiniTripleSpark
                      byStatus={seriesForKind(card.kind)}
                      focusStatus={sparkFocusFor(card.kind)}
                      testId={`spark-proposal-kpi-${card.kind}`}
                    />
                    <div className="flex items-center gap-0.5 flex-wrap justify-end">
                      {PROPOSAL_KPI_CARD_STATUSES.map((status) => (
                        <StatusBadgeButton
                          key={status}
                          status={status}
                          count={counts[status]}
                          active={urlStatusFocus === status}
                          testId={`button-proposal-kpi-${card.kind}-${status}`}
                          onHoverChange={(hovering) =>
                            setHoverFocus(hovering ? { kind: card.kind, status } : null)
                          }
                          onClick={() =>
                            onStatusClick(urlStatusFocus === status ? "all" : status)
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 w-full">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Live stock by status
                  </p>
                  {card.kind === "idea" && onStalledClick ? (
                    <button
                      type="button"
                      className={cn(
                        "text-[11px] tabular-nums rounded-sm px-1.5 py-0.5 shrink-0",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        stalledOnly
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      onClick={onStalledClick}
                      title="Accepted ideas with a locked page and no successful follow-up edits yet. Rejected attempts show here again."
                      data-testid="button-proposal-kpi-stalled-ideas"
                    >
                      {Number(stats?.stalled_ideas ?? 0)} stalled
                    </button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {trailing ? <div className="min-w-0 h-full">{trailing}</div> : null}
      </div>

      {focusedKind && chartByStatus ? (
        <Card data-testid="card-proposal-kpi-comparison">
          <CardContent className="pt-4 pb-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {focusedKind === "idea" ? "Ideas" : focusedKind === "edits" ? "Edits" : "Notes"} · stock
              through yesterday
            </p>
            <MultiStatusLineChart
              seriesByStatus={chartByStatus}
              focusStatus={chartFocus}
              testId="chart-proposal-kpi-comparison"
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
