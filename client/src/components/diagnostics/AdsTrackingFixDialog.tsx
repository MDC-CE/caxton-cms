import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleAlert, ExternalLink, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import {
  TRACKING_FIX_SKIP_LABELS,
  type TrackingFixAdPlan,
  type TrackingFixAdResult,
  type TrackingFixApplyResponse,
  type TrackingFixPreview,
} from "@shared/ads-tracking-fix";
import { adsManagerUrl } from "@/components/diagnostics/AdsIssueEvidence";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}

function TagsDiff({ before, after, added }: { before: string | null; after: string | null; added: string[] }) {
  return (
    <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug">
      <p className="break-all text-muted-foreground">
        <span className="font-sans text-[10px] uppercase tracking-wide">Now </span>
        {before || "(none)"}
      </p>
      {after && (
        <p className="break-all text-foreground">
          <span className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">After </span>
          {after}
        </p>
      )}
      {added.length > 0 && <p className="font-sans text-[11px] text-chart-3">Adds {added.join(", ")}</p>}
    </div>
  );
}

function SkippedRow({ ad, reasonText }: { ad: { ad_id: string; ad_name: string; account_id: string }; reasonText: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5" data-testid={`tracking-fix-skipped-${ad.ad_id}`}>
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{ad.ad_name || ad.ad_id}</p>
        <p className="text-[11px] text-muted-foreground">{reasonText}</p>
      </div>
      {ad.account_id && (
        <a
          href={adsManagerUrl(ad.account_id, { ad_id: ad.ad_id })}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Meta Ads Manager <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}

function ResultList({ title, items, tone }: { title: string; items: TrackingFixAdResult[]; tone: "ok" | "skip" | "fail" }) {
  if (items.length === 0) return null;
  const Icon = tone === "ok" ? CheckCircle2 : tone === "fail" ? CircleAlert : AlertTriangle;
  const color = tone === "ok" ? "text-chart-3" : tone === "fail" ? "text-destructive" : "text-muted-foreground";
  return (
    <div>
      <p className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${color}`}>
        <Icon className="h-3.5 w-3.5" /> {title} ({items.length})
      </p>
      <ul className="divide-y divide-border">
        {items.map((a) => (
          <SkippedRow
            key={`${tone}-${a.ad_id}`}
            ad={a}
            reasonText={a.error ?? (a.reason ? TRACKING_FIX_SKIP_LABELS[a.reason] : a.after ? `Now: ${a.after}` : "")}
          />
        ))}
      </ul>
    </div>
  );
}

export function AdsTrackingFixDialog({
  open,
  onOpenChange,
  issue,
  snapshotId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: AdsIssue;
  snapshotId: string | undefined;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<TrackingFixApplyResponse | null>(null);

  const preview = useQuery({
    queryKey: ["/api/ads/meta/tracking-fix/preview", issue.id, snapshotId],
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    queryFn: () => postJson<TrackingFixPreview>("/api/ads/meta/tracking-fix/preview", { issue_id: issue.id, snapshot_id: snapshotId }),
  });

  const fixable = useMemo(() => (preview.data?.ads ?? []).filter((a) => a.status === "fixable"), [preview.data]);
  const skipped = useMemo(() => (preview.data?.ads ?? []).filter((a) => a.status === "skipped"), [preview.data]);
  const maxAds = preview.data?.max_ads ?? 50;

  useEffect(() => {
    if (!open) {
      setResult(null);
      return;
    }
    setSelected(new Set(fixable.slice(0, maxAds).map((a) => a.ad_id)));
  }, [open, fixable, maxAds]);

  const apply = useMutation({
    mutationFn: () =>
      postJson<TrackingFixApplyResponse>("/api/ads/meta/tracking-fix/apply", {
        issue_id: issue.id,
        snapshot_id: snapshotId,
        ad_ids: Array.from(selected),
      }),
    onSuccess: (r) => {
      setResult(r);
      toast({
        title: r.fixed.length > 0 ? `Updated ${r.fixed.length} ad(s) in Meta` : "No ads were changed",
        description: r.stopped ? `Stopped early: ${r.stopped.error}` : r.failed.length > 0 ? `${r.failed.length} failed — see the list.` : undefined,
        variant: r.stopped || (r.fixed.length === 0 && r.failed.length > 0) ? "destructive" : undefined,
      });
      if (r.fixed.length > 0) onApplied();
    },
    onError: (err) => toast({ title: "Couldn't update ads", description: err instanceof Error ? err.message : String(err), variant: "destructive" }),
  });

  const toggle = (ad: TrackingFixAdPlan, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on && next.size < maxAds) next.add(ad.ad_id);
      else next.delete(ad.ad_id);
      return next;
    });

  const campaign = issue.scope.campaign_name ?? "this campaign";

  return (
    <Dialog open={open} onOpenChange={(o) => !apply.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="dialog-tracking-fix">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-muted-foreground" />
            Add missing tracking parameters
          </DialogTitle>
          <DialogDescription>
            This adds the missing tracking parameters to these ads in Meta so visits and leads can be matched to the exact ad.
            Tags the ads already have stay as they are.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the ads in {campaign} from Meta…
          </p>
        )}
        {preview.error && (
          <p className="text-sm text-destructive" data-testid="tracking-fix-preview-error">
            {preview.error instanceof Error ? preview.error.message : "Couldn't read the ads from Meta"}
          </p>
        )}

        {preview.data && !preview.data.write_configured && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground" data-testid="tracking-fix-not-configured">
            Meta isn't connected on this server yet. Ask an admin to add the Meta access token, or paste the template into each ad in Meta Ads
            Manager.
          </div>
        )}

        {preview.data?.write_configured && !result && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" data-testid="tracking-fix-consequences">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Before you confirm
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Changed ads go back to Meta review and may pause briefly until approved.</li>
                <li>The ad set may re-enter the learning phase, so results can dip for a few days.</li>
                <li>Budgets, audiences, and the ads' content don't change.</li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Will be updated ({selected.size} of {fixable.length})
              </p>
              {fixable.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">None of these ads can be fixed from here. Use Meta Ads Manager for the ones below.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {fixable.map((ad) => (
                    <li key={ad.ad_id} className="flex items-start gap-3 py-2" data-testid={`tracking-fix-ad-${ad.ad_id}`}>
                      <Checkbox
                        checked={selected.has(ad.ad_id)}
                        onCheckedChange={(v) => toggle(ad, v === true)}
                        disabled={!selected.has(ad.ad_id) && selected.size >= maxAds}
                        aria-label={`Update ${ad.ad_name || ad.ad_id}`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{ad.ad_name || ad.ad_id}</p>
                        <TagsDiff before={ad.before} after={ad.after} added={ad.added} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {fixable.length > maxAds && (
                <p className="text-[11px] text-muted-foreground">
                  Up to {maxAds} ads per confirm. Run it again afterwards for the rest.
                </p>
              )}
            </div>

            {skipped.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Can't be fixed from here ({skipped.length})</p>
                <ul className="divide-y divide-border">
                  {skipped.map((ad) => (
                    <SkippedRow key={ad.ad_id} ad={ad} reasonText={ad.reason ? TRACKING_FIX_SKIP_LABELS[ad.reason] : ""} />
                  ))}
                </ul>
              </div>
            )}

            <Collapsible>
              <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                Read more (advanced)
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <p>
                  Meta doesn't allow editing an ad's URL parameters in place. For each ad we create a new creative from the same page post (so likes
                  and comments stay) with the merged <code className="font-mono">url_tags</code>, then point the ad at it.
                </p>
                <p>
                  Only template parameters the ad lacks are added (from its link or URL parameters); existing values, including a non-paid{" "}
                  <code className="font-mono">utm_medium</code>, are kept. Dynamic / Advantage+ creatives, catalog ads, Instant Form ads, and ads
                  without a reusable post are skipped.
                </p>
                <p>
                  After a successful run we re-read ad setups from Meta so this issue can clear. Uses the server's{" "}
                  <code className="font-mono">META_ADS_ACCESS_TOKEN</code> (needs <code className="font-mono">ads_management</code>); each change is
                  logged with your account.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {result && (
          <div className="space-y-3" data-testid="tracking-fix-results">
            {result.stopped && (
              <p className="text-sm text-destructive">
                Stopped early ({result.stopped.kind}): {result.stopped.error}
              </p>
            )}
            <ResultList title="Updated" items={result.fixed} tone="ok" />
            <ResultList title="Failed" items={result.failed} tone="fail" />
            <ResultList title="Skipped" items={result.skipped} tone="skip" />
            {result.fixed.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {result.refresh_requested
                  ? "Re-reading ad setups from Meta now; the issue updates when that finishes."
                  : "Resync ads to see the issue update."}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)} data-testid="button-tracking-fix-close">
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={apply.isPending}>
                Cancel
              </Button>
              {preview.data?.write_configured && (
                <Button onClick={() => apply.mutate()} disabled={apply.isPending || selected.size === 0} data-testid="button-tracking-fix-confirm">
                  {apply.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Update {selected.size} ad(s) in Meta
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
