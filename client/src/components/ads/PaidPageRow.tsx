import { useState } from "react";
import { ChevronDown, ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LocaleFlag } from "@/components/DebugBubble/components/LocaleFlag";
import { cn } from "@/lib/utils";
import { isClicksVisitsMismatch, type AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsPageRow } from "./ads-types";
import { formatMoney, formatNum, formatPct, formatSeconds, PLATFORM_LABELS } from "./ads-format";
import { PlatformTag } from "./PlatformTag";

export type PaidPerspective = "traffic" | "conversion" | "engagement" | "integrity";

type Metric = { label: string; value: string; muted?: boolean; testId: string };

function metricsFor(row: AdsPageRow, perspective: PaidPerspective, issues: AdsIssue[]): Metric[] {
  const grey = row.low_sample;
  switch (perspective) {
    case "traffic":
      return [
        { label: "Spend", value: formatMoney(row.spend), testId: "spend" },
        { label: "Paid visits", value: formatNum(row.paid_visits), testId: "visits" },
        { label: "Cost / visit", value: formatMoney(row.cost_per_visit, { decimals: 2 }), muted: grey, testId: "cpv" },
        {
          label: "Clicks → visits",
          value: isClicksVisitsMismatch(row.clicks_to_visits) ? "Mismatch" : formatPct(row.clicks_to_visits, 0),
          muted: grey,
          testId: "ctv",
        },
      ];
    case "conversion":
      return [
        {
          label: "Leads",
          value: row.repeat_submissions > 0 ? `${formatNum(row.unique_leads)} · ${formatNum(row.submissions)} sub.` : formatNum(row.unique_leads),
          testId: "leads",
        },
        { label: "Conv. rate", value: formatPct(row.conversion_rate), muted: grey, testId: "cr" },
        { label: "Cost / lead", value: formatMoney(row.cost_per_lead, { decimals: 2 }), muted: grey, testId: "cpl" },
        { label: "Meta leads", value: formatNum(row.meta_leads), testId: "meta-leads" },
        { label: "Organic rate", value: formatPct(row.organic?.lead_rate ?? null), muted: true, testId: "organic-rate" },
      ];
    case "engagement":
      return [
        { label: "Bounce", value: formatPct(row.bounce_rate, 0), muted: grey, testId: "bounce" },
        { label: "Engaged time", value: formatSeconds(row.avg_engaged_seconds), muted: grey, testId: "engaged" },
        { label: "Organic bounce", value: formatPct(row.organic?.bounce_rate ?? null, 0), muted: true, testId: "organic-bounce" },
      ];
    case "integrity": {
      const errors = issues.filter((i) => i.severity === "error").length;
      const warnings = issues.filter((i) => i.severity === "warning").length;
      const unclearShare = row.paid_visits + row.unclear_visits > 0 ? row.unclear_visits / (row.paid_visits + row.unclear_visits) : null;
      return [
        { label: "Errors", value: String(errors), testId: "errors" },
        { label: "Warnings", value: String(warnings), testId: "warnings" },
        { label: "Unclear", value: formatPct(unclearShare, 0), testId: "unclear" },
        { label: "Redirected from", value: row.redirected_from.length ? String(row.redirected_from.length) : "—", testId: "redirects" },
      ];
    }
  }
}

export function PaidPageRow({
  row,
  perspective,
  issues = [],
  coveredDays,
  askRejectPct,
  primaryHost,
}: {
  row: AdsPageRow;
  perspective: PaidPerspective;
  issues?: AdsIssue[];
  coveredDays?: { covered: number; total: number };
  askRejectPct?: number | null;
  primaryHost?: string;
}) {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const metrics = metricsFor(row, perspective, issues);
  const showHost = row.host && primaryHost && row.host !== primaryHost;

  return (
    <div className="border-b border-border last:border-b-0" data-testid={`paid-page-row-${row.key}`}>
      <div className="flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {row.locale && <LocaleFlag locale={row.locale} className="w-3.5 h-2.5 rounded-sm shrink-0" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground" title={row.title}>
                {row.title}
              </span>
              {row.content_type && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {row.content_type}
                </Badge>
              )}
              {row.kind !== "entry" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {row.kind_label}
                </Badge>
              )}
              {row.low_sample && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground" data-testid="chip-low-sample">
                  not enough data
                </Badge>
              )}
              {row.platforms.map((p) => (
                <PlatformTag key={p} platform={p} row={row} />
              ))}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {showHost ? `${row.host}` : ""}
              {row.path}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {metrics.map((m) => (
            <div key={m.testId} className="min-w-[72px] text-right" data-testid={`metric-${m.testId}`}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
              <p className={cn("text-sm tabular-nums", m.muted ? "text-muted-foreground" : "text-foreground")}>{m.value}</p>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Details" data-testid="button-paid-row-details">
                  <Info className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-2 text-xs" align="end">
                {row.campaigns.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground mb-1">Campaigns</p>
                    <ul className="space-y-0.5">
                      {row.campaigns.map((c) => (
                        <li key={`${c.platform}-${c.campaign_id ?? c.campaign_name}`} className="flex justify-between gap-2">
                          <span className="truncate">
                            {c.platform ? `${PLATFORM_LABELS[c.platform] ?? c.platform} · ` : ""}
                            {c.campaign_name}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatNum(c.paid_visits)} · {formatMoney(c.spend)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p>
                  Started here: {row.started_here} · Form sent here: {row.closed_here}
                </p>
                {row.unassigned_visits > 0 && (
                  <p>{formatNum(row.unassigned_visits)} paid visit(s) here had no ad tags, so they aren't counted under the selected account or currency.</p>
                )}
                {row.last_visit_organic > 0 && (
                  <p>{row.last_visit_organic} lead(s) came back later without a new ad click; still credited here.</p>
                )}
                {row.repeat_submissions > 0 && (
                  <p>
                    {row.repeat_submissions} repeat submission(s) from the same browser within 24h — shown, not counted as leads.
                  </p>
                )}
                {coveredDays && coveredDays.covered < coveredDays.total && (
                  <p>
                    Site leads based on {coveredDays.covered} of {coveredDays.total} days.
                  </p>
                )}
                {askRejectPct != null && askRejectPct > 0 && <p>Includes estimates; {askRejectPct}% rejected tracking in ask regions.</p>}
                {row.redirected_from.length > 0 && <p>Also counts visits to: {row.redirected_from.join(", ")}</p>}
                <p className="text-muted-foreground">Seen in this browser — cross-device journeys are not joined.</p>
              </PopoverContent>
            </Popover>
            {row.url && row.kind !== "instant_form" && row.kind !== "unknown_destination" && (
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Open page"
                data-testid="link-paid-row-open"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {row.versions && row.versions.length > 0 && (
              <button
                type="button"
                onClick={() => setVersionsOpen((v) => !v)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Versions"
                data-testid="button-paid-row-versions"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", versionsOpen && "rotate-180")} />
              </button>
            )}
          </div>
        </div>
      </div>
      {versionsOpen && row.versions && (
        <div className="bg-muted/30 px-3 pb-2" data-testid="paid-row-versions">
          {row.versions.map((v) => (
            <div key={v.variant} className="flex items-center justify-between py-1 text-xs">
              <span className="text-foreground">{v.variant}</span>
              <span className={cn("tabular-nums", v.low_sample ? "text-muted-foreground" : "text-foreground")}>
                {formatNum(v.paid_visits)} visits · {formatNum(v.unique_leads)} leads · {formatPct(v.conversion_rate)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
