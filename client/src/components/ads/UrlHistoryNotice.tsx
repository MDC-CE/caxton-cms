import { useState } from "react";
import { ChevronDown, History, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AdsUrlHistory } from "./ads-types";

const NOTICE_DAYS = 14;
const STORAGE_KEY = "ads-url-history-notice-dismissed";

/** One-time notice (14 days after past numbers were recomputed): spend now follows each ad's link per day. */
export function UrlHistoryNotice({ urlHistory, now = Date.now() }: { urlHistory: AdsUrlHistory | null | undefined; now?: number }) {
  const at = urlHistory?.recomputed_at ?? null;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!at && window.localStorage.getItem(STORAGE_KEY) === at;
    } catch {
      return false;
    }
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  if (!at || dismissed) return null;
  const age = now - Date.parse(at);
  if (!Number.isFinite(age) || age < 0 || age > NOTICE_DAYS * 86_400_000) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, at);
    } catch {
      /* private mode */
    }
  };

  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs" data-testid="ads-url-history-notice">
      <div className="flex items-start gap-2">
        <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-foreground">
            Ad spend now follows the page each ad pointed to on each day, so past numbers were re-assigned. Pages an ad used to point to get their
            spend back; the day an ad switched links is split and marked &quot;URL changed&quot;.
          </p>
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground" data-testid="ads-url-history-advanced">
                Read more (advanced)
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1 text-muted-foreground">
              <p>
                Each Meta ad keeps a link history (a new version whenever the link&apos;s host or path changes; parameter-only edits are logged on the
                same version). On a changeover day, spend and clicks are split by where that day&apos;s visits with the ad&apos;s id landed; with no
                visits, the whole day goes to the new page.
              </p>
              <p>
                Days before link history was saved use where GA4 visits landed when there are at least 3 of them; otherwise the earliest known link,
                counted as &quot;page not confirmed&quot; for ads without the ad id in their links. Google spend already arrived per landing page, so
                it is unchanged.
              </p>
              <p>
                History lives in <code className="font-mono">.cache/&lt;site&gt;/ads-setup/meta.json</code> (<code className="font-mono">versions[]</code>
                ); attribution is <code className="font-mono">server/ads/ad-url-history.ts</code>.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <button type="button" onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Dismiss" data-testid="ads-url-history-dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
