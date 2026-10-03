import { useCallback, useRef, useState } from "react";
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

type PushResponse = { data: any; status: number };

/**
 * Off the live server, commit routes answer 409 `confirm_proposal_drafts` when a push would
 * include drafts that belong to proposals tested on this computer. This asks staff, then
 * retries with `confirm_proposal_drafts: true` or reports a cancel.
 */
export function useProposalDraftPushConfirm() {
  const [files, setFiles] = useState<string[] | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((list: string[]) => {
    setFiles(list);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setFiles(null);
  };

  const pushWithConfirm = useCallback(
    async (url: string, init: RequestInit & { body: string }): Promise<PushResponse> => {
      const first = await fetch(url, init);
      const data = await first.json();
      if (first.status !== 409 || data?.action_required !== "confirm_proposal_drafts") {
        return { data, status: first.status };
      }
      const ok = await ask(Array.isArray(data.files) ? data.files : []);
      if (!ok) return { data: { success: false, error: "Push cancelled.", cancelled: true }, status: 409 };
      const body = { ...JSON.parse(init.body), confirm_proposal_drafts: true };
      const retry = await fetch(url, { ...init, body: JSON.stringify(body) });
      return { data: await retry.json(), status: retry.status };
    },
    [ask],
  );

  const dialog = (
    <AlertDialog open={files !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent data-testid="dialog-confirm-proposal-drafts">
        <AlertDialogHeader>
          <AlertDialogTitle>Push proposal drafts?</AlertDialogTitle>
          <AlertDialogDescription>
            These drafts belong to proposals you tested on this computer. Proposals live in production, so
            these usually should not be pushed. Push them anyway?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-40 overflow-auto rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground">
          {(files ?? []).map((f) => (
            <li key={f} className="truncate">
              {f}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-proposal-drafts">Don't push</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)} data-testid="button-confirm-proposal-drafts">
            Push anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { pushWithConfirm, dialog };
}
