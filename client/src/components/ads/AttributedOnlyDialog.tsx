import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AdsAttributedOnlyVisits } from "./ads-types";
import { formatNum } from "./ads-format";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Explains sessions GA4 credits to ads that we don't count as paid visits. `data` null = GA4 can't measure it. */
export function AttributedOnlyDialog({ data, children }: { data: AdsAttributedOnlyVisits | null; children: ReactNode }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="dialog-attributed-only">
        <DialogHeader>
          <DialogTitle>Visits GA4 credits to ads that we don't count</DialogTitle>
          <DialogDescription>
            GA4 remembers the last ad someone clicked. It keeps crediting that ad for their later visits, even weeks later, and even when they type
            the address or open a bookmark. We only count a visit as paid when it came straight from an ad click, so these visits are left out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm text-muted-foreground">
          {data ? (
            data.by_host.length > 0 && (
              <Section title={`Where they landed · ${formatNum(data.total)} visits`}>
                <ul className="divide-y divide-border rounded-md border border-border" data-testid="attributed-only-hosts">
                  {data.by_host.map((h) => (
                    <li key={h.host} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate text-foreground">{h.host || "(no domain)"}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="text-foreground">{formatNum(h.sessions)}</span>
                        {data.total > 0 ? ` · ${Math.round((h.sessions / data.total) * 100)}%` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )
          ) : (
            <p className="rounded-md border border-border bg-muted/30 p-3" data-testid="attributed-only-unavailable">
              GA4's export doesn't include the field needed to measure how many visits this leaves out. Paid visits still follow the rule above.
            </p>
          )}

          <Section title="What doesn't change">
            <p>Spend, leads and Meta's own numbers stay the same. These visits still appear in GA4 as regular traffic.</p>
          </Section>

          <Section title="Is this a problem?">
            <p>
              Usually not. Returning visitors are normal, and most of these will be on our own site. To check whether ad tags are being lost, look at
              clicks-to-visits in Issues.
            </p>
          </Section>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid="button-attributed-only-advanced">
                Read more (advanced)
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2 text-xs">
              <p>
                A GA4 session counts as a paid visit when its landing URL has an ad click id (<code className="font-mono">gclid</code>,{" "}
                <code className="font-mono">gbraid</code>, <code className="font-mono">wbraid</code>, <code className="font-mono">msclkid</code>,{" "}
                <code className="font-mono">ttclid</code>, …, or <code className="font-mono">utm_id</code>) or a paid{" "}
                <code className="font-mono">utm_medium</code>, read from the URL or GA4's per-visit{" "}
                <code className="font-mono">collected_traffic_source</code>.
              </p>
              <p>
                GA4's <code className="font-mono">session_traffic_source_last_click</code> (and the first-user{" "}
                <code className="font-mono">traffic_source</code>) is ignored for paid detection. Sessions where it says paid, or where the Google Ads
                link is set without a Google click id, are counted here instead. The Google Ads link still supplies campaign ids for sessions that have a
                Google click id.
              </p>
              <p>
                Whole window, all platforms; filters on this card don't apply. Source:{" "}
                <code className="font-mono">server/ads/paid-detection.ts</code> → <code className="font-mono">buildPaidLandingSql</code>.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
