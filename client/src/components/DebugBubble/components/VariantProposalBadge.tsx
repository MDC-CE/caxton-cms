import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { getDebugToken } from "@/hooks/useDebugAuth";
import type { VariantProposalLink } from "../types";

/** "In proposal" chip on a draft row: who owns the draft, link to review, staff unlink. */
export function VariantProposalBadge({
  link,
  unlinkUrl,
  onUnlinked,
  testIdSuffix,
}: {
  link: VariantProposalLink;
  unlinkUrl: string | null;
  onUnlinked: () => void;
  testIdSuffix: string;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUnlink, setShowUnlink] = useState(false);
  const open = !link.status || link.status === "open" || link.status === "partial";

  const unlink = async () => {
    if (!unlinkUrl) return;
    setBusy(true);
    try {
      const token = getDebugToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Token ${token}`;
      const res = await fetch(unlinkUrl, { method: "POST", headers, body: JSON.stringify({ reason }) });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Could not unlink the draft", variant: "destructive" });
        return;
      }
      toast({ title: "Draft unlinked from the proposal" });
      setShowUnlink(false);
      setReason("");
      onUnlinked();
    } catch {
      toast({ title: "Could not unlink the draft", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex shrink-0" data-testid={`badge-variant-proposal-${testIdSuffix}`}>
          <Badge variant="outline" className="cursor-pointer text-[10px] px-1.5 py-0 leading-4 font-normal">
            {open ? "In proposal" : "Proposal closed"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 text-sm" align="end">
        <p className="font-medium text-foreground">This draft belongs to a proposal</p>
        <p className="leading-5 text-muted-foreground">
          {link.title ? `"${link.title}"` : `Proposal ${link.id.slice(0, 8)}`}
          {link.proposer_username ? ` by ${link.proposer_username}` : ""}. Edits you make here become part of what
          reviewers approve, and you will count as a co-author (so you cannot approve it yourself).
        </p>
        {link.local ? (
          <Button asChild size="sm" variant="outline">
            <a href={`/private/agents/proposals/${link.id}`} data-testid={`link-variant-proposal-${testIdSuffix}`}>
              Open proposal
            </a>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            The proposal lives in another environment ({link.env}), so it cannot be opened from here.
          </p>
        )}
        {unlinkUrl ? (
          showUnlink ? (
            <div className="space-y-2 border-t pt-2">
              <p className="text-xs text-muted-foreground">
                Unlinking keeps the draft content as it is; the proposal will no longer publish it.
              </p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you unlinking this draft?"
                className="min-h-[60px] text-xs"
                data-testid={`input-unlink-reason-${testIdSuffix}`}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || reason.trim().length < 10}
                onClick={() => void unlink()}
                data-testid={`button-confirm-unlink-${testIdSuffix}`}
              >
                Unlink draft
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setShowUnlink(true)}
              data-testid={`button-unlink-proposal-${testIdSuffix}`}
            >
              Unlink from proposal…
            </button>
          )
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
