import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
                <th className="py-2 pr-3 font-medium">Platform</th>
                <th className="py-2 pr-3 text-right font-medium">Spend</th>
                <th className="py-2 pr-3 text-right font-medium">Visits</th>
                <th className="py-2 pr-3 text-right font-medium">Site leads</th>
                <th className="py-2 pr-3 text-right font-medium">Spend per lead</th>
                <th className="py-2 text-right font-medium">Lead rate</th>
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
