import type { ComponentType, ReactNode } from "react";
import { Info, Megaphone, Search, Tag, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LEADS_RANGE_LABELS, type LeadsStatsResponse } from "@shared/leads-query";

const GRID = "grid w-full gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5";

function KpiCard({
  label,
  value,
  hint,
  subHint,
  icon: Icon,
  info,
  testId,
}: {
  label: string;
  value: string;
  hint: ReactNode;
  subHint?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  info?: ReactNode;
  testId: string;
}) {
  return (
    <Card className="min-w-0" data-testid={testId}>
      <CardContent className="pt-4 pb-3 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          {info && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  aria-label={`About ${label}`}
                  data-testid={`${testId}-info`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 text-xs text-muted-foreground leading-relaxed space-y-2">
                {info}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="text-2xl font-semibold tabular-nums truncate">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{hint}</div>
        {subHint && <div className="text-xs text-muted-foreground truncate">{subHint}</div>}
      </CardContent>
    </Card>
  );
}

function pct(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function LeadsKpiCards({ stats, loading }: { stats?: LeadsStatsResponse; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className={GRID}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[92px] w-full" />
        ))}
      </div>
    );
  }
  const k = stats.kpis;
  const delta = k.delta_pct;
  const since = stats.tracking_since != null ? shortDate(stats.tracking_since) : null;
  const rangeHint =
    stats.range === "all" ? (
      "All recorded leads"
    ) : delta != null ? (
      <span className={cn("inline-flex items-center gap-1", delta >= 0 ? "text-status-online" : "text-destructive")}>
        {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {delta > 0 ? "+" : ""}
        {delta}% vs previous {LEADS_RANGE_LABELS[stats.range]}
      </span>
    ) : (
      "No full previous period to compare"
    );

  return (
    <div className={GRID}>
      <KpiCard
        label="Total leads"
        value={k.total_all_time.toLocaleString()}
        hint="Kept 25 months · no contact details"
        icon={Users}
        testId="card-kpi-leads-total"
        info={
          <>
            <p>
              Leads are kept for 25 months, then deleted automatically, so this total can go down over time.
            </p>
            <p>
              Names, emails and phone numbers are not saved here on purpose; they go straight to the CRM.
            </p>
          </>
        }
      />
      <KpiCard
        label={stats.range === "all" ? "Leads (all time)" : `Leads in last ${LEADS_RANGE_LABELS[stats.range]}`}
        value={k.in_range.toLocaleString()}
        hint={rangeHint}
        icon={stats.range === "all" || delta == null || delta >= 0 ? TrendingUp : TrendingDown}
        testId="card-kpi-leads-range"
      />
      <KpiCard
        label="Paid share"
        value={pct(k.paid_share)}
        hint={`${k.paid.toLocaleString()} came from an ad`}
        subHint={k.meta_unclear > 0 ? `${k.meta_unclear.toLocaleString()} Meta, unclear (not counted)` : undefined}
        icon={Megaphone}
        testId="card-kpi-leads-paid"
        info={
          <>
            <p>
              Leads with only a Facebook click id now show as Meta unclear. They are not counted as paid because we cannot tell an
              ad from a regular Facebook link.
            </p>
            <p>
              {since ? `From ${since}` : "Once channel tracking starts"}, leads with an ad click in the 30 days before also count as
              paid; earlier numbers are unchanged, so compare across that date with care.
            </p>
          </>
        }
      />
      <KpiCard
        label="Organic search"
        value={since ? pct(k.organic_share) : "—"}
        hint={
          since
            ? `${k.organic_search.toLocaleString()} of ${k.tracked.toLocaleString()} leads since ${since}`
            : "Tracking starts with the next lead"
        }
        subHint={
          k.no_consent > 0
            ? `${k.no_consent.toLocaleString()} from visitors who declined tracking (channel only from that visit)`
            : undefined
        }
        icon={Search}
        testId="card-kpi-leads-organic"
        info={
          <>
            <p>
              We detect organic search from the site the visitor came from (Google, Bing and similar). It is a close estimate, not
              exact, and only covers leads {since ? `since ${since}` : "from when tracking starts"}.
            </p>
            <p>
              Visitors who decline tracking are only tracked for the visit they convert in, so organic search is slightly
              undercounted.
            </p>
          </>
        }
      />
      <KpiCard
        label="Tagged leads"
        value={pct(k.tagged_share)}
        hint={`${k.tagged.toLocaleString()} have UTM tags`}
        icon={Tag}
        testId="card-kpi-leads-tagged"
        info={<p>Leads with any UTM source, medium or campaign. A low share means we cannot tell where many leads came from.</p>}
      />
    </div>
  );
}
