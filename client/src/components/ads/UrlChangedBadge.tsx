import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdsPageRow, AdsRowUrlChange } from "./ads-types";
import { formatMoney, moneyTotal } from "./ads-format";

/** Page path (or "an Instant Form") for a URL from an ad's link history. */
export function shortAdUrl(url: string): string {
  if (url === "instant_form") return "an Instant Form";
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url;
  }
}

export function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function changeSentence(c: AdsRowUrlChange): string {
  const moved = `"${c.ad_name || c.ad_id}" moved from ${shortAdUrl(c.from_url)} to ${shortAdUrl(c.to_url)} on ${formatDay(c.date)}.`;
  if (c.inferred) return `${moved} Read from where visitors landed (before link history was saved).`;
  return c.basis === "ga4"
    ? `${moved} Spend that day was split by where visitors landed, so it's approximate.`
    : `${moved} No visits were seen that day, so all of it went to the new page.`;
}

/** "URL changed" chip on a paid page row: an ad pointing here switched links in this window. */
export function UrlChangedBadge({ row }: { row: Pick<AdsPageRow, "key" | "url_change_days" | "url_changes" | "unconfirmed_page_spend"> }) {
  const days = row.url_change_days ?? 0;
  const unconfirmed = moneyTotal(row.unconfirmed_page_spend) > 0;
  if (days === 0 && !unconfirmed) return null;
  const changes = row.url_changes ?? [];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground cursor-help" data-testid={`chip-url-changed-${row.key}`}>
          {days > 0 ? "URL changed" : "page not confirmed"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-[22rem] space-y-1.5">
        {changes.map((c) => (
          <p key={`${c.ad_id}-${c.date}`}>{changeSentence(c)}</p>
        ))}
        {days > 0 && changes.length === 0 && (
          <p>An ad pointing here changed its link in this range ({days} day(s)). Spend on those days is split between the old and new page, so it's approximate.</p>
        )}
        {unconfirmed && (
          <p className="text-muted-foreground">
            Some older spend from untagged ads ({formatMoney(row.unconfirmed_page_spend)}) is assumed to go to this page: we can't confirm where those ads
            pointed before link history was saved.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
