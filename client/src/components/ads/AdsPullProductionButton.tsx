import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, apiRequestWithAuth, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "inline-flex items-center justify-center h-5 w-5 rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type AdsPullResponse = {
  productionOrigin?: string;
  imported?: { meta_days: number; platform_days: number; ga4_days: number; last_date: string | null } | null;
};

type LeadsPullResponse = { imported_leads?: number; imported_consent_days?: number };

type PartResult = { label: string; ok: boolean; text: string };

/** `apiRequestWithAuth` throws "400: {json}"; surface the server's plain-English reason. */
function pullError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^\d{3}: ([\s\S]*)$/);
  if (!m) return msg;
  try {
    const body = JSON.parse(m[1]!) as { error?: string; reason?: string };
    return body.error || body.reason || m[1]!;
  } catch {
    return m[1]!;
  }
}

function invalidateAdsQueries() {
  void queryClient.invalidateQueries({ queryKey: ["/api/ads/report"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/diagnostics/ads"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/settings/ads/meta"] });
  void queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "/api/content-types" && q.queryKey[2] === "ads-entries",
  });
}

/**
 * Dev-only "Download from production" for Ads data (and optionally leads + consent). Renders nothing in production builds.
 * `variant="icon"` is the compact 20px control beside re-sync; `variant="button"` is a labeled small button for button rows.
 */
export function AdsPullProductionButton({
  onDone,
  testIdPrefix,
  variant = "icon",
}: {
  onDone?: () => void;
  testIdPrefix: string;
  variant?: "icon" | "button";
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [includeLeads, setIncludeLeads] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: originData, isLoading: originLoading } = useQuery({
    queryKey: ["/api/ads/pull-production/origin"],
    queryFn: async () => {
      const res = await apiFetch("/api/ads/pull-production/origin");
      if (!res.ok) return { productionOrigin: null };
      return (await res.json()) as { productionOrigin: string | null };
    },
    enabled: import.meta.env.DEV && open,
  });

  if (!import.meta.env.DEV) return null;

  const origin = originData?.productionOrigin ?? null;

  async function run() {
    // Close first so the production-token dialog is not trapped under this one.
    setOpen(false);
    setBusy(true);
    const parts: PartResult[] = [];
    try {
      try {
        const res = await apiRequestWithAuth("POST", "/api/ads/pull-production", {});
        const body = (await res.json()) as AdsPullResponse;
        const n = body.imported;
        parts.push({
          label: "Ad data",
          ok: true,
          text: n
            ? `${n.meta_days} Meta day(s), ${n.ga4_days} GA4 day(s)${n.last_date ? `, through ${n.last_date}` : ""}`
            : "downloaded",
        });
      } catch (err) {
        parts.push({ label: "Ad data", ok: false, text: pullError(err) });
      }
      if (includeLeads) {
        try {
          const res = await apiRequestWithAuth("POST", "/api/ads/leads/pull-production", {});
          const body = (await res.json()) as LeadsPullResponse;
          parts.push({
            label: "Leads",
            ok: true,
            text: `${(body.imported_leads ?? 0).toLocaleString()} lead(s), ${body.imported_consent_days ?? 0} consent day(s)`,
          });
        } catch (err) {
          parts.push({ label: "Leads", ok: false, text: pullError(err) });
        }
      }
    } finally {
      setBusy(false);
    }

    const anyOk = parts.some((p) => p.ok);
    if (anyOk) invalidateAdsQueries();
    toast({
      title: anyOk ? (parts.every((p) => p.ok) ? "Downloaded from production" : "Partly downloaded from production") : "Download from production failed",
      description: (
        <div className="space-y-0.5" data-testid={`${testIdPrefix}-pull-production-result`}>
          {parts.map((p) => (
            <p key={p.label}>
              <span className="font-medium">{p.label}:</span> {p.ok ? p.text : `failed. ${p.text}`}
            </p>
          ))}
        </div>
      ),
      variant: anyOk ? undefined : "destructive",
    });
    if (anyOk) onDone?.();
  }

  return (
    <>
      {variant === "button" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={busy}
          data-testid={`${testIdPrefix}-pull-production`}
        >
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
          {busy ? "Downloading…" : "Download from production"}
        </Button>
      ) : busy ? (
        <span className={ICON_BUTTON} aria-live="polite" aria-label="Downloading from production" data-testid={`${testIdPrefix}-pull-production-pending`}>
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      ) : (
        <button
          type="button"
          className={cn(ICON_BUTTON, "hover:bg-muted hover:text-foreground")}
          onClick={() => setOpen(true)}
          aria-label="Download ad data from production"
          title="Download ad data from production"
          data-testid={`${testIdPrefix}-pull-production`}
        >
          <Download className="h-3 w-3" />
        </button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid={`${testIdPrefix}-dialog-pull-production`}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Download from{" "}
              {originLoading ? (
                "production"
              ) : origin ? (
                <span className="font-semibold" data-testid={`${testIdPrefix}-pull-production-origin`}>
                  {origin}
                </span>
              ) : (
                "production"
              )}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Replaces your local ad numbers with production&apos;s. You may be asked for a production staff token. Nothing is sent back to
              production.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!originLoading && !origin && (
            <p className="text-sm text-destructive">
              Couldn&apos;t work out the production address for this site. Set PRODUCTION_SITE_URL or the site domain in sites.yml.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${testIdPrefix}-pull-production-leads`}
              checked={includeLeads}
              onCheckedChange={(v) => setIncludeLeads(v === true)}
              data-testid={`${testIdPrefix}-pull-production-leads`}
            />
            <Label htmlFor={`${testIdPrefix}-pull-production-leads`} className="text-sm font-normal">
              Also download leads and cookie-consent numbers
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button disabled={!origin} onClick={() => void run()} data-testid={`${testIdPrefix}-confirm-pull-production`}>
              <Download className="h-4 w-4 mr-2" />
              Download from production
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
