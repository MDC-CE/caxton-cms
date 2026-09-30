import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, BadgeCheck, Loader2, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useDebugAuth } from "@/hooks/useDebugAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { AdsIssue } from "@shared/ads-diagnostics-rules";
import type { AdsDiagnostics } from "@/components/ads/ads-types";
import { formatNum } from "@/components/ads/ads-format";

const CHANGED_NOTE_DAYS = 7;

type Kpis = AdsDiagnostics["kpis"];

function CountsPopover({
  label,
  rows,
  empty,
  footer,
  testId,
}: {
  label: string;
  rows: Array<{ name: string; count: number; sub?: string }>;
  empty: string;
  footer: string;
  testId: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="whitespace-nowrap rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`button-${testId}`}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-xs text-muted-foreground" data-testid={`popover-${testId}`}>
        <p className="text-sm font-medium text-foreground">Counted in this window</p>
        {rows.length === 0 ? (
          <p>{empty}</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.name} className="flex items-baseline justify-between gap-3">
                <span className={cn("min-w-0 truncate", r.count > 0 ? "text-foreground" : "text-muted-foreground")} title={r.name}>
                  {r.name}
                  {r.sub && <span className="ml-1 text-muted-foreground">{r.sub}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-foreground">{formatNum(r.count)}</span>
              </li>
            ))}
          </ul>
        )}
        <p>{footer}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Bottom-right of the Leads card: which Meta conversions and site forms sit behind the two numbers. */
export function LeadConversionBadges({ k }: { k: Kpis }) {
  if (!k.meta_conversions || !k.site_conversions) return null;
  const metaActive = k.meta_conversions.filter((c) => c.count > 0).length;
  const fallback = (k.meta_lead_conversions_picked ?? []).length === 0;
  return (
    <div className="flex flex-col items-end gap-1" data-testid="kpi-leads-conversions">
      <CountsPopover
        label={`${metaActive} meta conv. ${metaActive === 1 ? "name" : "names"}`}
        rows={k.meta_conversions.map((c) => ({ name: c.name, count: c.count }))}
        empty="No Meta conversions in scope."
        footer={
          fallback
            ? "Nothing is picked in Settings → Ads → Meta, so the Meta number counts the standard Lead event."
            : "Only the conversions picked in Settings → Ads → Meta count. The Meta number is their sum."
        }
        testId="kpi-leads-meta-conversions"
      />
      <CountsPopover
        label={`${k.site_conversions.length} in-site conv. ${k.site_conversions.length === 1 ? "name" : "names"}`}
        rows={k.site_conversions}
        empty="No site leads from Meta ads in this window."
        footer="Forms submitted after a paid Meta visit. Repeats and staff tests are left out, so these add up to the site number."
        testId="kpi-leads-site-conversions"
      />
    </div>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Under the Leads card: nothing-picked warning plus the most important data note. */
export function LeadConversionNotes({ k, now = new Date() }: { k: Kpis; now?: Date }) {
  const picked = k.meta_lead_conversions_picked;
  const notPicked = picked != null && picked.length === 0;
  const changedAt = k.lead_conversions_changed_at ? Date.parse(k.lead_conversions_changed_at) : NaN;
  const recentlyChanged = Number.isFinite(changedAt) && now.getTime() - changedAt < CHANGED_NOTE_DAYS * 86_400_000;
  const note = k.snapshot_lacks_conversions
    ? "This production copy predates lead conversions — download again after production syncs."
    : (k.meta_conversions_incomplete_days ?? 0) > 0
      ? `Meta counts incomplete for ${k.meta_conversions_incomplete_days} day${k.meta_conversions_incomplete_days === 1 ? "" : "s"} — filling in on the next syncs.`
      : recentlyChanged
        ? `Lead conversions changed on ${dayLabel(k.lead_conversions_changed_at!)} — earlier numbers were recalculated.`
        : null;
  if (!notPicked && !note) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] leading-snug">
      {notPicked && (
        <Link
          href="/private/settings/ads/meta"
          className="flex items-start gap-1 text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
          data-testid="kpi-leads-not-picked"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          No Meta conversions picked — counting the standard Lead event. Pick them in Settings → Ads → Meta.
        </Link>
      )}
      {note && (
        <p className="text-muted-foreground" data-testid="kpi-leads-note">
          {note}
        </p>
      )}
    </div>
  );
}

/** Numbers behind conversion overlap / pixel lockstep / stopped conversion issues. */
export function IssueConversionEvidence({ issue }: { issue: AdsIssue }) {
  const e = issue.evidence;
  if (!e) return null;
  if (e.kind === "conversion_overlap") {
    return (
      <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs" data-testid={`ads-issue-evidence-${issue.id}`}>
        {e.conversions.map((c) => (
          <div key={c.key} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-foreground">
              {c.name}
              {c.optimized_ads > 0 && (
                <span className="ml-1 text-muted-foreground">
                  · optimized by {c.optimized_ads} ad{c.optimized_ads === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">{formatNum(c.count)}</span>
          </div>
        ))}
        <p className="text-muted-foreground">
          Both report on {e.both_days_pct}% of {formatNum(e.ad_days)} ad-days · counts {e.count_diff_pct}% apart · about {formatNum(e.estimated_extra)} counted twice
        </p>
      </div>
    );
  }
  if (e.kind === "event_lockstep") {
    return (
      <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs" data-testid={`ads-issue-evidence-${issue.id}`}>
        {e.events.map((ev) => (
          <div key={ev.event} className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-foreground">{ev.event}</span>
            <span className="tabular-nums text-foreground">{formatNum(ev.total)}</span>
          </div>
        ))}
        <p className="text-muted-foreground">
          {e.pixel_name} · since {e.since} · same count in {e.hours_matching_pct}% of {formatNum(e.hours_compared)} active hours
        </p>
      </div>
    );
  }
  return null;
}

/** Confirmed settings write offered on an issue (unpick a lead conversion, mark two pixel events as expected). */
export function IssueSettingsAction({ issue, onDone }: { issue: AdsIssue; onDone: () => void }) {
  const action = issue.action;
  const { hasCapability } = useDebugAuth();
  const canEdit = hasCapability("ads_settings");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!action) return null;
  const Icon = action.kind === "unpick_lead_conversion" ? MinusCircle : BadgeCheck;

  async function apply() {
    if (!action) return;
    setSaving(true);
    try {
      if (action.kind === "unpick_lead_conversion") {
        await apiRequest("POST", "/api/ads/meta/lead-conversions/unpick", { key: action.conversion_key });
        toast({ title: `Unpicked ${action.conversion_name}`, description: "The Meta leads number is recalculated with the remaining picks." });
      } else {
        await apiRequest("POST", "/api/ads/meta/expected-event-pairs", { pixel_id: action.pixel_id, events: action.events });
        toast({ title: "Marked as expected", description: "This pair is no longer flagged." });
      }
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/settings/ads/meta"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ads/meta/conversions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/diagnostics/ads"] });
      onDone();
    } catch (err) {
      toast({ title: "Couldn't save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`ads-issue-action-${issue.id}`}>
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!canEdit} onClick={() => setOpen(true)} data-testid="button-ads-issue-action">
        <Icon className="h-3.5 w-3.5" />
        {action.label}
      </Button>
      {!canEdit && <span className="text-xs text-muted-foreground">Ask someone with Ads settings access to do this.</span>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="dialog-ads-issue-action">
          <AlertDialogHeader>
            <AlertDialogTitle>{action.label}?</AlertDialogTitle>
            <AlertDialogDescription>{action.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
              data-testid="button-ads-issue-action-confirm"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {action.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
