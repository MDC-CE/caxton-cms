import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AdPlatform } from "@shared/paid-traffic";
import type { AdsPageRow, MoneyByCurrency } from "./ads-types";
import { formatMoney, moneyTotal, PLATFORM_LABELS } from "./ads-format";

/** Server keeps at most this many campaigns per row. */
const MAX_CAMPAIGNS = 10;

type PlatformCopy = { why: string; check: string };

const PLATFORM_COPY: Partial<Record<AdPlatform, PlatformCopy>> = {
  google: {
    why:
      "Google reported what these campaigns spent, but not which page the clicks landed on. This happens most with Performance Max and Demand Gen (formerly Discovery) campaigns, and with brand-new ads.",
    check:
      "Look up the campaign type in Google Ads. Performance Max or Demand Gen: nothing to fix here; compare this spend with Google-reported leads instead. A brand-new ad usually moves to its page after a day. Search or Display spend that stays here means the Google Ads transfer may be missing landing page stats.",
  },
  meta: {
    why:
      "We couldn't read a website link on these ads, and no visits from them showed up in Google Analytics. Typical for ads that send people to Messenger, WhatsApp, a call or a Facebook post, ads with no clicks yet, or ads whose details haven't synced.",
    check:
      "Open the ad in Meta Ads Manager. If it isn't meant to reach the site, nothing to fix. If it should, add the website URL and the tracking template; after the next sync its spend moves to the right page.",
  },
};

const OTHER_PLATFORM_COPY: PlatformCopy = {
  why: "The platform reported spend but no landing page, and no visits from these ads showed up in Google Analytics.",
  check: "Check the ads send people to a page on this site with tracking parameters in the link.",
};

function spendByPlatform(row: AdsPageRow): Map<AdPlatform | "unknown", MoneyByCurrency> {
  const out = new Map<AdPlatform | "unknown", MoneyByCurrency>();
  for (const c of row.campaigns) {
    const key = c.platform ?? "unknown";
    const money = out.get(key) ?? {};
    for (const [cur, v] of Object.entries(c.spend)) money[cur] = (money[cur] ?? 0) + v;
    out.set(key, money);
  }
  return out;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function UnknownDestinationDialog({ row, children }: { row: AdsPageRow; children: ReactNode }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const platforms: AdPlatform[] = row.platforms.length > 0 ? row.platforms : ["google", "meta"];
  const campaignSpend = spendByPlatform(row);
  const campaigns = [...row.campaigns].sort((a, b) => moneyTotal(b.spend) - moneyTotal(a.spend));
  const campaignsCapped = row.campaigns.length >= MAX_CAMPAIGNS;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="dialog-unknown-destination">
        <DialogHeader>
          <DialogTitle>Why is the destination unknown?</DialogTitle>
          <DialogDescription>
            This {formatMoney(row.spend)} is real ad spend, but we can't tell which page the ads sent people to, so it isn't credited to any page.
            It still counts toward total spend; it's left out of cost per lead and cost per visit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm text-muted-foreground">
          {platforms.map((p) => {
            const copy = PLATFORM_COPY[p] ?? OTHER_PLATFORM_COPY;
            const spend = campaignSpend.get(p);
            return (
              <Section key={p} title={`${PLATFORM_LABELS[p] ?? p}${spend && !campaignsCapped ? ` · ${formatMoney(spend)}` : ""}`}>
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3" data-testid={`unknown-destination-platform-${p}`}>
                  <p>{copy.why}</p>
                  <p>
                    <span className="font-medium text-foreground">What to check: </span>
                    {copy.check}
                  </p>
                </div>
              </Section>
            );
          })}

          {campaigns.length > 0 && (
            <Section title={campaignsCapped ? `Top ${MAX_CAMPAIGNS} campaigns by spend` : "Campaigns"}>
              <ul className="divide-y divide-border rounded-md border border-border" data-testid="unknown-destination-campaigns">
                {campaigns.map((c) => (
                  <li key={`${c.platform ?? ""}|${c.campaign_id ?? c.campaign_name}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{c.campaign_name}</p>
                      <p className="text-xs">{c.platform ? PLATFORM_LABELS[c.platform] ?? c.platform : "Unknown platform"}</p>
                    </div>
                    <span className="shrink-0 tabular-nums text-foreground">{formatMoney(c.spend)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid="button-unknown-destination-advanced">
                Read more (advanced)
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2 text-xs">
              <p>
                Google: campaign-day cost that the transfer's <code className="font-mono">LandingPageStats</code> doesn't cover becomes a remainder
                row. Its kind comes from the channel type and conversions: <code className="font-mono">VIDEO</code> → Video views,{" "}
                <code className="font-mono">MULTI_CHANNEL</code> → App, no landing clicks with lead conversions → Google lead form, with calls →
                Calls, anything else → unknown. Demand Gen and Performance Max have no special case, so their remainder lands here (
                <code className="font-mono">server/ads/google-ads-bq.ts</code> → <code className="font-mono">remainderDestination</code>).
              </p>
              <p>
                Meta: an ad's destination is the first link on its synced creative; without one, the page most of its GA4 visits landed on (matched
                by <code className="font-mono">utm_content</code> = ad id). Neither available → unknown (
                <code className="font-mono">server/ads/ads-report.ts</code> → <code className="font-mono">destinationOf</code>).
              </p>
              <p>
                The row key is <code className="font-mono">dest:unknown</code>. Its spend is in the report totals but excluded from cost per lead,
                cost per visit and the clicks → visits ratio. Campaign lists keep at most {MAX_CAMPAIGNS} campaigns per row.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
