import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import JsonViewer from "@/components/editing/JsonViewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import type { LeadDetail } from "@shared/leads-query";

async function fetchLead(id: string): Promise<LeadDetail> {
  const res = await apiFetch(`/api/ads/leads/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<LeadDetail>;
}

export function LeadDetailsDialog({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const lead = useQuery<LeadDetail>({
    queryKey: ["/api/ads/leads/detail", leadId],
    queryFn: () => fetchLead(leadId!),
    enabled: !!leadId,
  });
  const json = lead.data ? JSON.stringify(lead.data, null, 2) : "";

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast({ title: "Lead details copied" });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!leadId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="dialog-lead-details">
        <DialogHeader>
          <DialogTitle>Lead details</DialogTitle>
          <DialogDescription>
            Everything this site saved about this lead. Names, emails and phone numbers are not saved here; search the lead
            ID in the CRM to see them.
          </DialogDescription>
        </DialogHeader>
        {lead.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : lead.error ? (
          <p className="text-sm text-destructive" data-testid="text-lead-details-error">
            Could not load this lead: {(lead.error as Error).message}
          </p>
        ) : (
          <>
            <div className="max-h-[60vh] overflow-y-auto rounded-md text-xs" data-testid="text-lead-details-json">
              <JsonViewer
                value={json}
                className="[&_.cm-editor]:!max-w-full [&_.cm-scroller]:!overflow-auto [&_.cm-editor]:!max-h-none"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => void copyJson()} data-testid="button-copy-lead-details">
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy JSON
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
