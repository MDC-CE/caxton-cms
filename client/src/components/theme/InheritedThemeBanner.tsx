import { useState } from "react";
import { Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { apiRequestWithAuth, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Theme editor on a site that uses its parent's theme: read-only notice and
 * the one action that makes the theme editable (copy the parent's theme).
 */
export function InheritedThemeBanner({
  parentFolder,
  parentName,
}: {
  parentFolder: string;
  parentName: string;
}) {
  const { toast } = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const createOwnTheme = async () => {
    setBusy(true);
    try {
      await apiRequestWithAuth("POST", "/api/theme/own");
      toast({
        title: "Separate theme created",
        description: `This site now has its own copy of the ${parentName} theme. It is queued for Cloud Sync.`,
      });
      setConfirmOpen(false);
    } catch (err: unknown) {
      toast({
        title: "Could not create a separate theme",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ["/api/theme"] });
    }
  };

  return (
    <div className="mx-4 my-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs" data-testid="banner-inherited-theme">
      <div className="flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
        <div className="space-y-2">
          <p className="text-foreground">
            This site uses the {parentName} theme. The colors below come from that site, and changes made there
            also apply here.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setConfirmOpen(true)}
            data-testid="button-create-own-theme"
          >
            <Copy className="h-3.5 w-3.5" />
            Create a separate theme for this site
          </Button>
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
            data-testid="button-inherited-theme-read-more"
          >
            {showAdvanced ? "Hide advanced" : "Read more (advanced)"}
          </button>
          {showAdvanced && (
            <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-1" data-testid="inherited-theme-advanced">
              <li>
                Set by <code className="text-[10px]">inherit_components_from: {parentFolder}</code> in{" "}
                <code className="text-[10px]">sites.yml</code>. The same setting makes this site use that site&apos;s
                components.
              </li>
              <li>
                Colors are read from <code className="text-[10px]">{parentFolder}/theme.json</code> because this site
                has no <code className="text-[10px]">theme.json</code> of its own. Saving is turned off here so nothing
                edits the parent by accident.
              </li>
              <li>
                Creating a separate theme copies that file into this site&apos;s folder unchanged; from then on the two
                themes are edited independently.
              </li>
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a separate theme for this site?</AlertDialogTitle>
            <AlertDialogDescription>
              This copies the {parentName} theme into this site. After that, changes to {parentName}&apos;s theme no
              longer apply here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void createOwnTheme();
              }}
              disabled={busy}
              data-testid="button-confirm-create-own-theme"
            >
              {busy ? "Creating..." : "Create separate theme"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
