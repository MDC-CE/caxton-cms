import { type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { META_PLACEMENT_LABELS } from "@shared/paid-traffic";
import type { AdsMetaPlatforms, MoneyByCurrency } from "@/components/ads/ads-types";
import { formatMoney, formatNum, formatPct } from "@/components/ads/ads-format";

function sumMoney(...parts: MoneyByCurrency[]): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const m of parts) for (const [cur, v] of Object.entries(m)) out[cur] = (out[cur] ?? 0) + v;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v > 0));
}

function partialNote(p: AdsMetaPlatforms): string | null {
  if (!p.spend_partial) return null;
  if (p.spend_since) return `Platform spend is only available from ${p.spend_since}, so spend and spend per lead may be lower than the real figure for this window.`;
  return "Platform spend is still loading, or the last read failed for an ad account. Spend and spend per lead may be lower than the real figure until the next sync.";
}

function ColumnInfo({
  label,
  align = "left",
  testId,
  className,
  children,
}: {
  label: string;
  align?: "left" | "right";
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <th className={cn("py-2 font-medium", align === "right" ? "text-right" : "text-left", className)}>
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {label}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm",
                "text-muted-foreground transition-colors hover:text-foreground",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label={`What ${label} means`}
              data-testid={testId}
              onClick={(e) => e.stopPropagation()}
            >
              <Info className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align={align === "right" ? "end" : "start"} className="w-72 space-y-1.5 text-sm text-muted-foreground">
            {children}
          </PopoverContent>
        </Popover>
      </span>
    </th>
  );
}

export function AdsMetaPlatformsCard({ data, days }: { data: AdsMetaPlatforms; days: number }) {
  if (data.rows.length === 0) return null;
  const notCounted = sumMoney(data.excluded_spend.instant_form, data.excluded_spend.off_site, data.excluded_spend.unknown);
  const partial = partialNote(data);
  return (
    <Card data-testid="card-ads-meta-platforms">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Facebook vs Instagram</CardTitle>
        <p className="text-sm text-muted-foreground">
          Where your Meta ads ran and what those visitors did on your site. Ads set up before this change show as Not split until their URL
          parameters are updated.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {partial && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" data-testid="ads-meta-platforms-partial">
            {partial}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-ads-meta-platforms">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <ColumnInfo label="Platform" className="pr-3" testId="info-meta-platforms-platform">
                  <p>Where the ad ran: Facebook, Instagram, Messenger, Audience Network, or Not split.</p>
                  <p>Not split means the ad still uses an older URL tag, so we can’t tell which app it came from.</p>
                </ColumnInfo>
                <ColumnInfo label="Spend" align="right" className="pr-3" testId="info-meta-platforms-spend">
                  <p>Money spent on ads that send people to this site, for that platform.</p>
                  <p>Instant Form ads and ads to other sites are left out (see “Not counted” below).</p>
                </ColumnInfo>
                <ColumnInfo label="Visits" align="right" className="pr-3" testId="info-meta-platforms-visits">
                  <p>Paid Meta sessions on this site from Google Analytics, grouped by platform tag.</p>
                </ColumnInfo>
                <ColumnInfo label="Site leads" align="right" className="pr-3" testId="info-meta-platforms-leads">
                  <p>Form submissions on this site credited to a paid Meta visit on that platform.</p>
                  <p>Repeats and staff tests are left out. This is not Meta’s own lead count.</p>
                </ColumnInfo>
                <ColumnInfo label="Spend per lead" align="right" className="pr-3" testId="info-meta-platforms-cpl">
                  <p>Spend ÷ site leads for that platform.</p>
                  <p>Empty when there are no site leads. Lower is better, all else equal.</p>
                </ColumnInfo>
                <ColumnInfo label="Lead rate" align="right" testId="info-meta-platforms-lead-rate">
                  <p>Site leads ÷ visits for that platform.</p>
                  <p>“Few visits” means the sample is too small to treat the rate as reliable.</p>
                </ColumnInfo>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.platform}
                  className={cn("border-b border-border last:border-b-0", r.platform === "not_split" && "text-muted-foreground")}
                  data-testid={`row-ads-meta-platform-${r.platform}`}
                >
                  <td className="py-2 pr-3">{META_PLACEMENT_LABELS[r.platform]}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.spend)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatNum(r.paid_visits)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatNum(r.unique_leads)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.cost_per_lead ?? undefined)}</td>
                  <td className="py-2 text-right tabular-nums" title={r.low_sample ? "Too few visits for a reliable rate" : undefined}>
                    {formatPct(r.conversion_rate)}
                    {r.low_sample && r.conversion_rate != null && <span className="ml-1 text-[10px] text-muted-foreground">few visits</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Object.keys(notCounted).length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="ads-meta-platforms-not-counted">
            Not counted: {formatMoney(notCounted)} on Instant Form and other-site ads.
          </p>
        )}
        <Collapsible>
          <CollapsibleTrigger
            className="group flex items-center gap-1 text-xs font-medium text-foreground"
            data-testid="button-ads-meta-platforms-advanced"
          >
            Read more (advanced)
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              Covers the last {days} days. Spend only counts ads that land on this site. Instant Form ads and ads sending people to other sites
              or unknown pages are left out and summed in the “Not counted” line.
            </p>
            <p>
              Facebook, Instagram, Messenger and Audience Network rows only include ads whose URL parameters use{" "}
              <code className="font-mono">utm_source={"{{site_source_name}}"}</code>. Ads still on an older tag (for example{" "}
              <code className="font-mono">utm_source=facebook</code>) put their spend, visits and leads in Not split.
            </p>
            <p>
              Visits are paid Meta sessions from Google Analytics, grouped by <code className="font-mono">utm_source</code> (
              <code className="font-mono">fb</code>, <code className="font-mono">ig</code>, <code className="font-mono">msg</code>,{" "}
              <code className="font-mono">an</code>). Site leads are form submissions credited to a paid Meta visit, grouped by the lead’s{" "}
              <code className="font-mono">utm_source</code>. Repeats and staff tests are left out.
            </p>
            <p>
              Spend per placement comes from a separate Meta read per ad and placement. The Spend card above and the rest of this page are not
              affected by this table.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
