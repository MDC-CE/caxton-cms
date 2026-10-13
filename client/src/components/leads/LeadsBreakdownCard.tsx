import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { utmConventionHref } from "@/components/ads/AdsUtmConvention";
import { cn } from "@/lib/utils";
import type { LeadsBreakdownRow, LeadsFilters, LeadsOffConventionValue } from "@shared/leads-query";

const PLATFORM_LABEL = { meta: "Meta", google: "Google" } as const;

function offConventionReason(v: LeadsOffConventionValue): string {
  const p = v.platform ? PLATFORM_LABEL[v.platform] : null;
  const codes = new Set(v.codes);
  if (codes.has("utm_source_alias")) return p ? `Not one of ${p}'s sources in the rules.` : "Not a source the rules list.";
  if (codes.has("utm_medium_off_convention")) return p ? `Not the medium the rules use for ${p}.` : "Not the medium the rules use.";
  if (codes.has("utm_medium_nonstandard")) return "Google Analytics doesn't count this medium as paid.";
  if (codes.has("utm_bad_chars")) return "Has spaces or characters the rules don't allow.";
  if (codes.has("utm_case_mixed")) return "The rules use lowercase only.";
  return "Doesn't match the tagging rules.";
}

function OffConventionPopover({ values, testId }: { values: LeadsOffConventionValue[]; testId: string }) {
  const platforms = Array.from(new Set(values.map((v) => v.platform).filter((p): p is "meta" | "google" => !!p)));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="shrink-0 rounded-md" aria-label="What does off-convention mean?" data-testid={testId}>
          <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] text-status-away border-status-away/40">
            <AlertTriangle className="h-3 w-3" />
            off-convention
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-medium">Tags outside the tagging rules</p>
          <p className="text-muted-foreground">Some leads in this row came from links tagged differently from what the site's rules expect:</p>
        </div>
        <ul className="space-y-2" data-testid={`${testId}-values`}>
          {values.map((v) => (
            <li key={`${v.param}:${v.value}:${v.platform ?? ""}`} className="rounded-md border border-border px-2.5 py-2">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-xs text-muted-foreground">{v.param === "utm_source" ? "Source" : "Medium"}</span>
                <code className="break-all font-mono text-xs text-status-away">{v.value}</code>
                {v.expected && (
                  <>
                    <span className="text-xs text-muted-foreground">· expected</span>
                    <code className="break-all font-mono text-xs text-foreground">{v.expected}</code>
                  </>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {offConventionReason(v)} {v.leads.toLocaleString()} {v.leads === 1 ? "lead" : "leads"}.
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          The leads are counted correctly, but reports split this traffic across several rows here and in Google Analytics. Usually
          the fix is the ad's tags. If the value is intended, update the tagging rules instead.
        </p>
        <div className="flex flex-col gap-1">
          {(platforms.length ? platforms : [null]).map((p) => (
            <Link
              key={p ?? "all"}
              href={p ? utmConventionHref(p) : "/private/settings/ads"}
              className="text-primary hover:underline"
              data-testid={`${testId}-rules-link${p ? `-${p}` : ""}`}
            >
              {p ? `View the ${PLATFORM_LABEL[p]} tagging rules →` : "View the tagging rules →"}
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LeadsBreakdownCard({
  title,
  icon: Icon,
  description,
  rows,
  loading,
  mono,
  emptyText,
  testId,
  onSelect,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  description?: ReactNode;
  rows?: LeadsBreakdownRow[];
  loading: boolean;
  /** Paths read better in a monospace font. */
  mono?: boolean;
  emptyText: string;
  testId: string;
  onSelect: (filter: LeadsFilters) => void;
}) {
  return (
    <Card className="min-w-0" data-testid={testId}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
        {loading || !rows ? (
          <div className="space-y-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : rows.length === 0 || rows.every((r) => r.count === 0) ? (
          <p className="text-sm text-muted-foreground py-2">{emptyText}</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((row, i) => {
              const clickable = !!row.filter && row.count > 0;
              const content = (
                <>
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm bg-primary/10"
                    style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                    aria-hidden
                  />
                  <span className={cn("relative min-w-0 flex-1 truncate text-left", mono && "font-mono text-xs")}>{row.label}</span>
                  {row.locale && (
                    <Badge variant="outline" className="relative shrink-0 px-1.5 py-0 text-[10px] uppercase">
                      {row.locale}
                    </Badge>
                  )}
                  <span className="relative shrink-0 tabular-nums text-xs text-muted-foreground w-24 text-right">
                    {row.count.toLocaleString()} · {row.pct}%
                  </span>
                </>
              );
              return (
                <li key={row.key} className="flex items-center gap-1.5">
                  {clickable ? (
                    <button
                      type="button"
                      className="relative flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-sm hover-elevate"
                      onClick={() => onSelect(row.filter!)}
                      title="Filter the leads below by this"
                      data-testid={`${testId}-row-${i}`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="relative flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-sm text-muted-foreground">
                      {content}
                    </div>
                  )}
                  {row.off_convention?.length ? (
                    <OffConventionPopover values={row.off_convention} testId={`${testId}-off-convention-${i}`} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
