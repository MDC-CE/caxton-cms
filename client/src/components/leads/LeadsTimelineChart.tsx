import { Bar, BarChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LEADS_DAY_MS,
  LEADS_TIMELINE_SERIES,
  utcDayKey,
  type LeadsStatsResponse,
  type LeadsTimelineSeries,
} from "@shared/leads-query";

const CONFIG = {
  paid: { label: "Paid", color: "hsl(var(--chart-1))" },
  meta_unclear: { label: "Meta, unclear", color: "hsl(var(--chart-5))" },
  organic_search: { label: "Organic search", color: "hsl(var(--chart-3))" },
  ai_assistant: { label: "AI assistant", color: "hsl(var(--chart-4))" },
  other_organic: { label: "Other non-paid", color: "hsl(var(--chart-2))" },
  not_tracked: { label: "Not tracked yet", color: "hsl(var(--muted-foreground) / 0.45)" },
} satisfies Record<LeadsTimelineSeries, ChartConfig[string]>;

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function LeadsTimelineChart({ stats, loading }: { stats?: LeadsStatsResponse; loading: boolean }) {
  const points = stats?.timeline.points ?? [];
  const weekly = stats?.timeline.bucket === "week";
  const sinceDay = stats?.collecting_since != null ? utcDayKey(stats.collecting_since) : null;
  const lastDayOf = (start: string) =>
    weekly ? utcDayKey(Date.parse(`${start}T00:00:00.000Z`) + 6 * LEADS_DAY_MS) : start;
  const uncovered = sinceDay ? points.filter((p) => lastDayOf(p.date) < sinceDay) : [];
  const uncoveredEnd = uncovered.length ? uncovered[uncovered.length - 1].date : null;

  return (
    <Card data-testid="card-leads-timeline">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Leads over time</CardTitle>
        </div>
        <span className="text-xs text-muted-foreground" data-testid="text-leads-timeline-utc">
          {weekly ? "Weekly · " : ""}Days are in UTC
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading || !stats ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <>
            <ChartContainer config={CONFIG} className="h-56 w-full aspect-auto">
              <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                {uncoveredEnd && points.length > 0 && (
                  <ReferenceArea
                    x1={points[0].date}
                    x2={uncoveredEnd}
                    fill="hsl(var(--muted))"
                    fillOpacity={0.6}
                    ifOverflow="extendDomain"
                    label={{ value: "Not recorded yet", position: "insideTop", fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                )}
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const day = payload?.[0]?.payload?.date as string | undefined;
                        return day ? `${weekly ? "Week of " : ""}${shortDay(day)} (UTC)` : "";
                      }}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {LEADS_TIMELINE_SERIES.map((s, i) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    stackId="leads"
                    fill={`var(--color-${s})`}
                    radius={i === LEADS_TIMELINE_SERIES.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            {sinceDay && uncoveredEnd && (
              <p className="text-xs text-muted-foreground" data-testid="text-leads-recording-since">
                Recording since {shortDay(sinceDay)}, {sinceDay.slice(0, 4)}. Earlier {weekly ? "weeks" : "days"} have no data, so they are greyed out.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
