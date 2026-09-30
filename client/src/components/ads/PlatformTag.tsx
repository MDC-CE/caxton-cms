import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CLICK_ID_PLATFORM, type AdPlatform } from "@shared/paid-traffic";
import type { AdsPageRow } from "./ads-types";
import { formatMoney, formatNum, PLATFORM_LABELS } from "./ads-format";

/** Platforms whose spend and clicks are imported from the ad account (others come from site visits only). */
const SPEND_SYNCED: ReadonlySet<AdPlatform> = new Set<AdPlatform>(["meta"]);

const MAX_CAMPAIGNS = 3;

function clickIdsFor(platform: AdPlatform): string[] {
  return Object.entries(CLICK_ID_PLATFORM)
    .filter(([, p]) => p === platform)
    .map(([id]) => id);
}

export function PlatformTag({ platform, row }: { platform: AdPlatform; row: AdsPageRow }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const label = PLATFORM_LABELS[platform] ?? platform;
  const campaigns = row.campaigns
    .filter((c) => c.platform === platform)
    .sort((a, b) => b.paid_visits - a.paid_visits);
  const visits = campaigns.reduce((s, c) => s + c.paid_visits, 0);
  const spendSynced = SPEND_SYNCED.has(platform);
  const isOther = platform === "other";
  const clickIds = clickIdsFor(platform);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded text-[10px] uppercase tracking-wide text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          aria-label={`What does ${label} mean here?`}
          data-testid={`button-platform-tag-${platform}`}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p className="text-sm font-medium text-foreground">{isOther ? "Other paid traffic" : `${label} ads`}</p>
        <p>
          {isOther
            ? "Some visits to this page came from links marked as paid, but we couldn't tell which ad platform sent them."
            : `Some paid visits to this page came from ${label} ads. This label shows who sent the traffic. It doesn't mean the page belongs to a ${label} campaign only.`}
        </p>

        {campaigns.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-foreground">
              {formatNum(visits)} paid visit(s) from {label} in this period
            </p>
            <ul className="space-y-0.5">
              {campaigns.slice(0, MAX_CAMPAIGNS).map((c) => (
                <li key={c.campaign_id ?? c.campaign_name} className="flex justify-between gap-2">
                  <span className="truncate">{c.campaign_name || "(no campaign name)"}</span>
                  <span className="shrink-0 tabular-nums">{formatNum(c.paid_visits)}</span>
                </li>
              ))}
            </ul>
            {campaigns.length > MAX_CAMPAIGNS && (
              <p className="mt-0.5">+{campaigns.length - MAX_CAMPAIGNS} more campaign(s) in this row's details.</p>
            )}
          </div>
        )}

        {!spendSynced && (
          <p>
            {label} spend and clicks aren't imported here. This row's spend and cost numbers only include Meta ads, so
            check the cost in {isOther ? "the ad platform" : label} yourself.
          </p>
        )}

        <div>
          <p className="mb-1 font-medium text-foreground">How to use this</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Switch the platform filter above to {label} to see only this traffic and its leads.</li>
            <li>Compare leads here with what {isOther ? "the ad platform" : label} reports to spot tracking gaps.</li>
            <li>
              {isOther
                ? "If you don't recognize this traffic, a link is probably tagged as paid by mistake. Fix its tags so it's counted correctly."
                : `If you don't run ${label} ads, a link is probably tagged as paid by mistake. Fix its tags so it isn't counted as paid.`}
            </li>
          </ul>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-foreground"
              data-testid={`button-platform-tag-${platform}-advanced`}
            >
              Read more (advanced)
              <ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5 space-y-1.5">
            <p>
              We detect this from GA4 landing visits. A visit counts as {label} when{" "}
              <code className="rounded bg-muted px-1 font-mono">utm_medium</code> is a paid medium (e.g.{" "}
              <code className="rounded bg-muted px-1 font-mono">cpc</code>,{" "}
              <code className="rounded bg-muted px-1 font-mono">paid_social</code>){" "}
              {isOther ? (
                "and the source isn't a known ad platform."
              ) : (
                <>
                  and <code className="rounded bg-muted px-1 font-mono">utm_source</code> points to {label}
                  {clickIds.length > 0 && (
                    <>
                      , or the URL has a {label} click id (
                      {clickIds.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ", "}
                          <code className="rounded bg-muted px-1 font-mono">{id}</code>
                        </span>
                      ))}
                      ){platform === "meta" && " together with a paid medium or a known Meta campaign/ad id"}
                    </>
                  )}
                  .
                </>
              )}
            </p>
            <p>
              Organic visits from {isOther ? "any source" : label} are never counted. Rules live in{" "}
              <code className="rounded bg-muted px-1 font-mono">shared/paid-traffic.ts</code>.
            </p>
            {spendSynced && <p>Spend: {formatMoney(row.spend)} (imported from the connected Meta ad account).</p>}
          </CollapsibleContent>
        </Collapsible>
      </PopoverContent>
    </Popover>
  );
}
